CREATE TABLE "week_headlines" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_of" date NOT NULL,
	"headline" text NOT NULL,
	"generated" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "week_headlines_week_of_unique" UNIQUE("week_of")
);
