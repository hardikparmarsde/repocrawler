import { db } from "@/db";
import { evalQueries, evalRuns } from "@/db/schema";
import { desc } from "drizzle-orm";
import { LineChart, FlaskConical } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EvalsPage() {
  const queries = await db.select().from(evalQueries);
  const runs = await db
    .select()
    .from(evalRuns)
    .orderBy(desc(evalRuns.runAt))
    .limit(500);

  // Latest run per gold query
  const latestByQuery = new Map<string, (typeof runs)[number]>();
  for (const r of runs) {
    if (!latestByQuery.has(r.evalQueryId)) latestByQuery.set(r.evalQueryId, r);
  }

  const latestRuns = Array.from(latestByQuery.values());
  const avgPrecision = avg(latestRuns, (r) => r.precisionAt3) / 100;
  const avgRecall = avg(latestRuns, (r) => r.recallAt10) / 100;
  const avgCost = avg(latestRuns, (r) => r.costCents) / 100;

  // Experiments grouped by prompt version
  const versions = Array.from(new Set(runs.map((r) => r.promptVersion))).sort();
  const experiments = versions.map((v) => {
    const vRuns = runs.filter((r) => r.promptVersion === v);
    return {
      version: v,
      runs: vRuns.length,
      avgP: avg(vRuns, (r) => r.precisionAt3) / 100,
      avgR: avg(vRuns, (r) => r.recallAt10) / 100,
      avgCost: avg(vRuns, (r) => r.costCents) / 100,
      avgLatency: avg(vRuns, (r) => r.latencyMs) / 1000,
    };
  });

  return (
    <div className="max-w-5xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
        <LineChart className="w-6 h-6" /> Evaluation Dashboard
      </h1>
      <p className="text-sm text-zinc-500 mb-8">
        Nightly runs against the gold set. Precision@3, recall@10, cost per query.
      </p>

      {queries.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-xl p-12 text-center">
          <p className="text-sm text-zinc-400 mb-2">No gold-set queries yet.</p>
          <p className="text-xs text-zinc-500">
            Seed via <code className="mono bg-zinc-800 px-1 py-0.5 rounded">npm run eval:seed</code>, then run{" "}
            <code className="mono bg-zinc-800 px-1 py-0.5 rounded">npm run eval:run</code>.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-8">
            <StatCard label="Avg Precision@3" value={`${avgPrecision.toFixed(1)}%`} />
            <StatCard label="Avg Recall@10" value={`${avgRecall.toFixed(1)}%`} />
            <StatCard label="Avg Cost / Query" value={`$${avgCost.toFixed(4)}`} />
          </div>

          <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-8">
            <div className="px-5 py-3 border-b border-zinc-800">
              <h2 className="font-semibold text-sm">
                Latest run per gold query ({queries.length})
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="text-left px-5 py-2 font-medium">Query</th>
                  <th className="text-left px-5 py-2 font-medium">Repo</th>
                  <th className="text-right px-5 py-2 font-medium">P@3</th>
                  <th className="text-right px-5 py-2 font-medium">R@10</th>
                  <th className="text-right px-5 py-2 font-medium">Cost</th>
                  <th className="text-right px-5 py-2 font-medium">Latency</th>
                  <th className="text-right px-5 py-2 font-medium">Version</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {queries.map((q) => {
                  const r = latestByQuery.get(q.id);
                  return (
                    <tr key={q.id} className="hover:bg-zinc-800/50">
                      <td className="px-5 py-3">{q.label}</td>
                      <td className="px-5 py-3 mono text-xs text-zinc-400">
                        {q.owner}/{q.repo}
                      </td>
                      <td className="text-right mono text-xs">
                        {r ? `${(r.precisionAt3 / 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="text-right mono text-xs">
                        {r ? `${(r.recallAt10 / 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="text-right mono text-xs">
                        {r ? `$${(r.costCents / 100).toFixed(4)}` : "—"}
                      </td>
                      <td className="text-right mono text-xs">
                        {r ? `${(r.latencyMs / 1000).toFixed(1)}s` : "—"}
                      </td>
                      <td className="text-right mono text-xs text-zinc-500">
                        {r?.promptVersion ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {experiments.length >= 1 && (
            <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-zinc-800 flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-zinc-400" />
                <h2 className="font-semibold text-sm">
                  Experiments — grouped by prompt version
                </h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="text-left px-5 py-2 font-medium">Version</th>
                    <th className="text-right px-5 py-2 font-medium">Runs</th>
                    <th className="text-right px-5 py-2 font-medium">Avg P@3</th>
                    <th className="text-right px-5 py-2 font-medium">Avg R@10</th>
                    <th className="text-right px-5 py-2 font-medium">Avg Cost</th>
                    <th className="text-right px-5 py-2 font-medium">Avg Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {experiments.map((e, i) => {
                    const prev = i > 0 ? experiments[i - 1] : null;
                    const dP = prev ? e.avgP - prev.avgP : null;
                    const dR = prev ? e.avgR - prev.avgR : null;
                    return (
                      <tr key={e.version} className="hover:bg-zinc-800/50">
                        <td className="px-5 py-3 mono text-xs">{e.version}</td>
                        <td className="text-right mono text-xs">{e.runs}</td>
                        <td className="text-right mono text-xs">
                          {e.avgP.toFixed(1)}%
                          {dP !== null && (
                            <Delta v={dP} suffix="%" />
                          )}
                        </td>
                        <td className="text-right mono text-xs">
                          {e.avgR.toFixed(1)}%
                          {dR !== null && (
                            <Delta v={dR} suffix="%" />
                          )}
                        </td>
                        <td className="text-right mono text-xs">
                          ${e.avgCost.toFixed(4)}
                        </td>
                        <td className="text-right mono text-xs">
                          {e.avgLatency.toFixed(1)}s
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function avg<T>(arr: T[], f: (t: T) => number): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, x) => s + f(x), 0) / arr.length;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
      <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">
        {label}
      </div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}

function Delta({ v, suffix }: { v: number; suffix: string }) {
  if (Math.abs(v) < 0.05) return null;
  const positive = v >= 0;
  return (
    <span
      className={`ml-1 text-[10px] ${positive ? "text-emerald-400" : "text-red-400"}`}
    >
      {positive ? "▲" : "▼"}
      {Math.abs(v).toFixed(1)}
      {suffix}
    </span>
  );
}
