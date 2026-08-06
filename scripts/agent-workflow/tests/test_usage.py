from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

WORKFLOW_DIR = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).parent / "fixtures"
sys.path.insert(0, str(WORKFLOW_DIR))

from usage_lib import (
    UsageRecord,
    build_spec_log,
    discover_codex_records,
    migrate_legacy_log,
    parse_claude_session,
    parse_codex_session,
)


def make_usage_record(*, executor: str, spec_tag: str, raw_total: int) -> UsageRecord:
    return UsageRecord(
        executor=executor,
        session=f"{executor.lower()}-session",
        phase="Criação/Decisão",
        agent_role=None,
        models=(),
        input_tokens=raw_total,
        cached_input=0,
        cache_write_input=0,
        output_tokens=0,
        reasoning_output=0,
        raw_total=raw_total,
        effective_total=raw_total if executor == "Claude" else None,
        spec_tag=spec_tag,
        first_ts="2026-08-05T10:00:00Z",
        last_ts="2026-08-05T10:00:01Z",
        telemetry_status="complete",
        cwd="/repo/Atlas",
    )


class UsageTests(unittest.TestCase):
    def test_codex_uses_last_cumulative_total_once(self) -> None:
        record = parse_codex_session(FIXTURES / "codex-main.jsonl")
        self.assertEqual(record.executor, "Codex")
        self.assertEqual(record.raw_total, 180)
        self.assertEqual(record.cached_input, 90)
        self.assertEqual(record.spec_tag, "SPEC-0052")
        self.assertIsNone(record.effective_total)

    def test_codex_subagent_maps_role_to_phase(self) -> None:
        record = parse_codex_session(FIXTURES / "codex-subagent.jsonl")
        self.assertEqual(record.agent_role, "spec-implementer")
        self.assertEqual(record.phase, "Implementação")

    def test_codex_unknown_token_schema_is_incomplete(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            fixture = Path(temp) / "codex-incomplete.jsonl"
            fixture.write_text(
                '{"timestamp":"2026-08-05T10:00:00Z","type":"session_meta","payload":{"id":"incomplete","thread_source":"user","cwd":"/repo/Atlas"}}\n',
                encoding="utf-8",
            )
            record = parse_codex_session(fixture)
        self.assertEqual(record.telemetry_status, "incomplete")
        self.assertEqual(record.raw_total, 0)

    def test_codex_discovery_filters_sessions_outside_repo(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "Atlas"
            sessions = Path(temp) / "sessions"
            root.mkdir()
            sessions.mkdir()
            shutil.copy(FIXTURES / "codex-main.jsonl", sessions / "inside.jsonl")
            inside = (sessions / "inside.jsonl").read_text(encoding="utf-8").replace("/repo/Atlas", str(root))
            (sessions / "inside.jsonl").write_text(inside, encoding="utf-8")
            shutil.copy(FIXTURES / "codex-outside.jsonl", sessions / "outside.jsonl")
            self.assertEqual([record.session for record in discover_codex_records(sessions, root)], ["codex-main"])

    def test_legacy_migration_keeps_values_and_labels_every_table(self) -> None:
        legacy = "\n".join((
            "| SPEC | Título | Status | Sessões | Última atividade | Tokens brutos | Tokens efetivos |",
            "|---|---|---|---:|---|---:|---:|",
            "| SPEC-0052 | Title | Draft | 1 | 2026-08-05 | 100 | 50 |",
            "| SPEC | Criação/Decisão | Implementação |",
            "|---|---:|---:|",
            "| SPEC-0052 | 10 | 40 |",
            "| SPEC | Implementação | Overhead (resto) | Overhead ÷ Impl |",
            "|---|---:|---:|---:|",
            "| SPEC-0052 | 40 | 10 | 0.2× |",
        ))
        migrated = migrate_legacy_log(legacy)
        self.assertEqual(migrated.count("| SPEC-0052 | Claude |"), 3)
        self.assertIn("| SPEC-0052 | Claude | Title | Draft | 1 | 2026-08-05 | 100 | 50 |", migrated)

    def test_claude_description_overrides_body_spec_attribution(self) -> None:
        record = parse_claude_session(
            FIXTURES / "claude-subagent.jsonl",
            metadata={"agentType": "spec-implementer", "description": "Implementa a SPEC-0052"},
        )
        self.assertEqual(record.executor, "Claude")
        self.assertEqual(record.phase, "Implementação")
        self.assertEqual(record.spec_tag, "SPEC-0052")

    def test_shared_log_keeps_executors_separate(self) -> None:
        claude = make_usage_record(executor="Claude", spec_tag="SPEC-0052", raw_total=100)
        codex = make_usage_record(executor="Codex", spec_tag="SPEC-0052", raw_total=200)
        log = build_spec_log([claude, codex])
        self.assertIn("| SPEC | Executor |", log)
        self.assertIn("| SPEC-0052 | Claude |", log)
        self.assertIn("| SPEC-0052 | Codex |", log)
        self.assertNotIn("| SPEC-0052 | Ambos |", log)


if __name__ == "__main__":
    unittest.main()
