ALTER TABLE "tip_candidates" ADD COLUMN "beat_category" varchar(40);--> statement-breakpoint
ALTER TABLE "tip_candidates" ADD COLUMN "reporter_ids" jsonb;--> statement-breakpoint
CREATE INDEX "idx_tip_candidates_kind_category_since" ON "tip_candidates" USING btree ("watch_kind","beat_category","since_at");