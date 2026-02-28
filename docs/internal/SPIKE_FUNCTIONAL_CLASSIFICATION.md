# Spike: Institutional Function Classification Feasibility

## Purpose

The proposed architecture redesign includes a "functional drift" metric that detects when agencies shift what they're _doing_ (e.g., from publishing guidance to issuing personnel actions) rather than what _topics_ they're covering. This is distinct from policy priority differences between administrations, which are expected and not concerning.

Before finalizing the architecture proposal, we need to determine:

1. **What functional categories (buckets) are appropriate?** We don't have a predetermined list — the buckets should emerge from a combination of existing government taxonomies and the actual distribution of documents in our data.

2. **Can documents be assigned to those buckets deterministically using available metadata?** If yes, functional drift is a structural metric (deterministic, reproducible, zero-cost). If no, it requires AI classification and belongs in a different part of the architecture.

3. **What's the ambiguity rate?** If 90% of documents are clearly assignable from metadata, that's a structural metric with documented uncertainty. If 50% are ambiguous, it's not a structural metric.

This spike should take ~30 minutes and produce data, not code. No implementation needed — just investigation and findings.

---

## Part 1: What Metadata Is Available?

### 1A: What's stored in our database?

```sql
-- What columns exist on the documents table?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'documents'
ORDER BY ordinal_position;

-- What distinct values exist in type-related fields?
-- (Run for each type/source_type/class column that exists)
SELECT source_type, count(*)
FROM documents
GROUP BY source_type
ORDER BY count(*) DESC;

-- If there are other classification columns, query their distributions too
```

### 1B: What metadata does the FR API provide that we might not be storing?

Fetch 3-5 raw FR API document JSON responses across different document types. We need to see the full metadata available, not just what we currently store.

```bash
# A rule
curl -s "https://www.federalregister.gov/api/v1/documents/2025-02000.json" | jq 'keys'
curl -s "https://www.federalregister.gov/api/v1/documents/2025-02000.json" | jq '{type, subtype, action, document_number, agencies, cfr_references, docket_ids, topics, regulation_id_numbers}'

# A notice
curl -s "https://www.federalregister.gov/api/v1/documents/2025-03000.json" | jq '{type, subtype, action, agencies, cfr_references, topics}'

# A presidential document
curl -s "https://www.federalregister.gov/api/v1/documents/2025-01500.json" | jq '{type, subtype, action, presidential_document_type, signing_date, executive_order_number}'

# Pick documents from different categories if possible (civilService, fiscal, igs)
# Use recently fetched document numbers from our database if available
```

**Record**: For each document, capture the full set of metadata fields returned. Note which fields are consistently populated vs. sparse.

### 1C: What does the FR API's own documentation say about classification fields?

```bash
# Fetch the API field descriptions
curl -s "https://www.federalregister.gov/developers/documentation/api/v1" | head -200
```

Or check: https://www.federalregister.gov/developers/documentation/api/v1

List every field that could be relevant to functional classification: `type`, `subtype`, `action`, `presidential_document_type`, `topics`, `cfr_references`, `regulation_id_numbers`, `docket_ids`, and any others.

---

## Part 2: What Natural Groupings Exist in Our Data?

### 2A: Document type distribution per category

```sql
-- Overall type distribution
SELECT source_type, count(*) as total,
  round(count(*) * 100.0 / sum(count(*)) over(), 1) as pct
FROM documents
WHERE published_at >= '2022-01-01' AND published_at < '2023-01-01'
GROUP BY source_type
ORDER BY count(*) DESC;

-- Type distribution per category (Biden 2022 baseline)
SELECT category, source_type, count(*) as total
FROM documents
WHERE published_at >= '2022-01-01' AND published_at < '2023-01-01'
GROUP BY category, source_type
ORDER BY category, count(*) DESC;

-- Same for Trump 2025
SELECT category, source_type, count(*) as total
FROM documents
WHERE published_at >= '2025-01-20'
GROUP BY category, source_type
ORDER BY category, count(*) DESC;
```

