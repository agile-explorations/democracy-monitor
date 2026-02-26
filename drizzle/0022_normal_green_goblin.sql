CREATE TABLE "narratives" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" varchar(50) NOT NULL,
	"week_of" date NOT NULL,
	"version" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"model" varchar(100) NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_narratives_category_week_version" UNIQUE("category","week_of","version")
);
--> statement-breakpoint
CREATE INDEX "idx_narratives_category" ON "narratives" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_narratives_week_of" ON "narratives" USING btree ("week_of");