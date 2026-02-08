-- Add embedding support to documents table for RAG pipeline
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "embedded_at" timestamp with time zone;

-- Add unique constraint on URL for upsert deduplication
CREATE UNIQUE INDEX IF NOT EXISTS "idx_documents_url" ON "documents" ("url") WHERE "url" IS NOT NULL;

-- Index for finding unembedded documents
CREATE INDEX IF NOT EXISTS "idx_documents_unembedded" ON "documents" ("embedded_at") WHERE "embedded_at" IS NULL;

-- Index for category-scoped vector search
CREATE INDEX IF NOT EXISTS "idx_documents_category" ON "documents" ("category");
