ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "search_rank_vector" "tsvector";-- Trigger keeps search_rank_vector current on every write path (app upserts,
-- backfills, promotes). Matching still uses the full generated search_vector;
-- this compact vector exists only for ts_rank ordering (#703).
CREATE OR REPLACE FUNCTION documents_search_rank_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."search_rank_vector" :=
    setweight(to_tsvector('english', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('english', left(coalesce(NEW."content", ''), 20000)), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_documents_search_rank_vector ON "documents";
--> statement-breakpoint
CREATE TRIGGER trg_documents_search_rank_vector
  BEFORE INSERT OR UPDATE OF "title", "content" ON "documents"
  FOR EACH ROW EXECUTE FUNCTION documents_search_rank_vector_update();
