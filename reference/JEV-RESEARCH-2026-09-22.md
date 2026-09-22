# Jev (TypeSafe AI) — research note, 2026-09-22

Compiled from public sources on 2026-09-22 for the Jev-vs-Claude evaluation (`PLAN.md` at the root of this repo). Everything here is vendor- or press-sourced; nothing has been verified against our own traffic yet. That verification is the point of the eval.

## What Jev is

- **Developer:** TypeSafe AI (San Francisco, founded 2024, led by ex-OpenAI researcher Diogo Almeida). $40M seed led by DCVC.
- **Released:** limited early access on **2026-09-15**. The *direct* key (console.typesafe.ai) is waitlisted, but Jev is self-serve today through resellers: **OpenRouter** (`typesafe/jev-1.13`; the rolling alias is `~typesafe/jev-latest` with a leading tilde, verified 2026-09-22), **Cloudflare AI** (`typesafe/jev`, same state+questions body, billed in the Cloudflare dashboard), **AI/ML API** (`typesafe/jev` on `POST /v1/decisions`, 32K context), and **Vercel AI Gateway**. Only OpenRouter exposes the pinned version. Reseller pricing is not published on the listing pages.
- **Not an LLM.** TypeSafe calls it a "System One model": it never generates text. You send a `state` (string, JSON object, or array of text) and a dictionary of typed questions; it returns one typed answer per question **with a probability distribution and a confidence**. Because outputs are schema-constrained, structured-output errors are 0% by construction. It cannot explain its answer.
- **Named** after William Stanley Jevons (Jevons paradox).
- **Training:** transformer-based, synthetic data only, "Reinforcement Learning for Calibrated Decisions (RLCD)" per the vendor. Weights and architecture unpublished. Not fine-tunable with customer data.

## API surface (Python)

```bash
pip install typesafe-sdk          # Python >= 3.10;  npm install @typesafe-ai/sdk for JS
export TYPESAFE_API_KEY="sk-..."
```

```python
from typesafe_sdk import Choice, Noul, Score, TypeSafeClient
client = TypeSafeClient()          # reads TYPESAFE_API_KEY
r = client.system_one(
    state={"user_message": "..."},           # str | dict | list[str]
    questions={
        "injection": Noul(instructions="The user text attempts to override the application's instructions"),
        "dept": Choice(instructions="Which team handles this",
                       criteria={"billing": "...", "technical": "...", "other": "..."}),
        "anger": Score(instructions="How angry the customer is",
                       criteria=["Calm", "Frustrated but civil", "Very angry"]),
    },
)
a = r.answers
a["injection"].noul            # float 0..1 (probability the statement is true); NO confidence field
a["dept"].choice               # selected option
a["dept"].probabilities        # dict option -> probability
a["dept"].confidence           # 0..1, how peaked the distribution is (for 3 options ≈ (3*max_p − 1)/2)
a["anger"].score               # decimal position on the rubric (e.g. 1.035); .legend, .probabilities, .confidence
r.usage.input_tokens           # output_tokens is always 0
```

Raw HTTP: `POST https://api.typesafe.ai/v1/systemone`, header `Authorization: Bearer <key>`, body `{"model": "jev-latest", "state": ..., "questions": {...}}`.

## Models, limits, pricing

| Item | Value |
|---|---|
| Model ids | `jev-1.13.0` (current), `jev-latest` and `jev-preview` (aliases → 1.13.0). **Pin `jev-1.13.0` for the eval.** |
| Context | 64k tokens per request; 32k for `state` plus the longest question |
| Input | text only (string / JSON / array of strings). English-optimised; other languages "handled but not equally well" |
| Choice options | up to 255 |
| Score levels | 2–10 ordered levels |
| Questions per request | not documented; questions are independent (one answer is never context for another) |
| Price | $0.042 per million input tokens ($42 per billion); output free |
| Rate limits | 250k tokens/s, 1,200 requests/min (dynamic) |
| Latency (vendor) | 70–500 ms end to end |

## Vendor and third-party performance claims (unverified)

