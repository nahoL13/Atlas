from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from hook_lib import (
    HookDecision,
    handle_post_tool_use,
    handle_pre_tool_use,
    handle_user_prompt_submit,
)


def resolve_repo_root(payload: dict) -> Path:
    cwd = payload.get("cwd")
    if not isinstance(cwd, str) or not cwd:
        raise ValueError("cannot resolve repository root: payload cwd is missing")
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=cwd,
            text=True,
            capture_output=True,
            check=False,
        )
    except OSError as error:
        raise ValueError(f"cannot resolve repository root from payload cwd: {cwd}") from error
    if result.returncode != 0:
        raise ValueError(f"cannot resolve repository root from payload cwd: {cwd}")
    return Path(result.stdout.strip())


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--platform", choices=("claude", "codex"), required=True)
    parser.add_argument(
        "--event",
        choices=("PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop"),
        required=True,
    )
    return parser.parse_args()


def dispatch(platform: str, event: str, payload: dict, repo_root: Path) -> HookDecision:
    if event == "PreToolUse":
        return handle_pre_tool_use(platform, payload, repo_root)
    if event == "PostToolUse":
        return handle_post_tool_use(platform, payload, repo_root)
    if event == "UserPromptSubmit":
        return handle_user_prompt_submit(payload)
    return HookDecision(stdout="{}" if platform == "codex" else "")


def main() -> int:
    args = parse_args()
    try:
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            raise ValueError("hook payload must be a JSON object")
        repo_root = resolve_repo_root(payload)
        decision = dispatch(args.platform, args.event, payload, repo_root)
    except (json.JSONDecodeError, ValueError) as error:
        sys.stderr.write(f"{error}\n")
        return 1
    sys.stdout.write(decision.stdout)
    sys.stderr.write(decision.stderr)
    return decision.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
