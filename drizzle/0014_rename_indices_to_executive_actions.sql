-- Rename category 'indices' to 'executiveActions' across all tables
-- See SYSTEM SPECIFICATION V3 ADDENDUM.md §14.2

UPDATE documents SET category = 'executiveActions' WHERE category = 'indices';
UPDATE assessments SET category = 'executiveActions' WHERE category = 'indices';
UPDATE ai_analysis_history SET category = 'executiveActions' WHERE category = 'indices';
UPDATE alerts SET category = 'executiveActions' WHERE category = 'indices';
UPDATE keyword_trends SET category = 'executiveActions' WHERE category = 'indices';
UPDATE document_scores SET category = 'executiveActions' WHERE category = 'indices';
UPDATE weekly_aggregates SET category = 'executiveActions' WHERE category = 'indices';
UPDATE baselines SET category = 'executiveActions' WHERE category = 'indices';
UPDATE p2025_proposals SET dashboard_category = 'executiveActions' WHERE dashboard_category = 'indices';
