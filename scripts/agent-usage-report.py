#!/usr/bin/env python3
"""Generate executor-separated local usage reports for Project Atlas."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

WORKFLOW_DIR = Path(__file__).resolve().parent / "agent-workflow"
sys.path.insert(0, str(WORKFLOW_DIR))

from usage_lib import (  # noqa: E402
    REPO_ROOT,
    build_spec_log,
    discover_claude_records,
    discover_codex_records,
    migrate_legacy_log,
    parse_codex_session,
)


def default_claude_project_dir() -> Path:
    return Path.home() / ".claude" / "projects" / str(REPO_ROOT).replace("/", "-")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executor", choices=("claude", "codex", "all"), default="all")
    parser.add_argument("--claude-project-dir", type=Path, default=None)
    parser.add_argument("--codex-sessions-dir", type=Path, default=Path.home() / ".codex" / "sessions")
    parser.add_argument("--transcript", type=Path, default=None)
    parser.add_argument("--top", type=int, default=15)
    parser.add_argument("--no-log", action="store_true")
    parser.add_argument("--out", type=Path, default=None)
    return parser.parse_args()


def build_private_report(records: list, executor: str, top_n: int) -> str:
    selected = [record for record in records if executor == "all" or record.executor.lower() == executor]
    lines = ["# Uso de tokens por executor — Project Atlas\n", f"- Executor: {executor}\n", f"- Sessões analisadas: {len(selected)}\n", "| Executor | Sessão | SPEC | Modelos | Tokens brutos | Tokens efetivos | Telemetria |", "|---|---|---|---|---:|---:|---|"]
    for record in sorted(selected, key=lambda item: item.raw_total, reverse=True)[:top_n]:
        effective = str(record.effective_total) if record.effective_total is not None else "N/D"
        lines.append(f"| {record.executor} | {record.session[:16]} | {record.spec_tag or '-'} | {', '.join(record.models) or '-'} | {record.raw_total} | {effective} | {record.telemetry_status} |")
    return "\n".join(lines) + "\n"


def merge_codex_rows(existing: str, current: str) -> str:
    """Add fresh Codex rows without recomputing unrecoverable Claude history."""
    sections = (("## Por SPEC", "## Detalhamento por fase"), ("## Detalhamento por fase", "## Eficiência de processo"))
    for start_marker, end_marker in sections:
        current_start = current.find(start_marker)
        current_end = current.find(end_marker, current_start + len(start_marker))
        incoming = [line for line in current[current_start:current_end].splitlines() if line.startswith("| SPEC-") and "| Codex |" in line]
        if not incoming:
            continue
        start = existing.find(start_marker)
        end = existing.find(end_marker, start + len(start_marker))
        section = existing[start:end]
        for line in incoming:
            key = "|".join(line.split("|")[:3]) + "|"
            section_lines = [old for old in section.splitlines() if not old.startswith(key)]
            section = "\n".join(section_lines).rstrip() + "\n" + line + "\n"
        existing = existing[:start] + section + existing[end:]
    return existing


def main() -> None:
    args = parse_args()
    records = []
    if args.executor in {"claude", "all"}:
        project_dir = args.claude_project_dir or default_claude_project_dir()
        if project_dir.is_dir():
            records.extend(discover_claude_records(project_dir))
    if args.executor in {"codex", "all"}:
        if args.transcript is not None:
            records.append(parse_codex_session(args.transcript))
        elif args.codex_sessions_dir.is_dir():
            records.extend(discover_codex_records(args.codex_sessions_dir, REPO_ROOT))
    if args.out is None:
        args.out = REPO_ROOT / (".claude/usage-report.md" if args.executor == "claude" else ".codex/usage-report.md")
    report = build_private_report(records, args.executor, args.top)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(report, encoding="utf-8")
    print(report, end="")
    if args.no_log:
        return
    log_path = REPO_ROOT / "docs/05-context/TOKEN_USAGE_LOG.md"
    existing = log_path.read_text(encoding="utf-8") if log_path.exists() else ""
    # The first unified regeneration must retain legacy Claude history exactly;
    # discovery on a new checkout cannot reconstruct past local transcripts.
    if existing:
        # Historical Claude transcripts are local and frequently unavailable in
        # a worktree. Keep their exact, previously validated arithmetic.
        log = migrate_legacy_log(existing)
        codex_records = [record for record in records if record.executor == "Codex"]
        if codex_records:
            log = merge_codex_rows(log, build_spec_log(codex_records))
    else:
        log = build_spec_log(records)
    log_path.write_text(log, encoding="utf-8")
    print(f"Log por SPEC salvo em {log_path}")


if __name__ == "__main__":
    main()
