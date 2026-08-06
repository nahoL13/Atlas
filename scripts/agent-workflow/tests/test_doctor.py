from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

WORKFLOW_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKFLOW_DIR))

from doctor import run_checks


class DoctorTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
