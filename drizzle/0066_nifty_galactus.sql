CREATE TABLE "tip_seen_keys" (
	"reporter_id" varchar(40) NOT NULL,
	"article_key" text NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_tip_seen_keys" UNIQUE("reporter_id","article_key")
);
