from __future__ import annotations

import datetime as dt
import fcntl
import json
import os
import re
import tempfile
from collections import Counter, defaultdict
from contextlib import contextmanager
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Any

from workflow_lib import parse_spec_status


SPEC_RE = re.compile(r"SPEC-\d{4}")
SPEC_TITLE_RE = re.compile(r"\*\*Título\*\*\s*\n\n(.+)")
REPO_ROOT = Path(__file__).resolve().parents[2]
SPECS_DIR = REPO_ROOT / "docs" / "implementation" / "specs"

# Do not change these weights: they are the historical Claude cost model.
CLAUDE_EFFECTIVE_WEIGHTS = {
    "input": 1.0,
    "cache_creation": 1.25,
    "cache_read": 0.1,
    "output": 5.0,
}

PHASE_BY_AGENT_TYPE = {
    "spec-drafter": "Rascunho",
    "architecture-reviewer": "Revisão",
    "spec-implementer": "Implementação",
    "spec-validator": "Verificação",
    "spec-closer": "Fechamento",
}
PHASE_MAIN_THREAD = "Criação/Decisão"
PHASE_OTHER_AGENTS = "Apoio (outros agentes)"
PHASE_COLUMN_ORDER = [
    PHASE_MAIN_THREAD,
    "Rascunho",
    "Revisão",
    "Implementação",
    "Verificação",
    "Fechamento",
    PHASE_OTHER_AGENTS,
]
CACHE_VERSION = 1


@dataclass(frozen=True)
class UsageRecord:
    executor: str
    session: str
    phase: str
    agent_role: str | None
    models: tuple[str, ...]
    input_tokens: int
    cached_input: int
    cache_write_input: int
    output_tokens: int
    reasoning_output: int
    raw_total: int
    effective_total: int | None
    spec_tag: str | None
    first_ts: str | None
    last_ts: str | None
    telemetry_status: str
    cwd: str | None


@dataclass
class UsageCache:
    cutover: str
    protect_historical_baseline: bool
    ignored_sessions: set[tuple[str, str]]
    sessions: dict[tuple[str, str], UsageRecord]


def _extract_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text":
            parts.append(str(block.get("text", "")))
        elif block.get("type") == "tool_use":
            parts.append(json.dumps(block.get("input", {})))
    return "\n".join(parts)


def _phase(agent_role: str | None) -> str:
    return PHASE_MAIN_THREAD if agent_role is None else PHASE_BY_AGENT_TYPE.get(agent_role, PHASE_OTHER_AGENTS)


def _top_spec(mentions: Counter[str]) -> str | None:
    return max(mentions.items(), key=lambda item: item[1])[0] if mentions else None


