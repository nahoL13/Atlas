# Dual Agent Development Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Claude Code and Codex Desktop/CLI/IDE execute the same autonomous Atlas SPEC pipeline from one canonical workflow definition, with tested adapters, hooks, and executor-labelled telemetry.

**Architecture:** Human-maintained role prompts and skills live under `.agents/`; a deterministic standard-library Python generator renders Claude and Codex adapters. Shared Python hook logic translates each client's payload into the same policy decisions, while independent transcript readers normalize usage records without combining incomparable provider metrics.

**Tech Stack:** Python 3 standard library (`dataclasses`, `json`, `tomllib`, `unittest`, `subprocess`), Markdown/TOML/JSON configuration, Claude Code hooks, Codex custom agents/hooks, pnpm 11, Node.js 24, existing GitHub Actions CI.

## Global Constraints

- Do not edit `packages/*/src`, `apps/*/src`, or product behavior.
- Preserve all pre-existing worktree changes, especially ADR-0023, SPEC-0052, `TOKEN_USAGE_LOG.md`, and ADR-0022; stage only files owned by the current task.
- Keep Claude Code operational after every task; Codex activation must never become a prerequisite for Claude.
- Use only the Python standard library; add no runtime or development dependency.
- Canonical role tiers are `deep-reasoning` and `balanced-execution`.
- Map `deep-reasoning` to Claude `opus` and Codex `gpt-5.6-sol`; map `balanced-execution` to Claude `sonnet` and Codex `gpt-5.6-terra`.
- Configure Codex `model_reasoning_effort = "high"` for all five custom agents.
- Keep generated adapters committed; CI must detect drift without calling a model or requiring Claude/OpenAI authentication.
- Preserve executor-specific accounting: never sum or rank Claude and Codex as a universal cost total.
- Every commit must include only that task's files and the repository-required `Co-Authored-By` trailer naming the model actually executing the task.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm format:check` before declaring the implementation complete.

---

## File Map

### Canonical inputs

- `.agents/workflow/model-tiers.toml` — supplier-specific model and reasoning mappings for the two neutral capability tiers.
- `.agents/workflow/dispatch.md` — short, shared root-instruction block that tells the primary thread to invoke `spec-pipeline`.
- `.agents/workflow/agents/*.md` — five neutral role definitions with TOML front matter and the complete role instructions.
- `.agents/skills/spec-pipeline/SKILL.md` — canonical complete/micro state machine and handoff contract.
- `.agents/skills/spec-check/SKILL.md` — source-edit gate method.
- `.agents/skills/lessons-learned/SKILL.md` — canonical closeout history format.
- `.agents/skills/doc-sync/SKILL.md` — canonical living-document synchronization format.

### Workflow implementation

- `scripts/agent-workflow/workflow_lib.py` — parsing, validation, rendering, generated-block replacement, and expected-output calculation.
- `scripts/agent-workflow/generate.py` — write generated adapters.
- `scripts/agent-workflow/check.py` — read-only drift and schema check.
- `scripts/agent-workflow/hook.py` — Claude/Codex hook payload normalization and process entry point.
- `scripts/agent-workflow/hook_lib.py` — path extraction, SPEC gate, intent classification, lint invocation, and hook response construction.
- `scripts/agent-workflow/usage_lib.py` — Claude/Codex transcript readers and normalized usage records.
- `scripts/agent-workflow/doctor.py` — read-only discovery/config/transcript diagnostics.
- `scripts/agent-usage-report.py` — unified reporting CLI.
- `scripts/claude-usage-report.py` — compatibility shim delegating to the unified reporter with `--executor claude`.
- `scripts/agent-workflow/tests/` — standard-library unit tests and synthetic fixtures.

### Generated/runtime adapters

- `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`, `.claude/settings.json`.
- `.codex/agents/*.toml`, `.codex/config.toml`, `.codex/hooks.json`.
- Generated workflow blocks inside `CLAUDE.md` and `AGENTS.md`.

### Integration and documentation

- `package.json` — workflow generation/check/doctor scripts.
- `.github/workflows/ci.yml` — deterministic workflow check.
- `.gitignore` — Codex private report/cache ignores and updated reporter comments.
- `docs/04-engineering/ClaudeCodeAutomation.md` — retained path, neutralized title/content, dual-executor operating guide.
- `docs/03-architecture/ProjectStructure.md` — `.agents/` and `.codex/` development-tooling directories.
- `docs/05-context/TOKEN_USAGE_LOG.md` — regenerated executor-labelled shared summary.

---

### Task 1: Canonical role sources and deterministic agent/skill generation

**Files:**

- Create: `.agents/workflow/model-tiers.toml`
- Create: `.agents/workflow/agents/spec-drafter.md`
- Create: `.agents/workflow/agents/architecture-reviewer.md`
- Create: `.agents/workflow/agents/spec-implementer.md`
- Create: `.agents/workflow/agents/spec-validator.md`
- Create: `.agents/workflow/agents/spec-closer.md`
- Modify: `.agents/skills/spec-check/SKILL.md`
- Modify: `.agents/skills/lessons-learned/SKILL.md`
- Modify: `.agents/skills/doc-sync/SKILL.md`
- Create: `scripts/agent-workflow/workflow_lib.py`
- Create: `scripts/agent-workflow/generate.py`
- Create: `scripts/agent-workflow/check.py`
- Create: `scripts/agent-workflow/tests/test_generation.py`
- Generate: `.claude/agents/*.md`
- Generate: `.claude/skills/*/SKILL.md`
- Generate: `.codex/agents/*.toml`

