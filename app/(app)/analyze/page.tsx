import { auth } from "@/auth";
import { db } from "@/db";
import { repoAnalyses } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { after } from "next/server";
import Link from "next/link";
import { Search, Clock } from "lucide-react";
import { parseRepoUrl } from "@/lib/github";
import { runAnalysis } from "@/lib/analysis/run";

async function startAnalysis(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const parsed = parseRepoUrl(String(formData.get("repoUrl") ?? ""));
  if (!parsed) throw new Error("Invalid GitHub repo URL");

  const [row] = await db
    .insert(repoAnalyses)
    .values({
      userId: session.user.id,
      owner: parsed.owner,
      repo: parsed.repo,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: [repoAnalyses.userId, repoAnalyses.owner, repoAnalyses.repo],
      set: { status: "pending", errorMessage: null },
    })
    .returning({ id: repoAnalyses.id });

  // Fire-and-forget: analysis runs AFTER the redirect response is streamed.
  // Note: on serverless, enforces the function's execution-timeout cap.
  // For heavy repos, migrate to BullMQ in Phase 5.
  after(async () => {
    try {
      await runAnalysis(row.id);
    } catch (err) {
      console.error("Analysis failed", row.id, err);
    }
  });

  redirect(`/analyze/${parsed.owner}/${parsed.repo}`);
}

export default async function AnalyzePage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const recent = await db
    .select()
    .from(repoAnalyses)
    .where(eq(repoAnalyses.userId, userId))
    .orderBy(desc(repoAnalyses.createdAt))
    .limit(10);

  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="text-center mb-10 pt-8">
        <h1 className="text-3xl font-bold mb-3">Analyze a repository</h1>
        <p className="text-zinc-400">
          Paste any public GitHub repo URL. Get a contributor onboarding path in under a minute.
        </p>
      </div>

      <form action={startAnalysis} className="mb-10">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2 flex items-center gap-2">
          <Search className="w-5 h-5 text-zinc-500 ml-3" />
          <input
            name="repoUrl"
            type="text"
            placeholder="github.com/vercel/next.js"
            required
            className="flex-1 bg-transparent outline-none text-sm py-2.5"
          />
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium"
          >
            Analyze →
          </button>
        </div>
        <p className="text-xs text-zinc-600 mt-3 text-center">
          Try: <code className="mono text-zinc-500">facebook/react</code> ·{" "}
          <code className="mono text-zinc-500">microsoft/vscode</code> ·{" "}
          <code className="mono text-zinc-500">supabase/supabase</code>
        </p>
      </form>

      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Recent analyses
        </h2>
        {recent.length === 0 ? (
          <div className="border border-dashed border-zinc-800 rounded-lg p-8 text-center text-sm text-zinc-500">
            Your analysis history will show up here.
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((a) => (
              <Link
                key={a.id}
                href={`/analyze/${a.owner}/${a.repo}`}
                className="block bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700"
              >
                <div className="flex items-center justify-between">
                  <div className="font-mono text-sm">
                    {a.owner}/{a.repo}
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      a.status === "complete"
                        ? "bg-emerald-900/50 text-emerald-400"
                        : a.status === "analyzing"
                          ? "bg-amber-900/50 text-amber-400"
                          : a.status === "failed"
                            ? "bg-red-900/50 text-red-400"
                            : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {a.status}
                  </span>
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  {new Date(a.createdAt).toLocaleString()}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
