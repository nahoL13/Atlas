from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from workflow_lib import parse_spec_status


PATCH_FILE_RE = re.compile(r"^\*\*\* (?:Add|Update|Delete) File: (.+)$", re.MULTILINE)
PATCH_MOVE_RE = re.compile(r"^\*\*\* Move to: (.+)$", re.MULTILINE)
SOURCE_RE = re.compile(r"^(packages|apps|tooling)/([^/]+)/src/(.+)$")
TYPESCRIPT_SUFFIXES = {".ts", ".tsx", ".mts", ".cts"}
ACTIVE_SPEC_STATUSES = {"Ready", "In Progress"}


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
    if not isinstance(command, str):
        return ()
    paths = PATCH_FILE_RE.findall(command) + PATCH_MOVE_RE.findall(command)
    return tuple(dict.fromkeys(Path(value) for value in paths))


def _component_for_path(repo_root: Path, path: Path) -> str | None:
    path = _lexically_normalize(path)
    try:
        relative = path.relative_to(repo_root) if path.is_absolute() else path
    except ValueError:
        parts = path.parts
        for index, part in enumerate(parts):
            if part in {"packages", "apps", "tooling"}:
                relative = Path(*parts[index:])
                break
        else:
            return None
    match = SOURCE_RE.fullmatch(relative.as_posix())
    return f"{match.group(1)}/{match.group(2)}" if match else None


def _lexically_normalize(path: Path) -> Path:
    normalized_parts: list[str] = []
    for part in path.parts:
        if part in {path.anchor, ".", ""}:
            continue
        if part == "..":
            if normalized_parts and normalized_parts[-1] != "..":
                normalized_parts.pop()
            elif not path.anchor:
                normalized_parts.append(part)
            continue
        normalized_parts.append(part)
    return Path(path.anchor, *normalized_parts) if path.anchor else Path(*normalized_parts)


def _spec_mentions_component(source: str, component: str) -> bool:
    _kind, slug = component.split("/", maxsplit=1)
    forms = (component, f"@atlas/{slug}", slug)
    return any(
        re.search(rf"(?<![\w@/-]){re.escape(form)}(?![\w@/-])", source)
        for form in forms
    )


def find_active_spec(repo_root: Path, component: str) -> Path | None:
    specs_dir = repo_root / "docs/implementation/specs"
    for spec in sorted(specs_dir.glob("*.md")):
        source = spec.read_text(encoding="utf-8")
        if parse_spec_status(source) in ACTIVE_SPEC_STATUSES and _spec_mentions_component(
            source, component
        ):
            return spec
    return None


def _permission_decision(platform: str, missing_components: tuple[str, ...]) -> HookDecision:
    decision = "ask" if platform == "claude" else "deny"
    reason = (
        f"Nenhuma SPEC ativa cobre: {', '.join(missing_components)}. "
        "Crie/aprove a SPEC e execute novamente."
    )
    body = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": reason,
        }
    }
    return HookDecision(stdout=json.dumps(body, ensure_ascii=False))


def _unextractable_edit_decision(platform: str) -> HookDecision:
    decision = "ask" if platform == "claude" else "deny"
    body = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": (
                "Não foi possível extrair caminhos do payload de edição; "
                "o gate de SPEC falhou de forma fechada. Revise o schema da ferramenta."
            ),
        }
    }
    return HookDecision(stdout=json.dumps(body, ensure_ascii=False))


def handle_pre_tool_use(platform: str, payload: dict, repo_root: Path) -> HookDecision:
    paths = extract_touched_paths(platform, payload)
    if not paths:
        return _unextractable_edit_decision(platform)
    components = tuple(
        dict.fromkeys(
            component
            for path in paths
            if (component := _component_for_path(repo_root, path)) is not None
        )
    )
    missing = tuple(component for component in components if find_active_spec(repo_root, component) is None)
    return _permission_decision(platform, missing) if missing else HookDecision()


def _post_tool_paths(platform: str, payload: dict) -> tuple[Path, ...]:
    paths = extract_touched_paths(platform, payload)
    if platform != "claude" or paths:
        return paths
    response = payload.get("tool_response") or {}
    value = response.get("filePath")
    return (Path(value),) if isinstance(value, str) and value else ()


def handle_post_tool_use(platform: str, payload: dict, repo_root: Path) -> HookDecision:
    typescript_paths = tuple(
        path
        for path in _post_tool_paths(platform, payload)
        if path.suffix in TYPESCRIPT_SUFFIXES
        and (path if path.is_absolute() else repo_root / path).is_file()
    )
    if not typescript_paths:
        return HookDecision()

    result = subprocess.run(
        ["pnpm", "exec", "eslint", *[str(path) for path in typescript_paths]],
        cwd=repo_root,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode == 0:
        return HookDecision()
    return HookDecision(exit_code=2, stderr=f"{result.stdout}{result.stderr}")


def classify_prompt(prompt: str) -> str | None:
    if re.search(r"\bspec\b|lições aprendidas|lessons", prompt, re.IGNORECASE):
        return "spec-pipeline"
    return None


def handle_user_prompt_submit(payload: dict) -> HookDecision:
    prompt = payload.get("prompt")
    if not isinstance(prompt, str) or classify_prompt(prompt) is None:
        return HookDecision()
    body = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "Use a skill spec-pipeline.",
        }
    }
    return HookDecision(stdout=json.dumps(body, ensure_ascii=False))
