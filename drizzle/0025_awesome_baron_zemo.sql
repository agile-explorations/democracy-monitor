CREATE TABLE "cron_locks" (
	"lock_key" varchar(64) PRIMARY KEY NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"pid" integer
);
