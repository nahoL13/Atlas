from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

WORKFLOW_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = WORKFLOW_DIR.parents[1]
sys.path.insert(0, str(WORKFLOW_DIR))

from workflow_lib import expected_generated_files, load_model_tiers, load_roles


EXPECTED_ROLES = {
    "spec-drafter",
    "architecture-reviewer",
    "spec-implementer",
    "spec-validator",
    "spec-closer",
}


class GenerationTests(unittest.TestCase):
    def test_loads_exact_role_set(self) -> None:
        roles = load_roles(REPO_ROOT)
        self.assertEqual({role.name for role in roles}, EXPECTED_ROLES)

    def test_model_tiers_map_both_executors(self) -> None:
        tiers = load_model_tiers(REPO_ROOT)
        self.assertEqual(tiers["deep-reasoning"].claude_model, "opus")
        self.assertEqual(tiers["deep-reasoning"].codex_model, "gpt-5.6-sol")
        self.assertEqual(tiers["balanced-execution"].claude_model, "sonnet")
        self.assertEqual(tiers["balanced-execution"].codex_model, "gpt-5.6-terra")

    def test_renders_all_agent_and_skill_adapters(self) -> None:
        outputs = expected_generated_files(REPO_ROOT)
        for role in EXPECTED_ROLES:
            self.assertIn(Path(f".claude/agents/{role}.md"), outputs)
            self.assertIn(Path(f".codex/agents/{role}.toml"), outputs)
        for skill in ("spec-check", "lessons-learned", "doc-sync"):
            self.assertIn(Path(f".claude/skills/{skill}/SKILL.md"), outputs)

    def test_codex_agents_pin_model_effort_and_valid_paths(self) -> None:
        outputs = expected_generated_files(REPO_ROOT)
        drafter = outputs[Path(".codex/agents/spec-drafter.toml")]
        closer = outputs[Path(".codex/agents/spec-closer.toml")]
        self.assertIn('model = "gpt-5.6-sol"', drafter)
        self.assertIn('model = "gpt-5.6-terra"', closer)
        self.assertIn('model_reasoning_effort = "high"', closer)
        self.assertNotIn(".Codex/", closer)
        self.assertNotIn("noreply@anthropic.com", closer)

    def test_claude_agent_preserves_single_front_matter_separator(self) -> None:
        outputs = expected_generated_files(REPO_ROOT)
        drafter = outputs[Path(".claude/agents/spec-drafter.md")]
        self.assertIn("model: opus\n---\n\nVocê rascunha", drafter)

    def test_doc_sync_adapter_keeps_neutral_trailer_and_scoped_staging(self) -> None:
        canonical = (REPO_ROOT / ".agents/skills/doc-sync/SKILL.md").read_text()
        generated = expected_generated_files(REPO_ROOT)[
            Path(".claude/skills/doc-sync/SKILL.md")
        ]
        for content in (canonical, generated):
            self.assertIn("git add <lista-explícita-de-arquivos-da-SPEC>", content)
            self.assertNotIn("\ngit add -A\n", content)
            self.assertIn("Co-Authored-By: <modelo em uso>", content)
            self.assertNotIn("noreply@anthropic.com", content)


if __name__ == "__main__":
    unittest.main()
