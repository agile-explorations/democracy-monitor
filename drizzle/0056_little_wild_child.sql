CREATE TABLE "slow_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"phrase" text NOT NULL,
	"kind" varchar(12) NOT NULL,
	"params_hash" varchar(16) NOT NULL,
	"params" jsonb,
	"last_duration_ms" integer NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_slow_aliases_identity" ON "slow_aliases" USING btree ("phrase","kind","params_hash");