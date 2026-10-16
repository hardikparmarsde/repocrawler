import { GoogleGenAI, Type } from "@google/genai";
import { env } from "@/lib/env";

let _client: GoogleGenAI | null = null;

export function gemini(): GoogleGenAI {
  if (!env.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY not set.");
  }
  if (!_client) {
    _client = new GoogleGenAI({ apiKey: env.GOOGLE_API_KEY });
  }
  return _client;
}

// Model IDs — Google deprecates versions periodically. If you see
// NOT_FOUND errors, check https://ai.google.dev/gemini-api/docs/models for current IDs.
export const GEMINI_MODELS = {
  scorer: "gemini-3.8-flash",      // used for per-issue scoring (parallel)
  synthesizer: "gemini-3.8-flash", // used for final synthesis
} as const;

// Rough free-tier pricing (free = 0 cents; we track usage anyway).
export function geminiCostCents(): number {
  return 0;
}

// Retry wrapper for Gemini calls. Handles transient 429/503 by waiting
// with exponential backoff. Final attempt lets the error through.
// For 429 RESOURCE_EXHAUSTED we parse Google's retryDelay hint when present.
export async function geminiRetry<T>(
  fn: () => Promise<T>,
  attempts = 4,
  baseDelayMs = 2_000,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit =
        msg.includes("429") || /RESOURCE_EXHAUSTED/i.test(msg);
      const isUnavailable =
        msg.includes("503") || /UNAVAILABLE|high demand/i.test(msg);
      if (!isRateLimit && !isUnavailable) throw err;
      if (i === attempts - 1) throw err;

      // Prefer Google's suggested retryDelay if we can extract it.
      let delay: number;
      const retryHint = msg.match(/retryDelay"?\s*:\s*"?(\d+)s/i);
      if (isRateLimit && retryHint) {
        delay = (Number(retryHint[1]) + 2) * 1000;
      } else {
        delay = baseDelayMs * Math.pow(2, i) + Math.random() * 500;
      }
      console.log(
        `[geminiRetry] attempt ${i + 1}/${attempts} failed (${isRateLimit ? "429" : "503"}), waiting ${(delay / 1000).toFixed(1)}s...`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// Schema for issue scoring — Gemini supports structured output natively.
export const SCORE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    difficulty: { type: Type.INTEGER, minimum: 1, maximum: 5 },
    estimated_hours: { type: Type.NUMBER },
    skill_tags: { type: Type.ARRAY, items: { type: Type.STRING } },
    rationale: { type: Type.STRING },
  },
  required: ["difficulty", "estimated_hours", "skill_tags", "rationale"],
};

export const SYNTHESIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    codebase_map: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          path: { type: Type.STRING },
          purpose: { type: Type.STRING },
          difficulty: { type: Type.STRING, enum: ["beginner", "intermediate", "advanced"] },
        },
        required: ["path", "purpose", "difficulty"],
      },
    },
    conventions: {
      type: Type.OBJECT,
      properties: {
        pr_title_format: { type: Type.STRING },
        commit_style: { type: Type.STRING },
        tests_required: { type: Type.STRING },
        avg_merge_time: {
          type: Type.OBJECT,
          properties: {
            docs: { type: Type.STRING },
            bugfix: { type: Type.STRING },
            feature: { type: Type.STRING },
          },
          required: ["docs", "bugfix", "feature"],
        },
        local_dev_command: { type: Type.STRING },
      },
      required: ["pr_title_format", "commit_style", "tests_required", "avg_merge_time", "local_dev_command"],
    },
    my_pick_issue_number: { type: Type.INTEGER, nullable: true },
    my_pick_justification: { type: Type.STRING },
  },
  required: ["summary", "codebase_map", "conventions", "my_pick_justification"],
};
