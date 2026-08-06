from __future__ import annotations

import datetime as dt
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any


SPEC_RE = re.compile(r"SPEC-\d{4}")
SPEC_TITLE_RE = re.compile(r"\*\*Título\*\*\s*\n\n(.+)")
SPEC_STATUS_CHECKBOX_RE = re.compile(r"- \[x\] (.+)")
SPEC_STATUS_PLAIN_RE = re.compile(r"\*\*Status\*\*\s*\n\n(.+)")
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
    return value if isinstance(value, int) and value >= 0 else None


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
        first_ts=first_ts, last_ts=last_ts, telemetry_status="complete", cwd=None,
    )


def parse_codex_session(path: Path) -> UsageRecord:
    session = path.stem
    cwd: str | None = None
    agent_role: str | None = None
    models: set[str] = set()
    mentions: Counter[str] = Counter()
    first_ts = last_ts = None
    last_usage: dict[str, Any] | None = None
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
                    info = payload.get("info")
                    total = info.get("total_token_usage") if isinstance(info, dict) else None
                    if isinstance(total, dict):
                        # Codex snapshots are cumulative: retaining only this final one is intentional.
                        last_usage = total
    if last_usage is None:
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
    for path in sorted(sessions_dir.rglob("*.jsonl")):
        record = parse_codex_session(path)
        if record.cwd is None:
            continue
        try:
            Path(record.cwd).resolve().relative_to(root)
        except ValueError:
            continue
        records.append(record)
    return records


def _fmt(value: int) -> str:
    return f"{value:,}".replace(",", ".")


def _read_spec_meta(spec_id: str) -> tuple[str | None, str | None]:
    matches = list(SPECS_DIR.glob(f"{spec_id}-*.md"))
    if not matches:
        return None, None
    source = matches[0].read_text(encoding="utf-8", errors="ignore")
    title = (match.group(1).strip() if (match := SPEC_TITLE_RE.search(source)) else None)
    status = (match.group(1).strip() if (match := SPEC_STATUS_CHECKBOX_RE.search(source)) else None)
    if status is None:
        status = match.group(1).strip() if (match := SPEC_STATUS_PLAIN_RE.search(source)) else None
    return title, status


def build_spec_log(records: list[UsageRecord]) -> str:
    per_spec: dict[tuple[str, str], dict[str, object]] = defaultdict(lambda: {"raw": 0, "effective": 0, "sessions": 0, "last": None, "complete": True})
    phases: dict[tuple[str, str], dict[str, int | None]] = defaultdict(dict)
    for record in records:
        if record.spec_tag is None:
            continue
        key = (record.spec_tag, record.executor)
        bucket = per_spec[key]
        bucket["raw"] = int(bucket["raw"]) + record.raw_total
        bucket["sessions"] = int(bucket["sessions"]) + 1
        bucket["complete"] = bool(bucket["complete"]) and record.telemetry_status == "complete"
        if record.effective_total is not None:
            bucket["effective"] = int(bucket["effective"]) + record.effective_total
        if record.last_ts and (bucket["last"] is None or record.last_ts > bucket["last"]):
            bucket["last"] = record.last_ts
        previous = phases[key].get(record.phase)
        if record.effective_total is None:
            phases[key][record.phase] = None
        elif previous is not None:
            phases[key][record.phase] = int(previous) + record.effective_total
        else:
            phases[key][record.phase] = record.effective_total
    lines = ["# Log de uso de tokens por SPEC\n", "> **Project Atlas — Log de Custo de Token por SPEC**\n"]
    lines.append(f"Atualizado em: {dt.date.today().isoformat()} (regenerado por `python3 scripts/agent-usage-report.py --executor all`)\n")
    lines.append("As métricas são separadas por executor. Tokens efetivos Claude usam os pesos históricos; Codex fica `N/D` até existir uma métrica comparável documentada. Snapshots de Codex são cumulativos e só o último total de cada transcript é lido.\n")
    lines.extend(["---\n", "## Por SPEC\n", "| SPEC | Executor | Título | Status | Sessões | Última atividade | Tokens brutos | Tokens efetivos | Telemetria |", "|---|---|---|---|---:|---|---:|---:|---|"])
    done_totals: dict[str, list[int]] = defaultdict(list)
    for (spec_id, executor), bucket in sorted(per_spec.items()):
        title, status = _read_spec_meta(spec_id)
        title, status = title or "(SPEC não encontrada em docs/implementation/specs/)", status or "?"
        effective = _fmt(int(bucket["effective"])) if executor == "Claude" else "N/D"
        if status == "Done" and executor == "Claude":
            done_totals[executor].append(int(bucket["effective"]))
        lines.append(f"| {spec_id} | {executor} | {title} | {status} | {bucket['sessions']} | {str(bucket['last'] or '-')[:10]} | {_fmt(int(bucket['raw']))} | {effective} | {'complete' if bucket['complete'] else 'incomplete'} |")
    lines.extend(["", "## Detalhamento por fase\n", "Valores em tokens efetivos. Codex não é somado nem comparado a Claude enquanto não existir métrica equivalente.\n"])
    present = {phase for totals in phases.values() for phase in totals}
    columns = [phase for phase in PHASE_COLUMN_ORDER if phase == PHASE_MAIN_THREAD or phase in present]
    columns += sorted(present - set(PHASE_COLUMN_ORDER))
    lines.append("| " + " | ".join(["SPEC", "Executor"] + columns) + " |")
    lines.append("|" + "|".join(["---", "---"] + ["---:"] * len(columns)) + "|")
    for key in sorted(phases):
        spec_id, executor = key
        values = ["N/D" if executor == "Codex" else _fmt(int(phases[key].get(column) or 0)) for column in columns]
        lines.append("| " + " | ".join([spec_id, executor] + values) + " |")
    lines.extend(["", "## Eficiência de processo (overhead ÷ implementação)\n", "Calculada separadamente por executor, apenas quando tokens efetivos comparáveis existem.\n", "| SPEC | Executor | Implementação | Overhead (resto) | Overhead ÷ Impl |", "|---|---|---:|---:|---:|"])
    for key in sorted(phases):
        spec_id, executor = key
        if executor != "Claude":
            continue
        totals = phases[key]
        implementation = totals.get("Implementação")
        if not implementation:
            continue
        overhead = sum(int(value or 0) for value in totals.values()) - int(implementation)
        lines.append(f"| {spec_id} | {executor} | {_fmt(int(implementation))} | {_fmt(overhead)} | {overhead / int(implementation):.1f}× |")
    lines.extend(["", "## Como estimar antes de começar uma SPEC nova\n"])
    for executor, totals in sorted(done_totals.items()):
        average = sum(totals) // len(totals)
        lines.append(f"- {executor}: SPECs concluídas: {len(totals)}. Custo médio: **{_fmt(average)} tokens efetivos**. Faixa: {_fmt(min(totals))} – {_fmt(max(totals))}.\n")
    return "\n".join(lines)


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
