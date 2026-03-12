# Narrative Generation — Technical Specification

**Status**: Approved — ready for implementation
**Date**: 2026-03-11
**Source**: Claude.ai architectural review + Claude Code review of three narrative examples (ConfirmedConcern/civilService, Divergent/civilLiberties, Elevated/lawEnforcement) + weekly and term summary review
**Files affected**: `lib/services/narrative-prompts.ts`, `lib/services/narrative-queries.ts`, `lib/types/narrative.ts`

---

## 1. Problem Statement

The current narrative generation pipeline produces AI-generated analyses that are the most user-visible output of Democracy Monitor. Three structural problems were identified through review of production narratives:

1. **Length is inversely proportional to evidence.** Narratives with no P2-confirmed documents and empty L2 data are the longest (compensating with statistical exposition), while narratives with specific documents to cite are appropriately detailed. The civilLiberties Divergent narrative (900 words, zero P2 documents, empty L2) is longer than the civilService ConfirmedConcern narrative (800 words, 2 specific OPM rules with cited content).

2. **Narratives cannot distinguish pipeline failures from policy changes.** When civilLiberties dropped from 354 to 9 documents in a single week, the narrative speculated about policy changes and enforcement curtailment. The most likely explanation — a CourtListener source issue — was invisible because source health data is not available to the narrative pipeline.

3. **Weekly and term summaries recapitulate rather than synthesize.** The weekly expert summary restates category narratives instead of identifying cross-category patterns. The term summary spends paragraphs on this week's layer configuration rather than characterizing term-level trends. The elevated-count sequence (57 raw numbers) is unreadable.

---

## 2. Changes

### 2.1 Category-Week Narrative Prompts

All changes in `narrative-prompts.ts`, affecting the category-week narrative generation.

#### 2.1.1 Evidence-proportional length guidance

Add to the draft prompt instructions:

```
EVIDENCE-PROPORTIONAL LENGTH:
- If P2-confirmed documents are available with content: expert 500-800 words,
  public 300-500 words. Cite specific documents, explain mechanisms, provide
  counter-arguments.
- If NO P2-confirmed documents are available AND L2 data is empty: expert
  250-400 words, public 150-250 words. Focus on what is observable (structural
  pattern), what is unknown (why it's happening), and what would need to happen
  to confirm or disconfirm the signal. Do not pad with detailed statistical
  breakdowns that repeat information shown in the layer panels.
- If P2-confirmed documents exist but L2 data is partial: scale between
  these ranges proportionally.
```

#### 2.1.2 "Why this might matter" lead sentence

Add to the draft prompt instructions:

```
WHY THIS MIGHT MATTER:
Within the first two paragraphs, include a sentence connecting the observable
pattern to the democratic institution at stake. Use conditional language
("could affect", "may indicate", "might matter because").

Example: "This might matter because performance ratings that are harder to
challenge would become the primary factor in determining who keeps their job
during layoffs — a combination that could affect the political neutrality
protections the civil service system was designed to maintain."

This sentence should: name the observable fact, name the institution potentially
at risk, and use conditional rather than declarative language.
```

#### 2.1.3 Weighted counter-arguments

Replace the current counter-arguments instruction with:

```
COUNTER-ARGUMENTS:
Rank alternative explanations by plausibility. Lead with the most likely
alternative explanation. Do not list all possibilities with equal weight —
that communicates "we have no idea" rather than "here's what we think is most
likely and here's why." Limit to 2-3 alternative explanations for the public
version, 3-4 for the expert version.
```

#### 2.1.4 L2-empty transparency

Add to the draft prompt instructions:

```
L2 DATA AVAILABILITY:
If the AI assessment data (L2) is empty or missing, state this explicitly and
early: "This assessment is based on structural pattern detection only; no
individual document was analyzed for content." Treat this as a central framing
constraint, not a footnote caveat.
```

#### 2.1.5 Small-sample functional distribution caveat

