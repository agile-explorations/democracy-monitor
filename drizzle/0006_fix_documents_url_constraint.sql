-- Replace partial unique index with a proper unique constraint on url.
-- The partial index (WHERE url IS NOT NULL) doesn't satisfy ON CONFLICT ("url").
DROP INDEX IF EXISTS "idx_documents_url";
ALTER TABLE "documents" ADD CONSTRAINT "documents_url_unique" UNIQUE ("url");
