import Link from "next/link";
import { auth } from "@/auth";

export default async function LandingPage() {
  const session = await auth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center font-bold">
              R
            </div>
            <span className="font-semibold text-lg">RepoCrawler</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="https://github.com"
              className="text-zinc-400 hover:text-white"
            >
              GitHub
            </Link>
            {session?.user ? (
              <Link
                href="/analyze"
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-md font-medium"
              >
                Analyze a repo
              </Link>
            ) : (
              <Link
                href="/signin"
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-md font-medium"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-400 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Open source · Self-hostable
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
            Contribute to any
            <br />
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              open-source project
            </span>
            <br />
            in 10 minutes, not 3 weeks
          </h1>
          <p className="text-lg text-zinc-400 mb-10 max-w-2xl mx-auto">
            Paste any GitHub repo. Our AI reads the codebase, open issues, and
            maintainer activity to generate a personalized contributor onboarding
            path matched to your skills.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href={session?.user ? "/analyze" : "/signin"}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-md font-medium"
            >
              {session?.user ? "Analyze a repo →" : "Get started →"}
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-20 text-left">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
              <div className="text-2xl mb-2">🗺️</div>
              <h3 className="font-semibold text-sm mb-1">Codebase map</h3>
              <p className="text-xs text-zinc-500">
                AI-generated architecture overview — which module does what.
              </p>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
              <div className="text-2xl mb-2">🎯</div>
              <h3 className="font-semibold text-sm mb-1">Matched issues</h3>
              <p className="text-xs text-zinc-500">
                Open issues ranked by your skills + how approachable they are.
              </p>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
              <div className="text-2xl mb-2">👥</div>
              <h3 className="font-semibold text-sm mb-1">Who to ping</h3>
              <p className="text-xs text-zinc-500">
                Active reviewers for the module you&apos;ll touch.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-800">
        <div className="max-w-6xl mx-auto px-6 py-6 text-xs text-zinc-500 flex justify-between">
          <span>Built with Next.js, Claude, and the GitHub API.</span>
          <span className="mono">v0.1.0 · phase 1</span>
        </div>
      </footer>
    </div>
  );
}
