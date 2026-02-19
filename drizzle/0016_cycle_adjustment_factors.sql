CREATE TABLE "cycle_adjustment_factors" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" varchar(50) NOT NULL,
	"cycle_year" integer NOT NULL,
	"reference_cycle_year" integer NOT NULL,
	"severity_ratio" real NOT NULL,
	"volume_ratio" real NOT NULL,
	"severity_stddev_ratio" real NOT NULL,
	"source_baselines" jsonb NOT NULL,
	"sample_size" integer NOT NULL,
	"confidence" varchar(20) NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_cycle_adj_category_years" UNIQUE("category","cycle_year","reference_cycle_year")
);
--> statement-breakpoint
CREATE INDEX "idx_cycle_adj_category" ON "cycle_adjustment_factors" USING btree ("category");
