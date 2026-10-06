import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
  uuid,
  pgEnum,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// ─── NextAuth adapter tables ───────────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  githubLogin: text("github_login"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (acc) => [primaryKey({ columns: [acc.provider, acc.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationTokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// ─── RepoCrawler domain tables ─────────────────────────────────────────────

export const skillLevel = pgEnum("skill_level", ["1", "2", "3", "4", "5"]);
export const analysisStatus = pgEnum("analysis_status", [
  "pending",
  "analyzing",
  "complete",
  "failed",
]);
export const contributionStatus = pgEnum("contribution_status", [
  "open",
  "merged",
  "closed",
  "draft",
]);

export const userSkills = pgTable(
  "user_skills",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skill: text("skill").notNull(),
    level: skillLevel("level").notNull().default("3"),
    isLanguage: integer("is_language").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (us) => [primaryKey({ columns: [us.userId, us.skill] })],
);

export const repoAnalyses = pgTable(
  "repo_analyses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    status: analysisStatus("status").notNull().default("pending"),
    analyzedAt: timestamp("analyzed_at"),
    summary: text("summary"),
    rawResult: jsonb("raw_result"),
    tokensIn: integer("tokens_in").default(0),
    tokensOut: integer("tokens_out").default(0),
    costCents: integer("cost_cents").default(0),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("repo_analyses_user_idx").on(t.userId, t.createdAt),
    unique("repo_analyses_user_repo_unique").on(t.userId, t.owner, t.repo),
  ],
);

export const userContributions = pgTable(
  "user_contributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    repoAnalysisId: uuid("repo_analysis_id").references(() => repoAnalyses.id, {
      onDelete: "set null",
    }),
    prUrl: text("pr_url").notNull(),
    prNumber: integer("pr_number").notNull(),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    title: text("title").notNull(),
    status: contributionStatus("status").notNull().default("open"),
    openedAt: timestamp("opened_at").notNull(),
    mergedAt: timestamp("merged_at"),
    closedAt: timestamp("closed_at"),
  },
  (t) => [
    index("user_contributions_user_idx").on(t.userId, t.openedAt),
    unique("user_contributions_pr_unique").on(t.userId, t.prUrl),
  ],
);

// ─── Phase 4 — Eval harness ────────────────────────────────────────────────

export const evalQueries = pgTable("eval_queries", {
  id: uuid("id").defaultRandom().primaryKey(),
  label: text("label").notNull(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  profileJson: jsonb("profile_json").notNull(),
  expectedIssues: jsonb("expected_issues").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const evalRuns = pgTable(
  "eval_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evalQueryId: uuid("eval_query_id")
      .notNull()
      .references(() => evalQueries.id, { onDelete: "cascade" }),
    retrievedIssues: jsonb("retrieved_issues").notNull(),
    precisionAt3: integer("precision_at_3_bps").notNull(),
    recallAt10: integer("recall_at_10_bps").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    costCents: integer("cost_cents").notNull(),
    promptVersion: text("prompt_version").notNull(),
    runAt: timestamp("run_at").defaultNow().notNull(),
  },
  (t) => [index("eval_runs_query_idx").on(t.evalQueryId, t.runAt)],
);
