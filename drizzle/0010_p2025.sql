CREATE TABLE IF NOT EXISTS "p2025_proposals" (
  "id" varchar(50) PRIMARY KEY,
  "chapter" varchar(100) NOT NULL,
  "target_agency" varchar(100),
  "dashboard_category" varchar(50),
  "policy_area" varchar(50),
  "severity" varchar(20) NOT NULL,
  "text" text NOT NULL,
  "summary" text NOT NULL,
  "embedding" vector(1536),
  "status" varchar(20) NOT NULL DEFAULT 'not_started',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "p2025_matches" (
  "id" serial PRIMARY KEY,
  "proposal_id" varchar(50) NOT NULL,
  "document_id" integer,
  "cosine_similarity" real NOT NULL,
  "llm_classification" varchar(20),
  "llm_confidence" real,
  "llm_reasoning" text,
  "human_reviewed" boolean NOT NULL DEFAULT false,
  "human_classification" varchar(20),
  "matched_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_p2025_matches_proposal" ON "p2025_matches" ("proposal_id");
CREATE INDEX IF NOT EXISTS "idx_p2025_matches_document" ON "p2025_matches" ("document_id");
