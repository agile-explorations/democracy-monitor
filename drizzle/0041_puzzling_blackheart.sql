CREATE TABLE "fr_drop_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" varchar(50) NOT NULL,
	"signal_url" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"agency" text,
	"published_at" date,
	"reason" varchar(30) NOT NULL,
	"pattern_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_fr_drop_ledger_url_category" UNIQUE("url","category")
);
--> statement-breakpoint
CREATE INDEX "idx_fr_drop_ledger_category_created" ON "fr_drop_ledger" USING btree ("category","created_at");