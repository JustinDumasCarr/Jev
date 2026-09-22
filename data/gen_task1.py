#!/usr/bin/env python3
"""WP2 — Task 1 (skill/agent routing) dataset generator.

Label-first: the plan of 1,000 (option, slice, style, language) specs is built
deterministically from PLAN.md section 3, then one `claude -p` call per spec asks
Opus 5 to write ONE user request for that spec. The generator model never sees
another case, and never sees the label of any other case.

Calls go through the local `claude` CLI on Justin's Claude Code subscription
(PLAN.md section 6). No Anthropic API key exists and none is used.

Usage:
    python3 data/gen_task1.py                 # generate / resume the full 1,000
    python3 data/gen_task1.py --limit 20      # first 20 specs only (smoke)
    python3 data/gen_task1.py --plan-only     # print the plan summary, no calls

Resumable: ids already present in data/task1_cases.jsonl are skipped. The file is
re-sorted by id on every exit so it is byte-stable.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import subprocess
import sys
import tempfile
import threading
import time
import unicodedata
import zlib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

DATA = Path(__file__).resolve().parent


def _path(env: str, default: str) -> Path:
    """Inputs and outputs are overridable so a regeneration can be staged beside the
    shipped files and swapped in only once it has passed the audits."""
    return Path(os.environ[env]) if os.environ.get(env) else DATA / default


CATALOGUE = _path("JEV_T1_CATALOGUE", "catalogue.json")
CASES = _path("JEV_T1_CASES", "task1_cases.jsonl")
LOG = _path("JEV_T1_LOG", "gen_task1_log.jsonl")

SEED = 20260922
GEN_MODEL = "claude-opus-5"
GEN_EFFORT = "low"
MAX_PARALLEL = 4
MAX_ATTEMPTS = 5
CALL_TIMEOUT_S = 180
SIM_THRESHOLD = 0.78   # token-set Jaccard above which a new prompt is a duplicate

# The `claude` CLI names its working directory in the prompt prefix, so running the
# generator from the Jev repo leaks "Jev" into the cases it writes. Calls therefore
# run from an empty scratch directory, and any prompt that still names this repo,
# this eval or the generating model is rejected.
SELF_REF = re.compile(r"(jev|typesafe|\bnoul\b|catalogue\.json)", re.I)

# The dataset is published, so no case may carry the operator's own business: the company
# and product names, the people, or the industry and locale this set was originally written
# against. A generated text that does is rejected and the case is asked for again, which is
# what keeps the scrub at the generator instead of in hand-edited rows.
#
# The term list itself lives OUTSIDE the repo, because a list of the things that must not be
# published is itself a description of them. Default path ~/.config/jev/private-terms.txt,
# overridable with JEV_PRIVATE_TERMS: one case-insensitive regex fragment per line, # for a
# comment. With no such file the guard is a no-op and says so once, which is the right
# behaviour for anyone who clones this repo: they have no such business to protect.
PRIVATE_TERMS_PATH = Path(
    os.environ.get("JEV_PRIVATE_TERMS", Path.home() / ".config" / "jev" / "private-terms.txt")
)


def _load_private_domain() -> "re.Pattern | None":
    if not PRIVATE_TERMS_PATH.exists():
        print(f"[privacy] no term list at {PRIVATE_TERMS_PATH}; the private-domain guard is off")
        return None
    terms = [
        line.strip()
        for line in PRIVATE_TERMS_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    return re.compile("|".join(terms), re.I) if terms else None


PRIVATE_DOMAIN = _load_private_domain()

# PLAN.md section 3, "Distribution of the 1,000 prompts".
SLICE_COUNTS = {
    "clear": 450,
    "implicit": 200,
    "ambiguous": 130,
    "none": 120,
    "adversarial": 100,
}
FR_SHARE = 0.20                      # "Across the set: 20% French"
NAME_DROP_TOTAL = 100                # "10% mention a skill by name"
NONE_SUBSTYLES = {"chitchat": 40, "code-question": 40, "uncovered": 40}
ADV_STYLES = ["typo", "negation", "wrong-name-drop"]

# Short-prompt stratum (added 2026-09-22 at Justin's request). 150 of the 1,000
# cases are regenerated under a hard word cap, so the set is not made entirely of
# the context-rich 37-word requests Opus 5 writes by default. The 150 are spread
# across the five slices in proportion to their size and, inside each slice, in
# proportion to that slice's French share, so the slice counts, the >= 15 gold
# prompts per option and the 20% French share are all unchanged: these are the
# same cases, written shorter. They carry an extra tags[4] = "len:short".
SHORT_MAX_WORDS = 14
SHORT_TARGETS = {"clear": 68, "implicit": 30, "ambiguous": 19, "none": 18, "adversarial": 15}

# Plausible confusions, used for the ambiguous slice (acceptable = [gold, partner])
# and for the negation / wrong-name-drop adversarial styles (the distractor).
PAIRS: dict[str, list[str]] = {
    "Explore": ["general-purpose", "Plan"],
    "Plan": ["Explore", "general-purpose"],
    "artifact-capabilities": ["artifact-design", "docs"],
    "artifact-design": ["artifact-diagramming", "canvas-design"],
    "artifact-diagramming": ["artifact-design", "dataviz"],
    "canvas-design": ["pptx", "artifact-design"],
    "claude-api": ["claude-code-guide", "workflow-authoring"],
    "claude-code-guide": ["claude-api", "update-config"],
    "client-email": ["writer", "marketing-analysis"],
    "code-review": ["security-review", "simplify"],
    "dataviz": ["xlsx", "artifact-diagramming"],
    "docs": ["docx", "writer"],
    "docx": ["docs", "pdf"],
    "fewer-permission-prompts": ["update-config", "keybindings-help"],
    "general-purpose": ["Explore", "Plan"],
    "import-memory": ["init", "update-config"],
    "init": ["claude-code-guide", "Explore"],
    "keybindings-help": ["update-config", "statusline-setup"],
    "loop": ["session-start-hook", "workflow-authoring"],
    "marketing-analysis": ["research", "dataviz"],
    "morning": ["loop", "dataviz"],
    "pdf": ["docx", "pptx"],
    "pptx": ["canvas-design", "docx"],
    "research": ["writer", "Explore"],
    "run": ["init", "claude-code-guide"],
    "security-review": ["code-review", "simplify"],
    "session-start-hook": ["update-config", "loop"],
    "simplify": ["code-review", "Plan"],
    "skill-creator": ["workflow-authoring", "init"],
    "statusline-setup": ["update-config", "keybindings-help"],
    "update-config": ["keybindings-help", "session-start-hook"],
    "workflow-authoring": ["loop", "skill-creator"],
    "wp-page-update": ["writer", "docs"],
    "writer": ["wp-page-update", "research"],
    "xlsx": ["dataviz", "docx"],
}

PERSONAS = [
    "a solo indie developer", "a data analyst at a mid-size company",
    "a technical writer", "an early-stage startup founder",
    "a computer-science student", "a product manager who codes a little",
    "a freelance consultant", "a backend engineer on a Python service",
    "a frontend engineer on a React app", "a platform / devops engineer",
    "a marketing manager", "an academic researcher",
    "a small-business owner", "a designer who edits code occasionally",
    "an engineering manager", "a QA engineer",
    "a mobile developer", "a teacher preparing course material",
    "an operations lead at a nonprofit", "a finance analyst",
    "a security engineer", "a support-team lead",
    "an office manager at a small agency", "a bootcamp graduate on their first job",
    "a game developer working alone", "a scientist who scripts in Python",
    "a solutions architect", "an SRE on call",
    "a junior developer three weeks into a codebase", "a CTO of a six-person company",
]

TONES = [
    "terse, lowercase, barely any punctuation",
    "polite and written in full sentences",
    "slightly rambling, gives background before the ask",
    "blunt and a little frustrated",
    "curious and exploratory, thinking out loud",
    "in a hurry, one line only",
    "formal, as if writing to a colleague",
    "casual, with a contraction or two",
    "precise and technical, names versions and paths",
    "tentative, unsure whether this is even possible",
]

UNCOVERED_TOPICS = [
    "planning a trip itinerary", "meal planning for a week",
    "a question about a rental lease", "translating a paragraph between languages",
    "a probability puzzle", "writing a toast for a wedding",
    "career advice about changing jobs", "a short piece of fiction",
    "explaining a news event", "choosing a bicycle",
    "a question about tax rules in general terms", "settling a friendly argument about history",
    "advice on a houseplant that is dying", "drafting a personal apology note",
    "understanding a medical term they read", "picking a name for a pet",
    "a chess opening question", "how a washing machine works",
    "a question about the rules of a board game", "summarising a book they half remember",
]

SYSTEM_PROMPT = """You write realistic user requests for an evaluation dataset.

