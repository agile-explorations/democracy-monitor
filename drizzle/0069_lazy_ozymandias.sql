ALTER TABLE "tip_candidates" ALTER COLUMN "article_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tip_candidates" ADD COLUMN "reporter_id" varchar(40);--> statement-breakpoint
CREATE INDEX "idx_tip_candidates_reporter_kind_since" ON "tip_candidates" USING btree ("reporter_id","watch_kind","since_at");--> statement-breakpoint
ALTER TABLE "tip_candidates" ADD CONSTRAINT "chk_tip_candidates_anchor" CHECK ("tip_candidates"."article_id" IS NOT NULL OR ("tip_candidates"."watch_kind" = 'beat' AND "tip_candidates"."reporter_id" IS NOT NULL));