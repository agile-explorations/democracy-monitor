ALTER TABLE "documents" ADD COLUMN "case_id" varchar(100);--> statement-breakpoint
CREATE INDEX "idx_documents_case_id" ON "documents" USING btree ("case_id");