**Interfaces:**

- Produces: `RoleDefinition`, `ModelTier`, `load_roles(root)`, `load_model_tiers(root)`, `render_claude_agent(role, tier)`, `render_codex_agent(role, tier)`, `expected_generated_files(root)`, and `write_generated_files(root)`.
- Produces: exactly five role names: `spec-drafter`, `architecture-reviewer`, `spec-implementer`, `spec-validator`, `spec-closer`.
- Consumes: current `.claude/agents/*.md` bodies and `.claude/skills/*/SKILL.md` bodies as migration sources only.

- [ ] **Step 1: Write failing generator tests**

Create `scripts/agent-workflow/tests/test_generation.py` with these assertions:

```python
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


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
python3 -m unittest discover -s scripts/agent-workflow/tests -p 'test_*.py' -v
```

Expected: FAIL because `workflow_lib` and the canonical role/model sources do not exist.

- [ ] **Step 3: Create the exact model tier mapping**

Create `.agents/workflow/model-tiers.toml`:

```toml
[deep-reasoning]
claude_model = "opus"
codex_model = "gpt-5.6-sol"
codex_reasoning_effort = "high"

[balanced-execution]
claude_model = "sonnet"
codex_model = "gpt-5.6-terra"
codex_reasoning_effort = "high"
```

- [ ] **Step 4: Move each existing role body into neutral role files**

For each of the five role names in the metadata table below, copy the instruction
body after the closing YAML `---` from `.claude/agents/{role}.md` into
`.agents/workflow/agents/{role}.md`. Prepend TOML front matter in this exact
format:

```markdown
+++
name = "spec-drafter"
description = "Rascunha e decide uma SPEC do Project Atlas a partir da documentação oficial."
tier = "deep-reasoning"
capabilities = ["read", "search", "write"]
sandbox_mode = "workspace-write"
+++
```

Immediately after the closing `+++`, paste the exact instruction body currently
stored after line 8 of `.claude/agents/spec-drafter.md`. Apply the same mechanical
move to the other four roles using their own current files; do not summarize or
rewrite their behavioral instructions during the move.

Use these exact metadata mappings:

| Role | Tier | Capabilities | Sandbox |
|---|---|---|---|
| `spec-drafter` | `deep-reasoning` | `read`, `search`, `write` | `workspace-write` |
| `architecture-reviewer` | `deep-reasoning` | `read`, `search` | `read-only` |
| `spec-implementer` | `balanced-execution` | `read`, `search`, `write`, `shell` | `workspace-write` |
| `spec-validator` | `balanced-execution` | `read`, `search`, `shell` | `workspace-write` |
| `spec-closer` | `balanced-execution` | `read`, `search`, `write`, `shell` | `workspace-write` |

Keep role behavior unchanged, but replace platform-specific references by their canonical paths:

- `.claude/skills/lessons-learned/SKILL.md` → `.agents/skills/lessons-learned/SKILL.md`
- `.claude/skills/doc-sync/SKILL.md` → `.agents/skills/doc-sync/SKILL.md`
- `CLAUDE.md dos packages` → `documento local de instruções do package`
- Anthropic-only coauthor text → `trailer Co-Authored-By do modelo em uso`

- [ ] **Step 5: Repair the three canonical skills**

Use the existing `.claude/skills/*/SKILL.md` as the source of behavior. In `.agents/skills/*/SKILL.md`, remove all `.Codex/` and `.claude/agents/*.md` references and point to neutral role names or `.agents/` paths. Preserve every checklist item and output contract.

- [ ] **Step 6: Implement the generator library**

Create `scripts/agent-workflow/workflow_lib.py` with these public types and functions:

```python
from __future__ import annotations

import json
import re
import tomllib
from dataclasses import dataclass
from pathlib import Path


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


def load_model_tiers(root: Path) -> dict[str, ModelTier]:
    raw = tomllib.loads((root / ".agents/workflow/model-tiers.toml").read_text())
    return {name: ModelTier(**values) for name, values in raw.items()}


def load_roles(root: Path) -> tuple[RoleDefinition, ...]:
    role_dir = root / ".agents/workflow/agents"
    return tuple(parse_role(path) for path in sorted(role_dir.glob("*.md")))


def expected_generated_files(root: Path) -> dict[Path, str]:
    tiers = load_model_tiers(root)
    outputs: dict[Path, str] = {}
    for role in load_roles(root):
        tier = tiers[role.tier]
        outputs[Path(f".claude/agents/{role.name}.md")] = render_claude_agent(role, tier)
        outputs[Path(f".codex/agents/{role.name}.toml")] = render_codex_agent(role, tier)
    for skill in ("spec-check", "lessons-learned", "doc-sync"):
        source = root / ".agents/skills" / skill / "SKILL.md"
        outputs[Path(f".claude/skills/{skill}/SKILL.md")] = source.read_text()
    return outputs


def write_generated_files(root: Path) -> None:
    for relative, content in expected_generated_files(root).items():
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
```

Implement `parse_role`, `render_claude_agent`, and `render_codex_agent` without a third-party parser. `parse_role` must require opening and closing `+++`, parse the enclosed TOML with `tomllib`, and reject a filename that differs from `name`. Claude capability mapping is:

