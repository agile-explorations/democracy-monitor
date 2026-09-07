CREATE TABLE "tip_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_id" varchar(40) NOT NULL,
	"outlet" varchar(60) NOT NULL,
	"article_key" text NOT NULL,
	"url" text,
	"title" text NOT NULL,
	"lede" text,
	"lede_source" varchar(20) NOT NULL,
	"published_at" timestamp with time zone,
	"feed_strategy" varchar(20) NOT NULL,
	"attribution" varchar(30) NOT NULL,
	"coauthor_count" integer DEFAULT 0 NOT NULL,
	"raw_meta" jsonb,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_tip_articles_reporter_key" UNIQUE("reporter_id","article_key")
);
--> statement-breakpoint
CREATE TABLE "tip_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"verdict" varchar(20) NOT NULL,
	"tip" jsonb,
	"tip_document_id" integer,
	"reasons_no_tip" text,
	"matched_docs" jsonb,
	"retrieval_meta" jsonb,
	"prompt_version" varchar(30),
	"model" varchar(60),
	"tokens_in" integer,
	"tokens_out" integer,
	"latency_ms" integer,
	"reactive" boolean DEFAULT false NOT NULL,
	"run_id" varchar(40),
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tip_sent_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"reporter_id" varchar(40) NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replied_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tip_candidates" ADD CONSTRAINT "tip_candidates_article_id_tip_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."tip_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_sent_log" ADD CONSTRAINT "tip_sent_log_candidate_id_tip_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."tip_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tip_articles_published" ON "tip_articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "idx_tip_candidates_status_created" ON "tip_candidates" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_tip_candidates_article" ON "tip_candidates" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "idx_tip_sent_log_reporter_sent" ON "tip_sent_log" USING btree ("reporter_id","sent_at");