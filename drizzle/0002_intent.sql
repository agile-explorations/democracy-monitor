CREATE TABLE IF NOT EXISTS "intent_statements" (
  "id" serial PRIMARY KEY,
  "text" text NOT NULL,
  "source" varchar(255) NOT NULL,
  "source_tier" integer NOT NULL,
  "type" varchar(20) NOT NULL,
  "policy_area" varchar(50) NOT NULL,
  "score" real NOT NULL,
  "date" date NOT NULL,
  "url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "intent_assessments" (
  "id" serial PRIMARY KEY,
  "overall" varchar(50) NOT NULL,
  "confidence" real,
  "rhetoric_score" real NOT NULL,
  "action_score" real NOT NULL,
  "gap" real NOT NULL,
  "detail" jsonb,
  "assessed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_intent_statements_date" ON "intent_statements" ("date");
CREATE INDEX IF NOT EXISTS "idx_intent_statements_type" ON "intent_statements" ("type");
CREATE INDEX IF NOT EXISTS "idx_intent_statements_area" ON "intent_statements" ("policy_area");
CREATE INDEX IF NOT EXISTS "idx_intent_assessments_assessed" ON "intent_assessments" ("assessed_at");
