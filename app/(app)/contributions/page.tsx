import { auth } from "@/auth";
import { db } from "@/db";
import { userContributions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { GitPullRequest } from "lucide-react";

export default async function ContributionsPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const contribs = await db
    .select()
    .from(userContributions)
    .where(eq(userContributions.userId, userId))
    .orderBy(desc(userContributions.openedAt));

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">My Contributions</h1>
      <p className="text-sm text-zinc-500 mb-8">
        Pull requests you&apos;ve opened across tracked repos.
      </p>

      {contribs.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-xl p-12 text-center">
          <GitPullRequest className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <h2 className="font-medium mb-2">No contributions tracked yet</h2>
          <p className="text-sm text-zinc-500 max-w-sm mx-auto">
            Open a PR after analyzing a repo and we&apos;ll track it here.
            PR status syncing lands in Phase 5.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-800 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {contribs.map((c) => (
            <a
              key={c.id}
              href={c.prUrl}
              target="_blank"
              rel="noreferrer"
              className="block p-4 hover:bg-zinc-800/30"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    c.status === "merged"
                      ? "bg-emerald-900/50 text-emerald-400"
                      : c.status === "closed"
                        ? "bg-red-900/50 text-red-400"
                        : c.status === "draft"
                          ? "bg-zinc-800 text-zinc-400"
                          : "bg-amber-900/50 text-amber-400"
                  }`}
                >
                  {c.status}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.title}</div>
                  <div className="text-xs text-zinc-500 mono mt-0.5">
                    {c.owner}/{c.repo} #{c.prNumber}
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
