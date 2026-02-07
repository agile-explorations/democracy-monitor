CREATE TABLE IF NOT EXISTS "cache_entries" (
  "id" serial PRIMARY KEY,
  "key" varchar(512) NOT NULL UNIQUE,
  "value" jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "documents" (
  "id" serial PRIMARY KEY,
  "source_type" varchar(50) NOT NULL,
  "category" varchar(50) NOT NULL,
  "title" text NOT NULL,
  "content" text,
  "url" text,
  "published_at" timestamp with time zone,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb
);

CREATE TABLE IF NOT EXISTS "assessments" (
  "id" serial PRIMARY KEY,
  "category" varchar(50) NOT NULL,
  "status" varchar(20) NOT NULL,
  "reason" text NOT NULL,
  "matches" jsonb,
  "detail" jsonb,
  "assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ai_provider" varchar(50),
  "confidence" integer
);

CREATE TABLE IF NOT EXISTS "site_uptime" (
  "id" serial PRIMARY KEY,
  "hostname" varchar(255) NOT NULL,
  "status" integer NOT NULL,
  "response_time_ms" integer,
  "checked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "is_up" boolean NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_cache_entries_key" ON "cache_entries" ("key");
CREATE INDEX IF NOT EXISTS "idx_cache_entries_expires" ON "cache_entries" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_documents_category" ON "documents" ("category");
CREATE INDEX IF NOT EXISTS "idx_documents_fetched" ON "documents" ("fetched_at");
CREATE INDEX IF NOT EXISTS "idx_assessments_category" ON "assessments" ("category");
CREATE INDEX IF NOT EXISTS "idx_assessments_assessed" ON "assessments" ("assessed_at");
CREATE INDEX IF NOT EXISTS "idx_site_uptime_hostname" ON "site_uptime" ("hostname");
CREATE INDEX IF NOT EXISTS "idx_site_uptime_checked" ON "site_uptime" ("checked_at");