def _int(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


def _effective_total(input_tokens: int, cache_write_input: int, cached_input: int, output_tokens: int) -> int:
    return int(
        input_tokens * CLAUDE_EFFECTIVE_WEIGHTS["input"]
        + cache_write_input * CLAUDE_EFFECTIVE_WEIGHTS["cache_creation"]
        + cached_input * CLAUDE_EFFECTIVE_WEIGHTS["cache_read"]
        + output_tokens * CLAUDE_EFFECTIVE_WEIGHTS["output"]
    )


def parse_claude_session(path: Path, metadata: dict[str, object] | None = None) -> UsageRecord:
    metadata = metadata or {}
    agent_role = metadata.get("agentType") if isinstance(metadata.get("agentType"), str) else None
    description = metadata.get("description") if isinstance(metadata.get("description"), str) else ""
    mentions: Counter[str] = Counter(SPEC_RE.findall(description))
    input_tokens = cached_input = cache_write_input = output_tokens = 0
    models: set[str] = set()
    valid_usage_count = 0
    first_ts = last_ts = None
    with path.open(encoding="utf-8", errors="ignore") as handle:
        for raw in handle:
            try:
                entry = json.loads(raw)
            except json.JSONDecodeError:
                continue
            timestamp = entry.get("timestamp")
            if isinstance(timestamp, str):
                first_ts = first_ts or timestamp
                last_ts = timestamp
            message = entry.get("message")
            if not isinstance(message, dict):
                continue
            mentions.update(SPEC_RE.findall(_extract_text(message.get("content"))))
            usage = message.get("usage")
            if not isinstance(usage, dict):
                continue
            usage_keys = (
                "input_tokens",
                "output_tokens",
                "cache_read_input_tokens",
                "cache_creation_input_tokens",
            )
            present_values = [usage[key] for key in usage_keys if key in usage]
            if not present_values or any(_int(value) is None for value in present_values):
                continue
            valid_usage_count += 1
            model = message.get("model")
            if isinstance(model, str):
                models.add(model)
            input_tokens += _int(usage.get("input_tokens")) or 0
            output_tokens += _int(usage.get("output_tokens")) or 0
            cached_input += _int(usage.get("cache_read_input_tokens")) or 0
            cache_write_input += _int(usage.get("cache_creation_input_tokens")) or 0
    # A subagent description is authoritative when it names a SPEC.
    description_spec = SPEC_RE.search(description)
    raw_total = input_tokens + cached_input + cache_write_input + output_tokens
    return UsageRecord(
        executor="Claude", session=path.stem, phase=_phase(agent_role), agent_role=agent_role,
        models=tuple(sorted(models)), input_tokens=input_tokens, cached_input=cached_input,
        cache_write_input=cache_write_input, output_tokens=output_tokens, reasoning_output=0,
        raw_total=raw_total, effective_total=_effective_total(input_tokens, cache_write_input, cached_input, output_tokens),
        spec_tag=description_spec.group(0) if description_spec else _top_spec(mentions),
        first_ts=first_ts, last_ts=last_ts, telemetry_status="complete" if valid_usage_count else "incomplete", cwd=None,
    )


def parse_codex_session(path: Path) -> UsageRecord:
    session = path.stem
    cwd: str | None = None
    agent_role: str | None = None
    models: set[str] = set()
    mentions: Counter[str] = Counter()
    first_ts = last_ts = None
    last_usage: dict[str, Any] | None = None
    saw_token_count = False
    with path.open(encoding="utf-8", errors="ignore") as handle:
        for raw in handle:
            try:
                entry = json.loads(raw)
            except json.JSONDecodeError:
                continue
            timestamp = entry.get("timestamp")
            if isinstance(timestamp, str):
                first_ts = first_ts or timestamp
                last_ts = timestamp
            payload = entry.get("payload")
            if not isinstance(payload, dict):
                continue
            if entry.get("type") == "session_meta":
                value = payload.get("id")
                if isinstance(value, str):
                    session = value
                value = payload.get("cwd")
                if isinstance(value, str):
                    cwd = value
                if payload.get("thread_source") == "subagent":
                    source = payload.get("source")
                    subagent = source.get("subagent") if isinstance(source, dict) else payload.get("subagent")
                    spawn = subagent.get("thread_spawn") if isinstance(subagent, dict) else None
                    role = spawn.get("agent_role") if isinstance(spawn, dict) else None
                    if isinstance(role, str):
                        agent_role = role
            elif entry.get("type") == "turn_context":
                model = payload.get("model")
                if isinstance(model, str):
                    models.add(model)
            elif entry.get("type") == "event_msg":
                kind = payload.get("type")
                if kind in {"user_message", "agent_message"}:
                    message = payload.get("message")
                    if isinstance(message, str):
                        mentions.update(SPEC_RE.findall(message))
                elif kind == "token_count":
                    saw_token_count = True
                    info = payload.get("info")
                    total = info.get("total_token_usage") if isinstance(info, dict) else None
                    # Codex snapshots are cumulative: only the final schema is authoritative.
                    last_usage = total if isinstance(total, dict) else None
    if not saw_token_count or last_usage is None:
        return UsageRecord("Codex", session, _phase(agent_role), agent_role, tuple(sorted(models)), 0, 0, 0, 0, 0, 0, None, _top_spec(mentions), first_ts, last_ts, "incomplete", cwd)
    values = {key: _int(last_usage.get(key)) for key in ("total_tokens", "input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens")}
    if any(value is None for value in values.values()):
        return UsageRecord("Codex", session, _phase(agent_role), agent_role, tuple(sorted(models)), 0, 0, 0, 0, 0, 0, None, _top_spec(mentions), first_ts, last_ts, "incomplete", cwd)
    return UsageRecord(
        executor="Codex", session=session, phase=_phase(agent_role), agent_role=agent_role,
        models=tuple(sorted(models)), input_tokens=values["input_tokens"] or 0,
        cached_input=values["cached_input_tokens"] or 0, cache_write_input=values["cache_write_input_tokens"] or 0,
        output_tokens=values["output_tokens"] or 0, reasoning_output=values["reasoning_output_tokens"] or 0,
        raw_total=values["total_tokens"] or 0, effective_total=None, spec_tag=_top_spec(mentions),
        first_ts=first_ts, last_ts=last_ts, telemetry_status="complete", cwd=cwd,
    )


def discover_claude_records(project_dir: Path) -> list[UsageRecord]:
    records: list[UsageRecord] = []
    for path in sorted(project_dir.glob("*.jsonl")):
        main = parse_claude_session(path)
        records.append(main)
        for meta_path in sorted((project_dir / path.stem / "subagents").glob("agent-*.meta.json")):
            jsonl_path = meta_path.with_name(meta_path.name.removesuffix(".meta.json") + ".jsonl")
            if not jsonl_path.exists():
                continue
            try:
                metadata = json.loads(meta_path.read_text(encoding="utf-8", errors="ignore"))
            except json.JSONDecodeError:
                metadata = {}
            record = parse_claude_session(jsonl_path, metadata)
            if record.spec_tag is None and main.spec_tag is not None:
                record = UsageRecord(**{**record.__dict__, "spec_tag": main.spec_tag})
            records.append(record)
    return records


def discover_codex_records(sessions_dir: Path, repo_root: Path) -> list[UsageRecord]:
    root = repo_root.resolve()
    records: list[UsageRecord] = []
    parents: dict[str, str] = {}
    for path in sorted(sessions_dir.rglob("*.jsonl")):
        record = parse_codex_session(path)
        if record.cwd is None:
            continue
        try:
            Path(record.cwd).resolve().relative_to(root)
        except ValueError:
            continue
        records.append(record)
        with path.open(encoding="utf-8", errors="ignore") as handle:
            for raw in handle:
                try:
                    entry = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                payload = entry.get("payload")
                if entry.get("type") != "session_meta" or not isinstance(payload, dict):
                    continue
                source = payload.get("source")
                subagent = source.get("subagent") if isinstance(source, dict) else payload.get("subagent")
                spawn = subagent.get("thread_spawn") if isinstance(subagent, dict) else None
                parent = spawn.get("parent_thread_id") if isinstance(spawn, dict) else None
                if isinstance(parent, str):
                    parents[record.session] = parent
                break
    by_session = {record.session: record for record in records}
    # A child may be read before an ancestor, so resolve until no fallback changes.
    for _ in records:
        changed = False
        for session, record in tuple(by_session.items()):
            if record.spec_tag is not None or session not in parents:
                continue
            parent = by_session.get(parents[session])
            if parent is not None and parent.spec_tag is not None:
                by_session[session] = replace(record, spec_tag=parent.spec_tag)
                changed = True
        if not changed:
            break
    return [by_session[record.session] for record in records]


def _fmt(value: int) -> str:
    return f"{value:,}".replace(",", ".")


def _read_spec_meta(spec_id: str) -> tuple[str | None, str | None]:
    matches = list(SPECS_DIR.glob(f"{spec_id}-*.md"))
    if not matches:
        return None, None
    source = matches[0].read_text(encoding="utf-8", errors="ignore")
    title = (match.group(1).strip() if (match := SPEC_TITLE_RE.search(source)) else None)
    status = parse_spec_status(source)
    return title, status


@dataclass
class SpecLogAggregate:
    spec_tag: str
    executor: str
    title: str
    status: str
    sessions: int
    last_ts: str | None
    raw_total: int
    effective_total: int | None
    telemetry_status: str
    phases: dict[str, int | None]


def _parse_number(value: str) -> int:
    return int(value.replace(".", "").replace(",", ""))


def aggregate_records(records: list[UsageRecord]) -> dict[tuple[str, str], SpecLogAggregate]:
    aggregates: dict[tuple[str, str], SpecLogAggregate] = {}
    for record in records:
        if record.spec_tag is None:
            continue
        key = (record.spec_tag, record.executor)
        aggregate = aggregates.get(key)
        if aggregate is None:
            title, status = _read_spec_meta(record.spec_tag)
            aggregate = SpecLogAggregate(record.spec_tag, record.executor, title or "(SPEC não encontrada em docs/implementation/specs/)", status or "?", 0, None, 0, 0 if record.executor == "Claude" else None, "complete", {})
            aggregates[key] = aggregate
        aggregate.sessions += 1
        aggregate.raw_total += record.raw_total
        if aggregate.effective_total is not None and record.effective_total is not None:
            aggregate.effective_total += record.effective_total
        aggregate.telemetry_status = "complete" if aggregate.telemetry_status == record.telemetry_status == "complete" else "incomplete"
        if record.last_ts and (aggregate.last_ts is None or record.last_ts > aggregate.last_ts):
            aggregate.last_ts = record.last_ts
        previous = aggregate.phases.get(record.phase)
        if aggregate.executor == "Codex":
            aggregate.phases[record.phase] = None
        elif previous is None and record.phase in aggregate.phases:
            aggregate.phases[record.phase] = None
        else:
            aggregate.phases[record.phase] = (previous or 0) + (record.effective_total or 0)
    return aggregates


def parse_spec_log(source: str) -> dict[tuple[str, str], SpecLogAggregate]:
    source = migrate_legacy_log(source)
    aggregates: dict[tuple[str, str], SpecLogAggregate] = {}
    spec_start, phase_start = source.find("## Por SPEC"), source.find("## Detalhamento por fase")
    if spec_start < 0 or phase_start < 0:
        return aggregates
    spec_lines = [line for line in source[spec_start:phase_start].splitlines() if line.startswith("|")]
    if len(spec_lines) < 2:
        return aggregates
    for line in spec_lines[2:]:
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) < 8:
            continue
        spec_tag, executor = cells[:2]
        telemetry = "complete"
        if len(cells) >= 9 and cells[-1] in {"complete", "incomplete"}:
            telemetry = cells.pop()
        status, sessions, last_ts, raw_total, effective_text = cells[-5:]
        title = " | ".join(cells[2:-5])
        effective = _parse_number(effective_text) if effective_text not in {"", "N/D"} else None
        aggregates[(spec_tag, executor)] = SpecLogAggregate(
            spec_tag, executor, title, status, int(sessions), last_ts if last_ts != "-" else None,
            _parse_number(raw_total), effective, telemetry, {},
        )
    efficiency_start = source.find("## Eficiência de processo", phase_start)
    phase_lines = [line for line in source[phase_start:efficiency_start].splitlines() if line.startswith("|")]
    if len(phase_lines) < 2:
        return aggregates
    headers = [cell.strip() for cell in phase_lines[0].strip("|").split("|")]
    for line in phase_lines[2:]:
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        row = dict(zip(headers, cells, strict=False))
        aggregate = aggregates.get((row.get("SPEC", ""), row.get("Executor", "")))
        if aggregate is None:
            continue
        for phase in headers[2:]:
            value = row.get(phase, "—")
            if value == "—":
                continue
            aggregate.phases[phase] = None if value == "N/D" else _parse_number(value)
    return aggregates


