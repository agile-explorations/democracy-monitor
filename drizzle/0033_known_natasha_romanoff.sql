CREATE TABLE "cron_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_name" varchar(50) NOT NULL,
	"status" varchar(20) NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"summary" jsonb,
	"errors" jsonb
);
--> statement-breakpoint
CREATE INDEX "idx_cron_runs_job_name" ON "cron_runs" USING btree ("job_name");