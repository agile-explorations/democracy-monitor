CREATE TABLE IF NOT EXISTS "intent_weekly" (
  "id" serial PRIMARY KEY,
  "policy_area" varchar(50) NOT NULL,
  "week_of" date NOT NULL,
  "rhetoric_score" real NOT NULL,
  "action_score" real NOT NULL,
  "gap" real NOT NULL,
  "statement_count" integer NOT NULL DEFAULT 0,
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_intent_weekly_area_week" UNIQUE ("policy_area", "week_of")
);

CREATE INDEX IF NOT EXISTS "idx_intent_weekly_policy_area" ON "intent_weekly" ("policy_area");
CREATE INDEX IF NOT EXISTS "idx_intent_weekly_week_of" ON "intent_weekly" ("week_of");