Add to the draft prompt instructions:

```
SMALL SAMPLE SIZES:
If the document count for the week is below 20, note that functional
distribution shifts, type composition changes, and other proportional metrics
have limited diagnostic value due to the small sample size. A single document
entering or leaving the sample can shift percentages dramatically. Do not
devote more than one sentence to functional distribution analysis when the
sample is this small.
```

#### 2.1.6 GPT-4o evidence-sufficiency criterion

Add to the GPT-4o feedback prompt (Pass 2) a sixth evaluation criterion:

```
(f) Evidence sufficiency: Is the narrative substantially longer than the
evidence warrants? A narrative with no P2-confirmed documents and no L2 data
should not exceed 400 words for the expert version or 250 words for the public
version. If the draft exceeds these limits without P2/L2 evidence, flag this
as the primary feedback item.
```

### 2.2 Weekly Summary Prompts

All changes in `narrative-prompts.ts`, affecting `weeklyRequirements()` and `formatWeeklyCategoryBlocks()`.

#### 2.2.1 Word count reduction

Change weekly expert range from 400-800 to **300-500 words**.
Change weekly public range from 200-500 to **200-350 words**.

#### 2.2.2 Synthesize, don't recapitulate

Add to `weeklyRequirements()`:

```
SYNTHESIS REQUIREMENT:
Your job is cross-category synthesis, not category-by-category recapitulation.
The reader has access to individual category narratives — do not restate them.
Instead, identify:
(1) The system-level picture: how many categories elevated, which layers are
    most active, what's the overall posture
(2) Cross-category connections that individual narratives cannot see: are
    thematically adjacent categories co-elevated? Are structural signatures
    shared across unrelated categories?
(3) What changed from last week: delta in elevation count, which categories
    entered or exited elevated status
(4) What to watch: the key question for next week

Structure as 3-4 paragraphs, not 7 sections with horizontal rules.
```

#### 2.2.3 Zero-document coverage caveat

Modify `formatWeeklyCategoryBlocks()` to flag zero-document stable categories differently:

Current format:

```
civilLiberties: Stable, 0 documents, no structural or AI anomalies
```

New format:

```
civilLiberties: Stable, 0 documents (NO DATA — coverage gap or quiet week;
source health status: [healthy/degraded/unknown])
```

Add to `weeklyRequirements()`:

```
DATA AVAILABILITY:
If multiple categories show zero documents, flag this prominently in the
overview — not as a limitation footnote. Zero documents may mean "nothing
happened" (genuine stability) or "our pipeline didn't fetch anything" (coverage
gap). If source health data indicates any source issues, state this explicitly.
If source health data is unavailable, note that zero-document categories
cannot be confirmed as genuinely stable.
```

#### 2.2.4 "Why this might matter" for weekly pattern

Add to `weeklyRequirements()`:

```
WHY THIS MIGHT MATTER:
Within the first two paragraphs, include a sentence connecting the week's
cross-category pattern to institutional significance. Use conditional language.

Example: "Five categories elevated simultaneously after weeks of calm might
matter because coordinated multi-category activation can indicate system-wide
institutional pressure that individual category monitors cannot detect.
However, it can also reflect routine administrative rhythms."
```

### 2.3 Term Summary Prompts

All changes in `narrative-prompts.ts`, affecting `buildTermSummaryPrompt()`.

#### 2.3.1 Word count reduction

Change term expert range from 800-1500 to **600-1000 words**.
Change term public range from 500-1000 to **400-700 words**.

#### 2.3.2 Summarize trends, don't reproduce raw sequences

Add to term instructions:

```
RAW DATA SEQUENCES:
Do not reproduce raw weekly data sequences (e.g., "10 → 3 → 6 → 2 → 4 → ...").
The reader has the heatmap and timeline visualizations for this data. Instead,
summarize: "The elevated count peaked at 10 in Week 5, averaged 3.4 over the
term, and has ranged from 1-5 in recent weeks." Describe the shape of the
trajectory, not the individual data points.
```

