import type { IssueLite, RepoRawData } from "@/lib/github";

export interface UserProfile {
  skills: Array<{ skill: string; level: 1 | 2 | 3 | 4 | 5; isLanguage: boolean }>;
}

export interface IssueScore {
  issueNumber: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  estimatedHours: number;
  skillTags: string[];
  rationale: string;
}

export interface MatchedIssue {
  issue: IssueLite;
  score: IssueScore;
  matchScore: number; // 0..1
  rank: number;
}

export interface CodebaseMapEntry {
  path: string;
  purpose: string; // 1-sentence description
  difficulty: "beginner" | "intermediate" | "advanced";
}

export interface Conventions {
  prTitleFormat: string;
  commitStyle: string;
  testsRequired: string;
  avgMergeTime: {
    docs: string;
    bugfix: string;
    feature: string;
  };
  localDevCommand: string;
}

export interface SynthesisResult {
  summary: string;
  codebaseMap: CodebaseMapEntry[];
  conventions: Conventions;
  myPick: {
    issueNumber: number;
    justification: string;
  } | null;
  totalCostCents: number;
  totalTokensIn: number;
  totalTokensOut: number;
}

export interface FinalAnalysis {
  raw: RepoRawData;
  synthesis: SynthesisResult;
  matched: MatchedIssue[];
  version: string;
}

export const PROMPT_VERSION = "v1-2026-10-01";
