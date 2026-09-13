from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from unittest.mock import patch

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
    update_usage_files,
    _read_spec_meta,
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

    def test_codex_last_token_count_schema_controls_completeness(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            transcript = Path(temp) / "last-schema.jsonl"
            source = (FIXTURES / "codex-main.jsonl").read_text(encoding="utf-8")
            transcript.write_text(source + '{"timestamp":"2026-08-05T10:00:05Z","type":"event_msg","payload":{"type":"token_count","info":{}}}\n', encoding="utf-8")
            record = parse_codex_session(transcript)
        self.assertEqual(record.telemetry_status, "incomplete")
        self.assertEqual(record.raw_total, 0)

    def test_claude_without_valid_usage_is_incomplete(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            transcript = Path(temp) / "claude-no-usage.jsonl"
            transcript.write_text('{"timestamp":"2026-08-05T10:00:00Z","message":{"content":"SPEC-0052"}}\n', encoding="utf-8")
            record = parse_claude_session(transcript)
        self.assertEqual(record.telemetry_status, "incomplete")

    def test_claude_empty_usage_schema_is_incomplete(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            transcript = Path(temp) / "claude-empty-usage.jsonl"
            transcript.write_text('{"message":{"usage":{}}}\n', encoding="utf-8")
            record = parse_claude_session(transcript)
        self.assertEqual(record.telemetry_status, "incomplete")

    def test_claude_invalid_usage_values_are_incomplete(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            transcript = Path(temp) / "claude-invalid-usage.jsonl"
            transcript.write_text('{"message":{"usage":{"input_tokens":"not-a-number"}}}\n', encoding="utf-8")
            record = parse_claude_session(transcript)
        self.assertEqual(record.telemetry_status, "incomplete")

    def test_claude_false_usage_value_is_incomplete(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            transcript = Path(temp) / "claude-false-usage.jsonl"
            transcript.write_text('{"message":{"usage":{"input_tokens":false}}}\n', encoding="utf-8")
            record = parse_claude_session(transcript)
        self.assertEqual(record.telemetry_status, "incomplete")

    def test_claude_true_usage_value_is_incomplete(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            transcript = Path(temp) / "claude-true-usage.jsonl"
            transcript.write_text('{"message":{"usage":{"input_tokens":true}}}\n', encoding="utf-8")
            record = parse_claude_session(transcript)
        self.assertEqual(record.telemetry_status, "incomplete")

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

    def test_codex_subagent_inherits_spec_from_parent_when_it_has_no_mention(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "Atlas"
            sessions = Path(temp) / "sessions"
            root.mkdir()
            sessions.mkdir()
            for name in ("codex-main.jsonl", "codex-subagent-no-spec.jsonl"):
                source = (FIXTURES / name).read_text(encoding="utf-8").replace("/repo/Atlas", str(root))
                (sessions / name).write_text(source, encoding="utf-8")
            records = {record.session: record for record in discover_codex_records(sessions, root)}
        self.assertEqual(records["codex-child-no-spec"].spec_tag, "SPEC-0052")

    def test_sequential_codex_updates_accumulate_sessions_and_phases(self) -> None:
        first = UsageRecord("Codex", "one", "Criação/Decisão", None, (), 100, 0, 0, 0, 0, 100, None, "SPEC-0052", "2026-08-05T10:00:00Z", "2026-08-05T10:00:00Z", "complete", "/repo/Atlas")
        second = UsageRecord("Codex", "two", "Implementação", "spec-implementer", (), 200, 0, 0, 0, 0, 200, None, "SPEC-0052", "2026-08-05T10:01:00Z", "2026-08-05T10:01:00Z", "complete", "/repo/Atlas")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            log_path, cache_path = root / "TOKEN_USAGE_LOG.md", root / "usage-cache.json"
            log_path.write_text(build_spec_log([]), encoding="utf-8")
            with patch("usage_lib.SPECS_DIR", root):
                update_usage_files(log_path, cache_path, [first], now="2026-08-05T10:00:01Z")
                merged = update_usage_files(
                    log_path, cache_path, [second], now="2026-08-05T10:01:01Z"
                )
        self.assertIn("| SPEC-0052 | Codex |", merged)
        self.assertIn("| SPEC-0052 | Codex | (SPEC não encontrada em docs/implementation/specs/) | ? | 2 | 2026-08-05 | 300 | N/D | complete |", merged)
        self.assertIn("| SPEC-0052 | Codex | N/D | N/D |", merged)

    def test_reprocessing_same_session_is_idempotent(self) -> None:
        record = UsageRecord("Codex", "same", "Criação/Decisão", None, (), 100, 0, 0, 0, 0, 100, None, "SPEC-0052", "2026-08-05T10:00:00Z", "2026-08-05T10:00:00Z", "complete", "/repo/Atlas")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            log_path, cache_path = root / "TOKEN_USAGE_LOG.md", root / "usage-cache.json"
            log_path.write_text(build_spec_log([]), encoding="utf-8")
            with patch("usage_lib.SPECS_DIR", root):
                update_usage_files(log_path, cache_path, [record], now="2026-08-05T10:00:01Z")
                once = update_usage_files(
                    log_path, cache_path, [record], now="2026-08-05T10:00:02Z"
                )
        self.assertIn("| SPEC-0052 | Codex | (SPEC não encontrada em docs/implementation/specs/) | ? | 1 | 2026-08-05 | 100 | N/D | complete |", once)

    def test_later_snapshot_replaces_same_session_contribution(self) -> None:
        first = UsageRecord("Codex", "same", "Criação/Decisão", None, (), 100, 0, 0, 0, 0, 100, None, "SPEC-0052", "2026-08-05T10:00:00Z", "2026-08-05T10:00:00Z", "complete", "/repo/Atlas")
        later = UsageRecord("Codex", "same", "Criação/Decisão", None, (), 180, 0, 0, 0, 0, 180, None, "SPEC-0052", "2026-08-05T10:05:00Z", "2026-08-05T10:05:00Z", "complete", "/repo/Atlas")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            log_path, cache_path = root / "TOKEN_USAGE_LOG.md", root / "usage-cache.json"
            log_path.write_text(build_spec_log([]), encoding="utf-8")
            with patch("usage_lib.SPECS_DIR", root):
                update_usage_files(log_path, cache_path, [first], now="2026-08-05T10:00:01Z")
                merged = update_usage_files(
                    log_path, cache_path, [later], now="2026-08-05T10:05:01Z"
                )
        self.assertIn("| SPEC-0052 | Codex | (SPEC não encontrada em docs/implementation/specs/) | ? | 1 | 2026-08-05 | 180 | N/D | complete |", merged)

    def test_distinct_sessions_accumulate_after_idempotent_merge(self) -> None:
        first = UsageRecord("Codex", "one", "Criação/Decisão", None, (), 100, 0, 0, 0, 0, 100, None, "SPEC-0052", "2026-08-05T10:00:00Z", "2026-08-05T10:00:00Z", "complete", "/repo/Atlas")
        second = UsageRecord("Codex", "two", "Criação/Decisão", None, (), 200, 0, 0, 0, 0, 200, None, "SPEC-0052", "2026-08-05T10:01:00Z", "2026-08-05T10:01:00Z", "complete", "/repo/Atlas")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            log_path, cache_path = root / "TOKEN_USAGE_LOG.md", root / "usage-cache.json"
            log_path.write_text(build_spec_log([]), encoding="utf-8")
            with patch("usage_lib.SPECS_DIR", root):
                update_usage_files(log_path, cache_path, [first], now="2026-08-05T10:00:01Z")
                merged = update_usage_files(
                    log_path, cache_path, [second], now="2026-08-05T10:01:01Z"
                )
        self.assertIn("| SPEC-0052 | Codex | (SPEC não encontrada em docs/implementation/specs/) | ? | 2 | 2026-08-05 | 300 | N/D | complete |", merged)

    def test_first_cache_migration_preserves_history_and_cuts_over_sessions(self) -> None:
        historical = UsageRecord("Codex", "historical", "Criação/Decisão", None, ("gpt-5.6-sol",), 100, 0, 0, 0, 0, 100, None, "SPEC-0052", "2026-08-05T09:00:00Z", "2026-08-05T09:10:00Z", "complete", "/repo/Atlas")
        late_discovered_history = UsageRecord("Claude", "late-historical", "Revisão", "architecture-reviewer", ("claude-opus-4-1",), 500, 0, 0, 0, 0, 500, 500, "SPEC-0052", "2026-08-05T09:30:00Z", "2026-08-05T09:40:00Z", "complete", "/repo/Atlas")
        fresh = UsageRecord("Codex", "fresh", "Implementação", "spec-implementer", ("gpt-5.6-terra",), 200, 0, 0, 0, 0, 200, None, "SPEC-0052", "2026-08-05T10:01:00Z", "2026-08-05T10:02:00Z", "complete", "/repo/Atlas")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            log_path, cache_path = root / "TOKEN_USAGE_LOG.md", root / "usage-cache.json"
            baseline = build_spec_log([historical])
            log_path.write_text(baseline, encoding="utf-8")

            migrated = update_usage_files(
                log_path, cache_path, [historical], now="2026-08-05T10:00:00Z"
            )
            updated = update_usage_files(
                log_path,
                cache_path,
                [historical, late_discovered_history, fresh],
                now="2026-08-05T10:03:00Z",
            )
            cache = json.loads(cache_path.read_text(encoding="utf-8"))

        self.assertIn("| 1 | 2026-08-05 | 100 | N/D |", migrated)
        self.assertIn("| 2 | 2026-08-05 | 300 | N/D |", updated)
        self.assertIn(
            {"executor": "Codex", "session": "historical"},
            cache["ignored_sessions"],
        )
        self.assertIn(
            {"executor": "Claude", "session": "late-historical"},
            cache["ignored_sessions"],
        )
        self.assertNotIn("| SPEC-0052 | Claude |", updated)

    def test_incomplete_snapshot_does_not_replace_last_complete_session(self) -> None:
        complete = UsageRecord("Codex", "same", "Criação/Decisão", None, (), 180, 0, 0, 0, 0, 180, None, "SPEC-0052", "2026-08-05T10:00:00Z", "2026-08-05T10:05:00Z", "complete", "/repo/Atlas")
        incomplete = UsageRecord("Codex", "same", "Criação/Decisão", None, (), 0, 0, 0, 0, 0, 0, None, "SPEC-0052", "2026-08-05T10:00:00Z", "2026-08-05T10:06:00Z", "incomplete", "/repo/Atlas")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            log_path, cache_path = root / "TOKEN_USAGE_LOG.md", root / "usage-cache.json"
            log_path.write_text(build_spec_log([]), encoding="utf-8")
            update_usage_files(log_path, cache_path, [complete], now="2026-08-05T10:05:01Z")
            updated = update_usage_files(
                log_path, cache_path, [incomplete], now="2026-08-05T10:06:01Z"
            )
            cache = cache_path.read_text(encoding="utf-8")

        self.assertIn("| 1 | 2026-08-05 | 180 | N/D | complete |", updated)
        self.assertIn('"raw_total":180', cache)

    def test_shared_log_has_only_aggregates_and_private_cache_has_session_details(self) -> None:
        record = UsageRecord("Codex", "private-session-id", "Criação/Decisão", None, ("private-model",), 100, 25, 0, 10, 5, 100, None, "SPEC-0052", "2026-08-05T10:00:00Z", "2026-08-05T10:05:00Z", "complete", "/private/repo")
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            log_path, cache_path = root / "TOKEN_USAGE_LOG.md", root / "usage-cache.json"
            log_path.write_text(build_spec_log([]), encoding="utf-8")
            shared = update_usage_files(
                log_path, cache_path, [record], now="2026-08-05T10:05:01Z"
            )
            private = cache_path.read_text(encoding="utf-8")

        for detail in ("private-session-id", "private-model", "/private/repo", "cached_input"):
            self.assertNotIn(detail, shared)
            self.assertIn(detail, private)
        self.assertNotIn("ATLAS-USAGE-SESSION-LEDGER", shared)

    def test_concurrent_reporters_serialize_without_losing_a_session(self) -> None:
        worker = """
import sys
from pathlib import Path
from usage_lib import UsageRecord, update_usage_files
log_path, cache_path, session, raw, timestamp = sys.argv[1:]
record = UsageRecord('Codex', session, 'Criação/Decisão', None, (), int(raw), 0, 0, 0, 0, int(raw), None, 'SPEC-0052', timestamp, timestamp, 'complete', '/repo/Atlas')
update_usage_files(Path(log_path), Path(cache_path), [record], now='2026-08-05T11:00:00Z')
"""
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            log_path, cache_path = root / "TOKEN_USAGE_LOG.md", root / "usage-cache.json"
            log_path.write_text(build_spec_log([]), encoding="utf-8")
            env = {**os.environ, "PYTHONPATH": str(WORKFLOW_DIR)}
            processes = [
                subprocess.Popen(
                    [
                        sys.executable,
                        "-c",
                        worker,
                        str(log_path),
                        str(cache_path),
                        session,
                        raw,
                        timestamp,
                    ],
                    env=env,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                for session, raw, timestamp in (
                    ("one", "100", "2026-08-05T10:00:00Z"),
                    ("two", "200", "2026-08-05T10:01:00Z"),
                )
            ]
            results = [process.communicate(timeout=10) for process in processes]
            statuses = [process.returncode for process in processes]
            shared = log_path.read_text(encoding="utf-8")
            cache = json.loads(cache_path.read_text(encoding="utf-8"))

        self.assertEqual(statuses, [0, 0], results)
        self.assertIn("| 2 | 2026-08-05 | 300 | N/D | complete |", shared)
        self.assertEqual(
            {item["session"] for item in cache["sessions"]}, {"one", "two"}
        )

    def test_all_executor_report_keeps_top_record_for_each_executor(self) -> None:
        source = WORKFLOW_DIR.parent / "agent-usage-report.py"
        spec = spec_from_file_location("agent_usage_report", source)
        assert spec is not None and spec.loader is not None
        module = module_from_spec(spec)
        spec.loader.exec_module(module)
        claude = make_usage_record(executor="Claude", spec_tag="SPEC-0052", raw_total=100)
        codex = make_usage_record(executor="Codex", spec_tag="SPEC-0052", raw_total=200)
        report = module.build_private_report([claude, codex], "all", 1)
        self.assertIn("## Claude", report)
        self.assertIn("## Codex", report)
        self.assertIn("| Claude | claude-session |", report)
        self.assertIn("| Codex | codex-session |", report)

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

    def test_spec_status_comes_only_from_the_official_status_section(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            specs = Path(temp)
            (specs / "SPEC-9999-status.md").write_text(
                "\n".join(
                    (
                        "# SPEC-9999",
                        "",
                        "- [x] Draft",
                        "",
                        "**Título**",
                        "",
                        "Status parser",
                        "",
                        "**Status**",
                        "",
                        "- [ ] Draft",
                        "- [ ] Ready",
                        "- [ ] In Progress",
                        "- [ ] Review",
                        "- [x] Done",
                        "",
                        "---",
                    )
                ),
                encoding="utf-8",
            )
            with patch("usage_lib.SPECS_DIR", specs):
                _title, status = _read_spec_meta("SPEC-9999")

        self.assertEqual(status, "Done")


if __name__ == "__main__":
    unittest.main()
