CREATE TABLE "chrg_seen_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"package_id" text NOT NULL,
	"title" text NOT NULL,
	"committees" text,
	"date_issued" date,
	"reason" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_chrg_seen_ledger_package_id" UNIQUE("package_id")
);