#### 2.3.3 Critically evaluate previous summary framing

Add to term instructions:

```
CRITICAL EVALUATION:
When updating the term summary, critically evaluate the previous summary's
framing against this week's data. If new data contradicts a pattern described
in the previous summary, note the correction explicitly rather than silently
revising. If the previous summary's framing was based on incomplete or
potentially misleading data (e.g., a "monitoring scope crisis" that was
actually a pipeline issue), correct it with a note like: "The previous
summary's characterization of [X] has been revised based on [Y]."

Do not inherit framings uncritically from the previous summary. Each claim
in the updated summary should be justified by the current data.
```

#### 2.3.4 Term-level patterns, not this week's details

Add to term instructions:

```
TERM-LEVEL FOCUS:
The term summary characterizes the full term trajectory, not this week's details.
This week's specific layer configuration, individual document flags, and
category-specific details belong in the weekly summary, not here.

For layer analysis, characterize term-level patterns: "Over N weeks, L1 has been
the primary driver of elevations, with L2 corroborating in approximately X% of
elevated weeks. L3 has been in reinforcement-only mode since Week Y." Do not
spend more than 2-3 sentences on this week's specific layer activity.
```

#### 2.3.5 "Why this might matter" opening

Add to term instructions:

```
OPENING FRAMING (public version):
Begin with a 2-3 sentence paragraph that answers "why should I care about this
summary?" before diving into the arc. State what the system monitors, which
categories have been most persistently active, and what this week's reading is.

Example: "This monitoring system tracks whether the federal government's own
documentary record shows patterns consistent with democratic erosion across 14
institutional categories. Over N weeks of the current term, the most persistent
signals have appeared in [top 3-4 categories with activation rates]. This week,
[current state]."
```

### 2.4 Source Health Injection (Architecture Change)

Requires changes to `narrative-queries.ts` and `lib/types/narrative.ts`.

#### 2.4.1 Add source health to narrative context

Add `sourceHealthContext` field to `NarrativeLayerData` type:

```typescript
interface SourceHealthContext {
  sources: Array<{
    signalId: string;
    sourceType: string;
    status: 'healthy' | 'degraded' | 'silent' | 'unknown';
    lastSuccessAt: string | null;
    itemsThisWeek: number;
    expectedMinWeekly: number;
    errorMessage?: string;
  }>;
  overallStatus: 'healthy' | 'degraded' | 'critical';
  degradedSources: string[]; // human-readable list for prompt injection
}
```

#### 2.4.2 New query in narrative-queries.ts

```typescript
async function fetchSourceHealthForCategory(
  category: string,
  weekOf: string,
): Promise<SourceHealthContext>;
```

Queries `fetch_log` entries for the category's source signals during the target week. Summarizes into the structure above.

#### 2.4.3 Format for prompt injection

Add `formatSourceHealthSection()` to `narrative-prompts.ts`:

```
SOURCE HEALTH:
[If all sources healthy]: All data sources for this category reported normal
operation during this week.
[If degraded]: The following data sources reported issues during this week:
{source}: {status} — {errorMessage}. This may affect document volume and
should be considered when interpreting structural anomalies.
[If critical]: Multiple data sources failed during this week. Structural
anomalies may primarily reflect data availability issues rather than changes
in government activity.
```

Include in `collectDraftSections()` so it's part of the context for Pass 1.

### 2.5 Thematic Drift Interpretability (Architecture Change)

Requires changes to `narrative-queries.ts`.

#### 2.5.1 Nearest-to-centroid documents (baseline typical)

New query that retrieves the most representative documents from the baseline period:

```sql
SELECT title, url, published_at
FROM documents
WHERE category = $1
  AND published_at BETWEEN $rolling_window_start AND $rolling_window_end
  AND embedding IS NOT NULL
ORDER BY embedding <-> $rolling_centroid
LIMIT 10
```

