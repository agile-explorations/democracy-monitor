ALTER TABLE "search_timings" ALTER COLUMN "embed_ms" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "search_timings" ALTER COLUMN "expansion_ms" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "search_timings" ALTER COLUMN "retrieve_wall_ms" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "search_timings" ALTER COLUMN "total_ms" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "search_timings" ADD COLUMN "served" varchar(8) DEFAULT 'build' NOT NULL;--> statement-breakpoint
ALTER TABLE "search_timings" ADD COLUMN "doc_count" integer;