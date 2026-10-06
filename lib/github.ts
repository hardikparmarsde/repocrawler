import { Octokit } from "octokit";

export function githubClient(token?: string): Octokit {
  return new Octokit({ auth: token, userAgent: "repocrawler/0.1" });
}

export function parseRepoUrl(input: string): { owner: string; repo: string } | null {
  const url = input.trim();
  // Full URL (https://github.com/owner/repo, http://, git@github.com:owner/repo.git, etc.)
  const full = url.match(
    /github\.com[/:]([a-zA-Z0-9][a-zA-Z0-9-]*)\/([a-zA-Z0-9._-]+?)(?:\.git|\/|$)/,
  );
  if (full) return { owner: full[1], repo: full[2].replace(/\.git$/, "") };
  // Shorthand: "owner/repo"
  const short = url.match(/^([a-zA-Z0-9][a-zA-Z0-9-]*)\/([a-zA-Z0-9._-]+)$/);
  if (short) return { owner: short[1], repo: short[2].replace(/\.git$/, "") };
  return null;
}

export interface RepoMeta {
  owner: string;
  repo: string;
  description: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  defaultBranch: string;
  topics: string[];
  homepageUrl: string | null;
  primaryLanguage: string | null;
}

export interface LanguageStat {
  name: string;
  bytes: number;
  percent: number;
}

export interface IssueLite {
  number: number;
  title: string;
  body: string;
  labels: string[];
  commentsCount: number;
  authorLogin: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface PrLite {
  number: number;
  title: string;
  mergedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  authorLogin: string | null;
  reviewers: string[];
  labels: string[];
  additions: number;
  deletions: number;
  changedFiles: number;
  state: "OPEN" | "CLOSED" | "MERGED";
}

export interface Maintainer {
  login: string;
  avatarUrl: string;
  reviewsLast30d: number;
}

export interface DirectoryEntry {
  path: string;
  type: "dir" | "file";
}

export interface RepoRawData {
  meta: RepoMeta;
  languages: LanguageStat[];
  issues: IssueLite[];
  prs: PrLite[];
  contributing: string | null;
  readme: string | null;
  directoryTree: DirectoryEntry[];
  maintainers: Maintainer[];
}

// ─── Fetchers ──────────────────────────────────────────────────────────────

export async function fetchRepoMeta(
  gh: Octokit,
  owner: string,
  repo: string,
): Promise<RepoMeta> {
  const { data } = await gh.rest.repos.get({ owner, repo });
  return {
    owner,
    repo,
    description: data.description,
    stars: data.stargazers_count,
    forks: data.forks_count,
    openIssues: data.open_issues_count,
    defaultBranch: data.default_branch,
    topics: data.topics ?? [],
    homepageUrl: data.homepage,
    primaryLanguage: data.language,
  };
}

export async function fetchLanguages(
  gh: Octokit,
  owner: string,
  repo: string,
): Promise<LanguageStat[]> {
  const { data } = await gh.rest.repos.listLanguages({ owner, repo });
  const total = Object.values(data).reduce((s, v) => s + (v as number), 0) || 1;
  return Object.entries(data)
    .map(([name, bytes]) => ({
      name,
      bytes: bytes as number,
      percent: Math.round(((bytes as number) / total) * 1000) / 10,
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

export async function fetchIssues(
  gh: Octokit,
  owner: string,
  repo: string,
  opts: { labels?: string[]; limit?: number } = {},
): Promise<IssueLite[]> {
  const { data } = await gh.rest.issues.listForRepo({
    owner,
    repo,
    state: "open",
    labels: opts.labels?.join(","),
    per_page: Math.min(opts.limit ?? 50, 100),
    sort: "updated",
    direction: "desc",
  });
  return data
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      body: (i.body ?? "").slice(0, 2000),
      labels: i.labels
        .map((l) => (typeof l === "string" ? l : l.name ?? ""))
        .filter(Boolean),
      commentsCount: i.comments,
      authorLogin: i.user?.login ?? null,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      url: i.html_url,
    }));
}

export async function fetchRecentMergedPrs(
  gh: Octokit,
  owner: string,
  repo: string,
  limit = 100,
): Promise<PrLite[]> {
  const { data } = await gh.rest.pulls.list({
    owner,
    repo,
    state: "closed",
    per_page: Math.min(limit, 100),
    sort: "updated",
    direction: "desc",
  });
  return data.map((p) => ({
    number: p.number,
    title: p.title,
    mergedAt: p.merged_at,
    closedAt: p.closed_at,
    createdAt: p.created_at,
    authorLogin: p.user?.login ?? null,
    reviewers: (p.requested_reviewers ?? []).map((r) => r?.login ?? ""),
    labels: (p.labels ?? []).map((l) => l.name ?? ""),
    additions: 0, // detail call required; keep lite
    deletions: 0,
    changedFiles: 0,
    state: p.merged_at ? "MERGED" : "CLOSED",
  }));
}

export async function fetchFileRaw(
  gh: Octokit,
  owner: string,
  repo: string,
  path: string,
): Promise<string | null> {
  try {
    const { data } = await gh.rest.repos.getContent({ owner, repo, path });
    if ("content" in data && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8").slice(0, 20000);
    }
  } catch {
    return null;
  }
  return null;
}

export async function fetchDirectoryTree(
  gh: Octokit,
  owner: string,
  repo: string,
  defaultBranch: string,
): Promise<DirectoryEntry[]> {
  try {
    const { data } = await gh.rest.git.getTree({
      owner,
      repo,
      tree_sha: defaultBranch,
      recursive: "false",
    });
    return (data.tree ?? [])
      .filter((e) => e.path && (e.type === "tree" || e.type === "blob"))
      .map((e) => ({
        path: e.path!,
        type: e.type === "tree" ? ("dir" as const) : ("file" as const),
      }))
      .slice(0, 100);
  } catch {
    return [];
  }
}

export async function fetchActiveMaintainers(
  gh: Octokit,
  owner: string,
  repo: string,
): Promise<Maintainer[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data } = await gh.rest.pulls.list({
      owner,
      repo,
      state: "closed",
      per_page: 100,
      sort: "updated",
      direction: "desc",
    });
    const reviewerCounts = new Map<
      string,
      { count: number; avatar: string }
    >();
    for (const pr of data) {
      if (!pr.merged_at || pr.merged_at < since) continue;
      // Use author as proxy for active maintainer when reviewer data isn't paginated here.
      const login = pr.user?.login;
      const avatar = pr.user?.avatar_url ?? "";
      if (!login) continue;
      const prev = reviewerCounts.get(login) ?? { count: 0, avatar };
      reviewerCounts.set(login, { count: prev.count + 1, avatar });
    }
    return [...reviewerCounts.entries()]
      .map(([login, v]) => ({
        login,
        avatarUrl: v.avatar,
        reviewsLast30d: v.count,
      }))
      .sort((a, b) => b.reviewsLast30d - a.reviewsLast30d)
      .slice(0, 10);
  } catch {
    return [];
  }
}