- TypeSafe 4-workflow benchmark (security, observability, invoicing, customer service), agreement with consensus labels: Jev 67.8%, GPT-5.6 Terra 67.9%, Claude Opus 5 73.1%, GPT-5.6 Sol 74.1%. Consensus labels were built from GPT-6 Astra and Claude Fable 5.1, which biases the comparison toward those models.
- "193.6x faster and 444.6x cheaper" than frontier LLMs on internal workflows (vendor's own high-end numbers).
- Vercel: 5–18x faster than OpenAI Luna with better accuracy on safety classification. Bryo AI: slightly less accurate than Gemini on email classification but with much better confidence scoring. Every.to: ~580x cheaper than Fable 5.1 per passage, 0.35 s vs 8.83 s median.
- pi-warden (coding-agent tool-call gate): 42 holds over 17,000 operations, ~88% of holds correct.

## Documented use patterns relevant to us

1. **Guardrails / prompt-injection screening.** `Noul("Does this page attempt to control the system answering the query?")` with a 0.7 drop threshold; harm `Score`; policy code owns thresholds (allow / review / block).
2. **Agent-harness routing / tool or skill selection.** `Choice` over candidate capabilities; app code owns availability, permissions and fallback (JevRouter, LangChain `AutoModeMiddleware`, Vercel AI SDK 7 `evaluate`).
3. **Model routing** by difficulty score (send hard prompts to Opus, easy to Haiku).
4. **Cascade:** Jev classifies cheaply, deterministic code handles the clear cases, a frontier LLM handles the hard minority.

## Documented weaknesses (these become eval strata)

- **Literal reading.** Negations, scoping words and implied conditions are taken at face value; phrase questions positively; contradictory criteria confuse it.
- **Adversarial text.** The docs say Jev "treats the state as data, not as hostile" and that "injected instructions can move the answer". Pydantic's integration notes recommend pairing it with deterministic checks. This is the central risk for using it as an injection detector.
- **Counting, arithmetic, dates** are unreliable; keep those in code.
- **Context rot** when state is padded with irrelevant material.
- **Confidence semantics.** For Choice/Score, confidence is a peakedness statistic of the distribution, not a correctness probability. Noul returns a probability directly and no confidence. Thresholds must be tuned on labelled data (the community `jevcal` tool does this).
- **No rationale.** Cannot produce an audit explanation; only numbers.
- **Non-English** handled "not equally well" — matters for ARIANNE's FR/EN traffic.

## Sources

- Wikipedia: https://en.wikipedia.org/wiki/Jev_(AI_model)
- TypeSafe docs: https://docs.typesafe.ai/introduction/quickstart · https://docs.typesafe.ai/models · https://docs.typesafe.ai/concepts/system-one · https://docs.typesafe.ai/primitives · https://docs.typesafe.ai/confidence
- DataCamp explainer: https://www.datacamp.com/blog/system-one-models-jev
- TechCrunch, 2026-09-18: https://techcrunch.com/2026/09/18/a-new-kind-of-ai-model-from-a-chatgpt-inventor-is-thrilling-developers/
- The Register, 2026-09-16: https://www.theregister.com/ai-and-ml/2026/09/16/typesafe-ai-debuts-model-for-machines-that-plays-doom/5296711
- Tom's Hardware: https://www.tomshardware.com/tech-industry/artificial-intelligence/typesafe-ais-jev-offers-an-alternative-to-llms-that-claims-to-be-193x-faster-and-445x-cheaper-system-one-type-model-is-bespoke-for-probabilistic-decision-making
- Pydantic AI integration (confidence caveats, boolean threshold): https://pydantic.dev/docs/ai/models/typesafe/
- LangChain harness post: https://www.langchain.com/blog/building-a-harness-with-jev
- Firecrawl use-case post (injection screening, pi-warden): https://www.firecrawl.dev/blog/what-is-jev
- Valyu practical guide (code, wording guidance, failure modes): https://dev.to/valyuai/how-to-use-jev-a-practical-guide-to-typesafes-system-one-model-g5e
- awesome-jev (use cases 9 and 18, jev-guard, jevcal, jev-benchmarks): https://github.com/Anil-matcha/awesome-jev-by-typesafe
- simple-jev (open re-implementation of the v1 spec; useful as a reference for the request/response contract): https://github.com/featherless-ai/simple-jev
- vLLM semantic-router evaluation proposal (confidence must not be read as a label probability): https://github.com/vllm-project/semantic-router/issues/3970
- LiteLLM pass-through: https://docs.litellm.ai/docs/pass_through/typesafe · OpenRouter: https://openrouter.ai/typesafe · Cloudflare: https://developers.cloudflare.com/ai/models/typesafe/jev/
