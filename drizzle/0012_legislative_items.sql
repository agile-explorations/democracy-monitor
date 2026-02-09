CREATE TABLE legislative_items (
  id SERIAL PRIMARY KEY,
  govinfo_id VARCHAR(100) NOT NULL UNIQUE,
  title TEXT NOT NULL,
  type VARCHAR(20) NOT NULL,
  date DATE NOT NULL,
  url TEXT NOT NULL,
  chamber VARCHAR(10) NOT NULL,
  committee VARCHAR(200),
  relevant_categories JSONB NOT NULL,
  summary TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_legislative_items_date ON legislative_items (date);
CREATE INDEX idx_legislative_items_type ON legislative_items (type);
