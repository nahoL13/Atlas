from __future__ import annotations

import sys
import tempfile
import unittest
from shutil import copytree
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

    def test_pipeline_skill_is_generated_for_claude(self) -> None:
        outputs = expected_generated_files(REPO_ROOT)
        skill = outputs[Path(".claude/skills/spec-pipeline/SKILL.md")]
        ordered_roles = [
            "spec-drafter",
            "architecture-reviewer",
            "spec-implementer",
            "spec-validator",
            "spec-closer",
        ]
        positions = [skill.index(role) for role in ordered_roles]
        self.assertEqual(positions, sorted(positions))
        self.assertIn("segundo veto", skill.lower())
        self.assertIn("segunda reprovação", skill.lower())
        self.assertIn("Perfil micro", skill)

    def test_codex_project_config_enables_fallback_instructions(self) -> None:
        config = expected_generated_files(REPO_ROOT)[Path(".codex/config.toml")]
        self.assertIn('project_doc_fallback_filenames = ["CLAUDE.md"]', config)
        self.assertIn("[agents]", config)
        self.assertIn("enabled = true", config)

    def test_root_dispatch_blocks_are_generated(self) -> None:
        outputs = expected_generated_files(REPO_ROOT)
        for path in (Path("CLAUDE.md"), Path("AGENTS.md")):
            text = outputs[path]
            self.assertEqual(text.count("<!-- ATLAS-SPEC-PIPELINE:START -->"), 1)
            self.assertEqual(text.count("<!-- ATLAS-SPEC-PIPELINE:END -->"), 1)
            self.assertIn("spec-pipeline", text)

    def test_bootstraps_agents_without_legacy_state_machine(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            copytree(REPO_ROOT / ".agents", root / ".agents")
            (root / "CLAUDE.md").write_text(
                "# CLAUDE.md\n\n"
                "This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.\n\n"
                "Conteúdo externo antes.\n\n"
                "## Fluxo de desenvolvimento\n\n"
                "- **O pipeline de SPEC é autônomo de ponta a ponta** (legado).\n"
                "- **Ramo micro (Emenda v1.2):** fluxo legado.\n"
                "- Conteúdo externo depois.\n",
                encoding="utf-8",
            )

            agents = expected_generated_files(root)[Path("AGENTS.md")]

        self.assertIn("# AGENTS.md", agents)
        self.assertIn("guidance to Codex", agents)
        self.assertIn("Conteúdo externo antes.", agents)
        self.assertIn("Conteúdo externo depois.", agents)
        self.assertNotIn("O pipeline de SPEC é autônomo de ponta a ponta", agents)
        self.assertNotIn("Ramo micro (Emenda v1.2)", agents)
        self.assertEqual(agents.count("<!-- ATLAS-SPEC-PIPELINE:START -->"), 1)


if __name__ == "__main__":
    unittest.main()
