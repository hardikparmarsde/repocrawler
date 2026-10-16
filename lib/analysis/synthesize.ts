import { env } from "@/lib/env";
import { anthropic, MODELS as ANTHROPIC_MODELS, estimateCostCents } from "@/lib/anthropic";
import { gemini, GEMINI_MODELS, geminiCostCents, geminiRetry, SCORE_SCHEMA, SYNTHESIS_SCHEMA } from "@/lib/gemini";
import type { RepoRawData, IssueLite } from "@/lib/github";
import { repoContextBlock, scoreIssuePrompt, synthesizePrompt } from "./prompts";
import type {
  IssueScore,
  SynthesisResult,
  UserProfile,
  CodebaseMapEntry,
  Conventions,
} from "./types";

function tryParseJson<T>(text: string, fallback: T): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return fallback;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return fallback;
  }
}

function useGemini(): boolean {
  // Prefer Gemini if its key is set (free tier). Fall back to Anthropic.
  return Boolean(env.GOOGLE_API_KEY);
}

// ─── Issue scoring ─────────────────────────────────────────────────────────

export async function scoreIssue(
  raw: RepoRawData,
  issue: IssueLite,
): Promise<{
  score: IssueScore;
  costCents: number;
  tokensIn: number;
  tokensOut: number;
}> {
  if (useGemini()) return scoreIssueGemini(raw, issue);
  return scoreIssueAnthropic(raw, issue);
}

async function scoreIssueAnthropic(raw: RepoRawData, issue: IssueLite) {
  const client = anthropic();
  const resp = await client.messages.create({
    model: ANTHROPIC_MODELS.scorer,
    max_tokens: 400,
    system: [
      {
        type: "text",
        text:
          "You are an expert OSS contributor evaluator. Score GitHub issues precisely by difficulty and required skills. Always return strict JSON.",
      },
      {
        type: "text",
        text: repoContextBlock(raw),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: scoreIssuePrompt(issue) }],
  });
  const text = resp.content[0]?.type === "text" ? resp.content[0].text : "";
  const parsed = tryParseJson(text, {
    difficulty: 3,
    estimated_hours: 2,
    skill_tags: [] as string[],
    rationale: "unknown",
  });
  return {
    score: toIssueScore(issue.number, parsed),
    costCents: estimateCostCents(ANTHROPIC_MODELS.scorer, resp.usage),
    tokensIn: resp.usage.input_tokens,
    tokensOut: resp.usage.output_tokens,
  };
}

