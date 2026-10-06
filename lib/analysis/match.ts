import type { IssueLite } from "@/lib/github";
import type { IssueScore, MatchedIssue, UserProfile } from "./types";

/**
 * Match scoring = (skill_match × 0.6) + (approachability × 0.4)
 *
 *   skill_match ∈ [0,1]
 *     - For each inferred skill_tag on an issue, look up user's level/5.
 *     - Languages weighted 1.25× (knowing the language unblocks the whole issue).
 *     - Frameworks weighted 0.9× (nice-to-have, you can learn in context).
 *     - Average across tags. If no tags: neutral 0.3.
 *
 *   approachability ∈ [0,1]
 *     - diffFactor = (6 - difficulty) / 5     → d=1 → 1.0, d=5 → 0.2
 *     - commentPenalty up to -30% at 20+ comments (likely taken or contested)
 *     - small-estimated-hours bonus (≤2h gets +10%)
 */
export function matchIssues(
  issues: IssueLite[],
  scores: IssueScore[],
  profile: UserProfile,
): MatchedIssue[] {
  const scoreByNumber = new Map(scores.map((s) => [s.issueNumber, s]));
  const userSkillMap = new Map<string, { level: number; isLanguage: boolean }>();
  for (const s of profile.skills) {
    userSkillMap.set(s.skill.toLowerCase(), {
      level: s.level,
      isLanguage: s.isLanguage,
    });
  }

  const matched = issues
    .map((issue) => {
      const score = scoreByNumber.get(issue.number);
      if (!score) return null;

      const matchFactors = score.skillTags.map((t) => {
        const info = userSkillMap.get(t.toLowerCase());
        if (!info) return 0;
        const base = info.level / 5;
        const weight = info.isLanguage ? 1.25 : 0.9;
        return Math.min(1, base * weight);
      });
      const skillMatch =
        matchFactors.length === 0
          ? 0.3
          : matchFactors.reduce((a, b) => a + b, 0) / matchFactors.length;

      const diffFactor = (6 - score.difficulty) / 5;
      const commentPenalty = Math.min(1, issue.commentsCount / 20);
      const timeBoost = score.estimatedHours <= 2 ? 1.1 : 1.0;
      const approachability = Math.min(
        1,
        diffFactor * (1 - 0.3 * commentPenalty) * timeBoost,
      );

      const matchScore = skillMatch * 0.6 + approachability * 0.4;

      return { issue, score, matchScore, rank: 0 };
    })
    .filter((m): m is MatchedIssue => m !== null)
    .sort((a, b) => b.matchScore - a.matchScore)
    .map((m, i) => ({ ...m, rank: i + 1 }));

  return matched;
}
