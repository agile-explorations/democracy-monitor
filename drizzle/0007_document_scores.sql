CREATE TABLE IF NOT EXISTS "document_scores" (
  "id" serial PRIMARY KEY,
  "document_id" integer,
  "url" text NOT NULL UNIQUE,
  "category" varchar(50) NOT NULL,
  "severity_score" real NOT NULL,
  "final_score" real NOT NULL,
  "capture_count" integer NOT NULL DEFAULT 0,
  "drift_count" integer NOT NULL DEFAULT 0,
  "warning_count" integer NOT NULL DEFAULT 0,
  "suppressed_count" integer NOT NULL DEFAULT 0,
  "document_class" varchar(20) NOT NULL DEFAULT 'unknown',
  "class_multiplier" real NOT NULL DEFAULT 1.0,
  "is_high_authority" boolean NOT NULL DEFAULT false,
  "matches" jsonb NOT NULL,
  "suppressed" jsonb NOT NULL,
  "scored_at" timestamp with time zone DEFAULT now() NOT NULL,
  "week_of" date NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_document_scores_category_week" ON "document_scores" ("category", "week_of");
CREATE INDEX IF NOT EXISTS "idx_document_scores_document_id" ON "document_scores" ("document_id");
CREATE INDEX IF NOT EXISTS "idx_document_scores_url" ON "document_scores" ("url");
