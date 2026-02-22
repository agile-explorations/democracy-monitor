ALTER TABLE "weekly_aggregates" ADD COLUMN "structural_score" real;--> statement-breakpoint
ALTER TABLE "weekly_aggregates" ADD COLUMN "structural_detail" jsonb;--> statement-breakpoint
ALTER TABLE "weekly_aggregates" ADD COLUMN "thematic_score" real;--> statement-breakpoint
ALTER TABLE "weekly_aggregates" ADD COLUMN "thematic_detail" jsonb;--> statement-breakpoint
ALTER TABLE "weekly_aggregates" ADD COLUMN "convergence_score" real;--> statement-breakpoint
ALTER TABLE "weekly_aggregates" ADD COLUMN "convergence_detail" jsonb;