```python
CLAUDE_TOOLS = {
    "read": ("Read",),
    "search": ("Grep", "Glob"),
    "write": ("Write", "Edit"),
    "shell": ("Bash",),
}
```

Codex TOML must use `json.dumps(value, ensure_ascii=False)` for quoted scalar strings, a triple-quoted `developer_instructions`, and `sandbox_mode` from the role.

- [ ] **Step 7: Implement generate and check entry points**

`scripts/agent-workflow/generate.py` calls `write_generated_files(REPO_ROOT)` and prints each written relative path. `scripts/agent-workflow/check.py` compares every expected string byte-for-byte, reports missing/divergent paths, and exits `1` on drift without writing.

- [ ] **Step 8: Generate adapters and verify GREEN**

Run:

```bash
python3 scripts/agent-workflow/generate.py
python3 -m unittest discover -s scripts/agent-workflow/tests -p 'test_*.py' -v
python3 scripts/agent-workflow/check.py
```

Expected: five Claude agents, five Codex agents including `spec-drafter`, three Claude skill copies, all tests PASS, drift check exits `0`.

- [ ] **Step 9: Confirm the Claude role behavior did not regress**

Run:

```bash
git diff -- .claude/agents .claude/skills
```

Expected: only neutral path terminology, generated headers, and the new canonical-source relationship change; phase responsibilities, status rules, commands, retry limits, and output contracts remain present.

- [ ] **Step 10: Commit Task 1 only**

```bash
git add .agents/workflow .agents/skills .claude/agents .claude/skills .codex/agents scripts/agent-workflow/workflow_lib.py scripts/agent-workflow/generate.py scripts/agent-workflow/check.py scripts/agent-workflow/tests/test_generation.py
git diff --cached --name-only
git commit -m "build(workflow): canonicaliza agentes e skills"
```

Expected staged paths: only Task 1 files; ADR-0023, SPEC-0052, ADR-0022, and pre-existing log changes remain unstaged.

---

### Task 2: Canonical pipeline skill, dispatch blocks, and Codex project config

**Files:**

- Create: `.agents/workflow/dispatch.md`
- Create: `.agents/skills/spec-pipeline/SKILL.md`
- Modify: `scripts/agent-workflow/workflow_lib.py`
- Modify: `scripts/agent-workflow/tests/test_generation.py`
- Modify generated block: `CLAUDE.md`
- Modify generated block: `AGENTS.md`
- Generate: `.claude/skills/spec-pipeline/SKILL.md`
- Generate: `.codex/config.toml`

**Interfaces:**

- Consumes: `expected_generated_files(root)` and `write_generated_files(root)` from Task 1.
- Produces: `replace_generated_block(text, block) -> str` and generated root markers `<!-- ATLAS-SPEC-PIPELINE:START -->` / `<!-- ATLAS-SPEC-PIPELINE:END -->`.
- Produces: a `spec-pipeline` skill whose handoff fields are `spec_path`, `profile`, `attempt`, `previous_report`, and `unrecorded_decisions`.

- [ ] **Step 1: Add failing pipeline-generation tests**

Append tests that assert:

```python
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
```

- [ ] **Step 2: Run tests and verify RED**

Run the unittest command from Task 1.

Expected: FAIL because the pipeline skill, project config, and root-block outputs are absent.

- [ ] **Step 3: Write the canonical dispatch block**

Create `.agents/workflow/dispatch.md` with this behavior:

```markdown
<!-- ATLAS-SPEC-PIPELINE:START -->
## Pipeline autônomo de SPEC

Pedidos para criar, continuar, revisar, implementar, validar ou fechar uma SPEC devem carregar e seguir a skill `spec-pipeline`. O fio principal é somente despachante: não desenha nem implementa inline, repassa relatórios sem re-narrar e aplica apenas as transições de Status atribuídas ao despachante. Se um agente obrigatório não estiver disponível, pare e reporte; nunca absorva silenciosamente a fase.
<!-- ATLAS-SPEC-PIPELINE:END -->
```

- [ ] **Step 4: Write the canonical `spec-pipeline` skill**

Create `.agents/skills/spec-pipeline/SKILL.md` with YAML front matter and the complete state machine approved in the design. It must explicitly encode:

```yaml
---
name: spec-pipeline
description: Use when a user asks to create, continue, review, implement, validate, or close an Atlas SPEC; orchestrates the complete and micro profiles end to end through the five specialized agents.
---
```

The body must contain, in this order:

1. preflight: read `NEXT_CONTEXT.md`, token log, workflow doc, and identify the SPEC/request;
2. exact handoff record with the five fields in **Interfaces**;
3. complete-profile transition table;
4. micro-profile transition table;
5. first-veto/second-veto and first-rejection/second-rejection rules;
6. immediate human escalation list;
7. prohibition on parallel dependent phases and inline phase absorption;
8. final requirement to return the closer's compact report without re-narration.

- [ ] **Step 5: Extend the generator**

Add `replace_generated_block`:

```python
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
```

Extend `expected_generated_files` to:

- copy `.agents/skills/spec-pipeline/SKILL.md` to `.claude/skills/spec-pipeline/SKILL.md`;
- render `.codex/config.toml` with the fallback and `[agents] enabled = true`;
- return updated full contents for root `CLAUDE.md` and `AGENTS.md` using the generated block.

- [ ] **Step 6: Generate and verify GREEN**

Run generation, unit tests, and drift check.

