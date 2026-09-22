"""Metrics: paired differences, the non-inferiority rule, kappa and calibration."""

import json

import pytest

from harness import metrics as M
from harness.schemas import SEED


def rows(system, task, decisions, golds, ps=None, tags=None):
    out = []
    for i, (d, g) in enumerate(zip(decisions, golds)):
        out.append({
            "case_id": f"c{i:03d}", "system": system, "task": task, "rep": 1,
            "requested_model": system, "served_model": system,
            "decision": d, "p": (ps[i] if ps else None), "gold": g,
            "correct": d == g, "correct_lenient": d == g, "top3_hit": d == g,
            "status": "ok", "usage": {}, "latency_ms": 100.0 + i,
            "cost_usd_list": 0.001, "tags": (tags[i] if tags else ["subtype:none", "lang:en"]),
        })
    return out


def write(root, task, system, rs, errors=()):
    d = root / task / system
    d.mkdir(parents=True, exist_ok=True)
    (d / "results.jsonl").write_text("\n".join(json.dumps(r) for r in rs) + "\n")
    if errors:
        (d / "errors.jsonl").write_text("\n".join(json.dumps(e) for e in errors) + "\n")


def test_bootstrap_is_deterministic():
    vals = [True] * 70 + [False] * 30
    a, b = M.boot_ci(vals), M.boot_ci(vals)
    assert a == b
    assert a["point"] == pytest.approx(0.70)
    assert a["lo"] < 0.70 < a["hi"]


def test_paired_diff_is_zero_for_identical_systems():
    d = M.paired_diff_ci([True] * 50 + [False] * 50, [True] * 50 + [False] * 50)
    assert d["point"] == 0.0 and d["lo"] == 0.0 and d["hi"] == 0.0