### 2B: If an `action` field exists (or similar), what's in it?

```sql
-- This query depends on what Part 1A reveals
-- If there's an action or subtype column:
SELECT action, count(*) as total
FROM documents
GROUP BY action
ORDER BY count(*) DESC
LIMIT 50;

-- Action distribution per category
SELECT category, action, count(*)
FROM documents
WHERE published_at >= '2022-01-01' AND published_at < '2023-01-01'
GROUP BY category, action
ORDER BY category, count(*) DESC;
```

### 2C: What do document titles tell us about institutional function?

Titles follow conventions. Sample them to understand the patterns:

```sql
-- Sample titles per type for civilService
SELECT source_type, LEFT(title, 150) as title
FROM documents
WHERE category = 'civilService'
  AND published_at >= '2022-01-01' AND published_at < '2023-01-01'
ORDER BY random()
LIMIT 30;

-- Sample titles per type for fiscal
SELECT source_type, LEFT(title, 150) as title
FROM documents
WHERE category = 'fiscal'
  AND published_at >= '2022-01-01' AND published_at < '2023-01-01'
ORDER BY random()
LIMIT 30;

-- Sample titles per type for igs
SELECT source_type, LEFT(title, 150) as title
FROM documents
WHERE category = 'igs'
  AND published_at >= '2022-01-01' AND published_at < '2023-01-01'
ORDER BY random()
LIMIT 30;

-- Same three queries for Trump 2025 period
-- (to see if title conventions differ across administrations)
```

### 2D: For the catch-all types (especially "Notice"), what sub-patterns exist?

"Notice" is the type most likely to be too broad. Investigate what's inside it:

```sql
-- All Notice titles in civilService, Biden 2022
SELECT LEFT(title, 150) as title
FROM documents
WHERE category = 'civilService'
  AND source_type = 'Notice'
  AND published_at >= '2022-01-01' AND published_at < '2023-01-01'
ORDER BY random()
LIMIT 40;

-- Same for Trump 2025
SELECT LEFT(title, 150) as title
FROM documents
WHERE category = 'civilService'
  AND source_type = 'Notice'
  AND published_at >= '2025-01-20'
ORDER BY random()
LIMIT 40;
```

**What to look for**: Can you see natural sub-groups within Notice? Examples:

- Personnel actions ("Senior Executive Service; Membership," "Excepted Service," "Federal Salary Council")
- Information collection ("Agency Information Collection Activities; Submission for OMB Review")
- Meeting announcements ("Federal Prevailing Rate Advisory Committee; Open Committee Meeting")
- Policy guidance ("Guidance on...")
- Organizational changes ("Reorganization of...")

Are these groupings identifiable from the title alone? From the title + agency? Do they need additional metadata like `action` or `cfr_references`?

---

## Part 3: What Existing Taxonomies Could Inform Bucket Design?

### 3A: FR API's own `topics` field

```bash
# Check if the topics field exists and what it contains
curl -s "https://www.federalregister.gov/api/v1/documents?conditions[term]=workforce&per_page=5&fields[]=topics&fields[]=title&fields[]=type" | jq '.results[] | {title, type, topics}'
```

The FR API may have a pre-built topic taxonomy. If it does, examine whether those topics map to institutional functions or only to policy areas.

### 3B: CFR references as functional indicators

```bash
# Check if cfr_references are available and informative
curl -s "https://www.federalregister.gov/api/v1/documents?conditions[term]=workforce&per_page=5&fields[]=cfr_references&fields[]=title&fields[]=type" | jq '.results[] | {title, type, cfr_references}'
```

CFR parts map to specific areas of government activity. 5 CFR = government personnel. 2 CFR = grants and agreements. 48 CFR = federal acquisition. These could provide a deterministic functional classification for documents that reference specific CFR parts.

### 3C: Federal Register categories / sections

