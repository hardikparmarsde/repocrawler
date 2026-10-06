import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Search, GitPullRequest, UserCircle, LogOut, LineChart } from "lucide-react";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 border-r border-zinc-800 flex flex-col">
        <div className="px-5 py-4 border-b border-zinc-800">
          <Link href="/analyze" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center font-bold text-sm">
              R
            </div>
            <span className="font-semibold">RepoCrawler</span>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 text-sm">
          <Link
            href="/analyze"
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800/50 text-zinc-300"
          >
            <Search className="w-4 h-4" />
            Analyze
          </Link>
          <Link
            href="/contributions"
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800/50 text-zinc-300"
          >
            <GitPullRequest className="w-4 h-4" />
            My Contributions
          </Link>
          <Link
            href="/profile"
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800/50 text-zinc-300"
          >
            <UserCircle className="w-4 h-4" />
            Profile
          </Link>
          <Link
            href="/evals"
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800/50 text-zinc-300"
          >
            <LineChart className="w-4 h-4" />
            Evals
          </Link>
        </nav>

        <div className="p-3 border-t border-zinc-800">
          <div className="flex items-center gap-2 px-2 py-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center text-xs font-bold">
              {session.user.name?.[0] ?? session.user.email?.[0] ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{session.user.name ?? "User"}</div>
              <div className="text-xs text-zinc-500 truncate">{session.user.email}</div>
            </div>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
