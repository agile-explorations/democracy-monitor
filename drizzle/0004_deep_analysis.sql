-- Enable pgvector extension for embedding storage
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "legal_documents" (
  "id" serial PRIMARY KEY,
  "title" text NOT NULL,
  "type" varchar(20) NOT NULL,
  "citation" varchar(255) NOT NULL,
  "content" text NOT NULL,
  "relevant_categories" jsonb NOT NULL,
  "embedding" vector(1536),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "debates" (
  "id" serial PRIMARY KEY,
  "category" varchar(50) NOT NULL,
  "status" varchar(20) NOT NULL,
  "messages" jsonb NOT NULL,
  "verdict" jsonb NOT NULL,
  "total_rounds" integer NOT NULL,
  "total_latency_ms" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "digests" (
  "id" serial PRIMARY KEY,
  "date" varchar(10) NOT NULL UNIQUE,
  "summary" text NOT NULL,
  "highlights" jsonb,
  "category_summaries" jsonb,
  "overall_assessment" text,
  "provider" varchar(50) NOT NULL,
  "model" varchar(100) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "keyword_trends" (
  "id" serial PRIMARY KEY,
  "keyword" varchar(255) NOT NULL,
  "category" varchar(50) NOT NULL,
  "count" integer NOT NULL,
  "baseline_avg" real,
  "ratio" real,
  "is_anomaly" boolean NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "semantic_clusters" (
  "id" serial PRIMARY KEY,
  "label" varchar(255) NOT NULL,
  "description" text,
  "document_count" integer NOT NULL,
  "top_keywords" jsonb,
  "categories" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_legal_documents_type" ON "legal_documents" ("type");
CREATE INDEX IF NOT EXISTS "idx_legal_documents_citation" ON "legal_documents" ("citation");
CREATE INDEX IF NOT EXISTS "idx_debates_category" ON "debates" ("category");
CREATE INDEX IF NOT EXISTS "idx_debates_created" ON "debates" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_digests_date" ON "digests" ("date");
CREATE INDEX IF NOT EXISTS "idx_keyword_trends_category" ON "keyword_trends" ("category");
CREATE INDEX IF NOT EXISTS "idx_keyword_trends_period" ON "keyword_trends" ("period_start");
CREATE INDEX IF NOT EXISTS "idx_keyword_trends_anomaly" ON "keyword_trends" ("is_anomaly") WHERE "is_anomaly" = true;
CREATE INDEX IF NOT EXISTS "idx_semantic_clusters_created" ON "semantic_clusters" ("created_at");
