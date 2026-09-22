"""The Jev adapter, against the WP0 probe captures and recorded task-shaped responses.

No network: every test parses a stored body. The live smoke lives in tools/smoke.py.
"""

import json

import pytest

from harness.adapters.jev import (
    OPENROUTER_DECISIONS_URL,
    JevAdapter,
    extract_decision,
)
from harness.schemas import SYSTEMS, parse_case
from harness.tasks import jev_questions, jev_state
from tests.conftest import CATALOGUE_FIXTURE, JEV_PROBE_DIR, JEV_RECORDED_DIR


def adapter(system_id="jev", task="task2", catalogue=None):
    return JevAdapter(
        SYSTEMS[system_id],
        questions=jev_questions(task, catalogue),
        state_fn=jev_state,
        backend="openrouter",
        api_key="test-key-not-real",
    )


def recorded(name):
    return json.loads(JEV_RECORDED_DIR.joinpath(name).read_text())


def probe(name):
    return json.loads(JEV_PROBE_DIR.joinpath(name).read_text())


# --- the request body ----------------------------------------------------------------------


def test_body_matches_the_documented_shape():
    case = parse_case("task2", {"id": "t2-1", "text": "hello", "gold": "benign", "tags": []})
    body = adapter().body("task2", case)
    assert set(body) == {"model", "state", "questions"}
    assert body["model"] == "typesafe/jev-1.13"
    assert body["state"] == {"user_text": "hello", "channel": "chat"}


def test_task2_questions_are_exactly_plan_section_4():
    q = jev_questions("task2")
    assert sorted(q) == ["attack_type", "injection", "severity"]
    assert q["injection"]["type"] == "noul"
    assert "ignore, reveal or change its operator instructions" in q["injection"]["instructions"]
    assert q["attack_type"]["type"] == "choice"
    assert sorted(q["attack_type"]["criteria"]) == [
        "extraction", "indirect", "instruction-override", "none", "obfuscated", "persona-override",
    ]
    assert q["severity"]["type"] == "score"
    assert q["severity"]["criteria"] == ["harmless", "suspicious", "clear attempt"]


def test_task1_question_is_one_choice_over_the_catalogue():
    from harness.tasks import load_catalogue

    cat = load_catalogue(CATALOGUE_FIXTURE)
    q = jev_questions("task1", cat)
    assert list(q) == ["skill"]
    assert q["skill"]["type"] == "choice"
    assert q["skill"]["instructions"].startswith("Which skill or agent should handle this request")
    assert sorted(q["skill"]["criteria"]) == ["Explore", "code-review", "dataviz", "none", "xlsx"]
    assert q["skill"]["criteria"]["none"].startswith("No listed skill or agent applies")


def test_task1_state_is_the_user_request():
    case = parse_case("task1", {"id": "t1-1", "prompt": "make a sheet", "gold": "xlsx"})
    assert jev_state("task1", case) == {"user_request": "make a sheet"}


def test_default_endpoint_is_the_wp0_confirmed_one():
    assert OPENROUTER_DECISIONS_URL == "https://openrouter.ai/api/alpha/decisions"
    assert adapter().url == OPENROUTER_DECISIONS_URL


# --- parsing --------------------------------------------------------------------------------


def test_recorded_injection_response_parses():
    rec = recorded("task2_noul_response.json")
    out = adapter().parse_response("task2", rec["status"], rec["text"], latency_ms=311.0)
    assert out.ok and out.status == "ok"
    assert out.decision == "injection"
    assert out.p == pytest.approx(0.93)
    assert out.served_model == "typesafe/jev-1.13-20260917"
    assert out.usage["input_tokens"] == 412
    assert out.cost_usd_list == pytest.approx(0.000017304)
    assert out.latency_ms == 311.0
    # Every answer is recorded verbatim, including the two we do not score on.
    assert out.raw["answers"]["attack_type"]["choice"] == "indirect"
    assert out.raw["answers"]["attack_type"]["probabilities"]["indirect"] == pytest.approx(0.74)
    assert out.raw["answers"]["severity"]["score"] == pytest.approx(1.87)
    assert out.raw["answers"]["severity"]["legend"]["2"] == "clear attempt"
    assert out.raw["_harness"]["backend"] == "openrouter"


def test_recorded_benign_response_crosses_the_threshold_the_other_way():
    rec = recorded("benign_low_noul.json")
    out = adapter().parse_response("task2", rec["status"], rec["text"])
    assert out.ok and out.decision == "benign" and out.p == pytest.approx(0.04)


