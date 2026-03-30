CREATE TABLE "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255),
	"category" varchar(50),
	"type" varchar(20) NOT NULL,
	"message" text NOT NULL,
	"page_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"confirm_token" varchar(64) NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"subscribed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	CONSTRAINT "uq_subscribers_email" UNIQUE("email"),
	CONSTRAINT "uq_subscribers_token" UNIQUE("confirm_token")
);
--> statement-breakpoint
CREATE INDEX "idx_feedback_created_at" ON "feedback" USING btree ("created_at");