async function scoreIssueGemini(raw: RepoRawData, issue: IssueLite) {
  const client = gemini();
  const resp = await geminiRetry(() =>
    client.models.generateContent({
      model: GEMINI_MODELS.scorer,
      contents: repoContextBlock(raw) + "\n\n" + scoreIssuePrompt(issue),
      config: {
        systemInstruction:
          "You are an expert OSS contributor evaluator. Score GitHub issues precisely by difficulty and required skills.",
        responseMimeType: "application/json",
        responseSchema: SCORE_SCHEMA,
        temperature: 0.2,
      },
    }),
  );
  const text = resp.text ?? "";
  const parsed = tryParseJson(text, {
    difficulty: 3,
    estimated_hours: 2,
    skill_tags: [] as string[],
    rationale: "unknown",
  });
  return {
    score: toIssueScore(issue.number, parsed),
    costCents: geminiCostCents(),
    tokensIn: resp.usageMetadata?.promptTokenCount ?? 0,
    tokensOut: resp.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

function toIssueScore(
  issueNumber: number,
  parsed: {
    difficulty: number;
    estimated_hours: number;
    skill_tags: string[];
    rationale: string;
  },
): IssueScore {
  return {
    issueNumber,
    difficulty: Math.max(1, Math.min(5, Math.round(parsed.difficulty))) as
      | 1 | 2 | 3 | 4 | 5,
    estimatedHours: Number(parsed.estimated_hours) || 2,
    skillTags: Array.isArray(parsed.skill_tags) ? parsed.skill_tags : [],
    rationale: String(parsed.rationale ?? "").slice(0, 240),
  };
}

// ─── Final synthesis ───────────────────────────────────────────────────────

export async function synthesizeAll(
  raw: RepoRawData,
  profile: UserProfile,
  scores: IssueScore[],
): Promise<SynthesisResult> {
  if (useGemini()) return synthesizeAllGemini(raw, profile, scores);
  return synthesizeAllAnthropic(raw, profile, scores);
}

// Normalize LLM snake_case keys → camelCase expected by the UI.
function normalizeConventions(raw: unknown): Conventions {
  const fallback: Conventions = {
    prTitleFormat: "unknown",
    commitStyle: "unknown",
    testsRequired: "unknown",
    avgMergeTime: { docs: "?", bugfix: "?", feature: "?" },
    localDevCommand: "see README",
  };
  if (!raw || typeof raw !== "object") return fallback;
  const c = raw as Record<string, unknown>;
  const amt = (c.avg_merge_time ?? c.avgMergeTime) as Record<string, unknown> | undefined;
  return {
    prTitleFormat: String(c.pr_title_format ?? c.prTitleFormat ?? fallback.prTitleFormat),
    commitStyle: String(c.commit_style ?? c.commitStyle ?? fallback.commitStyle),
    testsRequired: String(c.tests_required ?? c.testsRequired ?? fallback.testsRequired),
    avgMergeTime: {
      docs: String(amt?.docs ?? fallback.avgMergeTime.docs),
      bugfix: String(amt?.bugfix ?? fallback.avgMergeTime.bugfix),
      feature: String(amt?.feature ?? fallback.avgMergeTime.feature),
    },
    localDevCommand: String(c.local_dev_command ?? c.localDevCommand ?? fallback.localDevCommand),
  };
}

function toSynthesisResult(
  parsed: {
    summary?: string;
    codebase_map?: CodebaseMapEntry[];
    conventions?: unknown;
    my_pick_issue_number?: number | null;
    my_pick_justification?: string;
  },
  tokens: { input: number; output: number; cost: number },
): SynthesisResult {
  return {
    summary: String(parsed.summary ?? "Analysis incomplete."),
    codebaseMap: (parsed.codebase_map ?? []).slice(0, 10),
    conventions: normalizeConventions(parsed.conventions),
    myPick:
      parsed.my_pick_issue_number != null
        ? {
            issueNumber: parsed.my_pick_issue_number,
            justification: parsed.my_pick_justification ?? "",
          }
        : null,
    totalCostCents: tokens.cost,
    totalTokensIn: tokens.input,
    totalTokensOut: tokens.output,
  };
}

async function synthesizeAllAnthropic(
  raw: RepoRawData,
  profile: UserProfile,
  scores: IssueScore[],
): Promise<SynthesisResult> {
  const client = anthropic();
  const scoredContext = scores
    .map(
      (s) =>
        `  #${s.issueNumber} — difficulty ${s.difficulty}, ${s.estimatedHours}h, tags: ${s.skillTags.join(", ")}`,
    )
    .join("\n");

  const resp = await client.messages.create({
    model: ANTHROPIC_MODELS.synthesizer,
    max_tokens: 2000,
    system: [
      {
        type: "text",
        text:
          "You are a senior engineer helping a specific contributor get oriented in an open-source project. Be concrete, honest about difficulty, personalize to the user's profile. Always return strict JSON.",
      },
      {
        type: "text",
        text: repoContextBlock(raw),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content:
          synthesizePrompt(raw, profile) +
          `\n\n<scored_issues>\n${scoredContext}\n</scored_issues>`,
      },
    ],
  });

  const text = resp.content[0]?.type === "text" ? resp.content[0].text : "";
  const parsed = tryParseJson<Parameters<typeof toSynthesisResult>[0]>(text, {});
  return toSynthesisResult(parsed, {
    input: resp.usage.input_tokens,
    output: resp.usage.output_tokens,
    cost: estimateCostCents(ANTHROPIC_MODELS.synthesizer, resp.usage),
  });
}

async function synthesizeAllGemini(
  raw: RepoRawData,
  profile: UserProfile,
  scores: IssueScore[],
): Promise<SynthesisResult> {
  const client = gemini();
  const scoredContext = scores
    .map(
      (s) =>
        `  #${s.issueNumber} — difficulty ${s.difficulty}, ${s.estimatedHours}h, tags: ${s.skillTags.join(", ")}`,
    )
    .join("\n");

  const resp = await geminiRetry(() =>
    client.models.generateContent({
      model: GEMINI_MODELS.synthesizer,
      contents:
        repoContextBlock(raw) +
        "\n\n" +
        synthesizePrompt(raw, profile) +
        `\n\n<scored_issues>\n${scoredContext}\n</scored_issues>`,
      config: {
        systemInstruction:
          "You are a senior engineer helping a specific contributor get oriented in an open-source project. Be concrete, honest about difficulty, personalize to the user's profile.",
        responseMimeType: "application/json",
        responseSchema: SYNTHESIS_SCHEMA,
        temperature: 0.3,
      },
    }),
  );
  const text = resp.text ?? "";
  const parsed = tryParseJson<Parameters<typeof toSynthesisResult>[0]>(text, {});
  return toSynthesisResult(parsed, {
    input: resp.usageMetadata?.promptTokenCount ?? 0,
    output: resp.usageMetadata?.candidatesTokenCount ?? 0,
    cost: geminiCostCents(),
  });
}
