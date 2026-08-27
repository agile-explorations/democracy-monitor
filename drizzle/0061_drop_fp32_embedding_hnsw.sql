-- #789: the full-precision HNSW index has had zero scans since the halfvec
-- cutover (#724, v1.9.44); every ranking query casts to halfvec. It was kept
-- one week as a rollback lever (expired 2026-08-24). Drop it, and register
-- the halfvec index that was created by hand on prod so migrations-only
-- databases get it too. The CREATE is skipped wherever ANY halfvec HNSW
-- index already exists on documents (prod/dev: idx_documents_embedding_halfvec_hnsw;
-- some local DBs carry a differently named rehearsal build). lock_timeout
-- keeps a deploy-time migration from stalling live traffic: it fails fast.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
DROP INDEX IF EXISTS "idx_documents_embedding_hnsw";--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema() AND tablename = 'documents'
      AND indexdef LIKE '%USING hnsw%' AND indexdef LIKE '%halfvec_cosine_ops%'
  ) THEN
    EXECUTE 'CREATE INDEX "idx_documents_embedding_halfvec_hnsw" ON "documents" USING hnsw ((("embedding")::halfvec(1536)) halfvec_cosine_ops) WITH (m = 16, ef_construction = 200)';
  END IF;
END $$;
