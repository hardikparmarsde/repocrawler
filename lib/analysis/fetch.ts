import {
  githubClient,
  fetchRepoMeta,
  fetchLanguages,
  fetchIssues,
  fetchRecentMergedPrs,
  fetchFileRaw,
  fetchDirectoryTree,
  fetchActiveMaintainers,
  type RepoRawData,
} from "@/lib/github";

export async function fetchAllRepoData(
  owner: string,
  repo: string,
  userToken?: string,
): Promise<RepoRawData> {
  const gh = githubClient(userToken);

  const meta = await fetchRepoMeta(gh, owner, repo);

  const [
    languages,
    goodFirstIssues,
    helpWantedIssues,
    prs,
    contributing,
    readme,
    directoryTree,
    maintainers,
  ] = await Promise.all([
    fetchLanguages(gh, owner, repo),
    fetchIssues(gh, owner, repo, { labels: ["good first issue"], limit: 30 }),
    fetchIssues(gh, owner, repo, { labels: ["help wanted"], limit: 30 }),
    fetchRecentMergedPrs(gh, owner, repo, 50),
    fetchFileRaw(gh, owner, repo, "CONTRIBUTING.md"),
    fetchFileRaw(gh, owner, repo, "README.md"),
    fetchDirectoryTree(gh, owner, repo, meta.defaultBranch),
    fetchActiveMaintainers(gh, owner, repo),
  ]);

  // Deduplicate issues (same issue can have both labels).
  const seen = new Set<number>();
  const issues = [...goodFirstIssues, ...helpWantedIssues].filter((i) => {
    if (seen.has(i.number)) return false;
    seen.add(i.number);
    return true;
  });

  return {
    meta,
    languages,
    issues,
    prs,
    contributing,
    readme,
    directoryTree,
    maintainers,
  };
}
