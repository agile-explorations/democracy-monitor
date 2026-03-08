CREATE TABLE "narrative_failures" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" varchar(50) NOT NULL,
	"week_of" date NOT NULL,
	"failed_pass" integer NOT NULL,
	"error" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "uq_narrative_failures_category_week" UNIQUE("category","week_of")
);
--> statement-breakpoint
CREATE INDEX "idx_narrative_failures_unresolved" ON "narrative_failures" USING btree ("resolved_at");