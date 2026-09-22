"""Case-schema validation and the price table."""

import json

import pytest
from pydantic import ValidationError

from harness.schemas import (
    CLAUDE_TIER_ORDER,
    SYSTEMS,
    TASK1_SCHEMA,
    TASK2_SCHEMA,
    claude_cost_usd,
    parse_case,
)
from tests.conftest import CASE_DIR, PROBE_DIR


def test_task1_case_round_trips():
    raw = json.loads(CASE_DIR.joinpath("task1_fixture.jsonl").read_text().splitlines()[0])
    case = parse_case("task1", raw)
    assert case.id == "t1-f001"
    assert case.gold == "xlsx"
    assert case.gold in case.acceptable
    assert case.stratum == "slice:clear"
    assert case.text == case.prompt


def test_task2_case_round_trips():
    raw = json.loads(CASE_DIR.joinpath("task2_fixture.jsonl").read_text().splitlines()[1])
    case = parse_case("task2", raw)
    assert case.gold == "injection"
    assert case.vector == "indirect"
    assert case.prefilter_tag == "prefilter:passed"
    assert case.acceptable == ["injection"]


def test_task1_case_gold_is_added_to_acceptable():
    case = parse_case("task1", {"id": "x", "prompt": "p", "gold": "xlsx", "acceptable": []})
    assert case.acceptable == ["xlsx"]


def test_invalid_case_is_rejected():
    with pytest.raises(ValidationError):
        parse_case("task2", {"id": "x", "text": "t", "gold": "maybe"})
    with pytest.raises(ValidationError):
        parse_case("task1", {"id": "x", "prompt": "p"})  # no gold


def test_model_matrix_matches_plan_section_2():
    expected = {
        "fable51": ("claude-fable-5-1", "low"),
        "opus5": ("claude-opus-5", "low"),
        "opus48": ("claude-opus-4-8", "low"),
        "opus47": ("claude-opus-4-7", "low"),
        "opus46": ("claude-opus-4-6", "low"),
        "sonnet5": ("claude-sonnet-5", "low"),
        "sonnet46": ("claude-sonnet-4-6", "low"),
        "haiku45": ("claude-haiku-4-5", "low"),
    }
    for sid, (model, effort) in expected.items():
        assert SYSTEMS[sid].model == model
        assert SYSTEMS[sid].effort == effort
    assert set(CLAUDE_TIER_ORDER) == set(expected)
    assert SYSTEMS["jev"].model == "typesafe/jev-1.13"


def test_output_schemas_match_plan():
    assert set(TASK1_SCHEMA["required"]) == {"top3", "confidence"}
    assert TASK1_SCHEMA["properties"]["top3"]["minItems"] == 3
    assert TASK2_SCHEMA["properties"]["verdict"]["enum"] == ["injection", "benign"]


@pytest.mark.parametrize("name", sorted(p.name for p in PROBE_DIR.glob("claude-*.json")))
def test_cost_matches_reported(name):
    """Our list-price computation reproduces the CLI's own costUSD to the cent."""
    from harness.adapters.claude_cli import split_stdout

    result = json.loads(split_stdout(PROBE_DIR.joinpath(name).read_text()))
    ((key, entry),) = result["modelUsage"].items()
    ours = claude_cost_usd(entry, (result.get("usage") or {}).get("cache_creation") or {})
    assert ours == pytest.approx(entry["costUSD"], rel=1e-4)
