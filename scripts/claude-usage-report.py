#!/usr/bin/env python3
"""Agrega o uso de tokens do Claude Code neste repositório a partir dos
transcripts locais (~/.claude/projects/<projeto>/*.jsonl).

Ferramenta pessoal de análise, não faz parte do build do Atlas nem do
workspace pnpm. Lê apenas dados já salvos localmente pelo Claude Code;
não faz nenhuma chamada de rede.

Além do relatório detalhado (pessoal, não versionado), também atualiza
docs/05-context/TOKEN_USAGE_LOG.md — um resumo por SPEC, versionado no
repositório, para consultar quanto uma SPEC parecida custou no passado antes
de decidir se vale começar uma nova agora ou esperar a próxima janela de
sessão.

Uso:
    python3 scripts/claude-usage-report.py [--top N] [--out PATH] [--project-dir DIR] [--no-log]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
from collections import defaultdict
from pathlib import Path

SPEC_RE = re.compile(r"SPEC-\d{4}")
SPEC_TITLE_RE = re.compile(r"\*\*Título\*\*\s*\n\n(.+)")
SPEC_STATUS_CHECKBOX_RE = re.compile(r"- \[x\] (.+)")
SPEC_STATUS_PLAIN_RE = re.compile(r"\*\*Status\*\*\s*\n\n(.+)")
REPO_ROOT = Path(__file__).resolve().parent.parent
SPECS_DIR = REPO_ROOT / "docs" / "implementation" / "specs"


def sanitize_cwd(cwd: str) -> str:
    return cwd.replace("/", "-")


def default_project_dir() -> Path:
    cwd = str(Path(__file__).resolve().parent.parent)
    return Path.home() / ".claude" / "projects" / sanitize_cwd(cwd)


def extract_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    parts.append(block.get("text", ""))
                elif block.get("type") == "tool_use":
                    parts.append(json.dumps(block.get("input", {})))
        return "\n".join(parts)
    return ""


# Pesos relativos ao preço do token de input (proporções iguais em todos os
# modelos Anthropic): cache read custa ~10% do input, cache write ~125%,
# output ~500%. "Tokens efetivos" = tokens equivalentes em input, para que
# sessões agênticas longas (dominadas por cache read barato) não pareçam
# ordens de magnitude mais caras do que realmente são.
EFFECTIVE_WEIGHTS = {
    "input": 1.0,
    "cache_creation": 1.25,
    "cache_read": 0.1,
    "output": 5.0,
}


def effective_total(bucket: dict) -> int:
    return int(sum(bucket.get(k, 0) * w for k, w in EFFECTIVE_WEIGHTS.items()))


def parse_session(path: Path) -> dict:
    totals_by_model = defaultdict(lambda: defaultdict(int))
    spec_mentions = defaultdict(int)
    first_ts = None
    last_ts = None

    with path.open(encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            ts = entry.get("timestamp")
            if ts:
                first_ts = first_ts or ts
                last_ts = ts

            message = entry.get("message")
            if not isinstance(message, dict):
                continue

            text = extract_text(message.get("content"))
            for match in SPEC_RE.findall(text):
                spec_mentions[match] += 1

            usage = message.get("usage")
            if not usage:
                continue
            model = message.get("model", "unknown")
            bucket = totals_by_model[model]
            bucket["input"] += usage.get("input_tokens", 0)
            bucket["output"] += usage.get("output_tokens", 0)
            bucket["cache_read"] += usage.get("cache_read_input_tokens", 0)
            bucket["cache_creation"] += usage.get("cache_creation_input_tokens", 0)

    grand_total = sum(
        v for bucket in totals_by_model.values() for v in bucket.values()
    )
    grand_effective = sum(
        effective_total(bucket) for bucket in totals_by_model.values()
    )

    top_spec = None
    if spec_mentions:
        top_spec = max(spec_mentions.items(), key=lambda kv: kv[1])[0]

    return {
        "session": path.stem,
        "first_ts": first_ts,
        "last_ts": last_ts,
        "by_model": dict(totals_by_model),
        "grand_total": grand_total,
        "grand_effective": grand_effective,
        "spec_tag": top_spec,
        "spec_mentions": dict(spec_mentions),
    }


# Fase do ciclo de uma SPEC atribuída a cada agente. Agentes não listados aqui
# caem em "Apoio (outros agentes)" — não descartados, só não são nenhuma das
# três fases nomeadas pelo usuário (criação/decisão, implementação, verificação).
PHASE_BY_AGENT_TYPE = {
    "spec-implementer": "Implementação",
    "spec-validator": "Verificação",
}
PHASE_MAIN_THREAD = "Criação/Decisão"
PHASE_OTHER_AGENTS = "Apoio (outros agentes)"


def parse_subagents(session_dir: Path, fallback_spec_tag: str | None) -> list[dict]:
    subagents_dir = session_dir / "subagents"
    if not subagents_dir.is_dir():
        return []

    records = []
    for meta_path in subagents_dir.glob("agent-*.meta.json"):
        base = meta_path.name[: -len(".meta.json")]
        jsonl_path = subagents_dir / f"{base}.jsonl"
        if not jsonl_path.exists():
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8", errors="ignore"))
        except json.JSONDecodeError:
            meta = {}

        record = parse_session(jsonl_path)
        record["agent_type"] = meta.get("agentType", "unknown")
        record["description"] = meta.get("description")
        if not record["spec_tag"]:
            record["spec_tag"] = fallback_spec_tag
        record["phase"] = PHASE_BY_AGENT_TYPE.get(record["agent_type"], PHASE_OTHER_AGENTS)
        records.append(record)
    return records


def fmt(n: int) -> str:
    return f"{n:,}".replace(",", ".")


def read_spec_meta(spec_id: str) -> tuple[str | None, str | None]:
    matches = list(SPECS_DIR.glob(f"{spec_id}-*.md"))
    if not matches:
        return None, None
    text = matches[0].read_text(encoding="utf-8", errors="ignore")
    title_match = SPEC_TITLE_RE.search(text)
    title = title_match.group(1).strip() if title_match else None

    status_match = SPEC_STATUS_CHECKBOX_RE.search(text)
    if status_match:
        return title, status_match.group(1).strip()

    status_match = SPEC_STATUS_PLAIN_RE.search(text)
    status = status_match.group(1).strip() if status_match else None
    return title, status


def build_spec_log(sessions: list[dict], subagent_records: list[dict]) -> str:
    per_spec = defaultdict(
        lambda: {"total": 0, "effective": 0, "sessions": 0, "last_ts": None}
    )
    phase_totals = defaultdict(lambda: defaultdict(int))

    for s in sessions:
        tag = s["spec_tag"]
        if not tag:
            continue
        bucket = per_spec[tag]
        bucket["total"] += s["grand_total"]
        bucket["effective"] += s["grand_effective"]
        bucket["sessions"] += 1
        if s["last_ts"] and (bucket["last_ts"] is None or s["last_ts"] > bucket["last_ts"]):
            bucket["last_ts"] = s["last_ts"]
        phase_totals[tag][PHASE_MAIN_THREAD] += s["grand_effective"]

    for rec in subagent_records:
        tag = rec["spec_tag"]
        if not tag:
            continue
        phase_totals[tag][rec["phase"]] += rec["grand_effective"]
        per_spec[tag]["total"] += rec["grand_total"]
        per_spec[tag]["effective"] += rec["grand_effective"]

    done_totals = []
    lines = []
    lines.append("# Log de uso de tokens por SPEC\n")
    lines.append("> **Project Atlas — Log de Custo de Token por SPEC**\n")
    lines.append(
        f"Atualizado em: {dt.date.today().isoformat()} "
        "(regenerado por `python3 scripts/claude-usage-report.py`)\n"
    )
    lines.append(
        "Este documento existe para responder, antes de começar a implementar "
        "uma SPEC, à pergunta: *\"cabe numa sessão, ou é melhor esperar a "
        "próxima janela?\"*. Os totais são derivados automaticamente dos "
        "transcripts locais (heurística: sessão é atribuída à SPEC mais "
        "citada nela — uma sessão que tocou mais de uma SPEC entra só na "
        "dominante). Regenere após encerrar ou retomar trabalho em uma SPEC "
        "rodando o script acima; **não edite esta tabela manualmente**.\n"
    )
    lines.append(
        "**Tokens brutos** somam input + output + cache com o mesmo peso; "
        "**tokens efetivos** ponderam cada tipo pelo preço relativo ao token "
        "de input (cache read ~10%, cache write ~125%, output ~500%) — é o "
        "número que reflete custo/limite real e o usado para estimar. Sessões "
        "agênticas longas são dominadas por cache read barato, por isso o "
        "bruto pode ser ~10× o efetivo.\n"
    )
    lines.append("---\n")
    lines.append("## Por SPEC\n")
    lines.append(
        "| SPEC | Título | Status | Sessões | Última atividade | "
        "Tokens brutos | Tokens efetivos |"
    )
    lines.append("|---|---|---|---:|---|---:|---:|")
    for spec_id, bucket in sorted(per_spec.items(), key=lambda kv: kv[0]):
        title, status = read_spec_meta(spec_id)
        title = title or "(SPEC não encontrada em docs/implementation/specs/)"
        status = status or "?"
        last = (bucket["last_ts"] or "-")[:10]
        lines.append(
            f"| {spec_id} | {title} | {status} | {bucket['sessions']} | {last} | "
            f"{fmt(bucket['total'])} | {fmt(bucket['effective'])} |"
        )
        if status == "Done":
            done_totals.append(bucket["effective"])
    lines.append("")

    phases_present = sorted(
        {phase for totals in phase_totals.values() for phase in totals}
        - {PHASE_MAIN_THREAD}
    )
    lines.append("## Detalhamento por fase\n")
    lines.append(
        "Fase = qual agente fez o trabalho: **Criação/Decisão** é tudo que "
        "roda no fio principal (hoje isso cobre decidir o que vai ser feito, "
        "já que ainda não existe um agente dedicado a rascunhar SPEC); "
        "**Implementação** e **Verificação** só aparecem quando os subagents "
        "`spec-implementer`/`spec-validator` (`.claude/agents/`) são "
        "efetivamente usados via Task; **Apoio (outros agentes)** cobre "
        "qualquer outro subagent (ex. `Explore`, `code-reviewer`) invocado "
        "durante o trabalho na SPEC. SPECs antigas, implementadas antes de "
        "esses agentes existirem, aparecem 100% em Criação/Decisão — não é "
        "erro, é a fase real que ocorreu. Valores em **tokens efetivos**.\n"
    )
    header = ["SPEC", PHASE_MAIN_THREAD, "Implementação", "Verificação"] + (
        [PHASE_OTHER_AGENTS] if PHASE_OTHER_AGENTS in phases_present else []
    )
    lines.append("| " + " | ".join(header) + " |")
    lines.append("|" + "|".join(["---"] + ["---:"] * (len(header) - 1)) + "|")
    for spec_id in sorted(phase_totals.keys()):
        totals = phase_totals[spec_id]
        row = [
            spec_id,
            fmt(totals.get(PHASE_MAIN_THREAD, 0)),
            fmt(totals.get("Implementação", 0)),
            fmt(totals.get("Verificação", 0)),
        ]
        if PHASE_OTHER_AGENTS in phases_present:
            row.append(fmt(totals.get(PHASE_OTHER_AGENTS, 0)))
        lines.append("| " + " | ".join(row) + " |")
    lines.append("")

    lines.append("## Como estimar antes de começar uma SPEC nova\n")
    if done_totals:
        avg = sum(done_totals) // len(done_totals)
        lines.append(
            f"- SPECs concluídas (`Done`) até agora: {len(done_totals)}. "
            f"Custo médio: **{fmt(avg)} tokens efetivos**. "
            f"Faixa observada: {fmt(min(done_totals))} – {fmt(max(done_totals))} "
            "tokens efetivos.\n"
        )
    lines.append(
        "- Compare a SPEC que você está prestes a começar com as mais parecidas "
        "em tamanho na tabela acima (número de itens em \"Escopo\"/\"Critérios "
        "de Aceitação\", quantidade de \"Arquivos Esperados\"). Uma SPEC do "
        "porte de uma linha já concluída tende a custar perto do que ela "
        "custou.\n"
        "- Se o consumo já acumulado na sessão atual (rode o relatório "
        "detalhado, `.claude/usage-report.md`) mais a estimativa da próxima "
        "SPEC passar perto do seu limite de janela, prefira parar num ponto "
        "de commit limpo e retomar na próxima sessão em vez de começar e "
        "arriscar cortar a implementação pela metade.\n"
    )

    return "\n".join(lines)


def build_report(sessions: list[dict], top_n: int) -> str:
    lines = []
    lines.append("# Uso de tokens do Claude Code — Project Atlas\n")
    lines.append(
        "> Gerado por `scripts/claude-usage-report.py` a partir dos transcripts "
        "locais. Ferramenta pessoal, não é parte da documentação oficial do "
        "Atlas (não segue o processo de SPEC/ADR).\n"
    )

    overall_by_model = defaultdict(lambda: defaultdict(int))
    for s in sessions:
        for model, bucket in s["by_model"].items():
            for k, v in bucket.items():
                overall_by_model[model][k] += v

    grand_total = sum(s["grand_total"] for s in sessions)

    grand_effective = sum(s["grand_effective"] for s in sessions)

    lines.append("## Totais gerais\n")
    lines.append(f"- Sessões analisadas: {len(sessions)}")
    lines.append(f"- Tokens brutos (input + output + cache): {fmt(grand_total)}")
    lines.append(
        f"- Tokens efetivos (ponderados pelo preço relativo ao input — "
        f"cache read ~10%, cache write ~125%, output ~500%): {fmt(grand_effective)}\n"
    )

    lines.append("### Por modelo\n")
    lines.append(
        "| Modelo | Input | Output | Cache read | Cache creation | Total | Efetivo |"
    )
    lines.append("|---|---:|---:|---:|---:|---:|---:|")
    for model, bucket in sorted(
        overall_by_model.items(), key=lambda kv: -sum(kv[1].values())
    ):
        total = sum(bucket.values())
        lines.append(
            f"| {model} | {fmt(bucket['input'])} | {fmt(bucket['output'])} | "
            f"{fmt(bucket['cache_read'])} | {fmt(bucket['cache_creation'])} | "
            f"{fmt(total)} | {fmt(effective_total(bucket))} |"
        )
    lines.append("")

    by_spec = defaultdict(lambda: [0, 0])
    for s in sessions:
        tag = s["spec_tag"] or "(sem SPEC identificada)"
        by_spec[tag][0] += s["grand_total"]
        by_spec[tag][1] += s["grand_effective"]

    lines.append(
        "## Por SPEC (heurístico — sessão marcada pela SPEC mais citada nela)\n"
    )
    lines.append("| SPEC | Tokens brutos | Tokens efetivos |")
    lines.append("|---|---:|---:|")
    for tag, (total, effective) in sorted(by_spec.items(), key=lambda kv: -kv[1][1]):
        lines.append(f"| {tag} | {fmt(total)} | {fmt(effective)} |")
    lines.append("")

    lines.append(f"## Top {top_n} sessões por consumo efetivo\n")
    lines.append("| Sessão | Início | SPEC | Modelo(s) | Tokens brutos | Tokens efetivos |")
    lines.append("|---|---|---|---|---:|---:|")
    top_sessions = sorted(sessions, key=lambda s: -s["grand_effective"])[:top_n]
    for s in top_sessions:
        models = ", ".join(sorted(s["by_model"].keys())) or "-"
        started = (s["first_ts"] or "-")[:10]
        tag = s["spec_tag"] or "-"
        lines.append(
            f"| {s['session'][:8]} | {started} | {tag} | {models} | "
            f"{fmt(s['grand_total'])} | {fmt(s['grand_effective'])} |"
        )
    lines.append("")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--top", type=int, default=15, help="quantas sessões listar no ranking")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(".claude/usage-report.md"),
        help="onde salvar o relatório (default: .claude/usage-report.md, não versionado)",
    )
    parser.add_argument("--project-dir", type=Path, default=None)
    parser.add_argument(
        "--log-out",
        type=Path,
        default=REPO_ROOT / "docs" / "05-context" / "TOKEN_USAGE_LOG.md",
        help="onde salvar o log por SPEC versionado (default: docs/05-context/TOKEN_USAGE_LOG.md)",
    )
    parser.add_argument(
        "--no-log", action="store_true", help="não atualizar o log versionado por SPEC"
    )
    args = parser.parse_args()

    project_dir = args.project_dir or default_project_dir()
    if not project_dir.is_dir():
        raise SystemExit(f"Diretório de transcripts não encontrado: {project_dir}")

    sessions = []
    subagent_records = []
    for path in sorted(project_dir.glob("*.jsonl")):
        session = parse_session(path)
        sessions.append(session)
        session_dir = project_dir / path.stem
        subagent_records.extend(parse_subagents(session_dir, session["spec_tag"]))

    report = build_report(sessions, args.top)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(report, encoding="utf-8")
    print(report)
    print(f"\nRelatório detalhado salvo em {args.out}")

    if not args.no_log:
        spec_log = build_spec_log(sessions, subagent_records)
        args.log_out.parent.mkdir(parents=True, exist_ok=True)
        args.log_out.write_text(spec_log, encoding="utf-8")
        print(f"Log por SPEC salvo em {args.log_out}")


if __name__ == "__main__":
    main()
