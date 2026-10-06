import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    AUTH_SECRET: z.string().min(32),
    AUTH_GITHUB_ID: z.string().min(1),
    AUTH_GITHUB_SECRET: z.string().min(1),
    // ONE of these is required at analysis time.
    // Pipeline prefers GOOGLE_API_KEY (free tier) if both set.
    ANTHROPIC_API_KEY: z.string().optional(),
    GOOGLE_API_KEY: z.string().optional(),
    // Optional GitHub PAT for scripts/CLI (user OAuth token is used in-app).
    GITHUB_TOKEN: z.string().optional(),
    // Phase 5+
    VOYAGE_API_KEY: z.string().optional(),
    REDIS_URL: z.string().optional(),
  },
  client: {},
  experimental__runtimeEnv: {},
});
