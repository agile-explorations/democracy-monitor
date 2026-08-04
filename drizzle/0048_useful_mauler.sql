ALTER TABLE "feedback" ADD COLUMN "approved" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Grandfather existing feedback (#668): these rows were already public, so
-- approve them; only NEW submissions (default false) require moderation.
UPDATE "feedback" SET "approved" = true;