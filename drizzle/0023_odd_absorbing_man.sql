CREATE TABLE "legiscan_datasets" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"state" varchar(2) NOT NULL,
	"session_name" text,
	"dataset_hash" varchar(32) NOT NULL,
	"dataset_date" timestamp with time zone,
	"downloaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bill_count" integer,
	CONSTRAINT "legiscan_datasets_session_id_unique" UNIQUE("session_id")
);
