export type Hero = {
  decision: string | null;
  p: number | null;
  correct: boolean | null;
  status: string;
  output: Record<string, unknown> | null;
  output_text: string;
  output_tokens: number;
  thinking_tokens: number;
  duration_api_ms: number | null;
  thinking_ms_est: number | null;
  split_note: string;
};

export type System = {
  system: string;
  label: string;
  family: 'jev' | 'claude-think' | 'claude-nothink';
  pair: string;
  thinking: boolean;
  tier_rank: number | null;
  n: number;
  latency_ms: {p50: number | null; p95: number | null; min: number | null; max: number | null; sample: number[]};
  tokens: {output_median: number | null; thinking_median: number | null};
  cost_per_1000_usd: number | null;
  accuracy: {point: number; ci_low: number; ci_high: number; source?: string};
  hero: Hero | null;
  equivalent_tier_note: string | null;
};

export type VizData = {
  schema_version: number;
  meta: {
    task: string;
    task_label: string;
    split: string;
    filter: string;
    run_date: string;
    git_sha: string;
    machine: string;
    fixture: boolean;
    footnotes: string[];
    hero_case: {id: string | null; text: string | null; gold: string | null; question: string; source: string};
    verdict: {
      margin_pts: number;
      equivalent_tier: Record<string, string | null>;
      equivalent_tier_label: Record<string, string | null>;
      weakest_stratum: {key: string; group: string; vs: string; delta_pts: number; point: number} | null;
    };
  };
  systems: System[];
};

export type Layout = 'square' | 'wide';

export type FilmProps = {
  layout: Layout;
  data: VizData;
};
