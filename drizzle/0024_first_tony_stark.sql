CREATE TABLE "fetch_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_origin" varchar(30) NOT NULL,
	"category" varchar(50) NOT NULL,
	"week_start" date NOT NULL,
	"week_end" date NOT NULL,
	"status" varchar(20) NOT NULL,
	"items_fetched" integer DEFAULT 0 NOT NULL,
	"items_stored" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_fetch_log_source_category_week" UNIQUE("source_origin","category","week_start")
);
--> statement-breakpoint
CREATE INDEX "idx_fetch_log_incomplete" ON "fetch_log" ("source_origin", "category")
  WHERE "status" != 'complete';