Expected: PASS; both root files contain exactly one generated block; package `CLAUDE.md` files remain untouched.

- [ ] **Step 7: Validate the two state-machine branches manually**

Run:

```bash
rg -n "Draft → Ready|Ready → In Progress|In Progress → Review|Review → Done|segundo veto|segunda reprovação|Perfil micro" .agents/skills/spec-pipeline/SKILL.md .claude/skills/spec-pipeline/SKILL.md CLAUDE.md AGENTS.md
```

Expected: all transitions and escalation limits are present in the canonical skill and generated Claude copy; root files contain only the short dispatch block, not a second full state machine.

- [ ] **Step 8: Commit Task 2 only**

```bash
git add .agents/workflow/dispatch.md .agents/skills/spec-pipeline .claude/skills/spec-pipeline .codex/config.toml scripts/agent-workflow/workflow_lib.py scripts/agent-workflow/tests/test_generation.py CLAUDE.md AGENTS.md
git diff --cached --name-only
git commit -m "build(workflow): centraliza orquestracao de specs"
```

---

### Task 3: Shared hook engine with Claude and Codex adapters

**Files:**

- Create: `scripts/agent-workflow/hook_lib.py`
- Create: `scripts/agent-workflow/hook.py`
- Create: `scripts/agent-workflow/tests/test_hooks.py`
- Create: `scripts/agent-workflow/tests/fixtures/hook-claude-write.json`
- Create: `scripts/agent-workflow/tests/fixtures/hook-codex-patch.json`
- Modify: `scripts/agent-workflow/workflow_lib.py`
- Generate: `.claude/settings.json`
- Generate: `.codex/hooks.json`
- Delete after replacement: `scripts/hooks/spec-prompt-nudge.sh`

**Interfaces:**

- Produces: `HookDecision(exit_code: int, stdout: str, stderr: str)`.
- Produces: `extract_touched_paths(platform, payload) -> tuple[Path, ...]`.
- Produces: `find_active_spec(repo_root, component) -> Path | None`.
- Produces: `handle_pre_tool_use`, `handle_post_tool_use`, and `handle_user_prompt_submit`.
- Consumes: JSON hook payload on stdin and returns the exact native JSON/exit behavior for the selected platform/event.

- [ ] **Step 1: Create synthetic payload fixtures**

`hook-claude-write.json`:

```json
{
  "cwd": "/repo",
  "hook_event_name": "PreToolUse",
  "tool_name": "Write",
  "tool_input": {"file_path": "/repo/packages/runtime/src/runtime.ts"}
}
```

`hook-codex-patch.json`:

```json
{
  "cwd": "/repo",
  "hook_event_name": "PreToolUse",
  "tool_name": "apply_patch",
  "tool_input": {
    "command": "*** Begin Patch\n*** Update File: packages/runtime/src/runtime.ts\n@@\n-old\n+new\n*** Add File: apps/cli/src/new-file.ts\n+export {};\n*** End Patch"
  }
}
```

- [ ] **Step 2: Write failing hook unit tests**

Create `test_hooks.py` with temporary SPEC repositories and these core assertions:

```python
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

WORKFLOW_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKFLOW_DIR))

from hook_lib import extract_touched_paths, handle_pre_tool_use, classify_prompt


class HookTests(unittest.TestCase):
    def test_codex_patch_extracts_every_file(self) -> None:
        payload = json.loads((Path(__file__).parent / "fixtures/hook-codex-patch.json").read_text())
        self.assertEqual(
            extract_touched_paths("codex", payload),
            (Path("packages/runtime/src/runtime.ts"), Path("apps/cli/src/new-file.ts")),
        )

    def test_codex_missing_spec_denies(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "packages/runtime/src").mkdir(parents=True)
            payload = {
                "cwd": str(root),
                "tool_name": "apply_patch",
                "tool_input": {"command": "*** Begin Patch\n*** Update File: packages/runtime/src/runtime.ts\n*** End Patch"},
            }
            decision = handle_pre_tool_use("codex", payload, root)
            self.assertEqual(decision.exit_code, 0)
            body = json.loads(decision.stdout)
            self.assertEqual(body["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_claude_missing_spec_asks(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            payload = {"tool_input": {"file_path": str(root / "packages/runtime/src/runtime.ts")}}
            decision = handle_pre_tool_use("claude", payload, root)
            body = json.loads(decision.stdout)
            self.assertEqual(body["hookSpecificOutput"]["permissionDecision"], "ask")

    def test_ready_spec_allows_without_output(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            specs = root / "docs/implementation/specs"
            specs.mkdir(parents=True)
            (specs / "SPEC-9999-runtime.md").write_text("- [x] Ready\n\npackages/runtime\n")
            payload = {"tool_input": {"command": "*** Begin Patch\n*** Update File: packages/runtime/src/runtime.ts\n*** End Patch"}}
            decision = handle_pre_tool_use("codex", payload, root)
            self.assertEqual((decision.exit_code, decision.stdout), (0, ""))

    def test_prompt_classification_targets_pipeline_skill(self) -> None:
        self.assertEqual(classify_prompt("faz a SPEC de cache"), "spec-pipeline")
        self.assertEqual(classify_prompt("valida a SPEC-0042"), "spec-pipeline")
```

Add separate cases for `Draft`, `Done`, `In Progress`, moved files, deleted files, non-source docs, `.tsx`, and multiple components where one lacks an active SPEC.

- [ ] **Step 3: Run hook tests and verify RED**

