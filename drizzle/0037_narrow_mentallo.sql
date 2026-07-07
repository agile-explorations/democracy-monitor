CREATE TABLE "significant_weeks" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_of" date NOT NULL,
	"reasons" jsonb NOT NULL,
	"rank" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "significant_weeks_week_of_unique" UNIQUE("week_of")
);
--> statement-breakpoint
CREATE INDEX "idx_significant_weeks_rank" ON "significant_weeks" USING btree ("rank");