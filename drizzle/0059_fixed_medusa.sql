ALTER TABLE "hot_entities" DROP CONSTRAINT "hot_entities_phrase_unique";--> statement-breakpoint
ALTER TABLE "hot_entities" ADD COLUMN "era" varchar(12) DEFAULT 'trump_t2' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_hot_entities_era" ON "hot_entities" USING btree ("era");--> statement-breakpoint
ALTER TABLE "hot_entities" ADD CONSTRAINT "uq_hot_entities_phrase_era" UNIQUE("phrase","era");