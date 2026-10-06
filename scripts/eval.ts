#!/usr/bin/env tsx
/**
 * Phase 4 eval runner.
 *
 * Usage:
 *   npm run eval:seed        # seed the gold set (idempotent)
 *   npm run eval:run         # run analysis for each query, write eval_runs
 *   npm run eval:report      # generate docs/EVAL_REPORT.md from latest runs
 *
 * Requires: GOOGLE_API_KEY (or ANTHROPIC_API_KEY) in .env.local
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { db } from "../db";
import { evalQueries, evalRuns } from "../db/schema";
import { fetchAllRepoData } from "../lib/analysis/fetch";
import { scoreIssue, synthesizeAll } from "../lib/analysis/synthesize";
import { matchIssues } from "../lib/analysis/match";
import { PROMPT_VERSION, type UserProfile } from "../lib/analysis/types";

const PROFILE_TS_REACT: UserProfile = {
  skills: [
    { skill: "TypeScript", level: 4, isLanguage: true },
    { skill: "JavaScript", level: 4, isLanguage: true },
    { skill: "React", level: 4, isLanguage: false },
    { skill: "Next.js", level: 4, isLanguage: false },
    { skill: "Node.js", level: 3, isLanguage: true },
  ],
};

const PROFILE_TS_BACKEND: UserProfile = {
  skills: [
    { skill: "TypeScript", level: 4, isLanguage: true },
    { skill: "Node.js", level: 3, isLanguage: true },
    { skill: "PostgreSQL", level: 3, isLanguage: false },
    { skill: "SQL", level: 3, isLanguage: false },
  ],
};

const PROFILE_PYTHON: UserProfile = {
  skills: [
    { skill: "Python", level: 4, isLanguage: true },
    { skill: "FastAPI", level: 3, isLanguage: false },
    { skill: "pytest", level: 3, isLanguage: false },
  ],
};

/**
 * Gold set — (repo, profile) pairs where we expect sensible matches.
 * `expectedIssues` populated manually by inspecting repos. Empty = run in
 * "label-alignment" mode (checks top-3 all have good-first-issue label).
 */
const GOLD_SET: Array<{
  label: string;
  owner: string;
  repo: string;
  profile: UserProfile;
  expectedIssues: number[];
}> = [
  {
    label: "ts-react-mid · drizzle-orm",
    owner: "drizzle-team",
    repo: "drizzle-orm",
    profile: PROFILE_TS_BACKEND,
    expectedIssues: [],
  },
  {
    label: "ts-react-mid · tanstack-query",
    owner: "TanStack",
    repo: "query",
    profile: PROFILE_TS_REACT,
    expectedIssues: [],
  },
  {
    label: "ts-react-mid · shadcn-ui",
    owner: "shadcn-ui",
    repo: "ui",
    profile: PROFILE_TS_REACT,
    expectedIssues: [],
  },
  {
    label: "ts-react-mid · zod",
    owner: "colinhacks",
    repo: "zod",
    profile: PROFILE_TS_BACKEND,
    expectedIssues: [],
  },
  {
    label: "ts-react-mid · trpc",
    owner: "trpc",
    repo: "trpc",
    profile: PROFILE_TS_REACT,
    expectedIssues: [],
  },
  {
    label: "ts-react-mid · remix",
    owner: "remix-run",
    repo: "remix",
    profile: PROFILE_TS_REACT,
    expectedIssues: [],
  },
  {
    label: "python-mid · fastapi",
    owner: "fastapi",
    repo: "fastapi",
    profile: PROFILE_PYTHON,
    expectedIssues: [],
  },
  {
    label: "python-mid · httpx",
    owner: "encode",
    repo: "httpx",
    profile: PROFILE_PYTHON,
    expectedIssues: [],
  },
  {
    label: "ts-backend · prisma",
    owner: "prisma",
    repo: "prisma",
    profile: PROFILE_TS_BACKEND,
    expectedIssues: [],
  },
  {
    label: "ts-react-mid · nextjs-docs",
    owner: "vercel",
    repo: "next.js",
    profile: PROFILE_TS_REACT,
    expectedIssues: [],
  },
];

async function seed() {
  let inserted = 0;
  for (const g of GOLD_SET) {
    const result = await db
      .insert(evalQueries)
      .values({
        label: g.label,
        owner: g.owner,
        repo: g.repo,
        profileJson: g.profile,
        expectedIssues: g.expectedIssues,
      })
      .onConflictDoNothing();
    inserted += result.count;
  }
  console.log(`Seeded ${inserted}/${GOLD_SET.length} gold queries (rest already present).`);
}

async function runOnce() {
  const queries = await db.select().from(evalQueries);
  console.log(`Running eval on ${queries.length} gold queries...\n`);

  for (const q of queries) {
    console.log(`[eval] ${q.label} — ${q.owner}/${q.repo}`);
    const started = Date.now();
    try {
      const raw = await fetchAllRepoData(q.owner, q.repo, process.env.GITHUB_TOKEN);
      const scored = [];
      for (const issue of raw.issues) {
        try {
          scored.push(await scoreIssue(raw, issue));
        } catch (e) {
          console.warn(`  scoring issue #${issue.number} failed:`, e);
        }
      }
      const scores = scored.map((s) => s.score);
      const profile = q.profileJson as UserProfile;
      const synthesis = await synthesizeAll(raw, profile, scores);
      const matched = matchIssues(raw.issues, scores, profile);

      const top3 = matched.slice(0, 3).map((m) => m.issue.number);
      const top10 = matched.slice(0, 10).map((m) => m.issue.number);
      const expected = (q.expectedIssues as number[]) ?? [];

      let precisionAt3: number;
      let recallAt10: number;

      if (expected.length > 0) {
        // Expected-set mode
        precisionAt3 = top3.filter((n) => expected.includes(n)).length / 3;
        recallAt10 = top10.filter((n) => expected.includes(n)).length / expected.length;
      } else {
        // Label-alignment mode: fraction of top-3 that have good-first-issue or help-wanted labels
        const goodLabels = ["good first issue", "help wanted"];
        const labelled = matched.slice(0, 3).filter((m) =>
          m.issue.labels.some((l) => goodLabels.includes(l.toLowerCase())),
        ).length;
        precisionAt3 = labelled / Math.max(1, Math.min(3, matched.length));
        recallAt10 = Math.min(1, matched.length / 10);
      }

      const totalCost =
        scored.reduce((s, x) => s + x.costCents, 0) + synthesis.totalCostCents;

      await db.insert(evalRuns).values({
        evalQueryId: q.id,
        retrievedIssues: top10,
        precisionAt3: Math.round(precisionAt3 * 10000),
        recallAt10: Math.round(recallAt10 * 10000),
        latencyMs: Date.now() - started,
        costCents: totalCost,
        promptVersion: PROMPT_VERSION,
      });

      console.log(
        `  ✓ P@3=${(precisionAt3 * 100).toFixed(0)}% R@10=${(recallAt10 * 100).toFixed(0)}% cost=$${(totalCost / 100).toFixed(4)} latency=${((Date.now() - started) / 1000).toFixed(1)}s\n`,
      );
    } catch (err) {
      console.error(`  ✗ failed:`, err instanceof Error ? err.message : err, "\n");
    }
  }
}

const cmd = process.argv[2];
if (cmd === "seed") {
  seed().then(() => process.exit(0));
} else if (cmd === "run") {
  runOnce().then(() => process.exit(0));
} else {
  console.log("Usage: tsx scripts/eval.ts <seed|run>");
  process.exit(1);
}
