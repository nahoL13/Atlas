from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

WORKFLOW_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKFLOW_DIR))

from hook_lib import (
    classify_prompt,
    extract_touched_paths,
    find_active_spec,
    handle_post_tool_use,
    handle_pre_tool_use,
    handle_user_prompt_submit,
)
from hook import dispatch
from workflow_lib import expected_generated_files


class HookTests(unittest.TestCase):
    def write_spec(self, root: Path, name: str, status: str, body: str) -> Path:
        specs = root / "docs/implementation/specs"
        specs.mkdir(parents=True, exist_ok=True)
        spec = specs / name
        spec.write_text(
            f"**Status**\n\n- [x] {status}\n\n---\n\n{body}\n", encoding="utf-8"
        )
        return spec

    def test_codex_patch_extracts_every_file(self) -> None:
        payload = json.loads(
            (Path(__file__).parent / "fixtures/hook-codex-patch.json").read_text()
        )
        self.assertEqual(
            extract_touched_paths("codex", payload),
            (Path("packages/runtime/src/runtime.ts"), Path("apps/cli/src/new-file.ts")),
        )

    def test_claude_write_extracts_its_absolute_file_path(self) -> None:
        payload = json.loads(
            (Path(__file__).parent / "fixtures/hook-claude-write.json").read_text()
        )
        self.assertEqual(
            extract_touched_paths("claude", payload),
            (Path("/repo/packages/runtime/src/runtime.ts"),),
        )

    def test_codex_patch_extracts_moved_and_deleted_files(self) -> None:
        payload = {
            "tool_input": {
                "command": "\n".join(
                    (
                        "*** Begin Patch",
                        "*** Update File: packages/runtime/src/old.ts",
                        "*** Move to: apps/cli/src/new.tsx",
                        "*** Delete File: tooling/release/src/deleted.cts",
                        "*** End Patch",
                    )
                )
            }
        }
        self.assertEqual(
            extract_touched_paths("codex", payload),
            (
                Path("packages/runtime/src/old.ts"),
                Path("tooling/release/src/deleted.cts"),
                Path("apps/cli/src/new.tsx"),
            ),
        )

    def test_codex_missing_spec_denies(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "packages/runtime/src").mkdir(parents=True)
            payload = {
                "cwd": str(root),
                "tool_name": "apply_patch",
                "tool_input": {
                    "command": "*** Begin Patch\n*** Update File: packages/runtime/src/runtime.ts\n*** End Patch"
                },
            }
            decision = handle_pre_tool_use("codex", payload, root)
            self.assertEqual(decision.exit_code, 0)
            body = json.loads(decision.stdout)
            self.assertEqual(body["hookSpecificOutput"]["permissionDecision"], "deny")
            self.assertIn("packages/runtime", body["hookSpecificOutput"]["permissionDecisionReason"])

    def test_claude_missing_spec_asks(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            payload = {"tool_input": {"file_path": str(root / "packages/runtime/src/runtime.ts")}}
            decision = handle_pre_tool_use("claude", payload, root)
            body = json.loads(decision.stdout)
            self.assertEqual(body["hookSpecificOutput"]["permissionDecision"], "ask")

    def test_claude_absolute_path_uses_its_source_component_when_cwd_is_elsewhere(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            payload = {"tool_input": {"file_path": "/repo/packages/runtime/src/runtime.ts"}}
            body = json.loads(handle_pre_tool_use("claude", payload, root).stdout)
            self.assertEqual(body["hookSpecificOutput"]["permissionDecision"], "ask")
            self.assertIn("packages/runtime", body["hookSpecificOutput"]["permissionDecisionReason"])

    def test_ready_spec_allows_without_output(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.write_spec(root, "SPEC-9999-runtime.md", "Ready", "packages/runtime")
            payload = {
                "tool_input": {
                    "command": "*** Begin Patch\n*** Update File: packages/runtime/src/runtime.ts\n*** End Patch"
                }
            }
            decision = handle_pre_tool_use("codex", payload, root)
            self.assertEqual((decision.exit_code, decision.stdout), (0, ""))

    def test_in_progress_spec_covers_atlas_package_name(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.write_spec(root, "SPEC-9999-runtime.md", "In Progress", "@atlas/runtime")
            self.assertEqual(find_active_spec(root, "packages/runtime"), root / "docs/implementation/specs/SPEC-9999-runtime.md")

    def test_official_ready_and_in_progress_statuses_cover_a_component(self) -> None:
        for status in ("Ready", "In Progress"):
            with self.subTest(status=status), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                spec = self.write_spec(root, "SPEC-9999-runtime.md", status, "packages/runtime")
                self.assertEqual(find_active_spec(root, "packages/runtime"), spec)

    def test_done_spec_with_historical_ready_checklist_does_not_cover_a_component(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            specs = root / "docs/implementation/specs"
            specs.mkdir(parents=True)
            (specs / "SPEC-9999-runtime.md").write_text(
                "\n".join(
                    (
                        "**Status**",
                        "",
                        "- [x] Done",
                        "",
                        "---",
                        "",
                        "# Critérios históricos",
                        "- [x] Ready",
                        "- [x] In Progress",
                        "packages/runtime",
                    )
                ),
                encoding="utf-8",
            )
            self.assertIsNone(find_active_spec(root, "packages/runtime"))

    def test_draft_and_done_specs_do_not_cover_source_edits(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.write_spec(root, "SPEC-0001-runtime.md", "Draft", "packages/runtime")
            self.write_spec(root, "SPEC-0002-runtime.md", "Done", "runtime")
            self.assertIsNone(find_active_spec(root, "packages/runtime"))

    def test_move_requires_active_specs_for_both_components(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.write_spec(root, "SPEC-9999-runtime.md", "Ready", "packages/runtime")
            payload = {
                "tool_input": {
                    "command": "\n".join(
                        (
                            "*** Begin Patch",
                            "*** Update File: packages/runtime/src/runtime.ts",
                            "*** Move to: apps/cli/src/runtime.tsx",
                            "*** End Patch",
                        )
                    )
                }
            }
            body = json.loads(handle_pre_tool_use("codex", payload, root).stdout)
            self.assertEqual(body["hookSpecificOutput"]["permissionDecision"], "deny")
            self.assertEqual(
                body["hookSpecificOutput"]["permissionDecisionReason"],
                "Nenhuma SPEC ativa cobre: apps/cli. Crie/aprove a SPEC e execute novamente.",
            )

    def test_deleted_source_file_still_requires_an_active_spec(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            payload = {
                "tool_input": {
                    "command": "*** Begin Patch\n*** Delete File: tooling/release/src/old.mts\n*** End Patch"
                }
            }
            body = json.loads(handle_pre_tool_use("codex", payload, root).stdout)
            self.assertEqual(body["hookSpecificOutput"]["permissionDecision"], "deny")
            self.assertIn("tooling/release", body["hookSpecificOutput"]["permissionDecisionReason"])

    def test_non_source_documents_do_not_need_a_spec(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            payload = {
                "tool_input": {
                    "command": "*** Begin Patch\n*** Update File: docs/guide.md\n*** End Patch"
                }
            }
            self.assertEqual(handle_pre_tool_use("codex", payload, root).stdout, "")

    def test_codex_edit_payload_without_extractable_paths_denies(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            payload = {
                "tool_name": "apply_patch",
                "tool_input": {"unexpected_patch_field": "opaque"},
            }
            decision = handle_pre_tool_use("codex", payload, root)

        body = json.loads(decision.stdout)
        self.assertEqual(body["hookSpecificOutput"]["permissionDecision"], "deny")
        self.assertIn(
            "não foi possível extrair caminhos",
            body["hookSpecificOutput"]["permissionDecisionReason"].lower(),
        )

    def test_claude_empty_edit_payload_asks(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            decision = handle_pre_tool_use(
                "claude", {"tool_name": "Edit", "tool_input": {}}, root
            )

        body = json.loads(decision.stdout)
        self.assertEqual(body["hookSpecificOutput"]["permissionDecision"], "ask")
        self.assertIn(
            "não foi possível extrair caminhos",
            body["hookSpecificOutput"]["permissionDecisionReason"].lower(),
        )

    def test_path_with_parent_segments_into_src_still_requires_a_spec(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            payload = {
                "tool_input": {
                    "command": (
                        "*** Begin Patch\n"
                        "*** Update File: packages/runtime/tmp/../../runtime/src/file.ts\n"
                        "*** End Patch"
                    )
                }
            }
            body = json.loads(handle_pre_tool_use("codex", payload, root).stdout)
            self.assertEqual(body["hookSpecificOutput"]["permissionDecision"], "deny")
            self.assertIn("packages/runtime", body["hookSpecificOutput"]["permissionDecisionReason"])

    def test_parent_segments_are_normalized_before_assigning_the_component(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.write_spec(root, "SPEC-9999-runtime.md", "Ready", "packages/runtime")
            payload = {
                "tool_input": {
                    "command": (
                        "*** Begin Patch\n"
                        "*** Update File: packages/runtime/src/../../../apps/cli/src/main.ts\n"
                        "*** End Patch"
                    )
                }
            }
            body = json.loads(handle_pre_tool_use("codex", payload, root).stdout)
            self.assertEqual(body["hookSpecificOutput"]["permissionDecision"], "deny")
            self.assertEqual(
                body["hookSpecificOutput"]["permissionDecisionReason"],
                "Nenhuma SPEC ativa cobre: apps/cli. Crie/aprove a SPEC e execute novamente.",
            )

    def test_all_missing_components_are_named_once(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.write_spec(root, "SPEC-9999-runtime.md", "Ready", "runtime")
            payload = {
                "tool_input": {
                    "command": "\n".join(
                        (
                            "*** Begin Patch",
                            "*** Update File: packages/runtime/src/runtime.ts",
                            "*** Add File: apps/cli/src/main.ts",
                            "*** Add File: tooling/release/src/build.ts",
                            "*** End Patch",
                        )
                    )
                }
            }
            body = json.loads(handle_pre_tool_use("codex", payload, root).stdout)
            self.assertEqual(
                body["hookSpecificOutput"]["permissionDecisionReason"],
                "Nenhuma SPEC ativa cobre: apps/cli, tooling/release. Crie/aprove a SPEC e execute novamente.",
            )

    def test_prompt_classification_targets_pipeline_skill(self) -> None:
        self.assertEqual(classify_prompt("faz a SPEC de cache"), "spec-pipeline")
        self.assertEqual(classify_prompt("valida a SPEC-0042"), "spec-pipeline")

    def test_unrelated_prompt_has_no_skill_classification(self) -> None:
        self.assertIsNone(classify_prompt("qual e o estado do projeto?"))

    def test_prompt_hook_names_only_the_pipeline_skill(self) -> None:
        decision = handle_user_prompt_submit({"prompt": "faz a SPEC de cache"})
        body = json.loads(decision.stdout)
        self.assertEqual(
            body,
            {
                "hookSpecificOutput": {
                    "hookEventName": "UserPromptSubmit",
                    "additionalContext": "Use a skill spec-pipeline.",
                }
            },
        )

    def test_post_tool_lints_tsx_and_returns_combined_output_on_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bin_dir = root / "bin"
            bin_dir.mkdir()
            pnpm = bin_dir / "pnpm"
            pnpm.write_text("#!/bin/sh\nprintf 'lint stdout\\n'\nprintf 'lint stderr\\n' >&2\nexit 1\n")
            pnpm.chmod(0o755)
            source = root / "apps/cli/src/main.tsx"
            source.parent.mkdir(parents=True)
            source.write_text("export {};\n", encoding="utf-8")
            payload = {"tool_input": {"file_path": str(source)}}
            old_path = os.environ.get("PATH", "")
            try:
                os.environ["PATH"] = f"{bin_dir}{os.pathsep}{old_path}"
                decision = handle_post_tool_use("claude", payload, root)
            finally:
                os.environ["PATH"] = old_path
            self.assertEqual(decision.exit_code, 2)
            self.assertIn("lint stdout", decision.stderr)
            self.assertIn("lint stderr", decision.stderr)

    def test_claude_post_tool_falls_back_to_its_response_file_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bin_dir = root / "bin"
            bin_dir.mkdir()
            pnpm = bin_dir / "pnpm"
            pnpm.write_text("#!/bin/sh\nprintf 'response path linted\\n'\nexit 1\n")
            pnpm.chmod(0o755)
            source = root / "apps/cli/src/main.mts"
            source.parent.mkdir(parents=True)
            source.write_text("export {};\n", encoding="utf-8")
            payload = {"tool_response": {"filePath": str(source)}}
            old_path = os.environ.get("PATH", "")
            try:
                os.environ["PATH"] = f"{bin_dir}{os.pathsep}{old_path}"
                decision = handle_post_tool_use("claude", payload, root)
            finally:
                os.environ["PATH"] = old_path
            self.assertEqual(decision.exit_code, 2)
            self.assertIn("response path linted", decision.stderr)

    def test_codex_post_tool_lints_every_typescript_path_in_a_patch(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bin_dir = root / "bin"
            bin_dir.mkdir()
            pnpm = bin_dir / "pnpm"
            pnpm.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\"\nexit 1\n")
            pnpm.chmod(0o755)
            for relative in (
                "packages/runtime/src/runtime.ts",
                "apps/cli/src/main.tsx",
                "tooling/release/src/build.mts",
                "tooling/release/src/check.cts",
            ):
                source = root / relative
                source.parent.mkdir(parents=True, exist_ok=True)
                source.write_text("export {};\n", encoding="utf-8")
            payload = {
                "tool_input": {
                    "command": "\n".join(
                        (
                            "*** Begin Patch",
                            "*** Update File: packages/runtime/src/runtime.ts",
                            "*** Add File: apps/cli/src/main.tsx",
                            "*** Add File: tooling/release/src/build.mts",
                            "*** Add File: tooling/release/src/check.cts",
                            "*** Add File: docs/guide.md",
                            "*** End Patch",
                        )
                    )
                }
            }
            old_path = os.environ.get("PATH", "")
            try:
                os.environ["PATH"] = f"{bin_dir}{os.pathsep}{old_path}"
                decision = handle_post_tool_use("codex", payload, root)
            finally:
                os.environ["PATH"] = old_path
            self.assertEqual(decision.exit_code, 2)
            for expected in (
                "packages/runtime/src/runtime.ts",
                "apps/cli/src/main.tsx",
                "tooling/release/src/build.mts",
                "tooling/release/src/check.cts",
            ):
                self.assertIn(expected, decision.stderr)
            self.assertNotIn("docs/guide.md", decision.stderr)

    def test_codex_post_tool_does_not_lint_a_deleted_typescript_source(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bin_dir = root / "bin"
            bin_dir.mkdir()
            marker = root / "pnpm-called"
            pnpm = bin_dir / "pnpm"
            pnpm.write_text(
                f"#!/bin/sh\ntouch {marker}\nexit 1\n", encoding="utf-8"
            )
            pnpm.chmod(0o755)
            payload = {
                "tool_input": {
                    "command": "*** Begin Patch\n*** Delete File: apps/cli/src/deleted.ts\n*** End Patch"
                }
            }
            old_path = os.environ.get("PATH", "")
            try:
                os.environ["PATH"] = f"{bin_dir}{os.pathsep}{old_path}"
                decision = handle_post_tool_use("codex", payload, root)
            finally:
                os.environ["PATH"] = old_path
            marker_was_created = marker.exists()

        self.assertEqual(decision, decision.__class__())
        self.assertFalse(marker_was_created)

    def test_codex_post_tool_lints_only_the_existing_move_destination(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            destination = root / "apps/cli/src/new.tsx"
            destination.parent.mkdir(parents=True)
            destination.write_text("export {};\n", encoding="utf-8")
            bin_dir = root / "bin"
            bin_dir.mkdir()
            pnpm = bin_dir / "pnpm"
            pnpm.write_text("#!/bin/sh\nprintf '%s\\n' \"$*\"\nexit 1\n")
            pnpm.chmod(0o755)
            payload = {
                "tool_input": {
                    "command": "\n".join(
                        (
                            "*** Begin Patch",
                            "*** Update File: packages/runtime/src/old.ts",
                            "*** Move to: apps/cli/src/new.tsx",
                            "*** End Patch",
                        )
                    )
                }
            }
            old_path = os.environ.get("PATH", "")
            try:
                os.environ["PATH"] = f"{bin_dir}{os.pathsep}{old_path}"
                decision = handle_post_tool_use("codex", payload, root)
            finally:
                os.environ["PATH"] = old_path

        self.assertEqual(decision.exit_code, 2)
        self.assertIn("apps/cli/src/new.tsx", decision.stderr)
        self.assertNotIn("packages/runtime/src/old.ts", decision.stderr)

    def test_codex_post_tool_skips_non_typescript_paths(self) -> None:
        payload = {
            "tool_input": {
                "command": "*** Begin Patch\n*** Update File: docs/guide.md\n*** End Patch"
            }
        }
        decision = handle_post_tool_use("codex", payload, Path.cwd())
        self.assertEqual((decision.exit_code, decision.stdout, decision.stderr), (0, "", ""))

    def test_hook_cli_fails_closed_when_payload_cwd_is_not_a_repository(self) -> None:
        payload = {
            "cwd": "/repo-does-not-exist",
            "tool_input": {"command": "*** Begin Patch\n*** End Patch"},
        }
        result = subprocess.run(
            [
                sys.executable,
                str(WORKFLOW_DIR / "hook.py"),
                "--platform",
                "codex",
                "--event",
                "PreToolUse",
            ],
            cwd=WORKFLOW_DIR.parents[1],
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("cannot resolve repository root", result.stderr)

    def test_hook_cli_accepts_fixture_payloads_with_a_real_git_cwd(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            subprocess.run(["git", "init"], cwd=root, capture_output=True, check=True)
            for platform, fixture, expected in (
                ("codex", "hook-codex-patch.json", "deny"),
                ("claude", "hook-claude-write.json", "ask"),
            ):
                payload = json.loads((Path(__file__).parent / "fixtures" / fixture).read_text())
                payload["cwd"] = str(root)
                result = subprocess.run(
                    [
                        sys.executable,
                        str(WORKFLOW_DIR / "hook.py"),
                        "--platform",
                        platform,
                        "--event",
                        "PreToolUse",
                    ],
                    cwd=WORKFLOW_DIR.parents[1],
                    input=json.dumps(payload),
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 0)
                body = json.loads(result.stdout)
                self.assertEqual(body["hookSpecificOutput"]["permissionDecision"], expected)

    def test_generator_configures_both_adapters_for_the_shared_hook(self) -> None:
        outputs = expected_generated_files(WORKFLOW_DIR.parents[1])
        claude = json.loads(outputs[Path(".claude/settings.json")])
        codex = json.loads(outputs[Path(".codex/hooks.json")])
        self.assertEqual(set(claude["hooks"]), {"PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop"})
        self.assertEqual(set(codex["hooks"]), {"PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop"})
        for event in ("PreToolUse", "PostToolUse", "UserPromptSubmit"):
            claude_command = claude["hooks"][event][0]["hooks"][0]["command"]
            self.assertIn("CLAUDE" + "_PROJECT_DIR", claude_command)
            self.assertIn("scripts/agent-workflow/hook.py", claude_command)
            self.assertNotIn("git rev-parse --show-toplevel", claude_command)
            codex_command = codex["hooks"][event][0]["hooks"][0]["command"]
            self.assertIn("git rev-parse --show-toplevel", codex_command)
            self.assertIn("scripts/agent-workflow/hook.py", codex_command)
            self.assertNotIn("CLAUDE" + "_PROJECT_DIR", codex_command)
        self.assertEqual(codex["hooks"]["PreToolUse"][0]["matcher"], "Edit|Write")
        self.assertEqual(codex["hooks"]["PostToolUse"][0]["matcher"], "Edit|Write")
        stop_hook = claude["hooks"]["Stop"][0]["hooks"][0]
        self.assertTrue(stop_hook["async"])
        self.assertEqual(
            stop_hook["command"],
            'cd "${' + "CLAUDE" + '_PROJECT_DIR:-.}" && python3 scripts/agent-usage-report.py --executor claude > /dev/null 2>&1 || true',
        )
        self.assertEqual(
            codex["hooks"]["Stop"][0]["hooks"][0]["command"],
            'python3 "$(git rev-parse --show-toplevel)/scripts/agent-workflow/hook.py" --platform codex --event Stop',
        )

    def test_codex_stop_keeps_success_protocol_when_reporter_fails(self) -> None:
        with patch("hook.subprocess.run", side_effect=OSError("reporter unavailable")):
            decision = dispatch(
                "codex",
                "Stop",
                {"transcript_path": "/tmp/transcript.jsonl"},
                Path("/repo"),
            )
        self.assertEqual((decision.exit_code, decision.stdout), (0, "{}"))
        self.assertIn("usage reporter failed", decision.stderr)

    def test_codex_stop_cli_is_fail_open_for_early_payload_failures(self) -> None:
        cases = (
            ("malformed JSON", "{"),
            ("non-object JSON", "[]"),
            ("missing cwd", "{}"),
            ("invalid cwd", json.dumps({"cwd": "/repo-does-not-exist"})),
        )
        for name, stdin in cases:
            with self.subTest(case=name):
                result = subprocess.run(
                    [
                        sys.executable,
                        str(WORKFLOW_DIR / "hook.py"),
                        "--platform",
                        "codex",
                        "--event",
                        "Stop",
                    ],
                    cwd=WORKFLOW_DIR.parents[1],
                    input=stdin,
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "{}")
                self.assertTrue(result.stderr.strip())


if __name__ == "__main__":
    unittest.main()
