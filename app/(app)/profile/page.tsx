import { auth } from "@/auth";
import { db } from "@/db";
import { userSkills } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { X } from "lucide-react";

async function addSkill(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const skill = String(formData.get("skill") ?? "").trim();
  const level = String(formData.get("level") ?? "3") as "1" | "2" | "3" | "4" | "5";
  const isLanguage = formData.get("isLanguage") === "on" ? 1 : 0;
  if (!skill) return;

  await db
    .insert(userSkills)
    .values({ userId: session.user.id, skill, level, isLanguage })
    .onConflictDoUpdate({
      target: [userSkills.userId, userSkills.skill],
      set: { level, isLanguage, updatedAt: new Date() },
    });

  revalidatePath("/profile");
}

async function removeSkill(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const skill = String(formData.get("skill") ?? "");
  await db
    .delete(userSkills)
    .where(
      and(eq(userSkills.userId, session.user.id), eq(userSkills.skill, skill)),
    );

  revalidatePath("/profile");
}

export default async function ProfilePage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const skills = await db
    .select()
    .from(userSkills)
    .where(eq(userSkills.userId, userId));

  const languages = skills.filter((s) => s.isLanguage);
  const frameworks = skills.filter((s) => !s.isLanguage);

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Your skill profile</h1>
      <p className="text-sm text-zinc-500 mb-8">
        Used to rank issues by match score. The more accurate, the better the matches.
      </p>

      <form
        action={addSkill}
        className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6"
      >
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-medium text-zinc-400 mb-1 block">
              Skill
            </label>
            <input
              name="skill"
              type="text"
              placeholder="e.g. React, Python, Rust"
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1 block">
              Level (1–5)
            </label>
            <select
              name="level"
              defaultValue="3"
              className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm"
            >
              <option value="1">1 — Just started</option>
              <option value="2">2 — Beginner</option>
              <option value="3">3 — Comfortable</option>
              <option value="4">4 — Strong</option>
              <option value="5">5 — Expert</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-400 pb-2">
            <input type="checkbox" name="isLanguage" className="accent-emerald-500" />
            Language
          </label>
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded text-sm font-medium"
          >
            Add
          </button>
        </div>
      </form>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
          Languages
        </h2>
        {languages.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No languages added yet.
          </p>
        ) : (
          <div className="space-y-2">
            {languages.map((s) => (
              <SkillRow key={s.skill} s={s} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
          Frameworks & libraries
        </h2>
        {frameworks.length === 0 ? (
          <p className="text-sm text-zinc-500">No frameworks added yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {frameworks.map((s) => (
              <form key={s.skill} action={removeSkill} className="inline">
                <input type="hidden" name="skill" value={s.skill} />
                <button
                  type="submit"
                  className="group flex items-center gap-1 px-3 py-1 bg-violet-900/50 text-violet-300 text-xs rounded-full hover:bg-red-900/50 hover:text-red-300"
                >
                  {s.skill}
                  <span className="text-[10px] opacity-50">· lv{s.level}</span>
                  <X className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                </button>
              </form>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SkillRow({
  s,
}: {
  s: { skill: string; level: "1" | "2" | "3" | "4" | "5" };
}) {
  const pct = (Number(s.level) / 5) * 100;
  return (
    <form action={removeSkill} className="flex items-center gap-3">
      <input type="hidden" name="skill" value={s.skill} />
      <span className="text-sm w-28">{s.skill}</span>
      <div className="flex-1 bg-zinc-800 h-2 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs mono text-zinc-500 w-6">{s.level}</span>
      <button
        type="submit"
        className="text-zinc-600 hover:text-red-400 p-1"
        aria-label={`Remove ${s.skill}`}
      >
        <X className="w-3 h-3" />
      </button>
    </form>
  );
}
