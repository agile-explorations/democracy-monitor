ALTER TABLE "documents" ADD COLUMN "superseded" boolean;--> statement-breakpoint
CREATE INDEX "idx_documents_superseded" ON "documents" USING btree ("id") WHERE "documents"."superseded" IS TRUE;--> statement-breakpoint
UPDATE "documents" SET "superseded" = true WHERE "metadata" ? 'supersededBy' AND "superseded" IS NOT TRUE;
