#!/usr/bin/env python3
from __future__ import annotations

import runpy
import sys
from pathlib import Path

sys.argv[1:1] = ["--executor", "claude"]
runpy.run_path(str(Path(__file__).with_name("agent-usage-report.py")), run_name="__main__")
