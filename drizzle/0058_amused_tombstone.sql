CREATE TABLE "hot_entities" (
	"id" serial PRIMARY KEY NOT NULL,
	"phrase" varchar(80) NOT NULL,
	"entity_class" varchar(20) NOT NULL,
	"doc_freq_term" integer NOT NULL,
	"doc_freq_baseline" integer NOT NULL,
	"fts_matches" integer NOT NULL,
	"categories" jsonb NOT NULL,
	"week_stamp" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hot_entities_phrase_unique" UNIQUE("phrase")
);
--> statement-breakpoint
CREATE TABLE "hot_entity_docs" (
	"entity_id" integer NOT NULL,
	"doc_id" integer NOT NULL,
	CONSTRAINT "uq_hot_entity_docs" UNIQUE("entity_id","doc_id")
);
--> statement-breakpoint
ALTER TABLE "hot_entity_docs" ADD CONSTRAINT "hot_entity_docs_entity_id_hot_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."hot_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hot_entities_week_stamp" ON "hot_entities" USING btree ("week_stamp");--> statement-breakpoint
CREATE INDEX "idx_hot_entity_docs_doc_id" ON "hot_entity_docs" USING btree ("doc_id");