from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from shutil import copytree

WORKFLOW_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKFLOW_DIR))

from doctor import run_checks
from workflow_lib import write_generated_files


class DoctorTests(unittest.TestCase):
    def make_generated_repo(self, root: Path) -> None:
        copytree(WORKFLOW_DIR.parents[1] / ".agents", root / ".agents")
        (root / "CLAUDE.md").write_text(
            "# CLAUDE.md\n\n"
            "This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.\n\n"
            "## Fluxo de desenvolvimento\n",
            encoding="utf-8",
        )
        write_generated_files(root)

    def test_reports_missing_generated_agent(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            checks = run_checks(root)
            self.assertTrue(any(check.status == "error" for check in checks))

    def test_real_repo_has_no_workflow_errors(self) -> None:
        root = WORKFLOW_DIR.parents[1]
        checks = run_checks(root)
        self.assertFalse([check for check in checks if check.status == "error"])

    def test_hook_trust_is_explicitly_manual(self) -> None:
        root = WORKFLOW_DIR.parents[1]
        checks = run_checks(root)
        trust = next(check for check in checks if check.name == "hook trust")
        self.assertEqual(trust.status, "manual")
        self.assertEqual(
            trust.detail,
            "abra `/hooks` no Codex e revise o hash pendente",
        )

    def test_reports_crlf_byte_drift_in_generated_adapter(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.make_generated_repo(root)
            target = root / ".codex/agents/spec-drafter.toml"
            target.write_bytes(target.read_bytes().replace(b"\n", b"\r\n"))

            parity = next(check for check in run_checks(root) if check.name == "generated parity")

        self.assertEqual(parity.status, "error")
        self.assertIn(".codex/agents/spec-drafter.toml", parity.detail)

    def test_reports_obsolete_generated_adapter(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.make_generated_repo(root)
            obsolete = root / ".claude/agents/obsolete.md"
            obsolete.write_text("obsolete\n", encoding="utf-8")

            parity = next(check for check in run_checks(root) if check.name == "generated parity")

        self.assertEqual(parity.status, "error")
        self.assertIn(".claude/agents/obsolete.md", parity.detail)


if __name__ == "__main__":
    unittest.main()
