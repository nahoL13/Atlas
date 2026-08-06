from __future__ import annotations

from pathlib import Path

from workflow_lib import generated_file_drift


REPO_ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    issues = generated_file_drift(REPO_ROOT)
    for issue in issues:
        print(issue)
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