Note: uses the rolling 8-week intra-admin centroid (computed on the fly by averaging week centroids from `computeWeekCentroid()` for the prior 8 weeks), not the cross-admin baseline centroid.

#### 2.5.2 Furthest-from-centroid documents (drift drivers)

```sql
SELECT title, url, published_at
FROM documents
WHERE category = $1
  AND week_of = $current_week
  AND embedding IS NOT NULL
ORDER BY embedding <-> $rolling_centroid DESC
LIMIT 5
```

#### 2.5.3 Prompt injection

Add to the draft prompt when L3 data is available:

```
THEMATIC CONTEXT:
Typical recent documents in this category (most representative of the
8-week rolling norm): [titles]

This week's documents most divergent from the recent norm: [titles]

If the L3 thematic drift score is elevated, characterize the nature of the
shift by comparing these two sets. What topics appear in the drift-driving
documents that are absent from the typical set? What topics from the typical
set are missing this week?
```

---

## 3. Implementation Priority

### Phase 1: Prompt changes only (no code changes to data pipeline)

Ship immediately. All changes to `narrative-prompts.ts`.

| Item                                  | Section | Effort |
| ------------------------------------- | ------- | ------ |
| Evidence-proportional length          | 2.1.1   | Small  |
| "Why this might matter" (category)    | 2.1.2   | Small  |
| Weighted counter-arguments            | 2.1.3   | Small  |
| L2-empty transparency                 | 2.1.4   | Small  |
| Small-sample caveat                   | 2.1.5   | Small  |
| GPT-4o evidence-sufficiency criterion | 2.1.6   | Small  |
| Weekly word count reduction           | 2.2.1   | Small  |
| Synthesize instruction                | 2.2.2   | Small  |
| Weekly "why this might matter"        | 2.2.4   | Small  |
| Term word count reduction             | 2.3.1   | Small  |
| Summarize trends instruction          | 2.3.2   | Small  |
| Critical evaluation instruction       | 2.3.3   | Small  |
| Term-level focus instruction          | 2.3.4   | Small  |
| Term opening framing                  | 2.3.5   | Small  |

### Phase 2: Data pipeline changes

Requires changes to `narrative-queries.ts`, `NarrativeLayerData` type, and `narrative-prompts.ts`.

| Item                                               | Section | Effort |
| -------------------------------------------------- | ------- | ------ |
| Source health injection                            | 2.4     | Medium |
| Zero-document coverage caveat (with source health) | 2.2.3   | Medium |
| Thematic drift nearest-neighbor queries            | 2.5     | Medium |

---

## 4. Validation Tests

### 4.1 Category-Week Narrative Tests

Run each test by generating a narrative for the specified category-week and evaluating the output against the criteria.

#### T-NAR-1: Evidence-proportional length (data-rich)

**Input**: Category-week with ≥2 P2-confirmed documents and populated L2 data (e.g., civilService week of 2026-03-09).
**Pass criteria**:

- Expert narrative: 500-800 words
- Public narrative: 300-500 words
- Narrative cites specific documents by title
- Narrative explains a mechanism (how documents interact or what institutional vulnerability they create)

#### T-NAR-2: Evidence-proportional length (data-poor)

**Input**: Category-week with 0 P2-confirmed documents and empty L2 data (e.g., civilLiberties week of 2026-03-02).
**Pass criteria**:

- Expert narrative: 250-400 words
- Public narrative: 150-250 words
- Narrative does NOT contain more than one paragraph of z-score exposition
- Narrative does NOT list more than 3 alternative explanations

#### T-NAR-3: "Why this might matter" presence

**Input**: Any Elevated+ category-week.
**Pass criteria**:

- The phrase "might matter" or "could matter" or "may indicate" or equivalent conditional framing appears within the first two paragraphs of both expert and public versions
- The sentence names a specific democratic institution or protection (not generic "democratic norms")

