CREATE TABLE "dump_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" varchar(10) DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"size_bytes" bigint,
	"duration_s" integer,
	"sha256" varchar(64),
	"verified" boolean,
	"offsite" jsonb,
	"error" text,
	"log_tail" text
);
--> statement-breakpoint
CREATE INDEX "idx_dump_runs_started_at" ON "dump_runs" USING btree ("started_at");