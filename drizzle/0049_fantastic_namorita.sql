CREATE TABLE "robots_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"audited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trigger" varchar(20) NOT NULL,
	"host" varchar(120) NOT NULL,
	"fetch_status" integer,
	"robots_txt" text,
	"robots_source" varchar(20) DEFAULT 'live' NOT NULL,
	"verdicts" jsonb NOT NULL,
	"violation_count" integer DEFAULT 0 NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE INDEX "idx_robots_audit_host_time" ON "robots_audit" USING btree ("host","audited_at");