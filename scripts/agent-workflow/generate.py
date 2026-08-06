from __future__ import annotations

from pathlib import Path

from workflow_lib import expected_generated_files, write_generated_files


REPO_ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    for relative in expected_generated_files(REPO_ROOT):
        print(relative)
    write_generated_files(REPO_ROOT)


if __name__ == "__main__":
    main()
