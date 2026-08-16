CREATE TABLE "search_timings" (
	"id" serial PRIMARY KEY NOT NULL,
	"measured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"query" text NOT NULL,
	"query_hash" varchar(16) NOT NULL,
	"params" jsonb,
	"embed_ms" integer NOT NULL,
	"expansion_ms" integer NOT NULL,
	"retrieve_wall_ms" integer NOT NULL,
	"total_ms" integer NOT NULL,
	"windows" jsonb,
	"app_version" varchar(20),
	"git_commit" varchar(40),
	"flagged" boolean DEFAULT false NOT NULL,
	"flag_reason" text
);
--> statement-breakpoint
CREATE INDEX "idx_search_timings_measured_at" ON "search_timings" USING btree ("measured_at");--> statement-breakpoint
CREATE INDEX "idx_search_timings_flagged" ON "search_timings" USING btree ("flagged","measured_at");