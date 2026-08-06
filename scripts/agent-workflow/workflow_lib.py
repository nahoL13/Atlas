from __future__ import annotations

import json
import re
import tomllib
from dataclasses import dataclass
from pathlib import Path


CLAUDE_TOOLS = {
    "read": ("Read",),
    "search": ("Grep", "Glob"),
    "write": ("Write", "Edit"),
    "shell": ("Bash",),
}

START = "<!-- ATLAS-SPEC-PIPELINE:START -->"
END = "<!-- ATLAS-SPEC-PIPELINE:END -->"


def replace_generated_block(text: str, block: str) -> str:
    pattern = re.compile(rf"{re.escape(START)}.*?{re.escape(END)}", re.DOTALL)
    if pattern.search(text):
        return pattern.sub(block.rstrip(), text, count=1)
    anchor = "## Fluxo de desenvolvimento"
    if anchor not in text:
        raise ValueError(f"missing dispatch anchor: {anchor}")
    return text.replace(anchor, f"{block.rstrip()}\n\n{anchor}", 1)


@dataclass(frozen=True)
class ModelTier:
    claude_model: str
    codex_model: str
    codex_reasoning_effort: str


@dataclass(frozen=True)
class RoleDefinition:
    name: str
    description: str
    tier: str
    capabilities: tuple[str, ...]
    sandbox_mode: str
    instructions: str


def parse_role(path: Path) -> RoleDefinition:
    source = path.read_text(encoding="utf-8")
    match = re.fullmatch(r"\+\+\+\n(.*?)\n\+\+\+\n(.*)", source, re.DOTALL)
    if match is None:
        raise ValueError(f"Role file must use +++ TOML front matter: {path}")

    metadata = tomllib.loads(match.group(1))
    role = RoleDefinition(
        name=metadata["name"],
        description=metadata["description"],
        tier=metadata["tier"],
        capabilities=tuple(metadata["capabilities"]),
        sandbox_mode=metadata["sandbox_mode"],
        instructions=match.group(2).removeprefix("\n"),
    )
    if path.stem != role.name:
        raise ValueError(f"Role filename must match name: {path}")
    return role


def load_model_tiers(root: Path) -> dict[str, ModelTier]:
    raw = tomllib.loads((root / ".agents/workflow/model-tiers.toml").read_text())
    return {name: ModelTier(**values) for name, values in raw.items()}


def load_roles(root: Path) -> tuple[RoleDefinition, ...]:
    role_dir = root / ".agents/workflow/agents"
    return tuple(parse_role(path) for path in sorted(role_dir.glob("*.md")))


def render_claude_agent(role: RoleDefinition, tier: ModelTier) -> str:
    tools = ", ".join(tool for capability in role.capabilities for tool in CLAUDE_TOOLS[capability])
    return (
        "---\n"
        f"name: {role.name}\n"
        f"description: {role.description}\n"
        f"tools: {tools}\n"
        f"model: {tier.claude_model}\n"
        "---\n\n"
        f"{role.instructions}"
    )


def render_codex_agent(role: RoleDefinition, tier: ModelTier) -> str:
    return (
        f"name = {json.dumps(role.name, ensure_ascii=False)}\n"
        f"description = {json.dumps(role.description, ensure_ascii=False)}\n"
        f"model = {json.dumps(tier.codex_model, ensure_ascii=False)}\n"
        "model_reasoning_effort = "
        f"{json.dumps(tier.codex_reasoning_effort, ensure_ascii=False)}\n"
        f"sandbox_mode = {json.dumps(role.sandbox_mode, ensure_ascii=False)}\n"
        "developer_instructions = \"\"\"\n"
        f"{role.instructions}\"\"\"\n"
    )


def load_root_instruction(root: Path, filename: str) -> str:
    target = root / filename
    if target.exists():
        return target.read_text(encoding="utf-8")
    if filename != "AGENTS.md":
        raise FileNotFoundError(target)

    claude = (root / "CLAUDE.md").read_text(encoding="utf-8")
    return claude.replace("# CLAUDE.md", "# AGENTS.md", 1).replace(
        "guidance to Claude Code (claude.ai/code)", "guidance to Codex", 1
    )


def expected_generated_files(root: Path) -> dict[Path, str]:
    tiers = load_model_tiers(root)
    outputs: dict[Path, str] = {}
    for role in load_roles(root):
        tier = tiers[role.tier]
        outputs[Path(f".claude/agents/{role.name}.md")] = render_claude_agent(role, tier)
        outputs[Path(f".codex/agents/{role.name}.toml")] = render_codex_agent(role, tier)
    for skill in ("spec-check", "lessons-learned", "doc-sync", "spec-pipeline"):
        source = root / ".agents/skills" / skill / "SKILL.md"
        outputs[Path(f".claude/skills/{skill}/SKILL.md")] = source.read_text()
    dispatch = (root / ".agents/workflow/dispatch.md").read_text(encoding="utf-8")
    for filename in ("CLAUDE.md", "AGENTS.md"):
        outputs[Path(filename)] = replace_generated_block(
            load_root_instruction(root, filename), dispatch
        )
    outputs[Path(".codex/config.toml")] = (
        'project_doc_fallback_filenames = ["CLAUDE.md"]\n\n[agents]\nenabled = true\n'
    )
    return outputs


def write_generated_files(root: Path) -> None:
    for relative, content in expected_generated_files(root).items():
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
