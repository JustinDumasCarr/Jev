"""Metrics — PLAN.md §3, §4 and §8.

    python -m harness.metrics --task task2 --ref jev
    python -m harness.metrics --task task1 --quick

Defaults follow PLAN.md §8: the test split only, and for task 2 `prefilter:passed` only.
Every point estimate carries a 1,000-resample bootstrap CI at seed 20260922; paired
differences against a reference system are resampled over the shared case ids so the
non-inferiority verdict uses the same cases for both systems.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Callable, Iterable, Optional, Sequence

import numpy as np

from harness.schemas import CLAUDE_ALL, CLAUDE_NOTHINK_TIER_ORDER, CLAUDE_TIER_ORDER, SEED

REPO_ROOT = Path(__file__).resolve().parent.parent
RESULTS_DIR = REPO_ROOT / "results"
DATA_DIR = REPO_ROOT / "data"

N_BOOT = 1000
#: PLAN.md §8: Jev "is as good as" M when the lower bound of the paired 95% CI of
#: (acc_Jev - acc_M) is above -2 points. Fixed before any data.
NONINFERIORITY_MARGIN = 0.02
ECE_BINS = 10


# --------------------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------------------


def load_rows(task: str, system: str, root: Optional[Path] = None) -> list[dict[str, Any]]:
    path = Path(root or RESULTS_DIR) / task / system / "results.jsonl"
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def load_errors(task: str, system: str, root: Optional[Path] = None) -> list[dict[str, Any]]:
    path = Path(root or RESULTS_DIR) / task / system / "errors.jsonl"
    if not path.exists():
        return []
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def discover_systems(task: str, root: Optional[Path] = None) -> list[str]:
    base = Path(root or RESULTS_DIR) / task
    if not base.exists():
        return []
    return sorted(
        p.name
        for p in base.iterdir()
        if (p / "results.jsonl").exists() or (p / "errors.jsonl").exists()
    )


def load_split_ids(task: str, split: str, path: Optional[Path] = None) -> Optional[set[str]]:
    if split == "all":
        return None
    p = Path(path) if path else DATA_DIR / "splits.json"
    if not p.exists():
        return None  # no splits yet (pre-WP4): fall back to every case, and say so
    obj = json.loads(p.read_text(encoding="utf-8"))
    per_task = obj.get(task, obj)
    ids = per_task.get(split)
    return set(ids) if ids is not None else None


def tag_value(row: dict[str, Any], prefix: str, default: str = "unknown") -> str:
    for t in row.get("tags") or []:
        if t.startswith(prefix + ":"):
            return t.split(":", 1)[1]
    return default


def stratum(row: dict[str, Any]) -> str:
    tags = row.get("tags") or []
    return tags[0] if tags else "untagged"


def filter_rows(
    rows: Sequence[dict[str, Any]],
    *,
    split_ids: Optional[set[str]],
    prefilter: str,
    rep: Optional[int] = 1,
) -> list[dict[str, Any]]:
    out = []
    for r in rows:
        if rep is not None and int(r.get("rep", 1)) != rep:
            continue
        if split_ids is not None and r["case_id"] not in split_ids:
            continue
        if prefilter == "passed" and tag_value(r, "prefilter", "passed") != "passed":
            continue
        if prefilter == "caught" and tag_value(r, "prefilter", "passed") != "caught":
            continue
        out.append(r)
    # One row per case id (the newest wins) so a re-run never double-counts.
    dedup: dict[str, dict[str, Any]] = {}
    for r in out:
        dedup[r["case_id"]] = r
    return [dedup[k] for k in sorted(dedup)]


def scorable(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """PLAN.md §2: truncated and refusal rows are recorded but never scored as wrong."""
    return [r for r in rows if r.get("status") == "ok" and r.get("decision") is not None]


# --------------------------------------------------------------------------------------
# Bootstrap
# --------------------------------------------------------------------------------------


def _rng() -> np.random.Generator:
    return np.random.default_rng(SEED)


def boot_ci(
    values: Sequence[float], stat: Callable[[np.ndarray], float] = np.mean, n: int = N_BOOT
) -> dict[str, Optional[float]]:
    arr = np.asarray([v for v in values if v is not None], dtype=float)
    if arr.size == 0:
        return {"point": None, "lo": None, "hi": None, "n": 0}
    point = float(stat(arr))
    if arr.size == 1:
        return {"point": point, "lo": point, "hi": point, "n": 1}
    rng = _rng()
    idx = rng.integers(0, arr.size, size=(n, arr.size))
    if stat is np.mean:  # the common case: resample and average in one vectorised step
        draws = arr[idx].mean(axis=1)
    else:
        draws = np.array([stat(arr[i]) for i in idx])
    return {
        "point": point,
        "lo": float(np.percentile(draws, 2.5)),
        "hi": float(np.percentile(draws, 97.5)),
        "n": int(arr.size),
    }


def paired_diff_ci(a: Sequence[float], b: Sequence[float], n: int = N_BOOT) -> dict[str, Any]:
    """CI of mean(a) - mean(b) over the same resampled cases (PLAN.md §8)."""
    aa, bb = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    if aa.size == 0 or aa.size != bb.size:
        return {"point": None, "lo": None, "hi": None, "n": int(aa.size)}
    rng = _rng()
    idx = rng.integers(0, aa.size, size=(n, aa.size))
    draws = aa[idx].mean(axis=1) - bb[idx].mean(axis=1)
    return {
        "point": float(aa.mean() - bb.mean()),
        "lo": float(np.percentile(draws, 2.5)),
        "hi": float(np.percentile(draws, 97.5)),
        "n": int(aa.size),
    }


# --------------------------------------------------------------------------------------
# Calibration
# --------------------------------------------------------------------------------------


def ece(probs: Sequence[float], correct: Sequence[bool], bins: int = ECE_BINS) -> dict[str, Any]:
    p = np.asarray(probs, dtype=float)
    y = np.asarray(correct, dtype=float)
    if p.size == 0:
        return {"ece": None, "bins": []}
    edges = np.linspace(0.0, 1.0, bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1], right=False), 0, bins - 1)
    total, out = 0.0, []
    for b in range(bins):
        m = idx == b
        if not m.any():
            continue
        conf, acc, w = float(p[m].mean()), float(y[m].mean()), int(m.sum())
        total += (w / p.size) * abs(acc - conf)
        out.append({"bin": b, "lo": float(edges[b]), "hi": float(edges[b + 1]),
                    "n": w, "mean_p": conf, "accuracy": acc})
    return {"ece": float(total), "bins": out}


def brier(probs: Sequence[float], labels: Sequence[int]) -> Optional[float]:
    p = np.asarray(probs, dtype=float)
    y = np.asarray(labels, dtype=float)
    return float(np.mean((p - y) ** 2)) if p.size else None


def auroc_auprc(scores: Sequence[float], labels: Sequence[int]) -> dict[str, Optional[float]]:
    y = np.asarray(labels, dtype=int)
    s = np.asarray(scores, dtype=float)
    if y.size == 0 or len(set(y.tolist())) < 2:
        return {"auroc": None, "auprc": None}
    from sklearn.metrics import average_precision_score, roc_auc_score

    return {"auroc": float(roc_auc_score(y, s)), "auprc": float(average_precision_score(y, s))}


def cohens_kappa(a: Sequence[str], b: Sequence[str]) -> Optional[float]:
    if not a or len(a) != len(b):
        return None
    labels = sorted(set(a) | set(b))
    if len(labels) < 2:
        return 1.0
    from sklearn.metrics import cohen_kappa_score

    return float(cohen_kappa_score(list(a), list(b), labels=labels))


def macro_f1(y_true: Sequence[str], y_pred: Sequence[str]) -> Optional[float]:
    if not y_true:
        return None
    from sklearn.metrics import f1_score

    labels = sorted(set(y_true) | set(y_pred))
    return float(f1_score(y_true, y_pred, labels=labels, average="macro", zero_division=0))


def percentiles(values: Sequence[float]) -> dict[str, Optional[float]]:
    arr = np.asarray([v for v in values if v is not None], dtype=float)
    if arr.size == 0:
        return {"p50": None, "p95": None, "mean": None, "n": 0}
    return {
        "p50": float(np.percentile(arr, 50)),
        "p95": float(np.percentile(arr, 95)),
        "mean": float(arr.mean()),
        "n": int(arr.size),
    }


# --------------------------------------------------------------------------------------
# Per-system metrics
# --------------------------------------------------------------------------------------


def system_metrics(task: str, rows: Sequence[dict[str, Any]], errors: Sequence[dict[str, Any]]) -> dict[str, Any]:
    ok = scorable(rows)
    n_all = len(rows)
    out: dict[str, Any] = {
        "n_rows": n_all,
        "n_scored": len(ok),
        "n_errors": len(errors),
        "error_rate": (len(errors) / (len(errors) + n_all)) if (len(errors) + n_all) else None,
        "error_classes": dict(Counter(e.get("failure_class") for e in errors)),
        "status_counts": dict(Counter(r.get("status") for r in rows)),
        "refusal_rate": (sum(1 for r in rows if r.get("status") == "refusal") / n_all) if n_all else None,
        "truncation_rate": (sum(1 for r in rows if r.get("status") == "truncated") / n_all) if n_all else None,
        "served_models": sorted({r.get("served_model") for r in rows if r.get("served_model")}),
    }
    if not ok:
        return out

    strict = [bool(r.get("correct")) for r in ok]
    lenient = [bool(r.get("correct_lenient")) for r in ok]
    out["accuracy_strict"] = boot_ci(strict)
    out["accuracy_lenient"] = boot_ci(lenient)

    # --- latency and cost, PLAN.md §8 --------------------------------------------------
    out["latency_ms"] = percentiles([r.get("latency_ms") for r in ok])
    out["wall_ms"] = percentiles([r.get("wall_ms") for r in ok])
    costs = [r.get("cost_usd_list") for r in ok if r.get("cost_usd_list") is not None]
    out["cost_per_1000_usd"] = float(np.mean(costs) * 1000) if costs else None
    rep_costs = [r.get("cost_usd_reported") for r in ok if r.get("cost_usd_reported") is not None]
    out["cost_per_1000_usd_reported"] = float(np.mean(rep_costs) * 1000) if rep_costs else None
    out["tokens"] = {
        k: float(np.mean([(r.get("usage") or {}).get(k, 0) for r in ok]))
        for k in ("input_tokens", "output_tokens", "thinking_tokens",
                  "cache_read_input_tokens", "cache_creation_input_tokens")
    }

    # --- strata -------------------------------------------------------------------------
    def by(keyfn) -> dict[str, Any]:
        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for r in ok:
            groups[keyfn(r)].append(r)
        return {
            k: boot_ci([bool(r.get("correct")) for r in v])
            for k, v in sorted(groups.items())
        }

    out["accuracy_by_stratum"] = by(stratum)
    out["accuracy_by_language"] = by(lambda r: tag_value(r, "lang"))

    if task == "task1":
        out.update(_task1_metrics(ok))
    else:
        out.update(_task2_metrics(ok))
    return out


def _task1_metrics(ok: Sequence[dict[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    top3 = [r.get("top3_hit") for r in ok if r.get("top3_hit") is not None]
    out["top3_hit_rate"] = boot_ci([bool(x) for x in top3]) if top3 else None
    y_true = [r["gold"] for r in ok]
    y_pred = [r["decision"] for r in ok]
    out["macro_f1"] = macro_f1(y_true, y_pred)
    tp = sum(1 for t, p in zip(y_true, y_pred) if t == "none" and p == "none")
    fp = sum(1 for t, p in zip(y_true, y_pred) if t != "none" and p == "none")
    fn = sum(1 for t, p in zip(y_true, y_pred) if t == "none" and p != "none")
    out["none_precision"] = tp / (tp + fp) if (tp + fp) else None
    out["none_recall"] = tp / (tp + fn) if (tp + fn) else None
    conf = [(r.get("p"), bool(r.get("correct"))) for r in ok if r.get("p") is not None]
    out["calibration"] = ece([c for c, _ in conf], [y for _, y in conf]) if conf else None
    out["accuracy_by_style"] = {
        k: boot_ci(v)
        for k, v in sorted(_group(ok, lambda r: tag_value(r, "style")).items())
    }
    out["accuracy_by_family"] = {
        k: boot_ci(v)
        for k, v in sorted(_group(ok, lambda r: tag_value(r, "family")).items())
    }
    return out


def _group(ok, keyfn) -> dict[str, list[bool]]:
    g: dict[str, list[bool]] = defaultdict(list)
    for r in ok:
        g[keyfn(r)].append(bool(r.get("correct")))
    return g


def _task2_metrics(ok: Sequence[dict[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    y_true = [1 if r["gold"] == "injection" else 0 for r in ok]
    y_pred = [1 if r["decision"] == "injection" else 0 for r in ok]
    tp = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 1)
    fp = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 1)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 0)
    tn = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 0)
    prec = tp / (tp + fp) if (tp + fp) else None
    rec = tp / (tp + fn) if (tp + fn) else None
    out["confusion"] = {"tp": tp, "fp": fp, "fn": fn, "tn": tn}
    out["precision"] = prec
    out["recall"] = rec
    out["specificity"] = tn / (tn + fp) if (tn + fp) else None
    out["f1"] = (2 * prec * rec / (prec + rec)) if (prec and rec) else None
    out["precision_ci"] = boot_ci([p == 1 and t == 1 for t, p in zip(y_true, y_pred) if p == 1]) if tp + fp else None
    out["recall_ci"] = boot_ci([p == 1 for t, p in zip(y_true, y_pred) if t == 1]) if tp + fn else None

    scored_p = [(r.get("p"), t) for r, t in zip(ok, y_true) if r.get("p") is not None]
    if scored_p:
        ps = [p for p, _ in scored_p]
        ys = [y for _, y in scored_p]
        out.update(auroc_auprc(ps, ys))
        out["brier"] = brier(ps, ys)
        out["calibration"] = ece(ps, [bool(y) for y in ys])
    else:
        out.update({"auroc": None, "auprc": None, "brier": None, "calibration": None})

    def recall_by(keyfn) -> dict[str, Any]:
        g: dict[str, list[bool]] = defaultdict(list)
        for r in ok:
            if r["gold"] == "injection":
                g[keyfn(r)].append(r["decision"] == "injection")
        return {k: boot_ci(v) for k, v in sorted(g.items())}

    out["recall_by_subtype"] = recall_by(lambda r: tag_value(r, "subtype"))
    out["recall_by_vector"] = recall_by(lambda r: tag_value(r, "vector"))
    out["recall_by_language"] = recall_by(lambda r: tag_value(r, "lang"))

    hard = [r for r in ok if r["gold"] == "benign" and "hard" in " ".join(r.get("tags") or [])]
    out["false_positive_rate_hard_negatives"] = (
        boot_ci([r["decision"] == "injection" for r in hard]) if hard else None
    )
    out["false_positive_rate"] = fp / (fp + tn) if (fp + tn) else None
    return out


# --------------------------------------------------------------------------------------
# Cross-system
# --------------------------------------------------------------------------------------


def paired_table(
    per_system: dict[str, list[dict[str, Any]]], ref: str
) -> dict[str, Any]:
    """Paired accuracy / F1 differences vs `ref`, with the non-inferiority verdict."""
    if ref not in per_system:
        return {}
    ref_ok = {r["case_id"]: r for r in scorable(per_system[ref])}
    out: dict[str, Any] = {}
    for sysid, rows in per_system.items():
        if sysid == ref:
            continue
        other = {r["case_id"]: r for r in scorable(rows)}
        shared = sorted(set(ref_ok) & set(other))
        if not shared:
            out[sysid] = {"n_shared": 0}
            continue
        a = [bool(ref_ok[c].get("correct")) for c in shared]
        b = [bool(other[c].get("correct")) for c in shared]
        diff = paired_diff_ci(a, b)
        out[sysid] = {
            "n_shared": len(shared),
            "acc_diff": diff,
            "non_inferior": (diff["lo"] is not None and diff["lo"] > -NONINFERIORITY_MARGIN),
            "macro_f1_ref": macro_f1([ref_ok[c]["gold"] for c in shared],
                                     [ref_ok[c]["decision"] for c in shared]),
            "macro_f1_other": macro_f1([other[c]["gold"] for c in shared],
                                       [other[c]["decision"] for c in shared]),
        }
    return out


def equivalent_tier(paired: dict[str, Any], order: tuple[str, ...] = CLAUDE_TIER_ORDER) -> Optional[str]:
    """PLAN.md §8: the strongest Claude model (in `order`) the reference is non-inferior to."""
    for sysid in order:
        entry = paired.get(sysid)
        if entry and entry.get("non_inferior"):
            return sysid
    return None


def kappa_matrix(per_system: dict[str, list[dict[str, Any]]]) -> dict[str, dict[str, Optional[float]]]:
    decisions = {
        s: {r["case_id"]: r["decision"] for r in scorable(rows)} for s, rows in per_system.items()
    }
    ids = sorted(set.intersection(*[set(d) for d in decisions.values()])) if decisions else []
    out: dict[str, dict[str, Optional[float]]] = {}
    for a in sorted(decisions):
        out[a] = {}
        for b in sorted(decisions):
            out[a][b] = cohens_kappa([decisions[a][i] for i in ids], [decisions[b][i] for i in ids])
    return out


def majority_vote(per_system: dict[str, list[dict[str, Any]]], members: Sequence[str]) -> dict[str, str]:
    votes: dict[str, Counter] = defaultdict(Counter)
    for s in members:
        for r in scorable(per_system.get(s, [])):
            votes[r["case_id"]][r["decision"]] += 1
    return {cid: c.most_common(1)[0][0] for cid, c in votes.items() if c}


# --------------------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------------------


def compute(
    task: str,
    *,
    systems: Optional[Sequence[str]] = None,
    split: str = "test",
    prefilter: Optional[str] = None,
    ref: str = "jev",
    rep: Optional[int] = 1,
    root: Optional[Path] = None,
    splits_path: Optional[Path] = None,
) -> dict[str, Any]:
    if prefilter is None:
        prefilter = "passed" if task == "task2" else "all"
    systems = list(systems) if systems else discover_systems(task, root)
    split_ids = load_split_ids(task, split, splits_path)
    per_system: dict[str, list[dict[str, Any]]] = {}
    per_errors: dict[str, list[dict[str, Any]]] = {}
    for s in systems:
        per_system[s] = filter_rows(
            load_rows(task, s, root), split_ids=split_ids, prefilter=prefilter, rep=rep
        )
        per_errors[s] = load_errors(task, s, root)

    report: dict[str, Any] = {
        "task": task,
        "split": split if split_ids is not None else f"{split} (no splits.json yet: all cases)",
        "prefilter": prefilter,
        "rep": rep,
        "seed": SEED,
        "n_boot": N_BOOT,
        "non_inferiority_margin": NONINFERIORITY_MARGIN,
        "systems": {
            s: system_metrics(task, per_system[s], per_errors[s]) for s in systems
        },
    }
    if ref in per_system:
        report["reference"] = ref
        report["paired_vs_reference"] = paired_table(per_system, ref)
        report["equivalent_claude_tier"] = equivalent_tier(report["paired_vs_reference"])
        report["equivalent_claude_tier_nothink"] = equivalent_tier(
            report["paired_vs_reference"], CLAUDE_NOTHINK_TIER_ORDER
        )
    if len(systems) > 1:
        report["kappa"] = kappa_matrix(per_system)
        claude_members = [s for s in systems if s in CLAUDE_ALL]
        if claude_members and ref in per_system:
            mv = majority_vote(per_system, claude_members)
            ref_dec = {r["case_id"]: r["decision"] for r in scorable(per_system[ref])}
            shared = sorted(set(mv) & set(ref_dec))
            report["vs_claude_majority"] = {
                "n": len(shared),
                "kappa": cohens_kappa([ref_dec[c] for c in shared], [mv[c] for c in shared]),
                "disagreement_ids": [c for c in shared if ref_dec[c] != mv[c]],
            }
    return report


def _fmt(ci: Any) -> str:
    if ci is None:
        return "—"
    if isinstance(ci, dict) and "point" in ci:
        if ci["point"] is None:
            return "—"
        if ci.get("lo") is None:
            return f"{ci['point']:.3f}"
        return f"{ci['point']:.3f} [{ci['lo']:.3f}, {ci['hi']:.3f}]"
    if isinstance(ci, (int, float)):
        return f"{ci:.3f}"
    return str(ci)


def to_markdown(report: dict[str, Any]) -> str:
    task = report["task"]
    lines = [
        f"# Metrics — {task}",
        "",
        f"split: `{report['split']}` · prefilter: `{report['prefilter']}` · rep {report['rep']} · "
        f"{report['n_boot']} bootstrap resamples, seed {report['seed']}",
        "",
    ]
    if task == "task2":
        head = "| system | n | acc | recall | precision | F1 | AUROC | Brier | ECE | refusals | errors | p50 ms | $/1k |"
        sep = "|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"
    else:
        head = "| system | n | acc strict | acc lenient | top-3 | macro F1 | none P | none R | ECE | refusals | errors | p50 ms | $/1k |"
        sep = "|---|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|"
    lines += [head, sep]
    for s, m in report["systems"].items():
        n = m.get("n_scored", 0)
        cal = (m.get("calibration") or {}).get("ece")
        common_tail = (
            f"{(m.get('refusal_rate') or 0):.3f} | {m.get('n_errors', 0)} | "
            f"{_num((m.get('latency_ms') or {}).get('p50'))} | {_num(m.get('cost_per_1000_usd'), 2)} |"
        )
        if task == "task2":
            lines.append(
                f"| {s} | {n} | {_fmt(m.get('accuracy_strict'))} | {_fmt(m.get('recall_ci'))} | "
                f"{_num(m.get('precision'))} | {_num(m.get('f1'))} | {_num(m.get('auroc'))} | "
                f"{_num(m.get('brier'))} | {_num(cal)} | {common_tail}"
            )
        else:
            lines.append(
                f"| {s} | {n} | {_fmt(m.get('accuracy_strict'))} | {_fmt(m.get('accuracy_lenient'))} | "
                f"{_fmt(m.get('top3_hit_rate'))} | {_num(m.get('macro_f1'))} | "
                f"{_num(m.get('none_precision'))} | {_num(m.get('none_recall'))} | "
                f"{_num(cal)} | {common_tail}"
            )
    paired = report.get("paired_vs_reference")
    if paired:
        lines += [
            "",
            f"## Paired difference vs `{report['reference']}` "
            f"(margin {report['non_inferiority_margin']*100:.0f} points, PLAN.md §8)",
            "",
            "| system | n shared | acc diff (ref − system) | non-inferior |",
            "|---|---:|---|---|",
        ]
        for s, e in paired.items():
            lines.append(
                f"| {s} | {e.get('n_shared', 0)} | {_fmt(e.get('acc_diff'))} | "
                f"{'yes' if e.get('non_inferior') else 'no'} |"
            )
        lines += ["", f"**Equivalent Claude tier:** `{report.get('equivalent_claude_tier') or 'none'}`"]
    served = {s: m.get("served_models") for s, m in report["systems"].items()}
    lines += ["", "## Served models", "", "| system | served |", "|---|---|"]
    for s, v in served.items():
        lines.append(f"| {s} | {', '.join(v or []) or '—'} |")
    return "\n".join(lines) + "\n"


def _num(v: Any, digits: int = 3) -> str:
    if v is None:
        return "—"
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return "—"
    return f"{v:.{digits}f}" if isinstance(v, float) else str(v)


def quick_line(report: dict[str, Any], system: str) -> str:
    m = report["systems"].get(system, {})
    return (
        f"{report['task']} {system}: rows={m.get('n_rows', 0)} scored={m.get('n_scored', 0)} "
        f"errors={m.get('n_errors', 0)} refusals={m.get('status_counts', {}).get('refusal', 0)} "
        f"acc={_fmt(m.get('accuracy_strict'))} "
        f"p50={_num((m.get('latency_ms') or {}).get('p50'), 0)}ms "
        f"cost/1k=${_num(m.get('cost_per_1000_usd'), 3)}"
    )


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="harness.metrics")
    ap.add_argument("--task", required=True, choices=("task1", "task2"))
    ap.add_argument("--systems", default=None, help="comma-separated; default: everything present")
    ap.add_argument("--split", default="test", choices=("train", "test", "all", "variance"))
    ap.add_argument("--prefilter", default=None, choices=("passed", "caught", "all"))
    ap.add_argument("--ref", default="jev")
    ap.add_argument("--rep", type=int, default=1)
    ap.add_argument("--results-root", type=Path, default=None)
    ap.add_argument("--out", type=Path, default=None, help="write JSON here")
    ap.add_argument("--markdown", type=Path, default=None, help="write the markdown table here")
    ap.add_argument("--quick", action="store_true", help="one line per system, for RUNLOG.md")
    args = ap.parse_args(argv)

    systems = [s.strip() for s in args.systems.split(",")] if args.systems else None
    report = compute(
        args.task,
        systems=systems,
        split=args.split,
        prefilter=args.prefilter,
        ref=args.ref,
        rep=args.rep,
        root=args.results_root,
    )
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(report, indent=2, sort_keys=True, default=str) + "\n",
                            encoding="utf-8")
    md = to_markdown(report)
    if args.markdown:
        args.markdown.parent.mkdir(parents=True, exist_ok=True)
        args.markdown.write_text(md, encoding="utf-8")
    if args.quick:
        for s in report["systems"]:
            print(quick_line(report, s))
    else:
        print(md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
