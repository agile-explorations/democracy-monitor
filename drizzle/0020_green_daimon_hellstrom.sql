ALTER TABLE "documents" DROP CONSTRAINT "documents_url_unique";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_category" ON "documents" USING btree ("category");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "uq_documents_url_category" UNIQUE("url","category");