from __future__ import annotations

from pathlib import Path

from workflow_lib import expected_generated_files


REPO_ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    drift_found = False
    for relative, expected in expected_generated_files(REPO_ROOT).items():
        target = REPO_ROOT / relative
        if not target.exists():
            print(f"missing: {relative}")
            drift_found = True
        elif target.read_text(encoding="utf-8") != expected:
            print(f"divergent: {relative}")
            drift_found = True
    return 1 if drift_found else 0


if __name__ == "__main__":
    raise SystemExit(main())