#### T-NAR-4: L2-empty transparency

**Input**: Category-week where L2 AI Detail is `{}`.
**Pass criteria**:

- Expert narrative contains a sentence within the first three paragraphs stating that no content analysis was performed (e.g., "based on structural pattern detection only" or "no individual document was analyzed for content")
- The sentence appears as part of the framing, not buried in the limitations section

#### T-NAR-5: Small-sample functional distribution

**Input**: Category-week with fewer than 20 documents.
**Pass criteria**:

- Functional distribution analysis is limited to 1-2 sentences maximum
- If functional distribution is discussed, the small sample size is noted
- The narrative does NOT devote a full paragraph to percentage shifts in functional categories

#### T-NAR-6: Weighted counter-arguments

**Input**: Any Elevated+ category-week.
**Pass criteria**:

- Counter-arguments section presents explanations in order of plausibility (most likely first)
- Public version has 2-3 alternatives, expert version has 3-4
- Counter-arguments are NOT listed as equal-weight bullet points or numbered items without prioritization

#### T-NAR-7: GPT-4o evidence-sufficiency feedback

**Input**: Category-week with 0 P2 documents and empty L2 data, where Pass 1 draft exceeds 400 words (expert).
**Pass criteria**:

- GPT-4o feedback (Pass 2) identifies the length-to-evidence mismatch
- The feedback references the evidence-sufficiency criterion specifically
- Pass 3 revision reduces the expert narrative below 400 words

### 4.2 Weekly Summary Tests

#### T-NAR-8: Synthesis, not recapitulation

**Input**: Weekly summary for a week with 3+ elevated categories, each having individual narratives.
**Pass criteria**:

- Weekly expert summary is 300-500 words
- Weekly public summary is 200-350 words
- Summary does NOT contain per-category sections that restate the category narrative
- Summary DOES identify at least one cross-category pattern (thematic adjacency, shared structural signatures, or synchrony observation)

#### T-NAR-9: Zero-document coverage flagging

**Input**: Weekly summary for a week where 5+ categories have zero documents.
**Pass criteria**:

- The zero-document situation is mentioned in the first two paragraphs, not only in limitations
- If source health data shows degraded sources, the specific sources are named
- The summary does NOT characterize zero-document categories as "confirmed stable" or "no concerns"

#### T-NAR-10: Weekly "why this might matter"

**Input**: Any weekly summary with 3+ elevated categories.
**Pass criteria**:

- A "why this might matter" sentence appears within the first two paragraphs
- The sentence references the cross-category pattern (not an individual category)
- Conditional language is used

### 4.3 Term Summary Tests

#### T-NAR-11: Term-level focus

**Input**: Term summary updated with a new week's data.
**Pass criteria**:

- The Layer Architecture section (if present) characterizes term-level patterns in 2-3 sentences maximum
- The section does NOT describe this specific week's layer configuration in detail
- Cumulative statistics (activation rates, peak severity counts) are present

#### T-NAR-12: No raw data sequences

**Input**: Term summary for a term with 50+ weeks.
**Pass criteria**:

- No raw weekly sequences of more than 10 values appear (e.g., "10 → 3 → 6 → 2 → ...")
- Trajectory is described in summary form ("peaked at X in Week Y, averaged Z, currently at W")

#### T-NAR-13: Critical evaluation of previous framing

**Input**: Term summary where the previous summary contained a framing based on stale or incorrect data (e.g., "monitoring scope crisis" from pipeline gap).
**Pass criteria**:

- The updated summary does NOT silently inherit the previous framing
- If the framing is revised, the revision is noted explicitly (e.g., "The previous summary's characterization of X has been revised based on Y")
- If the framing is still supported by current data, it is restated with current evidence

#### T-NAR-14: Term summary word count

**Input**: Any term summary.
**Pass criteria**:

- Expert version: 600-1000 words
- Public version: 400-700 words

