CREATE TABLE IF NOT EXISTS "alerts" (
  "id" serial PRIMARY KEY,
  "type" varchar(50) NOT NULL,
  "category" varchar(50) NOT NULL,
  "severity" varchar(20) NOT NULL,
  "message" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "content_snapshots" (
  "id" serial PRIMARY KEY,
  "url" text NOT NULL UNIQUE,
  "content_hash" varchar(64) NOT NULL,
  "report_count" integer,
  "snapshot_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_alerts_category" ON "alerts" ("category");
CREATE INDEX IF NOT EXISTS "idx_alerts_severity" ON "alerts" ("severity");
CREATE INDEX IF NOT EXISTS "idx_alerts_created" ON "alerts" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_content_snapshots_url" ON "content_snapshots" ("url");
CREATE INDEX IF NOT EXISTS "idx_site_uptime_hostname" ON "site_uptime" ("hostname");
CREATE INDEX IF NOT EXISTS "idx_site_uptime_checked" ON "site_uptime" ("checked_at");
