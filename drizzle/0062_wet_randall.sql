CREATE TABLE "cl_cluster_ledger" (
	"cluster_id" bigint PRIMARY KEY NOT NULL,
	"docket_id" bigint,
	"court" varchar(100),
	"case_name" text,
	"date_filed" date,
	"reason" varchar(30) NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_tried_at" timestamp with time zone DEFAULT now() NOT NULL
);