#### T-NAR-15: Opening framing (public)

**Input**: Term summary public version.
**Pass criteria**:

- First 2-3 sentences answer "why should I care about this summary"
- The opening names the system's purpose, the most persistently active categories (with activation rates), and the current week's state
- The opening does NOT dive directly into this week's details

### 4.4 Source Health Integration Tests

These tests are for Phase 2 implementation only.

#### T-NAR-16: Source health context available

**Input**: Category-week where at least one source reported errors during the week.
**Pass criteria**:

- `NarrativeLayerData.sourceHealthContext` is populated with non-null data
- `degradedSources` array contains the affected source(s)
- The draft prompt includes the formatted source health section

#### T-NAR-17: Pipeline issue narrative

**Input**: Category-week with >80% volume drop from baseline AND source health showing degraded/silent sources.
**Pass criteria**:

- The narrative leads with the source health issue as the primary explanation
- The narrative does NOT speculate about policy changes as the leading hypothesis
- The narrative states which specific sources were affected and what errors occurred

#### T-NAR-18: Genuine volume drop narrative

**Input**: Category-week with >50% volume drop from baseline AND source health showing all sources healthy.
**Pass criteria**:

- The narrative does NOT attribute the drop to pipeline issues
- The narrative treats the volume drop as a potentially meaningful signal
- Source health is mentioned as "all sources reporting normally" to confirm the drop is real

### 4.5 Thematic Drift Interpretability Tests

These tests are for Phase 2 implementation only.

#### T-NAR-19: Drift characterization with context

**Input**: Category-week where L3 thematic drift z-score > 3.0, with typical and drift-driving document titles available.
**Pass criteria**:

- The narrative describes the thematic shift in plain language (e.g., "shifted from enforcement language toward procedural language" or "narrowed from broad civil rights topics to immigration detention specifically")
- The description references specific document titles from both the typical and drift-driving sets
- The narrative does NOT simply report the z-score and centroid distance without interpretation

#### T-NAR-20: No drift context available

**Input**: Category-week where L3 data is empty or bootstrap mode.
**Pass criteria**:

- The narrative does NOT attempt to characterize a thematic shift it cannot measure
- If L3 is mentioned, it notes that thematic drift data is unavailable for this week

---

## 5. Test Execution

### Automated validation

Tests T-NAR-1 through T-NAR-7 and T-NAR-14 can be partially automated:

- Word count checks against the specified ranges
- Presence checks for key phrases ("might matter", "structural pattern detection only", etc.)
- Section count checks (no more than N paragraphs on topic X)

### Manual validation

Tests requiring qualitative judgment (T-NAR-3 quality of institutional naming, T-NAR-6 plausibility ordering, T-NAR-13 critical evaluation quality) require human review of generated output.

### Regression testing

After prompt changes are shipped, regenerate narratives for the three example category-weeks (civilService ConfirmedConcern 2026-03-09, civilLiberties Divergent 2026-03-02, lawEnforcement Elevated 2026-03-02) and compare against the pre-change versions. The civilService narrative should remain high-quality (it was already good). The civilLiberties and lawEnforcement narratives should be substantially shorter, lead with data availability caveats, and avoid extended statistical exposition.

---

## 6. Success Metrics

After Phase 1 prompt changes:

- Average narrative word count for data-poor category-weeks (0 P2 docs, empty L2) drops by ≥40%
- All Elevated+ narratives contain "why this might matter" framing within first two paragraphs
- Weekly expert summaries average 300-500 words (down from ~700)
- Term summaries contain no raw data sequences longer than 10 values
- GPT-4o feedback identifies evidence-sufficiency issues in ≥80% of data-poor drafts

After Phase 2 pipeline changes:

- Category-week narratives for weeks with degraded sources correctly attribute volume drops to pipeline issues
- L3-elevated narratives characterize thematic shift in plain language using document title comparison
- Zero-document weekly categories display source health status rather than "no anomalies"
