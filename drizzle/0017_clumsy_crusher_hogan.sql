CREATE TABLE "source_health" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" varchar(100) NOT NULL,
	"source_name" varchar(255) NOT NULL,
	"source_type" varchar(20) NOT NULL,
	"category" varchar(50) NOT NULL,
	"status" varchar(20) NOT NULL,
	"document_count" integer,
	"expected_doc_count" integer,
	"error_message" text,
	"last_success_at" timestamp with time zone,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
