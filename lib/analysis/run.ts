import { db } from "@/db";
import { repoAnalyses, userSkills, accounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { fetchAllRepoData } from "./fetch";
import { scoreIssue, synthesizeAll } from "./synthesize";
import { matchIssues } from "./match";
import type { FinalAnalysis, IssueScore, UserProfile } from "./types";
import { PROMPT_VERSION } from "./types";

export async function loadUserProfile(userId: string): Promise<UserProfile> {
  const rows = await db
    .select()
    .from(userSkills)
    .where(eq(userSkills.userId, userId));
  return {
    skills: rows.map((r) => ({
      skill: r.skill,
      level: Number(r.level) as 1 | 2 | 3 | 4 | 5,
      isLanguage: Boolean(r.isLanguage),
    })),
  };
}

export async function loadUserGithubToken(userId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ accessToken: accounts.access_token })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "github")))
    .limit(1);
  const token = row?.accessToken ?? undefined;
  if (process.env.NODE_ENV !== "production") {
    const preview = token ? `${token.slice(0, 7)}...${token.slice(-4)}` : "<none>";
    console.log(`[runAnalysis] GitHub token for user ${userId}: ${preview}`);
  }
  return token;
}

async function limitParallel<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function runAnalysis(analysisId: string): Promise<void> {
  const [row] = await db
    .select()
    .from(repoAnalyses)
    .where(eq(repoAnalyses.id, analysisId))
    .limit(1);
  if (!row) throw new Error(`Analysis ${analysisId} not found`);

  await db
    .update(repoAnalyses)
    .set({ status: "analyzing" })
    .where(eq(repoAnalyses.id, analysisId));

  try {
    const token = await loadUserGithubToken(row.userId);
    const profile = await loadUserProfile(row.userId);

    // Phase 2 — fetch all GitHub data in parallel.
    const raw = await fetchAllRepoData(row.owner, row.repo, token);

    // Phase 3 — score issues sequentially with a per-call delay to respect
    // Gemini free-tier rate limits (5 RPM for gemini-3.8-flash).
    // 13s between calls = ~4.5 RPM, safely under the limit with buffer for synthesis.
    const RATE_LIMIT_DELAY_MS = 13_000;
    const scored: Array<{
      score: IssueScore;
      costCents: number;
      tokensIn: number;
      tokensOut: number;
    }> = [];
    console.log(`[runAnalysis] ${row.owner}/${row.repo}: scoring ${raw.issues.length} issues sequentially...`);
    for (let i = 0; i < raw.issues.length; i++) {
      const issue = raw.issues[i];
      const t0 = Date.now();
      try {
        scored.push(await scoreIssue(raw, issue));
        console.log(`[runAnalysis]   ✓ scored #${issue.number} in ${Math.round((Date.now() - t0) / 1000)}s (${i + 1}/${raw.issues.length})`);
      } catch (e) {
        console.log(`[runAnalysis]   ✗ scored #${issue.number} failed: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
        scored.push({
          score: {
            issueNumber: issue.number,
            difficulty: 3 as const,
            estimatedHours: 2,
            skillTags: [],
            rationale: "scoring failed",
          },
          costCents: 0,
          tokensIn: 0,
          tokensOut: 0,
        });
      }
      // Delay before next scoring call (skip after the last one).
      if (i < raw.issues.length - 1) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
      }
    }
    // Buffer before the synthesis call to let the per-minute window reset.
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));

    const scores: IssueScore[] = scored.map((s) => s.score);
    const scorerTokensIn = scored.reduce((a, b) => a + b.tokensIn, 0);
    const scorerTokensOut = scored.reduce((a, b) => a + b.tokensOut, 0);
    const scorerCostCents = scored.reduce((a, b) => a + b.costCents, 0);

    // Phase 3 — synthesize summary / codebase map / conventions / My Pick.
    const synthesis = await synthesizeAll(raw, profile, scores);

    // Phase 4 — match + rank.
    const matched = matchIssues(raw.issues, scores, profile);

    const finalResult: FinalAnalysis = {
      raw,
      synthesis: {
        ...synthesis,
        totalCostCents: scorerCostCents + synthesis.totalCostCents,
        totalTokensIn: scorerTokensIn + synthesis.totalTokensIn,
        totalTokensOut: scorerTokensOut + synthesis.totalTokensOut,
      },
      matched,
      version: PROMPT_VERSION,
    };

    await db
      .update(repoAnalyses)
      .set({
        status: "complete",
        analyzedAt: new Date(),
        summary: synthesis.summary,
        rawResult: finalResult,
        tokensIn: finalResult.synthesis.totalTokensIn,
        tokensOut: finalResult.synthesis.totalTokensOut,
        costCents: finalResult.synthesis.totalCostCents,
      })
      .where(eq(repoAnalyses.id, analysisId));
  } catch (err) {
    await db
      .update(repoAnalyses)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      .where(eq(repoAnalyses.id, analysisId));
    throw err;
  }
}
