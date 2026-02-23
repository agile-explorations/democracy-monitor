CREATE TABLE "ai_document_assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer,
	"url" text NOT NULL,
	"category" varchar(50) NOT NULL,
	"pass" integer NOT NULL,
	"relevant" boolean,
	"confidence" real,
	"erosion_type" varchar(30),
	"signals" jsonb,
	"assessment" varchar(30),
	"reasoning" text,
	"comparative_context" text,
	"cited_passages" jsonb,
	"counter_arguments" jsonb,
	"is_audit_sample" boolean DEFAULT false NOT NULL,
	"model" varchar(100) NOT NULL,
	"provider" varchar(50) NOT NULL,
	"tokens_input" integer,
	"tokens_output" integer,
	"latency_ms" integer,
	"week_of" date NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_ai_doc_assess_url_pass_model" UNIQUE("url","pass","model")
);
--> statement-breakpoint
ALTER TABLE "weekly_aggregates" ADD COLUMN "ai_score" real;--> statement-breakpoint
ALTER TABLE "weekly_aggregates" ADD COLUMN "ai_detail" jsonb;--> statement-breakpoint
CREATE INDEX "idx_ai_doc_assess_category_week" ON "ai_document_assessments" USING btree ("category","week_of");--> statement-breakpoint
CREATE INDEX "idx_ai_doc_assess_url" ON "ai_document_assessments" USING btree ("url");