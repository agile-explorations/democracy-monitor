CREATE TABLE IF NOT EXISTS "weekly_aggregates" (
  "id" serial PRIMARY KEY,
  "category" varchar(50) NOT NULL,
  "week_of" date NOT NULL,
  "total_severity" real NOT NULL,
  "document_count" integer NOT NULL,
  "avg_severity_per_doc" real NOT NULL,
  "capture_proportion" real NOT NULL DEFAULT 0,
  "drift_proportion" real NOT NULL DEFAULT 0,
  "warning_proportion" real NOT NULL DEFAULT 0,
  "severity_mix" real NOT NULL DEFAULT 0,
  "capture_match_count" integer NOT NULL DEFAULT 0,
  "drift_match_count" integer NOT NULL DEFAULT 0,
  "warning_match_count" integer NOT NULL DEFAULT 0,
  "suppressed_match_count" integer NOT NULL DEFAULT 0,
  "top_keywords" jsonb,
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_weekly_aggregates_category_week" UNIQUE ("category", "week_of")
);

CREATE INDEX IF NOT EXISTS "idx_weekly_aggregates_category" ON "weekly_aggregates" ("category");
CREATE INDEX IF NOT EXISTS "idx_weekly_aggregates_week_of" ON "weekly_aggregates" ("week_of");

CREATE TABLE IF NOT EXISTS "baselines" (
  "id" serial PRIMARY KEY,
  "baseline_id" varchar(50) NOT NULL,
  "category" varchar(50) NOT NULL,
  "avg_weekly_severity" real NOT NULL,
  "stddev_weekly_severity" real NOT NULL,
  "avg_weekly_doc_count" real NOT NULL,
  "avg_severity_mix" real NOT NULL,
  "drift_noise_floor" real,
  "embedding_centroid" vector(1536),
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_baselines_baseline_category" UNIQUE ("baseline_id", "category")
);

CREATE INDEX IF NOT EXISTS "idx_baselines_baseline_id" ON "baselines" ("baseline_id");
