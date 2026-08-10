CREATE TABLE "tracked_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_id" varchar(50) NOT NULL,
	"docket_id" bigint NOT NULL,
	"categories" jsonb NOT NULL,
	"case_name" text NOT NULL,
	"court_id" varchar(30),
	"court_name" varchar(200),
	"docket_number" varchar(100),
	"nature_of_suit" varchar(200),
	"cause" varchar(200),
	"date_filed" date,
	"date_terminated" date,
	"date_last_filing" date,
	"status" varchar(12) NOT NULL,
	"posture" jsonb,
	"cluster_disposition" text,
	"cluster_precedential" varchar(50),
	"cluster_citation_count" integer,
	"provenance" jsonb,
	"first_seen_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"refreshed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tracked_cases_case_id" ON "tracked_cases" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_tracked_cases_categories" ON "tracked_cases" USING gin ("categories");--> statement-breakpoint
CREATE INDEX "idx_tracked_cases_status_last_filing" ON "tracked_cases" USING btree ("status","date_last_filing");