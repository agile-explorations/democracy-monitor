CREATE TABLE IF NOT EXISTS "ai_analysis_history" (
  "id" serial PRIMARY KEY,
  "category" varchar(50) NOT NULL,
  "provider" varchar(50) NOT NULL,
  "model" varchar(100) NOT NULL,
  "status" varchar(20) NOT NULL,
  "confidence" real,
  "reasoning" text,
  "tokens_input" integer,
  "tokens_output" integer,
  "latency_ms" integer,
  "keyword_status" varchar(20),
  "consensus" boolean,
  "analyzed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_ai_history_category" ON "ai_analysis_history" ("category");
CREATE INDEX IF NOT EXISTS "idx_ai_history_analyzed" ON "ai_analysis_history" ("analyzed_at");
CREATE INDEX IF NOT EXISTS "idx_ai_history_provider" ON "ai_analysis_history" ("provider");