Run the unittest command.

Expected: FAIL because `hook_lib` does not exist.

- [ ] **Step 4: Implement payload normalization and the SPEC gate**

Create `hook_lib.py` around these exact data and regex contracts:

```python
from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path


PATCH_FILE_RE = re.compile(r"^\*\*\* (?:Add|Update|Delete) File: (.+)$", re.MULTILINE)
PATCH_MOVE_RE = re.compile(r"^\*\*\* Move to: (.+)$", re.MULTILINE)
SOURCE_RE = re.compile(r"^(packages|apps|tooling)/([^/]+)/src/(.+)$")
ACTIVE_STATUS_RE = re.compile(r"^- \[x\] (Ready|In Progress)$", re.MULTILINE)


@dataclass(frozen=True)
class HookDecision:
    exit_code: int = 0
    stdout: str = ""
    stderr: str = ""


def extract_touched_paths(platform: str, payload: dict) -> tuple[Path, ...]:
    tool_input = payload.get("tool_input") or {}
    if platform == "claude":
        value = tool_input.get("file_path")
        return (Path(value),) if isinstance(value, str) and value else ()
    command = tool_input.get("command", "")
    paths = PATCH_FILE_RE.findall(command) + PATCH_MOVE_RE.findall(command)
    return tuple(dict.fromkeys(Path(value) for value in paths))
```

`find_active_spec` must read only `docs/implementation/specs/*.md` and require
`Ready` or `In Progress`. Preserve the current broad component recognition: a
runtime package is covered when an active SPEC contains `packages/runtime`,
`@atlas/runtime`, or the standalone component slug `runtime`; apply the same
three-form rule to apps/tooling. If any touched source component lacks coverage,
deny/ask and list all missing components.

- [ ] **Step 5: Implement native hook responses**

