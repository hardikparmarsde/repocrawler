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

    // Phase 3 — score issues in parallel (concurrency 5 to be gentle on rate limits).
    const scored = await limitParallel(raw.issues, 5, async (issue) => {
      try {
        return await scoreIssue(raw, issue);
      } catch (e) {
        return {
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
        };
      }
    });

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
