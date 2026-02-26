ALTER TABLE "documents" ADD COLUMN "source_origin" varchar(30);--> statement-breakpoint
CREATE INDEX "idx_documents_source_origin" ON "documents" USING btree ("source_origin");