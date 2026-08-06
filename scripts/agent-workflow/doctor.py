#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import shutil
import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path

from usage_lib import parse_codex_session
from workflow_lib import expected_generated_files, load_roles


CANONICAL_ROLES = {
    "spec-drafter",
    "architecture-reviewer",
    "spec-implementer",
    "spec-validator",
    "spec-closer",
}
CANONICAL_SKILLS = {
    "spec-check",
    "lessons-learned",
    "doc-sync",
    "spec-pipeline",
}
LIVE_REFERENCE_ROOTS = (
    Path("AGENTS.md"),
    Path("CLAUDE.md"),
    Path(".agents"),
    Path(".claude"),
    Path(".codex"),
    Path("docs/04-engineering/ClaudeCodeAutomation.md"),
    Path("docs/03-architecture/ProjectStructure.md"),
)
HOOK_TRUST_INSTRUCTION = "abra `/hooks` no Codex e revise o hash pendente"
PACKAGE_AGENTS_REFERENCE_RE = re.compile(
    r"(?:packages|apps|tooling)/[^\s`\[\]()<>]+/AGENTS\.md"
)
MANAGED_ADAPTER_DIRECTORIES = (
    Path(".claude/agents"),
    Path(".claude/skills"),
    Path(".codex/agents"),
)


@dataclass(frozen=True)
class DoctorCheck:
    name: str
    status: str
    detail: str


def _check_canonical_roles(root: Path) -> DoctorCheck:
    try:
        roles = {role.name for role in load_roles(root)}
    except (KeyError, OSError, tomllib.TOMLDecodeError, ValueError) as error:
        return DoctorCheck("canonical roles", "error", f"cannot load roles: {error}")
    if roles != CANONICAL_ROLES:
        return DoctorCheck(
            "canonical roles",
            "error",
            f"expected {sorted(CANONICAL_ROLES)}, found {sorted(roles)}",
        )
    return DoctorCheck("canonical roles", "ok", "five canonical roles are available")


def _check_canonical_skills(root: Path) -> DoctorCheck:
    skills_dir = root / ".agents/skills"
    skills = {path.name for path in skills_dir.iterdir() if path.is_dir()} if skills_dir.is_dir() else set()
    if skills != CANONICAL_SKILLS:
        return DoctorCheck(
            "canonical skills",
            "error",
            f"expected {sorted(CANONICAL_SKILLS)}, found {sorted(skills)}",
        )
    missing = [skill for skill in sorted(skills) if not (skills_dir / skill / "SKILL.md").is_file()]
    if missing:
        return DoctorCheck("canonical skills", "error", f"missing SKILL.md for {', '.join(missing)}")
    return DoctorCheck("canonical skills", "ok", "four canonical skills are available")


def _check_generated_parity(root: Path) -> DoctorCheck:
    try:
        expected = expected_generated_files(root)
    except (KeyError, OSError, tomllib.TOMLDecodeError, ValueError) as error:
        return DoctorCheck("generated parity", "error", f"cannot render generated files: {error}")
    drift: list[str] = []
    expected_paths = set(expected)
    for relative, content in expected.items():
        target = root / relative
        try:
            if not target.is_file() or target.read_bytes() != content.encode("utf-8"):
                drift.append(str(relative))
        except OSError as error:
            drift.append(f"{relative}: {error}")

    actual_managed_paths: set[Path] = set()
    for directory in MANAGED_ADAPTER_DIRECTORIES:
        target = root / directory
        if target.is_dir():
            actual_managed_paths.update(path.relative_to(root) for path in target.rglob("*") if path.is_file())
    drift.extend(str(path) for path in sorted(actual_managed_paths - expected_paths))
    if drift:
        return DoctorCheck("generated parity", "error", f"missing or divergent: {', '.join(drift)}")
    return DoctorCheck("generated parity", "ok", "generated adapters match canonical sources")


def _check_hook_json(root: Path) -> DoctorCheck:
    failures: list[str] = []
    for relative in (Path(".claude/settings.json"), Path(".codex/hooks.json")):
        try:
            json.loads((root / relative).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            failures.append(f"{relative}: {error}")
    if failures:
        return DoctorCheck("hook JSON", "error", "; ".join(failures))
    return DoctorCheck("hook JSON", "ok", "Claude and Codex hook files contain valid JSON")


def _check_codex_toml(root: Path) -> DoctorCheck:
    files = [root / ".codex/config.toml", *sorted((root / ".codex/agents").glob("*.toml"))]
    failures: list[str] = []
    for path in files:
        try:
            tomllib.loads(path.read_text(encoding="utf-8"))
        except (OSError, tomllib.TOMLDecodeError) as error:
            failures.append(f"{path.relative_to(root)}: {error}")
    if failures:
        return DoctorCheck("Codex TOML", "error", "; ".join(failures))
    return DoctorCheck("Codex TOML", "ok", "Codex config and agents contain valid TOML")


def _live_reference_files(root: Path) -> tuple[Path, ...]:
    files: list[Path] = []
    for relative in LIVE_REFERENCE_ROOTS:
        path = root / relative
        if path.is_file():
            files.append(path)
        elif path.is_dir():
            files.extend(child for child in path.rglob("*") if child.is_file())
    return tuple(files)


def _check_stale_references(root: Path) -> DoctorCheck:
    invalid: list[str] = []
    for path in _live_reference_files(root):
        source = path.read_text(encoding="utf-8", errors="ignore")
        relative = path.relative_to(root)
        if ".Codex/" in source:
            invalid.append(f"{relative}: .Codex/")
        if "scripts/Codex-usage-report.py" in source:
            invalid.append(f"{relative}: scripts/Codex-usage-report.py")
        for reference in PACKAGE_AGENTS_REFERENCE_RE.findall(source):
            if not (root / reference).is_file():
                invalid.append(f"{relative}: {reference}")
    if invalid:
        return DoctorCheck("stale references", "error", "; ".join(invalid))
    return DoctorCheck("stale references", "ok", "no legacy or nonexistent agent references")


def _check_executable(name: str) -> DoctorCheck:
    path = shutil.which(name)
    if path is None:
        return DoctorCheck(name, "warning", f"{name} is not discoverable on PATH")
    return DoctorCheck(name, "ok", f"{name} is discoverable at {path}")


def _check_codex_transcript(root: Path) -> DoctorCheck:
    fixtures = sorted((root / "scripts/agent-workflow/tests/fixtures").glob("codex-*.jsonl"))
    supported = [path for path in fixtures if parse_codex_session(path).telemetry_status == "complete"]
    if not supported:
        return DoctorCheck("Codex transcript schema", "error", "no supported Codex transcript fixture found")
    return DoctorCheck(
        "Codex transcript schema",
        "ok",
        f"supported fixture: {supported[0].relative_to(root)}",
    )


def run_checks(root: Path) -> tuple[DoctorCheck, ...]:
    root = root.resolve()
    return (
        _check_canonical_roles(root),
        _check_canonical_skills(root),
        _check_generated_parity(root),
        _check_hook_json(root),
        _check_codex_toml(root),
        _check_stale_references(root),
        _check_executable("claude"),
        _check_executable("codex"),
        _check_codex_transcript(root),
        DoctorCheck("hook trust", "manual", HOOK_TRUST_INSTRUCTION),
    )


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    checks = run_checks(root)
    for check in checks:
        print(f"{check.status.upper():7} {check.name}: {check.detail}")
    return 1 if any(check.status == "error" for check in checks) else 0


if __name__ == "__main__":
    raise SystemExit(main())