def merge_aggregates(existing: dict[tuple[str, str], SpecLogAggregate], incoming: dict[tuple[str, str], SpecLogAggregate]) -> dict[tuple[str, str], SpecLogAggregate]:
    merged = {key: SpecLogAggregate(value.spec_tag, value.executor, value.title, value.status, value.sessions, value.last_ts, value.raw_total, value.effective_total, value.telemetry_status, dict(value.phases)) for key, value in existing.items()}
    for key, update in incoming.items():
        target = merged.get(key)
        if target is None:
            merged[key] = update
            continue
        target.sessions += update.sessions
        target.raw_total += update.raw_total
        if target.effective_total is not None and update.effective_total is not None:
            target.effective_total += update.effective_total
        target.telemetry_status = "complete" if target.telemetry_status == update.telemetry_status == "complete" else "incomplete"
        if update.last_ts and (target.last_ts is None or update.last_ts > target.last_ts):
            target.last_ts = update.last_ts
        for phase, value in update.phases.items():
            previous = target.phases.get(phase)
            target.phases[phase] = None if value is None or (phase in target.phases and previous is None) else (previous or 0) + value
    return merged


def _subtract_record(aggregates: dict[tuple[str, str], SpecLogAggregate], record: UsageRecord, remaining: list[UsageRecord]) -> None:
    if record.spec_tag is None:
        return
    key = (record.spec_tag, record.executor)
    aggregate = aggregates.get(key)
    if aggregate is None:
        return
    aggregate.sessions -= 1
    aggregate.raw_total -= record.raw_total
    if aggregate.effective_total is not None and record.effective_total is not None:
        aggregate.effective_total -= record.effective_total
    same_phase_remains = any(
        other.spec_tag == record.spec_tag and other.executor == record.executor and other.phase == record.phase
        for other in remaining
    )
    if aggregate.executor == "Codex":
        if not same_phase_remains:
            aggregate.phases.pop(record.phase, None)
    elif isinstance(aggregate.phases.get(record.phase), int) and record.effective_total is not None:
        aggregate.phases[record.phase] = int(aggregate.phases[record.phase] or 0) - record.effective_total
        if aggregate.phases[record.phase] == 0 and not same_phase_remains:
            aggregate.phases.pop(record.phase, None)
    if aggregate.sessions <= 0:
        aggregates.pop(key, None)