For Codex missing-SPEC output:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Nenhuma SPEC ativa cobre: packages/runtime. Crie/aprove a SPEC e execute novamente."
  }
}
```

For Claude use the same object with `permissionDecision: "ask"`.
`UserPromptSubmit` returns `additionalContext` naming only the `spec-pipeline`
skill. `PostToolUse` invokes the command below for touched `.ts`, `.tsx`,
`.mts`, and `.cts` files:

```python
subprocess.run(
    ["pnpm", "exec", "eslint", *[str(path) for path in typescript_paths]],
    cwd=repo_root,
    text=True,
    capture_output=True,
    check=False,
)
```

On lint failure, return exit `2` and the combined lint output on stderr. Do not undo the patch.

- [ ] **Step 6: Implement the hook CLI entry point**

`hook.py` accepts `--platform {claude,codex}` and `--event {PreToolUse,PostToolUse,UserPromptSubmit,Stop}`, reads one JSON object from stdin, resolves repo root with `git rev-parse --show-toplevel` using the payload `cwd`, delegates to `hook_lib`, writes stdout/stderr exactly, and exits with `HookDecision.exit_code`.

For `Stop` in this task, return `{}` for Codex and no output for Claude; Task 4 will attach telemetry without changing the interface.

- [ ] **Step 7: Generate both hook configs**

Extend `workflow_lib.expected_generated_files` to produce:

- `.claude/settings.json`: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, plus the existing asynchronous Claude `Stop` command unchanged until Task 4;
- `.codex/hooks.json`: the same first three events calling `hook.py`, with matcher `Edit|Write` for tool hooks.

Commands must derive the script from `git rev-parse --show-toplevel`; do not use `CLAUDE_PROJECT_DIR`.

- [ ] **Step 8: Run tests, generate configs, and remove the obsolete nudge script**

Run unit tests, generator, drift check, and then delete `scripts/hooks/spec-prompt-nudge.sh` only after both generated configs point to `hook.py`.

Expected: all hook tests PASS; `rg 'CLAUDE_PROJECT_DIR|tool_input.file_path' .codex scripts/agent-workflow` finds no Codex misuse; `.claude/settings.json` still has four events.

- [ ] **Step 9: Exercise the hook CLI with fixtures**

Run:

```bash
python3 scripts/agent-workflow/hook.py --platform codex --event PreToolUse < scripts/agent-workflow/tests/fixtures/hook-codex-patch.json
python3 scripts/agent-workflow/hook.py --platform claude --event PreToolUse < scripts/agent-workflow/tests/fixtures/hook-claude-write.json
```

Expected: both return actionable missing-SPEC decisions; Codex says `deny`, Claude says `ask`.

- [ ] **Step 10: Commit Task 3 only**

```bash
git add scripts/agent-workflow/hook.py scripts/agent-workflow/hook_lib.py scripts/agent-workflow/tests/test_hooks.py scripts/agent-workflow/tests/fixtures .claude/settings.json .codex/hooks.json scripts/agent-workflow/workflow_lib.py scripts/hooks/spec-prompt-nudge.sh
git diff --cached --name-only
git commit -m "build(workflow): adapta hooks para Claude e Codex"
```

---

### Task 4: Unified executor-labelled usage reporting and Stop hooks

**Files:**

- Create: `scripts/agent-workflow/usage_lib.py`
- Create: `scripts/agent-usage-report.py`
- Modify into compatibility shim: `scripts/claude-usage-report.py`
- Create: `scripts/agent-workflow/tests/test_usage.py`
- Create: `scripts/agent-workflow/tests/fixtures/claude-main.jsonl`
- Create: `scripts/agent-workflow/tests/fixtures/claude-subagent.jsonl`
- Create: `scripts/agent-workflow/tests/fixtures/claude-subagent.meta.json`
- Create: `scripts/agent-workflow/tests/fixtures/codex-main.jsonl`
- Create: `scripts/agent-workflow/tests/fixtures/codex-subagent.jsonl`
- Modify: `scripts/agent-workflow/hook.py`
- Modify: `scripts/agent-workflow/workflow_lib.py`
- Regenerate: `.claude/settings.json`
- Regenerate: `.codex/hooks.json`
- Modify generated output: `docs/05-context/TOKEN_USAGE_LOG.md`

**Interfaces:**

- Produces: `UsageRecord` with `executor`, `session`, `phase`, `agent_role`, `models`, token buckets, `raw_total`, `effective_total`, `spec_tag`, timestamps, and `telemetry_status`.
- Produces: `parse_claude_session(path, metadata=None) -> UsageRecord`.
- Produces: `parse_codex_session(path) -> UsageRecord`.
- Produces: `build_spec_log(records) -> str` with a required `Executor` column.
- Consumes Codex cumulative totals from the last `event_msg/payload.type=token_count/payload.info.total_token_usage` record; never sums cumulative snapshots.

- [ ] **Step 1: Create minimal synthetic transcript fixtures**

Codex main fixture must contain:

```json
{"timestamp":"2026-08-05T10:00:00Z","type":"session_meta","payload":{"id":"codex-main","thread_source":"user","source":"vscode","originator":"Codex Desktop","cwd":"/repo/Atlas"}}
{"timestamp":"2026-08-05T10:00:01Z","type":"turn_context","payload":{"turn_id":"turn-1","model":"gpt-5.6-sol","effort":"high"}}
{"timestamp":"2026-08-05T10:00:02Z","type":"event_msg","payload":{"type":"user_message","message":"implementa a SPEC-0052"}}
{"timestamp":"2026-08-05T10:00:03Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"total_tokens":100,"input_tokens":80,"cached_input_tokens":50,"output_tokens":20,"reasoning_output_tokens":5,"cache_write_input_tokens":0}}}}
{"timestamp":"2026-08-05T10:00:04Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"total_tokens":180,"input_tokens":140,"cached_input_tokens":90,"output_tokens":40,"reasoning_output_tokens":10,"cache_write_input_tokens":0}}}}
```

Codex subagent fixture changes `thread_source` to `subagent` and includes:

```json
{"subagent":{"thread_spawn":{"parent_thread_id":"codex-main","depth":1,"agent_path":"/root/spec_implementer","agent_nickname":"worker","agent_role":"spec-implementer"}}}
```

Claude fixtures mirror the smallest current `message.usage` records plus a `.meta.json` carrying `agentType` and description.

- [ ] **Step 2: Write failing reader/report tests**

Create tests asserting:

```python
from __future__ import annotations

import sys
import unittest
from pathlib import Path

WORKFLOW_DIR = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).parent / "fixtures"
sys.path.insert(0, str(WORKFLOW_DIR))

from usage_lib import UsageRecord, build_spec_log, parse_codex_session


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

    def test_shared_log_keeps_executors_separate(self) -> None:
        claude = make_usage_record(executor="Claude", spec_tag="SPEC-0052", raw_total=100)
        codex = make_usage_record(executor="Codex", spec_tag="SPEC-0052", raw_total=200)
        log = build_spec_log([claude, codex])
        self.assertIn("| SPEC | Executor |", log)
        self.assertIn("| SPEC-0052 | Claude |", log)
        self.assertIn("| SPEC-0052 | Codex |", log)
        self.assertNotIn("| SPEC-0052 | Ambos |", log)
```

- [ ] **Step 3: Run tests and verify RED**

Run the unittest command.

Expected: FAIL because `usage_lib` does not exist.

- [ ] **Step 4: Extract the current Claude reader without changing its math**

Move parsing/building logic from `scripts/claude-usage-report.py` into `usage_lib.py`. Preserve Anthropic weights exactly:

```python
CLAUDE_EFFECTIVE_WEIGHTS = {
    "input": 1.0,
    "cache_creation": 1.25,
    "cache_read": 0.1,
    "output": 5.0,
}
```

Add `executor="Claude"` to every Claude record. Preserve description-first SPEC attribution for Claude subagents and the existing phase mapping.

- [ ] **Step 5: Implement the Codex reader**

Use this normalized record shape:

```python
@dataclass(frozen=True)
class UsageRecord:
    executor: str
    session: str
    phase: str
    agent_role: str | None
    models: tuple[str, ...]
    input_tokens: int
    cached_input: int
    cache_write_input: int
    output_tokens: int
    reasoning_output: int
    raw_total: int
    effective_total: int | None
    spec_tag: str | None
    first_ts: str | None
    last_ts: str | None
    telemetry_status: str
    cwd: str | None
```

For Codex:

- models come from distinct `turn_context.payload.model` values;
- `cwd` comes from `session_meta.payload.cwd`;
- role comes from `session_meta.payload.source.subagent.thread_spawn.agent_role` when `thread_source == "subagent"`;
- SPEC mentions come from `event_msg` `user_message` and `agent_message` `payload.message` strings;
- token fields come from the final cumulative `total_token_usage` snapshot;
- `raw_total` is `total_tokens`, so cached input is not double-counted;
- `effective_total` is `None`;
- absent/unknown token schema returns `telemetry_status="incomplete"`, never fabricated zeros presented as complete.

Add `discover_codex_records(sessions_dir, repo_root)`. It may scan the Codex
session tree, but it returns only records whose resolved `cwd` is the repository
root or a descendant of it. A direct `--transcript` supplied by the current Stop
hook is parsed directly because that hook already belongs to the active project.

- [ ] **Step 6: Build executor-separated reports**

Change `build_spec_log` so both the per-SPEC and phase tables include `Executor`. Calculate averages, ranges, and overhead ratios separately per executor. Show Claude effective tokens only on Claude rows and `N/D` for Codex until a documented comparable metric exists.

Private output defaults:

- Claude: `.claude/usage-report.md`
- Codex: `.codex/usage-report.md`

- [ ] **Step 7: Implement the unified CLI and compatibility shim**

`scripts/agent-usage-report.py` supports:

```text
--executor claude|codex|all
--claude-project-dir PATH
--codex-sessions-dir PATH
--transcript PATH
--top N
--no-log
```

The compatibility shim contains only:

```python
#!/usr/bin/env python3
from __future__ import annotations

import runpy
import sys
from pathlib import Path

sys.argv[1:1] = ["--executor", "claude"]
runpy.run_path(str(Path(__file__).with_name("agent-usage-report.py")), run_name="__main__")
```

- [ ] **Step 8: Attach both Stop hooks**

Claude generated `Stop` runs `python3 scripts/agent-usage-report.py --executor claude` asynchronously, preserving current behavior.

Codex generated `Stop` calls `hook.py --platform codex --event Stop`. The hook reads `transcript_path`, invokes:

```python
[sys.executable, str(repo_root / "scripts/agent-usage-report.py"), "--executor", "codex", "--transcript", transcript_path]
```

and always emits `{}` on successful hook handling. Reporter failure is written to stderr as a diagnostic but the hook still exits `0` with `{}`.

- [ ] **Step 9: Run tests and regenerate the shared log carefully**

Run:

```bash
python3 -m unittest discover -s scripts/agent-workflow/tests -p 'test_*.py' -v
python3 scripts/agent-workflow/generate.py
python3 scripts/agent-usage-report.py --executor all
python3 scripts/agent-workflow/check.py
```

Expected: tests PASS; existing rows are labelled Claude without value recalculation; any current Codex Atlas sessions create separate Codex rows; unsupported records are reported as incomplete, not zero.

Before staging `TOKEN_USAGE_LOG.md`, inspect its diff and preserve the already-present SPEC-0052/ADR work reflected by the current generated data.

- [ ] **Step 10: Commit Task 4 only**

```bash
git add scripts/agent-workflow/usage_lib.py scripts/agent-usage-report.py scripts/claude-usage-report.py scripts/agent-workflow/tests/test_usage.py scripts/agent-workflow/tests/fixtures/claude-main.jsonl scripts/agent-workflow/tests/fixtures/claude-subagent.jsonl scripts/agent-workflow/tests/fixtures/claude-subagent.meta.json scripts/agent-workflow/tests/fixtures/codex-main.jsonl scripts/agent-workflow/tests/fixtures/codex-subagent.jsonl scripts/agent-workflow/hook.py scripts/agent-workflow/workflow_lib.py .claude/settings.json .codex/hooks.json docs/05-context/TOKEN_USAGE_LOG.md
git diff --cached --name-only
git commit -m "build(workflow): unifica telemetria Claude e Codex"
```

---

### Task 5: Doctor, CI gate, neutral operating documentation, and full verification

**Files:**

- Create: `scripts/agent-workflow/doctor.py`
- Create: `scripts/agent-workflow/tests/test_doctor.py`
- Modify: `package.json:9-16`
- Modify: `.github/workflows/ci.yml:28-38`
- Modify: `.gitignore:18-20`
- Modify: `docs/04-engineering/ClaudeCodeAutomation.md`
- Modify: `docs/03-architecture/ProjectStructure.md`
- Verify generated: `CLAUDE.md`, `AGENTS.md`, `.claude/**`, `.codex/**`

**Interfaces:**

- Produces: `run_checks(root) -> tuple[DoctorCheck, ...]`, where each check has `name`, `status` (`ok`, `warning`, `error`, `manual`), and `detail`.
- Produces package scripts: `agent-workflow:generate`, `agent-workflow:test`, `agent-workflow:check`, `agent-workflow:doctor`.
- CI consumes `pnpm agent-workflow:check` without model credentials.

- [ ] **Step 1: Write failing doctor tests**

Create `test_doctor.py`:

```python
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
```

- [ ] **Step 2: Run doctor tests and verify RED**

Run the unittest command.

Expected: FAIL because `doctor.py` does not exist.

- [ ] **Step 3: Implement read-only diagnostics**

Create:

```python
@dataclass(frozen=True)
class DoctorCheck:
    name: str
    status: str
    detail: str
```

`run_checks` must verify:

- canonical five-role/four-skill set;
- byte-for-byte generated-file parity;
- valid JSON for hooks and TOML for Codex config/agents;
- absence of `.Codex/`, nonexistent `AGENTS.md` package references, and `scripts/Codex-usage-report.py`;
- discoverable `claude` and `codex` executables when present on PATH, otherwise warning;
- at least one supported Codex transcript fixture/local transcript schema;
- hook trust as `manual` with the exact instruction “abra `/hooks` no Codex e revise o hash pendente” because persisted trust is not a documented machine-readable interface.

The CLI exits `1` only for `error`, prints warnings/manual checks, and performs no writes.

- [ ] **Step 4: Add package scripts and CI gate**

Add to `package.json`:

```json
"agent-workflow:generate": "python3 scripts/agent-workflow/generate.py",
"agent-workflow:test": "python3 -m unittest discover -s scripts/agent-workflow/tests -p 'test_*.py' -v",
"agent-workflow:check": "pnpm agent-workflow:test && python3 scripts/agent-workflow/check.py",
"agent-workflow:doctor": "python3 scripts/agent-workflow/doctor.py"
```

Add a CI step after install and before lint:

```yaml
      - name: Agent workflow parity
        run: pnpm agent-workflow:check
```

- [ ] **Step 5: Update ignores for private Codex artifacts**

Replace the Claude-only report comment with a neutral one and ensure these paths are ignored:

```gitignore
.claude/usage-report.md
.codex/usage-report.md
.codex/usage-cache.json
```

- [ ] **Step 6: Neutralize the operating guide without breaking historical links**

Keep the path `docs/04-engineering/ClaudeCodeAutomation.md` so old SPECs and lessons remain valid, but change its title/subtitle to “Agent Development Automation” and explicitly label the filename a historical compatibility path.

Update every live section to describe:

- canonical `.agents/` sources;
- both adapter trees;
- model-tier mapping;
- complete/micro pipeline from `spec-pipeline`;
- semantic hook differences (`ask` Claude, `deny` Codex);
- hook trust procedure;
- unified reporter and executor-separated interpretation;
- generation, check, doctor, and first-real-SPEC Codex canary commands.

Do not rewrite historical measurement snapshots; annotate them as Claude-only baselines.

- [ ] **Step 7: Update the official project structure**

Add `.agents/` and `.codex/` beside `.claude/` in the root tree. Define:

- `.agents/` as provider-neutral canonical development-agent workflow/skills;
- `.claude/` as generated Claude adapter;
- `.codex/` as generated Codex adapter/config/hooks;
- none of the three contains Atlas runtime product logic or secrets.

- [ ] **Step 8: Run scoped workflow verification**

Run:

```bash
pnpm agent-workflow:generate
pnpm agent-workflow:check
pnpm agent-workflow:doctor
git diff --check
```

Expected: generate is idempotent; tests and drift check PASS; doctor has no `error` (manual hook trust is allowed); diff check is clean.

- [ ] **Step 9: Run the repository's complete verification gate**

Run exactly:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
```

Expected: all four exit `0`. If format changes generated artifacts, rerun generation and `pnpm agent-workflow:check` to prove deterministic convergence.

- [ ] **Step 10: Perform local discovery smoke checks without modifying a SPEC**

Start fresh Claude and Codex sessions after trusting the project hooks. Ask each client:

```text
Liste os cinco agentes e as quatro skills do pipeline Atlas. Não edite arquivos e não execute uma SPEC.
```

Expected from both: the same five roles and four skills. In Codex, verify the same result in Desktop, CLI, and IDE using the shared project config. Do not use SPEC-0052 as a canary during this task.

Record in the operating guide that the first real SPEC started after merge is the end-to-end Codex canary; its acceptance requires correct phase dispatch, status ownership, closeout, commit/push, and a Codex-labelled telemetry row.

- [ ] **Step 11: Audit scope and stage Task 5 only**

Run:

```bash
git status --short
git diff --name-only
git diff --cached --name-only
```

Verify there is no diff under `packages/*/src` or `apps/*/src`, and that ADR-0023, SPEC-0052, ADR-0022, and any unrelated user changes remain unstaged.

- [ ] **Step 12: Commit Task 5**

```bash
git add scripts/agent-workflow/doctor.py scripts/agent-workflow/tests/test_doctor.py package.json .github/workflows/ci.yml .gitignore docs/04-engineering/ClaudeCodeAutomation.md docs/03-architecture/ProjectStructure.md
git diff --cached --name-only
git commit -m "docs(workflow): documenta operacao dual e gate de CI"
```

- [ ] **Step 13: Final post-commit verification**

Run:

```bash
pnpm agent-workflow:check
git status --short
git log -5 --oneline
```

Expected: parity check PASS; only the user's pre-existing unrelated changes remain; five focused implementation commits are visible after the earlier design/plan commits.

---

## Completion Checklist

- [ ] Five canonical roles render to both agent formats.
- [ ] Four canonical skills are available to Claude and Codex.
- [ ] Root instructions dispatch through `spec-pipeline` without duplicating the full state machine.
- [ ] Complete and micro branches encode current status owners, retry limits, and human escalations.
- [ ] Codex `apply_patch` paths are parsed from `tool_input.command`.
- [ ] Missing active SPEC yields Claude `ask` and Codex `deny`.
- [ ] Post-edit lint targets every touched TypeScript file and no unrelated file.
- [ ] Stop telemetry cannot block development.
- [ ] Claude historical effective-token math is unchanged.
- [ ] Codex cumulative token snapshots are counted once and labelled separately.
- [ ] CI detects generated-adapter drift without credentials.
- [ ] Doctor reports no errors and leaves trust/model checks manual when not observable.
- [ ] Full root verification is green.
- [ ] No product source or unrelated worktree change is included.
- [ ] First subsequent real Codex SPEC is explicitly tracked as the operational canary.
