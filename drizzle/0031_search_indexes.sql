-- Full-text search: generated tsvector column + GIN index
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("content", '')), 'B')
  ) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_search_vector" ON "documents" USING gin ("search_vector");
--> statement-breakpoint
-- HNSW vector index for semantic search (165K+ embedded documents)
CREATE INDEX IF NOT EXISTS "idx_documents_embedding_hnsw" ON "documents" USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64);
--> statement-breakpoint
-- Published date index for date range filtering in search
CREATE INDEX IF NOT EXISTS "idx_documents_published_at" ON "documents" USING btree ("published_at");