def _merge_session_records(aggregates: dict[tuple[str, str], SpecLogAggregate], ledger: dict[tuple[str, str], UsageRecord], records: list[UsageRecord]) -> tuple[dict[tuple[str, str], SpecLogAggregate], dict[tuple[str, str], UsageRecord]]:
    merged = merge_aggregates({}, aggregates)
    sessions = dict(ledger)
    for record in records:
        if record.spec_tag is None:
            continue
        identity = (record.executor, record.session)
        previous = sessions.pop(identity, None)
        if previous is not None:
            _subtract_record(merged, previous, list(sessions.values()))
        sessions[identity] = record
        merged = merge_aggregates(merged, aggregate_records([record]))
    return merged, sessions


def render_spec_log(aggregates: dict[tuple[str, str], SpecLogAggregate]) -> str:
    lines = ["# Log de uso de tokens por SPEC\n", "> **Project Atlas — Log de Custo de Token por SPEC**\n"]
    lines.append(f"Atualizado em: {dt.date.today().isoformat()} (regenerado por `python3 scripts/agent-usage-report.py --executor all`)\n")
    lines.append("As métricas são separadas por executor. Tokens efetivos Claude usam os pesos históricos; Codex fica `N/D` até existir uma métrica comparável documentada. Snapshots de Codex são cumulativos e só o último total de cada transcript é lido.\n")
    lines.extend(["---\n", "## Por SPEC\n", "| SPEC | Executor | Título | Status | Sessões | Última atividade | Tokens brutos | Tokens efetivos | Telemetria |", "|---|---|---|---|---:|---|---:|---:|---|"])
    done_totals: dict[str, list[int]] = defaultdict(list)
    for (_spec_id, _executor), aggregate in sorted(aggregates.items()):
        effective = _fmt(aggregate.effective_total or 0) if aggregate.executor == "Claude" else "N/D"
        if aggregate.status == "Done" and aggregate.executor == "Claude" and aggregate.effective_total is not None:
            done_totals[aggregate.executor].append(aggregate.effective_total)
        lines.append(f"| {aggregate.spec_tag} | {aggregate.executor} | {aggregate.title} | {aggregate.status} | {aggregate.sessions} | {str(aggregate.last_ts or '-')[:10]} | {_fmt(aggregate.raw_total)} | {effective} | {aggregate.telemetry_status} |")
    lines.extend(["", "## Detalhamento por fase\n", "Valores em tokens efetivos. Codex não é somado nem comparado a Claude enquanto não existir métrica equivalente.\n"])
    present = {phase for aggregate in aggregates.values() for phase in aggregate.phases}
    columns = [phase for phase in PHASE_COLUMN_ORDER if phase == PHASE_MAIN_THREAD or phase in present]
    columns += sorted(present - set(PHASE_COLUMN_ORDER))
    lines.append("| " + " | ".join(["SPEC", "Executor"] + columns) + " |")
    lines.append("|" + "|".join(["---", "---"] + ["---:"] * len(columns)) + "|")
    for (_spec_id, _executor), aggregate in sorted(aggregates.items()):
        values = []
        for column in columns:
            if column not in aggregate.phases:
                values.append("—" if aggregate.executor == "Codex" else "0")
            elif aggregate.phases[column] is None:
                values.append("N/D")
            else:
                values.append(_fmt(aggregate.phases[column] or 0))
        lines.append("| " + " | ".join([aggregate.spec_tag, aggregate.executor] + values) + " |")
    lines.extend(["", "## Eficiência de processo (overhead ÷ implementação)\n", "Calculada separadamente por executor, apenas quando tokens efetivos comparáveis existem.\n", "| SPEC | Executor | Implementação | Overhead (resto) | Overhead ÷ Impl |", "|---|---|---:|---:|---:|"])
    for (_spec_id, _executor), aggregate in sorted(aggregates.items()):
        if aggregate.executor != "Claude":
            continue
        implementation = aggregate.phases.get("Implementação")
        if not implementation:
            continue
        overhead = sum(int(value or 0) for value in aggregate.phases.values()) - int(implementation)
        lines.append(f"| {aggregate.spec_tag} | {aggregate.executor} | {_fmt(int(implementation))} | {_fmt(overhead)} | {overhead / int(implementation):.1f}× |")
    lines.extend(["", "## Como estimar antes de começar uma SPEC nova\n"])
    for executor, totals in sorted(done_totals.items()):
        average = sum(totals) // len(totals)
        lines.append(f"- {executor}: SPECs concluídas: {len(totals)}. Custo médio: **{_fmt(average)} tokens efetivos**. Faixa: {_fmt(min(totals))} – {_fmt(max(totals))}.\n")
    return "\n".join(lines)


