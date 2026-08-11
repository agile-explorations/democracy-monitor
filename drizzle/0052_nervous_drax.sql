ALTER TABLE "documents" ADD COLUMN "parent_id" integer;--> statement-breakpoint
CREATE INDEX "idx_documents_parent_id" ON "documents" USING btree ("parent_id");