You are given ONE target from a catalogue of Claude Code / claude.ai capabilities, plus constraints. Write exactly ONE message that a real user would type into a chat with Claude.

Hard rules:
- Write only the user's message. Never write Claude's reply. Never explain your choice. Never wrap the message in quotation marks.
- Obey the LENGTH line in the instruction exactly. Count the words before you answer.
- Concrete and specific: a real file, a real situation, a real deadline, a real repo. Avoid placeholder phrasing like "my document" with no other detail.
- Do not use the words "skill", "agent", "capability", "catalogue", "tool" or "route" unless a rule below tells you to name something.
- Do not mimic a template. Vary sentence shape, opening word and length.
- The dataset is published: invent every company, product, site, person and place name, and
  keep them plainly fictional. Never name a real city, a real firm or a real person, and keep
  the subject matter to ordinary software, office and small-business work.
- Return JSON matching the schema and nothing else."""

PROMPT_SCHEMA = json.dumps(
    {
        "type": "object",
        "properties": {"prompt": {"type": "string"}},
        "required": ["prompt"],
        "additionalProperties": False,
    },
    separators=(",", ":"),
)

# --------------------------------------------------------------------------- #
# Plan construction (deterministic)
# --------------------------------------------------------------------------- #


def load_catalogue() -> tuple[list[dict], dict[str, dict]]:
    doc = json.loads(CATALOGUE.read_text(encoding="utf-8"))
    opts = doc["options"]
    by_name = {o["name"]: o for o in opts}
    assert len(opts) == 36, f"expected 36 options, got {len(opts)}"
    assert "none" in by_name
    return opts, by_name


def spread(count: int, items: list[str], offset: int) -> dict[str, int]:
    """Give each item floor(count/n), then one extra to `count % n` items,
    starting at `offset` so the remainder rotates between slices."""
    n = len(items)
    base, rem = divmod(count, n)
    out = {it: base for it in items}
    for k in range(rem):
        out[items[(offset + k) % n]] += 1
    return out


def build_plan(by_name: dict[str, dict]) -> list[dict]:
    rng = random.Random(SEED)
    targets = sorted(n for n in by_name if n != "none")
    assert len(targets) == 35, len(targets)

    specs: list[dict] = []

    # --- option-bearing slices -------------------------------------------- #
    for s_i, slice_name in enumerate(["clear", "implicit", "ambiguous", "adversarial"]):
        per_option = spread(SLICE_COUNTS[slice_name], targets, offset=s_i * 7)
        slice_specs: list[dict] = []
        for opt in targets:
            partners = PAIRS[opt]
            for k in range(per_option[opt]):
                spec = {"slice": slice_name, "gold": opt, "acceptable": [opt]}
                if slice_name == "ambiguous":
                    partner = partners[k % len(partners)]
                    spec["partner"] = partner
                    spec["acceptable"] = [opt, partner]
                elif slice_name == "adversarial":
                    spec["distractor"] = partners[k % len(partners)]
                slice_specs.append(spec)

        # styles
        if slice_name == "clear":
            nd = spread(NAME_DROP_TOTAL, targets, offset=3)
            taken = {o: 0 for o in targets}
            for sp in slice_specs:
                if taken[sp["gold"]] < nd[sp["gold"]]:
                    sp["style"] = "name-drop"
                    taken[sp["gold"]] += 1
                else:
                    sp["style"] = "natural"
        elif slice_name == "implicit":
            for sp in slice_specs:
                sp["style"] = "implicit"
        elif slice_name == "ambiguous":
            for sp in slice_specs:
                sp["style"] = "natural"
        else:  # adversarial
            order = list(slice_specs)
            rng.shuffle(order)
            for i, sp in enumerate(order):
                sp["style"] = ADV_STYLES[i % len(ADV_STYLES)]

        specs.extend(slice_specs)

    # --- the `none` slice --------------------------------------------------- #
    none_specs: list[dict] = []
    for sub, n in NONE_SUBSTYLES.items():
        for k in range(n):
            sp = {"slice": "none", "gold": "none", "acceptable": ["none"], "style": sub}
            if sub == "uncovered":
                sp["topic"] = UNCOVERED_TOPICS[k % len(UNCOVERED_TOPICS)]
            none_specs.append(sp)
    specs.extend(none_specs)

    assert len(specs) == 1000, len(specs)

    # --- language: 20% French, stratified by slice ------------------------- #
    for slice_name, count in SLICE_COUNTS.items():
        pool = [sp for sp in specs if sp["slice"] == slice_name]
        n_fr = round(FR_SHARE * count)
        idx = list(range(len(pool)))
        # zlib.crc32, not hash(): Python salts string hashing per process, so
        # hash() here made the plan differ between runs and the same case id could
        # be assigned a different language by two different invocations.
        random.Random(SEED + zlib.crc32(slice_name.encode()) % 1000).shuffle(idx)
        fr = set(idx[:n_fr])
        for i, sp in enumerate(pool):
            sp["lang"] = "fr" if i in fr else "en"

    # --- ordering and ids --------------------------------------------------- #
    # Shuffle once with the fixed seed so ids are not grouped by slice, then
    # assign ids in that order. The plan is a pure function of SEED.
    rng2 = random.Random(SEED + 1)
    rng2.shuffle(specs)
    for i, sp in enumerate(specs, start=1):
        sp["id"] = f"t1-{i:04d}"
        sp["persona"] = PERSONAS[(i * 7) % len(PERSONAS)]
        sp["tone"] = TONES[(i * 3) % len(TONES)]
        sp["family"] = by_name[sp["gold"]]["family"]
    specs.sort(key=lambda s: s["id"])

    # --- short stratum ------------------------------------------------------ #
    # Within each (slice, language) group, walk the specs ordered by gold option
    # and take an evenly spaced stride. That spreads the short cases across every
    # option instead of clustering them, and is a pure function of the plan.
    short_ids: set[str] = set()
    for slice_name, n_short in SHORT_TARGETS.items():
        pool = [sp for sp in specs if sp["slice"] == slice_name]
        fr_pool = [sp for sp in pool if sp["lang"] == "fr"]
        en_pool = [sp for sp in pool if sp["lang"] == "en"]
        n_fr = round(n_short * len(fr_pool) / len(pool))
        for sub, k in ((fr_pool, n_fr), (en_pool, n_short - n_fr)):
            if k <= 0:
                continue
            ordered = sorted(sub, key=lambda s: (s["gold"], s["id"]))
            step = len(ordered) / k
            short_ids.update(ordered[min(len(ordered) - 1, int(i * step))]["id"] for i in range(k))
    for sp in specs:
        sp["short"] = sp["id"] in short_ids
    return specs


# --------------------------------------------------------------------------- #
# Instruction construction
# --------------------------------------------------------------------------- #


def lang_line(lang: str) -> str:
    if lang == "fr":
        return ("Language: French. Write it in natural French as a Quebec or European French speaker "
                "would actually type it — not a translation of an English sentence.")
    return "Language: English."


def describe(o: dict) -> str:
    return f'name: "{o["name"]}" ({o["family"]})\nwhat it does: {o["description"]}'


def build_instruction(spec: dict, by_name: dict[str, dict], variation: int) -> str:
    gold = by_name[spec["gold"]]
    parts: list[str] = []
    sl, st = spec["slice"], spec["style"]

    if sl != "none":
        parts.append("TARGET CAPABILITY\n" + describe(gold))

    if sl == "clear" and st == "natural":
        parts.append(
            "TASK\nWrite one user request that clearly and unambiguously calls for this capability "
            "and for nothing else in a developer-assistant catalogue. The need must be obvious from "
            "the words used. Do NOT name the capability."
        )
    elif sl == "clear" and st == "name-drop":
        parts.append(
            "TASK\nWrite one user request that clearly calls for this capability AND names it "
            f'explicitly, exactly as "{gold["name"]}" — the way a user who already knows the '
            f'catalogue would ("run {gold["name"]} on ...", "use {gold["name"]} for this", '
            f'"can you {gold["name"]} my ..."). Keep the rest of the request a real, specific need.'
        )
    elif sl == "implicit":
        parts.append(
            "TASK\nWrite one user request that describes a situation, a frustration or a desired end "
            "state from which this capability is the right answer — but that names no tool, no "
            "command, no feature and no file format, and avoids the obvious give-away vocabulary. "
            "Describe the problem, never the solution. A careful reader who knows the catalogue must "
            "still land on this capability."
        )
    elif sl == "ambiguous":
        partner = by_name[spec["partner"]]
        parts.append("ALSO-DEFENSIBLE CAPABILITY\n" + describe(partner))
        parts.append(
            "TASK\nWrite one user request that a careful reader could reasonably route to either the "
            "TARGET or the ALSO-DEFENSIBLE capability, with the TARGET the slightly better fit. The "
            "ambiguity must come from the request genuinely sitting between the two, NOT from being "
            "vague, short or unclear: it should be a specific, concrete request that simply happens "
            "to straddle both. Name neither capability."
        )
    elif sl == "adversarial" and st == "typo":
        parts.append(
            "TASK\nWrite one user request that calls for this capability, typed the way a fast and "
            "careless user types: several real misspellings, missing apostrophes, a run-on clause, "
            "inconsistent capitalisation, maybe a doubled word. The underlying need must still be "
            "recoverable by a careful reader. Do NOT name the capability. Do not use asterisks or "
            "any markup to signal the typos."
        )
    elif sl == "adversarial" and st == "negation":
        distractor = by_name[spec["distractor"]]
        parts.append("CAPABILITY TO RULE OUT\n" + describe(distractor))
        parts.append(
            "TASK\nWrite one user request in which the user first explicitly rules OUT what the "
            "CAPABILITY TO RULE OUT produces, then asks for what the TARGET does — the shape of "
            "\"don't make me a deck, I just need a one-page write-up\". Refer to the ruled-out thing "
            "by its output or its activity, not by its catalogue name. Name neither capability. The "
            "negated part must be the first thing in the message."
        )
    elif sl == "adversarial" and st == "wrong-name-drop":
        parts.append(
            "TASK\nWrite one user request describing a need that the TARGET capability handles, but "
            f'in which the user confidently names the wrong thing: they say "{spec["distractor"]}" '
            "is what they want. The described need must be unmistakably the TARGET's, so that a "
            "careful reader routes to the TARGET despite the wrong name. Do not name the TARGET."
        )
    elif sl == "none" and st == "chitchat":
        parts.append(
            "TASK\nWrite one message a user would send to Claude that is ordinary conversation or a "
            "general-knowledge question — small talk, an opinion, a definition, a bit of banter — "
            "where no developer-assistant skill or sub-agent applies and Claude should just answer "
            "in the chat. Do not mention files, documents, spreadsheets, slides, charts, repos, "
            "code, settings or reviews."
        )
    elif sl == "none" and st == "code-question":
        parts.append(
            "TASK\nWrite one message in which a user asks a plain programming or conceptual question "
            "that Claude should simply answer in the chat: no file to produce, no repository to "
            "search, no configuration to change, no review to run, no app to launch. For example "
            "explaining a language feature, comparing two approaches, or asking what an error "
            "message means in the abstract. Do not paste code and do not refer to 'my repo'."
        )
    elif sl == "none" and st == "uncovered":
        parts.append(
            "TASK\nWrite one message asking for something genuine and reasonable that a "
            "developer-assistant catalogue does not cover, so Claude should just answer directly. "
            f"Topic to use: {spec['topic']}. It must be a real request, not small talk and not a "
            "programming question. Do not mention files, documents, spreadsheets, slides, charts, "
            "repositories, code, settings or reviews."
        )
    else:  # pragma: no cover
        raise ValueError(f"unhandled spec {spec}")

    parts.append(
        "CONSTRAINTS\n"
        + (
            f"LENGTH: at most {SHORT_MAX_WORDS} words. One short sentence or fragment, the way "
            "someone types when they are in a hurry. This is a hard cap — count the words. Keep "
            "one concrete detail (a filename, a number, a place) and drop everything else.\n"
            if spec.get("short")
            else "LENGTH: between 12 and 45 words. One or two sentences.\n"
        )
        + f"{lang_line(spec['lang'])}\n"
        f"Speaker: {spec['persona']}.\n"
        f"Tone: {spec['tone']}.\n"
        f"Variation key {variation}: take a different angle from the most obvious phrasing."
    )
    return "\n\n".join(parts)


# --------------------------------------------------------------------------- #
# The Claude Code CLI call
# --------------------------------------------------------------------------- #

CLI_ENV_KEYS = ("PATH", "HOME", "USER", "TERM", "LANG")
LIMIT_RE = re.compile(r"(usage limit|rate limit|rate_limit|resets? at|too many requests)", re.I)
RESET_EPOCH_RE = re.compile(r"\b(1[7-9]\d{8})\b")


NEUTRAL_CWD = tempfile.mkdtemp(prefix="gen_task1_cwd_")


def cli_env() -> dict[str, str]:
    return {k: os.environ[k] for k in CLI_ENV_KEYS if k in os.environ}


def call_claude(instruction: str) -> tuple[dict | None, dict]:
    """Returns (result_json_or_None, meta). meta always has wall_ms."""
    cmd = [
        "claude", "-p", instruction,
        "--model", GEN_MODEL,
        "--effort", GEN_EFFORT,
        "--system-prompt", SYSTEM_PROMPT,
        "--json-schema", PROMPT_SCHEMA,
        "--output-format", "json",
        "--tools", "",
        "--no-session-persistence",
        "--setting-sources", "",
        "--strict-mcp-config",
        "--mcp-config", '{"mcpServers":{}}',
        "--disable-slash-commands",
        "--no-chrome",
    ]
    t0 = time.monotonic()
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, env=cli_env(),
            cwd=NEUTRAL_CWD, stdin=subprocess.DEVNULL, timeout=CALL_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        return None, {"wall_ms": int((time.monotonic() - t0) * 1000), "failure": "timeout"}
    wall_ms = int((time.monotonic() - t0) * 1000)
    if proc.returncode != 0 and not proc.stdout.strip():
        return None, {"wall_ms": wall_ms, "failure": "nonzero_exit",
                      "returncode": proc.returncode, "stderr": proc.stderr[-2000:]}
    try:
        return json.loads(proc.stdout), {"wall_ms": wall_ms, "stderr": proc.stderr[-500:]}
    except json.JSONDecodeError:
        return None, {"wall_ms": wall_ms, "failure": "non_json_stdout",
                      "stdout": proc.stdout[-2000:], "stderr": proc.stderr[-2000:]}


def is_limit_error(res: dict) -> bool:
    if not res.get("is_error"):
        return False
    if res.get("api_error_status") == 429:
        return True
    return bool(LIMIT_RE.search(str(res.get("result", "")) + str(res.get("error", ""))))


def limit_sleep_s(res: dict) -> int:
    text = str(res.get("result", "")) + str(res.get("error", ""))
    m = RESET_EPOCH_RE.search(text)
    if m:
        delta = int(m.group(1)) - int(time.time())
        if 0 < delta < 6 * 3600:
            return delta + 30
    return 600


# --------------------------------------------------------------------------- #
# Validation and dedup
# --------------------------------------------------------------------------- #

_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)
_WS = re.compile(r"\s+")
# Names distinctive enough that their appearance is a real leak. Two families are
# deliberately NOT checked: common English words that happen to be option names
# (run, docs, init, loop, plan, writer, research, simplify, morning, ...), and the
# file-format names (xlsx, pptx, docx, pdf), because naming `board_audit.pdf` or
# `revue_q3.pptx` is how a real user phrases that request — those skills' own
# descriptions say to trigger when the user references such a file by name.
LEAK_CHECKED = {n for n in PAIRS if "-" in n} | {"dataviz"}


def normalise(text: str) -> str:
    t = unicodedata.normalize("NFKD", text.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return _WS.sub(" ", _PUNCT.sub(" ", t)).strip()


def token_set(text: str) -> frozenset[str]:
    return frozenset(normalise(text).split())


def jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def clean_prompt(raw: str) -> str:
    t = raw.strip()
    t = _WS.sub(" ", t.replace("\n", " ")).strip()
    for q in ('"', "'", "“", "«"):
        if t.startswith(q):
            t = t[1:].strip()
    for q in ('"', "'", "”", "»"):
        if t.endswith(q):
            t = t[:-1].strip()
    return t


def validate(prompt: str, spec: dict) -> str | None:
    """Return a rejection reason, or None if acceptable."""
    if not prompt:
        return "empty"
    words = prompt.split()
    lo, hi = (3, SHORT_MAX_WORDS + 1) if spec.get("short") else (4, 80)
    if not (lo <= len(words) <= hi):
        return f"length_{len(words)}"
    low = prompt.lower()
    if spec["style"] not in ("name-drop", "wrong-name-drop"):
        g = spec["gold"]
        if g in LEAK_CHECKED and g.lower() in low:
            return "gold_name_leak"
    if spec["style"] == "name-drop" and spec["gold"].lower() not in low:
        return "name_drop_missing"
    if spec["style"] == "wrong-name-drop" and spec["distractor"].lower() not in low:
        return "distractor_name_missing"
    if low.startswith(("here is", "here's", "sure,", "certainly")):
        return "model_voice"
    if SELF_REF.search(prompt):
        return "self_reference"
    if PRIVATE_DOMAIN is not None and PRIVATE_DOMAIN.search(prompt):
        return "private_domain"
    return None


# --------------------------------------------------------------------------- #
# Driver
# --------------------------------------------------------------------------- #


def read_existing() -> dict[str, dict]:
    if not CASES.exists():
        return {}
    out = {}
    for line in CASES.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            row = json.loads(line)
            out[row["id"]] = row
    return out


def write_cases(rows: dict[str, dict]) -> None:
    ordered = [rows[k] for k in sorted(rows)]
    with CASES.open("w", encoding="utf-8") as fh:
        for row in ordered:
            fh.write(json.dumps(row, ensure_ascii=False, sort_keys=False) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--plan-only", action="store_true")
    args = ap.parse_args()

    opts, by_name = load_catalogue()
    plan = build_plan(by_name)

    if args.plan_only:
        from collections import Counter
        print("specs:", len(plan))
        print("slice:", dict(Counter(s["slice"] for s in plan)))
        print("style:", dict(Counter(s["style"] for s in plan)))
        print("lang: ", dict(Counter(s["lang"] for s in plan)))
        gold = Counter(s["gold"] for s in plan)
        print("min per option:", min(v for k, v in gold.items() if k != "none"),
              "max:", max(gold.values()))
        print("acceptable>1:", sum(1 for s in plan if len(s["acceptable"]) > 1))
        sh = [s for s in plan if s["short"]]
        print("short:", len(sh),
              "by slice:", dict(Counter(s["slice"] for s in sh)),
              "by lang:", dict(Counter(s["lang"] for s in sh)),
              "distinct options:", len({s["gold"] for s in sh}))
        return 0

    rows = read_existing()
    pending = [s for s in plan if s["id"] not in rows]
    if args.limit:
        pending = pending[: args.limit]
    print(f"{len(rows)} existing, {len(pending)} to generate", flush=True)
    if not pending:
        write_cases(rows)
        return 0

    lock = threading.Lock()
    log_lock = threading.Lock()
    accepted_tokens: list[frozenset[str]] = [token_set(r["prompt"]) for r in rows.values()]
    accepted_norm: set[str] = {normalise(r["prompt"]) for r in rows.values()}
    pause_until = [0.0]
    stats = {"calls": 0, "rejects": 0, "limit_pauses": 0,
             "in_tok": 0, "out_tok": 0, "think_tok": 0,
             "cache_create": 0, "cache_read": 0, "cost": 0.0, "api_ms": 0}

    def log(rec: dict) -> None:
        with log_lock:
            with LOG.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(rec, ensure_ascii=False) + "\n")

    def work(spec: dict, attempt: int) -> tuple[dict, str | None, str]:
        """Returns (spec, prompt_or_None, reason)."""
        while True:
            wait = pause_until[0] - time.time()
            if wait <= 0:
                break
            time.sleep(min(wait, 30))

        instruction = build_instruction(spec, by_name, variation=attempt)
        res, meta = call_claude(instruction)
        ts = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

        if res is None:
            log({"case_id": spec["id"], "attempt": attempt, "ts": ts, "ok": False, **meta})
            return spec, None, meta.get("failure", "no_result")

        usage = res.get("modelUsage", {}) or {}
        rec = {
            "case_id": spec["id"], "attempt": attempt, "ts": ts,
            "model_requested": GEN_MODEL, "effort": GEN_EFFORT,
            "duration_api_ms": res.get("duration_api_ms"),
            "duration_ms": res.get("duration_ms"),
            "wall_ms": meta["wall_ms"],
            "total_cost_usd": res.get("total_cost_usd"),
            "is_error": res.get("is_error"),
            "stop_reason": res.get("stop_reason"),
            "api_error_status": res.get("api_error_status"),
            "session_id": res.get("session_id"),
            "modelUsage": usage,
        }
        with log_lock:
            stats["calls"] += 1
            stats["cost"] += res.get("total_cost_usd") or 0.0
            stats["api_ms"] += res.get("duration_api_ms") or 0
            for _m, u in usage.items():
                stats["in_tok"] += u.get("inputTokens", 0)
                stats["out_tok"] += u.get("outputTokens", 0)
                stats["think_tok"] += u.get("thinkingTokens", 0)
                stats["cache_create"] += u.get("cacheCreationInputTokens", 0)
                stats["cache_read"] += u.get("cacheReadInputTokens", 0)

        if is_limit_error(res):
            nap = limit_sleep_s(res)
            with log_lock:
                stats["limit_pauses"] += 1
                pause_until[0] = max(pause_until[0], time.time() + nap)
            rec.update(ok=False, reason="usage_limit", pause_s=nap,
                       result=str(res.get("result", ""))[:500])
            log(rec)
            return spec, None, "usage_limit"

        so = res.get("structured_output")
        if not isinstance(so, dict) or not isinstance(so.get("prompt"), str):
            rec.update(ok=False, reason="no_structured_output",
                       result=str(res.get("result", ""))[:500])
            log(rec)
            return spec, None, "no_structured_output"

        prompt = clean_prompt(so["prompt"])
        reason = validate(prompt, spec)
        rec.update(ok=reason is None, reason=reason, prompt=prompt)
        log(rec)
        return spec, (None if reason else prompt), reason or "ok"

    attempt_of = {s["id"]: 1 for s in pending}
    queue = list(pending)
    t_start = time.time()

    while queue:
        batch = queue
        queue = []
        with ThreadPoolExecutor(max_workers=MAX_PARALLEL) as pool:
            futures = [pool.submit(work, s, attempt_of[s["id"]]) for s in batch]
            for fut in futures:
                spec, prompt, reason = fut.result()
                sid = spec["id"]
                if prompt is None:
                    attempt_of[sid] += 1
                    if attempt_of[sid] <= MAX_ATTEMPTS:
                        queue.append(spec)
                    else:
                        print(f"  !! {sid} gave up after {MAX_ATTEMPTS}: {reason}", flush=True)
                    continue
                with lock:
                    norm = normalise(prompt)
                    ts_ = token_set(prompt)
                    dup = norm in accepted_norm or any(
                        jaccard(ts_, other) >= SIM_THRESHOLD for other in accepted_tokens
                    )
                    if dup:
                        stats["rejects"] += 1
                        attempt_of[sid] += 1
                        if attempt_of[sid] <= MAX_ATTEMPTS:
                            queue.append(spec)
                        else:
                            print(f"  !! {sid} still duplicate after {MAX_ATTEMPTS}", flush=True)
                        continue
                    accepted_norm.add(norm)
                    accepted_tokens.append(ts_)
                    tags = [
                        f"slice:{spec['slice']}",
                        f"lang:{spec['lang']}",
                        f"style:{spec['style']}",
                        f"family:{spec['family']}",
                    ]
                    if spec.get("short"):
                        tags.append("len:short")
                    rows[sid] = {
                        "id": sid,
                        "prompt": prompt,
                        "gold": spec["gold"],
                        "acceptable": spec["acceptable"],
                        "tags": tags,
                    }
                    if len(rows) % 25 == 0:
                        write_cases(rows)
                        el = time.time() - t_start
                        print(f"  {len(rows)}/1000  calls={stats['calls']}  "
                              f"rejects={stats['rejects']}  {el:.0f}s", flush=True)
        if queue:
            print(f"  retrying {len(queue)}", flush=True)

    write_cases(rows)
    print(json.dumps({"rows": len(rows), **stats}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