def build_spec_log(records: list[UsageRecord]) -> str:
    return render_spec_log(aggregate_records(records))


def merge_spec_log(existing: str, records: list[UsageRecord]) -> str:
    return render_spec_log(
        merge_aggregates(parse_spec_log(existing), aggregate_records(records))
    )


def _record_from_json(raw: object) -> UsageRecord:
    if not isinstance(raw, dict):
        raise ValueError("usage cache session must be an object")
    values = dict(raw)
    values["models"] = tuple(values.get("models", ()))
    return UsageRecord(**values)


def _load_usage_cache(path: Path) -> UsageCache:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or raw.get("version") != CACHE_VERSION:
        raise ValueError("unsupported usage cache schema")
    cutover = raw.get("cutover")
    if not isinstance(cutover, str) or not cutover:
        raise ValueError("usage cache cutover is missing")
    ignored: set[tuple[str, str]] = set()
    for identity in raw.get("ignored_sessions", []):
        if not isinstance(identity, dict):
            raise ValueError("usage cache ignored session must be an object")
        executor, session = identity.get("executor"), identity.get("session")
        if not isinstance(executor, str) or not isinstance(session, str):
            raise ValueError("usage cache ignored session identity is invalid")
        ignored.add((executor, session))
    sessions: dict[tuple[str, str], UsageRecord] = {}
    for raw_record in raw.get("sessions", []):
        record = _record_from_json(raw_record)
        sessions[(record.executor, record.session)] = record
    protect_historical_baseline = raw.get("protect_historical_baseline", True)
    if not isinstance(protect_historical_baseline, bool):
        raise ValueError("usage cache baseline protection flag is invalid")
    return UsageCache(cutover, protect_historical_baseline, ignored, sessions)


