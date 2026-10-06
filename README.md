# RepoCrawler

**Contribute to any open-source project in 10 minutes, not 3 weeks.** Paste a GitHub repo URL; get a personalized contributor onboarding path — matched issues, codebase map, active reviewers, and project conventions, all tailored to your skills.

---

## Status: Phase 1 — Foundation ✅

Phase 1 ships: scaffold, auth, DB, deployable skeleton, repo-submission flow.

**Working end-to-end:**
- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4
- NextAuth v5 (Auth.js) with GitHub OAuth
- Drizzle ORM + Postgres schema for users, skills, analyses, contributions
- Protected routes via middleware
- Pages: landing · sign-in · Analyze (submit repo URL) · analysis-detail (stub for Phase 2) · Contributions · Profile (manage skills)
- Octokit SDK installed (used in Phase 2)
- GitHub Actions CI (lint + typecheck + build)

**Milestone:** sign in with GitHub → set your skills → paste a GitHub repo URL → see analysis queued → view the stub analysis page.

---

## Quickstart

### 1. Install deps

```bash
npm install
```

### 2. Pick your database — one of:

**Option A (recommended, zero setup) — Neon:**
1. https://console.neon.tech → create free project
2. Copy the connection string

**Option B — local Docker:**
```bash
docker compose up -d
# DATABASE_URL=postgres://repocrawler:repocrawler@localhost:5432/repocrawler
```

### 3. Create a GitHub OAuth app

- https://github.com/settings/developers → New OAuth App
- Homepage URL: `http://localhost:3000`
- Callback URL: `http://localhost:3000/api/auth/callback/github`
- Copy Client ID + generate Client Secret

### 4. Configure env

```bash
cp .env.example .env.local
# Fill in DATABASE_URL, AUTH_SECRET, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET
# Generate AUTH_SECRET: openssl rand -base64 32
```

### 5. Push schema + run

```bash
npm run db:push     # creates tables in your DB
npm run dev         # http://localhost:3000
```

Sign in with GitHub → set skills → paste `github.com/vercel/next.js` → done.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:3000 |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (no emit) |
| `npm run db:push` | Push schema to DB (dev — no migrations) |
| `npm run db:generate` | Generate SQL migration from schema change |
| `npm run db:studio` | Browse DB in Drizzle Studio |

---

## Project structure

```
repocrawler/
├── app/
│   ├── (app)/              # Auth-required routes
│   │   ├── layout.tsx      # Sidebar + session guard
│   │   ├── analyze/        # Submit repo URL + see history
│   │   │   └── [owner]/[repo]/   # Analysis result (stub Phase 1)
│   │   ├── contributions/  # PR tracker
│   │   └── profile/        # Skill profile
│   ├── (auth)/
│   │   └── signin/         # GitHub OAuth sign-in
│   ├── api/auth/[...nextauth]/   # NextAuth handlers
│   ├── layout.tsx          # Root (dark theme)
│   ├── page.tsx            # Public landing
│   └── globals.css
├── db/
│   ├── schema.ts           # users, skills, repo_analyses, contributions
│   └── index.ts            # DB client
├── lib/
│   ├── env.ts              # Type-safe env
│   └── utils.ts            # cn() helper
├── auth.config.ts          # Edge-safe NextAuth config
├── auth.ts                 # Full NextAuth with Drizzle adapter
├── middleware.ts           # Route protection
├── drizzle.config.ts
├── docker-compose.yml      # Local Postgres + Redis
└── .github/workflows/ci.yml
```

---

## Roadmap

| Phase | Weeks | Ships |
|---|---|---|
| 1 — Foundation | 1 | ✅ scaffold, auth, DB, repo-submission flow |
| 2 — Analysis pipeline | 2–3 | Octokit workers, GitHub GraphQL, cache, first-pass heuristic ranking |
| 3 — AI synthesis | 4–5 | Claude agent pipeline (codebase map, issue scoring, convention extraction) |
| 4 — Matching + evals | 6 | Match scoring, eval harness, precision@3 benchmarking |
| 5 — Launch | 7–8 | My Contributions sync, Playwright E2E, Docker, HN launch |

Full plan: `~/Resumes/ai-flagship-project-plan.md`

---

## License

MIT (planned at public release).
