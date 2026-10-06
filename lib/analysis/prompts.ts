import type { IssueLite, RepoRawData } from "@/lib/github";
import type { UserProfile } from "./types";

export function profileSummary(p: UserProfile): string {
  const langs = p.skills.filter((s) => s.isLanguage).map((s) => `${s.skill} (lv${s.level})`);
  const fw = p.skills.filter((s) => !s.isLanguage).map((s) => `${s.skill} (lv${s.level})`);
  return `Languages: ${langs.join(", ") || "none specified"}. Frameworks: ${fw.join(", ") || "none specified"}.`;
}

// Shared repo context — cached across all per-issue scoring calls.
export function repoContextBlock(raw: RepoRawData): string {
  const topDirs = raw.directoryTree
    .filter((e) => e.type === "dir" && !e.path.includes("/"))
    .map((e) => e.path)
    .slice(0, 30)
    .join(", ");
  return `
<repo>
  <name>${raw.meta.owner}/${raw.meta.repo}</name>
  <description>${raw.meta.description ?? ""}</description>
  <stars>${raw.meta.stars}</stars>
  <primary_language>${raw.meta.primaryLanguage ?? "unknown"}</primary_language>
  <languages>${raw.languages.map((l) => `${l.name}:${l.percent}%`).join(", ")}</languages>
  <top_directories>${topDirs}</top_directories>
  <contributing_md>
${(raw.contributing ?? "(no CONTRIBUTING.md found)").slice(0, 3000)}
  </contributing_md>
  <readme_excerpt>
${(raw.readme ?? "").slice(0, 2000)}
  </readme_excerpt>
</repo>
`.trim();
}

export function scoreIssuePrompt(issue: IssueLite): string {
  return `
You are scoring a GitHub issue for difficulty and skill requirements, to help
match contributors with issues that fit their background.

<issue>
  <number>${issue.number}</number>
  <title>${issue.title}</title>
  <labels>${issue.labels.join(", ")}</labels>
  <body>
${issue.body.slice(0, 1500)}
  </body>
  <comments_count>${issue.commentsCount}</comments_count>
</issue>

Return STRICT JSON only:
{
  "difficulty": 1-5,
  "estimated_hours": number,
  "skill_tags": ["TypeScript", "React", ...],
  "rationale": "one short sentence"
}
Difficulty rubric:
  1 = typo / one-line docs change
  2 = isolated bug fix with existing test
  3 = feature in a well-trodden area with examples to copy
  4 = cross-module change requiring design judgment
  5 = requires deep architectural knowledge or new subsystem
`.trim();
}

export function synthesizePrompt(raw: RepoRawData, profile: UserProfile): string {
  return `
You are generating a personalized contributor onboarding guide for an engineer
exploring an open-source repository.

User profile: ${profileSummary(profile)}

Return STRICT JSON only, matching this exact shape:
{
  "summary": "2-3 sentences specifically for this user, based on their skills. Say where to start, what to avoid, and what makes this repo a good/bad match.",
  "codebase_map": [
    { "path": "src/", "purpose": "one sentence", "difficulty": "beginner|intermediate|advanced" }
  ],
  "conventions": {
    "pr_title_format": "e.g. [area] Short description",
    "commit_style": "squash | merge | rebase | any",
    "tests_required": "yes for X, optional for Y",
    "avg_merge_time": { "docs": "2 days", "bugfix": "1 week", "feature": "3+ weeks" },
    "local_dev_command": "pnpm install && pnpm dev"
  },
  "my_pick_issue_number": <issue_number or null>,
  "my_pick_justification": "one sentence why THIS user should start with THIS issue"
}

Base your judgment on the repo context and the issues already scored.
Keep the codebase_map to 5-8 most relevant top-level directories.
`.trim();
}
