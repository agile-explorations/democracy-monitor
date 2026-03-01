ALTER TABLE "document_scores" ALTER COLUMN "document_class" SET DATA TYPE varchar(30);--> statement-breakpoint
ALTER TABLE "document_scores" ALTER COLUMN "document_class" SET DEFAULT 'unknown';