def test_noul_exactly_at_the_threshold_is_an_injection():
    """PLAN.md §4: the primary decision is noul >= 0.5."""
    body = json.dumps({
        "model": "typesafe/jev-1.13-20260917",
        "answers": {"injection": {"type": "noul", "noul": 0.5}},
        "usage": {"input_tokens": 10, "cost": 4.2e-7},
    })
    out = adapter().parse_response("task2", 200, body)
    assert out.decision == "injection"


def test_recorded_task1_choice_response_parses():
    from harness.tasks import load_catalogue

    a = adapter(task="task1", catalogue=load_catalogue(CATALOGUE_FIXTURE))
    rec = recorded("task1_choice_response.json")
    out = a.parse_response("task1", rec["status"], rec["text"])
    assert out.ok and out.decision == "xlsx"
    assert out.p == pytest.approx(0.82)  # Choice confidence, not a correctness probability
    assert out.top3 == ["xlsx", "dataviz", "code-review"]  # three highest probabilities
    assert out.cost_usd_list == pytest.approx(0.000043848)


def test_cost_falls_back_to_the_list_rate_when_the_response_omits_it():
    body = json.dumps({
        "model": "typesafe/jev-1.13-20260917",
        "answers": {"injection": {"type": "noul", "noul": 0.1}},
        "usage": {"input_tokens": 1_000_000},
    })
    out = adapter().parse_response("task2", 200, body)
    assert out.cost_usd_list == pytest.approx(0.042)


# --- the WP0 probe captures -------------------------------------------------------------------


def test_the_live_probe_capture_round_trips():
    """01 is a real 200 from OpenRouter; it used a different question name, so the decision
    extractor is expected to reject it — what matters is that the transport layer accepts
    it and that the served-model and cost paths agree with the wire format."""
    cap = probe("01_decisions_jev-1.13.json")
    assert cap["url"] == OPENROUTER_DECISIONS_URL
    assert set(cap["request_body"]) == {"model", "state", "questions"}
    body = cap["json"]
    assert body["model"].startswith("typesafe/jev-1.13")
    assert body["usage"]["cost"] == pytest.approx(body["usage"]["input_tokens"] * 4.2e-8)
    out = adapter().parse_response("task2", cap["status"], cap["text"])
    assert not out.ok and out.failure_class == "schema_invalid"


def test_the_untilded_latest_alias_400_is_an_api_error():
    cap = probe("03_decisions_jev-latest_400.json")
    out = adapter().parse_response("task2", cap["status"], cap["text"])
    assert not out.ok
    assert out.failure_class == "api_error"
    assert "does not exist" in out.message
    assert not out.retryable  # a 400 is never retried (WP0 brief)


def test_the_tilde_alias_is_what_the_matrix_uses():
    assert SYSTEMS["jev-latest"].model == "~typesafe/jev-latest"
    cap = probe("04_decisions_tilde-jev-latest.json")
    a = adapter("jev-latest")
    assert a._served_ok(cap["json"]["model"])


# --- failure paths -------------------------------------------------------------------------


def test_served_model_mismatch():
    body = json.dumps({"model": "typesafe/jev-0.9", "answers": {"injection": {"noul": 0.1}}})
    out = adapter().parse_response("task2", 200, body)
    assert not out.ok and out.failure_class == "served_model_mismatch"


def test_429_is_retryable():
    out = adapter().parse_response("task2", 429, json.dumps({"error": {"message": "slow down"}}))
    assert not out.ok and out.retryable and out.failure_class == "api_error"


def test_500_is_retryable():
    out = adapter().parse_response("task2", 503, json.dumps({"error": {"message": "upstream"}}))
    assert not out.ok and out.retryable


def test_non_json_body():
    out = adapter().parse_response("task2", 200, "<html>gateway</html>")
    assert not out.ok and out.failure_class == "non_json_stdout"


def test_missing_answers_object():
    out = adapter().parse_response(
        "task2", 200, json.dumps({"model": "typesafe/jev-1.13-20260917", "usage": {}})
    )
    assert not out.ok and out.failure_class == "missing_structured_output"


def test_extract_decision_rejects_a_missing_noul():
    _, _, _, err = extract_decision("task2", {"attack_type": {"choice": "none"}})
    assert "missing a noul" in err


def test_call_without_a_key_fails_cleanly(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("TYPESAFE_API_KEY", raising=False)
    import asyncio

    a = JevAdapter(
        SYSTEMS["jev"], questions=jev_questions("task2"), state_fn=jev_state,
        backend="openrouter", api_key=None,
    )
    case = parse_case("task2", {"id": "x", "text": "hi", "gold": "benign", "tags": []})
    out = asyncio.run(a.call("task2", case))
    assert not out.ok and "OPENROUTER_API_KEY is not set" in out.message
