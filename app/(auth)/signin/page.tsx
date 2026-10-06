import { signIn } from "@/auth";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2c-3.34.72-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.1-.75.08-.74.08-.74 1.21.08 1.84 1.24 1.84 1.24 1.08 1.84 2.82 1.31 3.51 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.97 0-1.32.47-2.4 1.24-3.24-.12-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.24.96-.27 1.98-.4 3-.4 1.02 0 2.04.14 3 .4 2.29-1.56 3.3-1.24 3.3-1.24.66 1.65.24 2.88.12 3.18.77.84 1.24 1.92 1.24 3.24 0 4.64-2.81 5.67-5.49 5.96.43.37.81 1.1.81 2.22v3.29c0 .32.21.69.82.57C20.56 22.3 24 17.8 24 12.5 24 5.87 18.63.5 12 .5z" />
    </svg>
  );
}

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center font-bold text-xl mx-auto mb-4">
            R
          </div>
          <h1 className="text-2xl font-bold">Sign in to RepoCrawler</h1>
          <p className="text-sm text-zinc-500 mt-2">
            Continue with GitHub — we use your profile to match issues to your skills.
          </p>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/analyze" });
          }}
        >
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white px-4 py-2.5 rounded-md font-medium"
          >
            <GithubIcon className="w-4 h-4" />
            Continue with GitHub
          </button>
        </form>
      </div>
    </div>
  );
}