def _render_usage_cache(cache: UsageCache) -> str:
    payload = {
        "version": CACHE_VERSION,
        "cutover": cache.cutover,
        "protect_historical_baseline": cache.protect_historical_baseline,
        "ignored_sessions": [
            {"executor": executor, "session": session}
            for executor, session in sorted(cache.ignored_sessions)
        ],
        "sessions": [
            asdict(record) for _identity, record in sorted(cache.sessions.items())
        ],
    }
    return json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ) + "\n"


def _timestamp(value: str | None) -> dt.datetime | None:
    if value is None:
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.UTC)
    return parsed.astimezone(dt.UTC)


def _is_historical(record: UsageRecord, cutover: str) -> bool:
    first, boundary = _timestamp(record.first_ts), _timestamp(cutover)
    return first is None or boundary is None or first <= boundary


@contextmanager
def _usage_lock(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=path.parent, prefix=f".{path.name}.", suffix=".tmp"
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def update_usage_files(
    log_path: Path,
    cache_path: Path,
    records: list[UsageRecord],
    *,
    now: str | None = None,
) -> str:
    """Merge session snapshots under a private cache lock and atomic replaces."""
    cutover = now or dt.datetime.now(dt.UTC).isoformat().replace("+00:00", "Z")
    lock_path = cache_path.with_suffix(".lock")
    with _usage_lock(lock_path):
        existing = log_path.read_text(encoding="utf-8") if log_path.exists() else ""
        aggregates = parse_spec_log(existing)
        if cache_path.exists():
            cache = _load_usage_cache(cache_path)
        else:
            cache = UsageCache(cutover, bool(aggregates), set(), {})

        if cache.protect_historical_baseline:
            cache.ignored_sessions.update(
                (record.executor, record.session)
                for record in records
                if (record.executor, record.session) not in cache.sessions
                and _is_historical(record, cache.cutover)
            )

        eligible = [
            record
            for record in records
            if record.telemetry_status == "complete"
            and (record.executor, record.session) not in cache.ignored_sessions
        ]
        merged, sessions = _merge_session_records(
            aggregates, cache.sessions, eligible
        )
        cache.sessions = sessions
        shared = render_spec_log(merged)
        _atomic_write_text(cache_path, _render_usage_cache(cache))
        _atomic_write_text(log_path, shared)
        return shared


def migrate_legacy_log(source: str) -> str:
    """Add executor labels to a historical Claude-only log without changing its values."""
    if "| SPEC | Executor |" in source:
        return source
    source = source.replace("`python3 scripts/claude-usage-report.py`", "`python3 scripts/agent-usage-report.py --executor all`")
    source = source.replace("| SPEC | Título |", "| SPEC | Executor | Título |")
    source = source.replace("|---|---|---|---:|", "|---|---|---|---|---:|")
    source = re.sub(r"^(\| SPEC-\d{4} \| )(?!Claude \|)", r"\1Claude | ", source, flags=re.MULTILINE)
    source = source.replace("| SPEC | Criação/Decisão", "| SPEC | Executor | Criação/Decisão")
    source = source.replace("|---|---:|", "|---|---|---:|")
    source = source.replace("| SPEC | Implementação |", "| SPEC | Executor | Implementação |")
    source = source.replace("Tokens efetivos", "Tokens efetivos (Claude)")
    return source
