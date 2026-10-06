import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

let _client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY not set — add it to .env.local to enable AI synthesis.",
    );
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// Cheapest config — Haiku for both. Switch synthesizer to Sonnet when
// you want higher-quality summaries (costs ~3-5x more per analysis).
export const MODELS = {
  scorer: "claude-haiku-4-5-20251001",
  synthesizer: "claude-haiku-4-5-20251001",
} as const;

// Approximate pricing per 1M tokens (USD) — update as Anthropic prices change.
// Numbers are illustrative; used for cost reporting, not billing.
export const PRICING = {
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0, cacheRead: 0.1 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0, cacheRead: 0.3 },
} as const;

export function estimateCostCents(
  model: keyof typeof PRICING,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
  },
): number {
  const p = PRICING[model];
  const input = (usage.input_tokens / 1_000_000) * p.input;
  const output = (usage.output_tokens / 1_000_000) * p.output;
  const cache = ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * p.cacheRead;
  return Math.ceil((input + output + cache) * 100);
}