The Federal Register organizes documents into sections. Check whether this organizational structure provides functional grouping:

```bash
# Check available section/category fields
curl -s "https://www.federalregister.gov/api/v1/documents?conditions[type][]=NOTICE&per_page=5&fields[]=title&fields[]=type&fields[]=subtype&fields[]=action&fields[]=agencies" | jq '.results[] | {title, type, subtype, action, agencies: [.agencies[].name]}'
```

---

## Part 4: Cross-Administration Comparison of Type Distribution

This directly tests whether document type metadata is stable enough across administrations to serve as a functional baseline.

```sql
-- Compare type distributions between Biden 2022 and Trump 2025 for civilService
-- If the distributions are dramatically different, type alone reflects
-- policy priorities, not institutional function

-- Biden 2022
SELECT source_type, count(*) as biden_2022
FROM documents
WHERE category = 'civilService'
  AND published_at >= '2022-01-01' AND published_at < '2023-01-01'
GROUP BY source_type
ORDER BY count(*) DESC;

-- Trump 2025
SELECT source_type, count(*) as trump_2025
FROM documents
WHERE category = 'civilService'
  AND published_at >= '2025-01-20'
GROUP BY source_type
ORDER BY count(*) DESC;

-- If more granular fields are available (action, subtype),
-- run the same comparison at that level
```

**What to look for**: If Biden 2022 and Trump 2025 have similar type distributions (e.g., both are ~60% Notice, ~25% Rule, ~15% Proposed Rule), then type distribution is stable across administrations and a shift in it is meaningful. If the distributions are already very different, type may partially reflect policy priorities rather than pure institutional function.

---

## Deliverables

After running these queries, report:

### Finding 1: Metadata Inventory

- List every classification-relevant field available from the FR API
- Note which fields we currently store vs. don't store
- Note which fields are consistently populated vs. sparse

### Finding 2: Natural Groupings

- What sub-patterns exist within each document type, especially "Notice"?
- Can you identify candidate functional buckets from the data? Propose 5-10 bucket labels based on what you see.
- Are these groupings identifiable from stored metadata, or do they require reading the title/content?

### Finding 3: Assignability Assessment

For each candidate functional bucket, assess:

- What metadata signals identify it? (type + action + agency? title pattern? CFR reference?)
- What percentage of documents in that bucket are clearly identifiable from metadata alone?
- What percentage are ambiguous?
- Provide an overall ambiguity rate estimate: what percentage of all documents can be deterministically assigned to a functional bucket using available metadata?

### Finding 4: Cross-Administration Stability

- Does the type/function distribution differ significantly between Biden 2022 and Trump 2025?
- If it does, is the difference attributable to policy priorities (not useful for functional drift) or to genuine institutional posture change (useful)?

### Finding 5: Recommended Approach

Based on the data, recommend one of:

- **Metadata-only**: Document type + action + agency metadata is sufficient for functional classification. Specify the lookup/mapping rules.
- **Metadata + title heuristics**: Metadata handles most documents; title pattern matching resolves the ambiguous remainder. Specify what heuristics are needed.
- **Metadata + AI (Pass 1)**: Metadata handles a portion but too many documents are ambiguous. AI classification in Pass 1 is needed for reliable assignment. Estimate the ambiguity rate that would hit Pass 1.
- **Not feasible as a structural metric**: The data doesn't support reliable functional classification at any level. Recommend alternative approach for detecting institutional posture changes.

Include the raw query results so we can review the data directly.

---

## Notes for Claude Code

- This is a read-only investigation. Don't change any code or data.
- If some queries fail because columns don't exist, that's a finding — record it.
- If the FR API returns fields we're not storing, note what they are and whether they'd require a schema change to capture.
- Sample broadly — don't just look at civilService. Check at least 3 categories to see if patterns are consistent across categories or category-specific.
- The goal is data and assessment, not implementation. We need to make an architectural decision based on what the data actually shows.
