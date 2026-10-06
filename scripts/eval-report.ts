#!/usr/bin/env tsx
/**
 * Generate docs/EVAL_REPORT.md from the latest eval runs.
 * Groups by prompt version so you can see deltas across experiments.
 *
 * Usage: npm run eval:report
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { db } from "../db";
import { evalQueries, evalRuns } from "../db/schema";
import { desc } from "drizzle-orm";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const queries = await db.select().from(evalQueries);
  const runs = await db.select().from(evalRuns).orderBy(desc(evalRuns.runAt));

  // Latest run per (query, prompt_version)
  const latestByQueryVersion = new Map<string, (typeof runs)[number]>();
  for (const r of runs) {
    const key = `${r.evalQueryId}::${r.promptVersion}`;
    if (!latestByQueryVersion.has(key)) latestByQueryVersion.set(key, r);
  }

  // Group by prompt version
  const versions = Array.from(new Set(runs.map((r) => r.promptVersion)));
  versions.sort();

  const lines: string[] = [];
  lines.push(`# RepoCrawler Eval Report`);
  lines.push(``);
  lines.push(`_Generated ${new Date().toISOString()}._`);
  lines.push(``);
  lines.push(`**Gold queries:** ${queries.length}`);
  lines.push(`**Total runs:** ${runs.length}`);
  lines.push(`**Prompt versions tested:** ${versions.length}`);
  lines.push(``);

  lines.push(`## Headline metrics per prompt version`);
  lines.push(``);
  lines.push(`| Version | Avg P@3 | Avg R@10 | Avg Cost | Avg Latency | Runs |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const v of versions) {
    const vRuns = runs.filter((r) => r.promptVersion === v);
    const n = vRuns.length;
    if (n === 0) continue;
    const avgP = vRuns.reduce((s, r) => s + r.precisionAt3, 0) / n / 100;
    const avgR = vRuns.reduce((s, r) => s + r.recallAt10, 0) / n / 100;
    const avgC = vRuns.reduce((s, r) => s + r.costCents, 0) / n / 100;
    const avgL = vRuns.reduce((s, r) => s + r.latencyMs, 0) / n / 1000;
    lines.push(
      `| \`${v}\` | ${avgP.toFixed(1)}% | ${avgR.toFixed(1)}% | $${avgC.toFixed(4)} | ${avgL.toFixed(1)}s | ${n} |`,
    );
  }
  lines.push(``);

  lines.push(`## Latest run per gold query`);
  lines.push(``);
  lines.push(`| Query | Repo | P@3 | R@10 | Cost | Latency | Version |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  for (const q of queries) {
    // find the newest run across any version
    const r = runs.find((x) => x.evalQueryId === q.id);
    if (!r) {
      lines.push(`| ${q.label} | \`${q.owner}/${q.repo}\` | — | — | — | — | — |`);
      continue;
    }
    lines.push(
      `| ${q.label} | \`${q.owner}/${q.repo}\` | ${(r.precisionAt3 / 100).toFixed(0)}% | ${(r.recallAt10 / 100).toFixed(0)}% | $${(r.costCents / 100).toFixed(4)} | ${(r.latencyMs / 1000).toFixed(1)}s | \`${r.promptVersion}\` |`,
    );
  }
  lines.push(``);

  if (versions.length >= 2) {
    lines.push(`## Version-over-version deltas`);
    lines.push(``);
    const [latest, prev] = versions.slice(-2).reverse();
    const latestRuns = runs.filter((r) => r.promptVersion === latest);
    const prevRuns = runs.filter((r) => r.promptVersion === prev);
    if (latestRuns.length && prevRuns.length) {
      const avg = (arr: typeof runs, k: "precisionAt3" | "recallAt10" | "costCents") =>
        arr.reduce((s, r) => s + r[k], 0) / arr.length;
      const dP = (avg(latestRuns, "precisionAt3") - avg(prevRuns, "precisionAt3")) / 100;
      const dR = (avg(latestRuns, "recallAt10") - avg(prevRuns, "recallAt10")) / 100;
      const dC = (avg(latestRuns, "costCents") - avg(prevRuns, "costCents")) / 100;
      lines.push(`Comparing \`${latest}\` vs \`${prev}\`:`);
      lines.push(``);
      lines.push(`- **P@3:** ${dP >= 0 ? "+" : ""}${dP.toFixed(2)}%`);
      lines.push(`- **R@10:** ${dR >= 0 ? "+" : ""}${dR.toFixed(2)}%`);
      lines.push(`- **Cost:** ${dC >= 0 ? "+" : ""}$${dC.toFixed(4)}`);
      lines.push(``);
    }
  }

  const outDir = join(process.cwd(), "docs");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "EVAL_REPORT.md");
  writeFileSync(outPath, lines.join("\n"));
  console.log(`✓ Wrote ${outPath} (${lines.length} lines)`);
}

main().then(() => process.exit(0));
