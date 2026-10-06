import { auth } from "@/auth";
import { db } from "@/db";
import { repoAnalyses } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, ExternalLink, Star, GitFork, Users } from "lucide-react";
import type { FinalAnalysis } from "@/lib/analysis/types";

export const dynamic = "force-dynamic";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  const session = await auth();
  const userId = session!.user!.id!;

  const [analysis] = await db
    .select()
    .from(repoAnalyses)
    .where(
      and(
        eq(repoAnalyses.userId, userId),
        eq(repoAnalyses.owner, owner),
        eq(repoAnalyses.repo, repo),
      ),
    )
    .limit(1);

  if (!analysis) notFound();

  const inProgress =
    analysis.status === "pending" || analysis.status === "analyzing";

  return (
    <div className="max-w-5xl mx-auto p-8">
      {/* Auto-refresh while pending/analyzing */}
      {inProgress && (
        <meta
          httpEquiv="refresh"
          content="4"
          suppressHydrationWarning
        />
      )}

      <Link
        href="/analyze"
        className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to analyze
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mono">
            {owner}/{repo}
          </h1>
          <a
            href={`https://github.com/${owner}/${repo}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-emerald-400 hover:underline inline-flex items-center gap-1"
          >
            View on GitHub <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <span
          className={`text-xs px-3 py-1 rounded ${
            analysis.status === "complete"
              ? "bg-emerald-900/50 text-emerald-400"
              : analysis.status === "analyzing"
                ? "bg-amber-900/50 text-amber-400"
                : analysis.status === "failed"
                  ? "bg-red-900/50 text-red-400"
                  : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {analysis.status}
        </span>
      </div>

      {inProgress && (
        <div className="border border-zinc-800 rounded-xl p-12 text-center">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-4" />
          <h2 className="font-medium mb-2">
            {analysis.status === "pending"
              ? "Analysis queued"
              : "Analyzing — fetching data from GitHub, scoring issues with Claude, synthesizing results"}
          </h2>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">
            This takes ~45 seconds for small repos, up to 2 minutes for large ones.
            Page auto-refreshes every 4 seconds.
          </p>
        </div>
      )}

      {analysis.status === "failed" ? (
        <div className="border border-red-900/50 rounded-xl p-6 bg-red-950/20">
          <div className="text-sm text-red-400 font-medium mb-1">
            Analysis failed
          </div>
          <p className="text-sm text-zinc-400">
            {analysis.errorMessage ?? "Unknown error."}
          </p>
        </div>
      ) : null}

      {analysis.status === "complete" && analysis.rawResult != null ? (
        <AnalysisDashboard result={analysis.rawResult as FinalAnalysis} />
      ) : null}
    </div>
  );
}

function AnalysisDashboard({ result }: { result: FinalAnalysis }) {
  const { raw, synthesis, matched } = result;
  const myPickMatched =
    synthesis.myPick &&
    matched.find((m) => m.issue.number === synthesis.myPick!.issueNumber);

  return (
    <div className="space-y-6">
      {/* Repo header stats */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-sm text-zinc-400 mb-3">
          {raw.meta.description ?? "No description provided."}
        </p>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1">
            <Star className="w-3 h-3" />
            {raw.meta.stars.toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1">
            <GitFork className="w-3 h-3" />
            {raw.meta.forks.toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3" />
            {raw.maintainers.length} active maintainers
          </span>
          <span>· {raw.meta.openIssues.toLocaleString()} open issues</span>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden mt-4 bg-zinc-800">
          {raw.languages.slice(0, 5).map((l, i) => (
            <div
              key={l.name}
              className={[
                "bg-blue-500",
                "bg-yellow-400",
                "bg-pink-500",
                "bg-purple-500",
                "bg-zinc-600",
              ][i]}
              style={{ width: `${l.percent}%` }}
              title={`${l.name} ${l.percent}%`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-2 text-zinc-500">
          {raw.languages.slice(0, 5).map((l) => (
            <span key={l.name}>
              {l.name} {l.percent}%
            </span>
          ))}
        </div>
      </div>

      {/* AI Summary */}
      <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-xl p-5">
        <div className="text-xs text-emerald-400 font-medium mb-2">
          AI SUMMARY · tailored to your profile
        </div>
        <p className="text-sm leading-relaxed">{synthesis.summary}</p>
        <div className="text-xs text-zinc-500 mt-3 pt-3 border-t border-emerald-900/40 mono">
          cost: ${(synthesis.totalCostCents / 100).toFixed(4)} · tokens in:{" "}
          {synthesis.totalTokensIn.toLocaleString()} · out:{" "}
          {synthesis.totalTokensOut.toLocaleString()}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Matched Issues */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800">
              <h2 className="font-semibold">🎯 Matched Issues</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Ranked by skill match × approachability
              </p>
            </div>
            <div className="divide-y divide-zinc-800">
              {matched.slice(0, 8).map((m) => (
                <a
                  key={m.issue.number}
                  href={m.issue.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block p-5 hover:bg-zinc-800/30"
                >
                  <div className="flex items-start justify-between mb-2 gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs mono text-zinc-500 mr-2">
                        #{m.issue.number}
                      </span>
                      <span className="font-medium text-sm">{m.issue.title}</span>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                        m.score.difficulty <= 2
                          ? "bg-emerald-900/50 text-emerald-400"
                          : m.score.difficulty === 3
                            ? "bg-amber-900/50 text-amber-400"
                            : "bg-red-900/50 text-red-400"
                      }`}
                    >
                      {m.score.difficulty <= 2
                        ? "easy"
                        : m.score.difficulty === 3
                          ? "medium"
                          : "hard"}{" "}
                      · {m.score.estimatedHours}h
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {m.score.skillTags.slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-violet-900/50 text-violet-300"
                      >
                        {t}
                      </span>
                    ))}
                    <span className="text-xs text-zinc-500 ml-auto">
                      match {Math.round(m.matchScore * 100)}% · 💬{" "}
                      {m.issue.commentsCount}
                    </span>
                  </div>
                </a>
              ))}
              {matched.length === 0 && (
                <div className="p-8 text-sm text-center text-zinc-500">
                  No matched issues found — this repo may not have beginner-friendly labels.
                </div>
              )}
            </div>
          </section>

          {/* Codebase Map */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="font-semibold mb-1">🗺️ Codebase Map</h2>
            <p className="text-xs text-zinc-500 mb-4">AI-generated. Difficulty labels help you pick where to start.</p>
            <div className="space-y-1 text-sm">
              {synthesis.codebaseMap.map((e) => (
                <div key={e.path} className="flex items-start gap-3 p-2 rounded hover:bg-zinc-800/50">
                  <div className="mono text-xs text-emerald-400 w-40 shrink-0 pt-0.5">
                    {e.path}
                  </div>
                  <div className="flex-1 text-xs text-zinc-400">{e.purpose}</div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                      e.difficulty === "beginner"
                        ? "bg-emerald-900/50 text-emerald-300"
                        : e.difficulty === "intermediate"
                          ? "bg-amber-900/50 text-amber-300"
                          : "bg-red-900/50 text-red-300"
                    }`}
                  >
                    {e.difficulty}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          {/* Maintainers */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="font-semibold mb-1">👥 Active Maintainers</h2>
            <p className="text-xs text-zinc-500 mb-4">Last 30 days</p>
            <div className="space-y-2">
              {raw.maintainers.slice(0, 6).map((m) => (
                <a
                  key={m.login}
                  href={`https://github.com/${m.login}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 hover:bg-zinc-800/50 p-1 rounded"
                >
                  {m.avatarUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.avatarUrl}
                      alt=""
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{m.login}</div>
                    <div className="text-xs text-zinc-500">
                      {m.reviewsLast30d} merged PRs
                    </div>
                  </div>
                </a>
              ))}
              {raw.maintainers.length === 0 && (
                <div className="text-xs text-zinc-500">No recent activity detected.</div>
              )}
            </div>
          </section>

          {/* Conventions */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="font-semibold mb-1">📏 Conventions</h2>
            <div className="space-y-3 text-xs mt-3">
              <ConventionRow label="PR title format" value={synthesis.conventions.prTitleFormat} />
              <ConventionRow label="Commits" value={synthesis.conventions.commitStyle} />
              <ConventionRow label="Tests" value={synthesis.conventions.testsRequired} />
              <ConventionRow
                label="Avg merge time"
                value={`docs ${synthesis.conventions.avgMergeTime?.docs} · bugfix ${synthesis.conventions.avgMergeTime?.bugfix} · feature ${synthesis.conventions.avgMergeTime?.feature}`}
              />
              <ConventionRow
                label="Local dev"
                value={synthesis.conventions.localDevCommand}
                mono
              />
            </div>
          </section>

          {/* My Pick */}
          {myPickMatched && (
            <section className="bg-emerald-950/30 border border-emerald-900/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">✨</span>
                <h2 className="font-semibold">My Pick for You</h2>
              </div>
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 mt-2">
                <div className="text-xs mono text-zinc-500 mb-1">
                  #{myPickMatched.issue.number}
                </div>
                <div className="text-sm font-medium mb-2">
                  {myPickMatched.issue.title}
                </div>
                <div className="text-xs text-zinc-500 mb-3">
                  {synthesis.myPick?.justification}
                </div>
                <a
                  href={myPickMatched.issue.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm py-2 rounded-md font-medium text-center"
                >
                  Open issue on GitHub ↗
                </a>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function ConventionRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="font-semibold text-zinc-400 mb-1">{label}</div>
      <div
        className={`text-zinc-300 ${mono ? "mono bg-zinc-800 px-2 py-1 rounded" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
