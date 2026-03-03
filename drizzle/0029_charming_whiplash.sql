ALTER TABLE "document_scores" DROP CONSTRAINT "document_scores_url_key";--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "content_type" varchar(20) DEFAULT 'full_text' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_scores" ADD CONSTRAINT "uq_document_scores_url_category" UNIQUE("url","category");