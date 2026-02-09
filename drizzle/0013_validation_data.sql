CREATE TABLE validation_data_points (
  id SERIAL PRIMARY KEY,
  source VARCHAR(30) NOT NULL,
  date DATE NOT NULL,
  dimension VARCHAR(50) NOT NULL,
  score REAL NOT NULL,
  raw_score REAL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_validation_source_date_dim UNIQUE (source, date, dimension)
);

CREATE INDEX idx_validation_source ON validation_data_points (source);
CREATE INDEX idx_validation_date ON validation_data_points (date);
