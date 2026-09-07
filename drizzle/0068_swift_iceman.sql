ALTER TABLE "tip_articles" ADD COLUMN "watch_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tip_articles" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tip_candidates" ADD COLUMN "watch_kind" varchar(20) DEFAULT 'forward' NOT NULL;--> statement-breakpoint
ALTER TABLE "tip_candidates" ADD COLUMN "since_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_tip_articles_watch_until" ON "tip_articles" USING btree ("watch_until");