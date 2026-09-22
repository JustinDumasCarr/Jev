import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

FIXTURES = REPO_ROOT / "tests" / "fixtures"
PROBE_DIR = FIXTURES / "claude_cli_probe_2026-09-22"
JEV_PROBE_DIR = FIXTURES / "jev_probe_2026-09-22"
JEV_RECORDED_DIR = FIXTURES / "jev_recorded"
CASE_DIR = FIXTURES / "cases"
CATALOGUE_FIXTURE = FIXTURES / "catalogue_fixture.json"

import pytest


@pytest.fixture(scope="session")
def fixtures_dir() -> Path:
    return FIXTURES


@pytest.fixture(scope="session")
def catalogue():
    from harness.tasks import load_catalogue

    return load_catalogue(CATALOGUE_FIXTURE)