def test_non_inferiority_uses_the_two_point_margin(tmp_path):
    """PLAN.md §8: non-inferior when the lower bound of the paired 95% CI is above -2 pts.

    n = 1,000 so the CI is narrow enough for a 0.2-point gap to clear the margin and a
    4-point gap to miss it; at n = 100 every gap is inside the noise, which is the point
    of PLAN.md §8's noise-floor note.
    """
    assert M.NONINFERIORITY_MARGIN == 0.02
    n = 1000
    golds = ["injection"] * (n // 2) + ["benign"] * (n // 2)
    flip = {"injection": "benign", "benign": "injection"}

    def wrong_on(k):
        preds = list(golds)
        for i in range(k):
            preds[i] = flip[golds[i]]
        return preds

    write(tmp_path, "task2", "jev", rows("jev", "task2", wrong_on(40), golds))       # 96.0%
    write(tmp_path, "task2", "haiku45", rows("haiku45", "task2", wrong_on(38), golds))  # 96.2%
    write(tmp_path, "task2", "sonnet5", rows("sonnet5", "task2", list(golds), golds))   # 100%
    rep = M.compute("task2", split="all", ref="jev", root=tmp_path)
    paired = rep["paired_vs_reference"]
    assert paired["haiku45"]["acc_diff"]["point"] == pytest.approx(-0.002)
    assert paired["haiku45"]["acc_diff"]["lo"] > -M.NONINFERIORITY_MARGIN
    assert paired["haiku45"]["non_inferior"] is True
    assert paired["sonnet5"]["acc_diff"]["point"] == pytest.approx(-0.04)
    assert paired["sonnet5"]["acc_diff"]["lo"] < -M.NONINFERIORITY_MARGIN
    assert paired["sonnet5"]["non_inferior"] is False
    assert rep["equivalent_claude_tier"] == "haiku45"


def test_equivalent_tier_picks_the_strongest_model(tmp_path):
    golds = ["benign"] * 100
    write(tmp_path, "task2", "jev", rows("jev", "task2", list(golds), golds))
    for s in ("haiku45", "sonnet5", "opus5"):
        write(tmp_path, "task2", s, rows(s, "task2", list(golds), golds))
    rep = M.compute("task2", split="all", ref="jev", root=tmp_path)
    assert rep["equivalent_claude_tier"] == "opus5"


def test_kappa_matrix_is_one_on_the_diagonal(tmp_path):
    golds = ["injection"] * 25 + ["benign"] * 25
    write(tmp_path, "task2", "jev", rows("jev", "task2", list(golds), golds))
    other = list(golds)
    other[0] = "benign"
    write(tmp_path, "task2", "haiku45", rows("haiku45", "task2", other, golds))
    rep = M.compute("task2", split="all", ref="jev", root=tmp_path)
    k = rep["kappa"]
    assert k["jev"]["jev"] == pytest.approx(1.0)
    assert 0.9 < k["jev"]["haiku45"] < 1.0


def test_prefilter_filter_is_the_default_for_task2(tmp_path):
    golds = ["injection"] * 4
    tags = [["subtype:x", "prefilter:passed"], ["subtype:x", "prefilter:caught"],
            ["subtype:x", "prefilter:passed"], ["subtype:x", "prefilter:caught"]]
    write(tmp_path, "task2", "jev", rows("jev", "task2", list(golds), golds, tags=tags))
    passed = M.compute("task2", split="all", ref="jev", root=tmp_path)
    assert passed["systems"]["jev"]["n_scored"] == 2
    every = M.compute("task2", split="all", prefilter="all", ref="jev", root=tmp_path)
    assert every["systems"]["jev"]["n_scored"] == 4


def test_task1_none_precision_and_recall(tmp_path):
    golds = ["none", "none", "xlsx", "xlsx"]
    preds = ["none", "xlsx", "none", "xlsx"]
    write(tmp_path, "task1", "jev", rows("jev", "task1", preds, golds))
    rep = M.compute("task1", split="all", ref="jev", root=tmp_path)
    m = rep["systems"]["jev"]
    assert m["none_precision"] == pytest.approx(0.5)
    assert m["none_recall"] == pytest.approx(0.5)


def test_auroc_and_brier_are_computed_from_p(tmp_path):
    golds = ["injection"] * 20 + ["benign"] * 20
    preds = list(golds)
    ps = [0.9] * 20 + [0.1] * 20
    write(tmp_path, "task2", "jev", rows("jev", "task2", preds, golds, ps=ps))
    m = M.compute("task2", split="all", ref="jev", root=tmp_path)["systems"]["jev"]
    assert m["auroc"] == pytest.approx(1.0)
    assert m["brier"] == pytest.approx(0.01)
    assert m["calibration"]["ece"] == pytest.approx(0.1, abs=0.01)


def test_perfect_calibration_has_near_zero_ece():
    probs = [0.1] * 100 + [0.9] * 100
    correct = [False] * 90 + [True] * 10 + [True] * 90 + [False] * 10
    assert M.ece(probs, correct)["ece"] == pytest.approx(0.0, abs=1e-9)


def test_markdown_table_renders(tmp_path):
    golds = ["injection"] * 5 + ["benign"] * 5
    write(tmp_path, "task2", "jev", rows("jev", "task2", list(golds), golds, ps=[0.9] * 5 + [0.1] * 5))
    write(tmp_path, "task2", "haiku45", rows("haiku45", "task2", list(golds), golds))
    md = M.to_markdown(M.compute("task2", split="all", ref="jev", root=tmp_path))
    assert "| system |" in md and "jev" in md and "haiku45" in md
    assert "Equivalent Claude tier" in md
    assert "Served models" in md


def test_report_module_builds(tmp_path):
    from harness import report as R

    golds = ["injection"] * 5 + ["benign"] * 5
    write(tmp_path, "task2", "jev", rows("jev", "task2", list(golds), golds, ps=[0.9] * 5 + [0.1] * 5))
    md, reports = R.build(root=tmp_path, split="all", ref="jev")
    assert "Jev vs Claude" in md and "task2" in reports
    assert "Calibration" in md


def test_seed_is_the_plan_seed():
    assert SEED == 20260922 and M.N_BOOT == 1000
