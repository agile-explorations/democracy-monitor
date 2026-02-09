# Democracy Monitor — Design Review Document

## Purpose of This Document

This document describes the full architecture, methodology, and data pipeline of Democracy Monitor, a system that tracks signals of executive-power centralization across U.S. government institutions. It is intended for external review by AI systems (ChatGPT, Claude, Gemini) to assess the project's potential for producing valid and useful results, and to suggest improvements.

**The core question**: Can this system reliably detect, measure, and track institutional change over time using publicly available government data, keyword analysis, semantic embeddings, and AI assessment?

---

## 1. What the System Does

Democracy Monitor is a web dashboard that:

1. **Ingests** documents from the Federal Register API, government RSS feeds, White House press releases, and GDELT media articles
2. **Scores** each document using keyword dictionaries organized by severity tier
3. **Aggregates** per-document scores into weekly and cumulative metrics per category
4. **Detects** cross-cutting authoritarian infrastructure patterns (detention, surveillance, criminalization) across categories
5. **Tracks** rhetoric vs. action divergence across 5 policy areas
6. **Visualizes** institutional health trajectories from inauguration day (Jan 20, 2025) forward
7. (Future) **Compares** government actions against Project 2025 proposals to measure implementation, detect escalation, and anticipate upcoming actions

The system produces **four independent analytical layers**, each answering a different question:

| Layer                          | Question                                              | Method                                                |
| ------------------------------ | ----------------------------------------------------- | ----------------------------------------------------- |
| **Category Assessment**        | Is this institution healthy right now?                | Keyword severity scoring + AI                         |
| **Infrastructure Overlay**     | Are authoritarian infrastructure patterns converging? | Cross-category keyword scan                           |
| **Rhetoric → Action Tracking** | Is rhetoric translating into policy?                  | Separate keyword dictionaries for rhetoric vs. action |
| **Historical Trajectory**      | How has institutional health changed over time?       | Weekly scoring with cumulative views                  |

---

## 2. Monitored Categories (11 total)

Each category represents an institutional dimension of democratic governance. Categories define **signals** — URLs pointing to specific Federal Register API queries, RSS feeds, or HTML pages.

| Category Key       | Title                              | Signal Sources                                                                                | What It Tracks                                                        |
| ------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `civilService`     | Government Worker Protections      | OPM (FR), Schedule F search (FR)                                                              | Civil service neutrality, merit system protections, political firings |
| `fiscal`           | Spending Money Congress Approved   | GAO Reports (RSS), Impoundment (FR)                                                           | Congressional power of the purse, illegal impoundment                 |
| `igs`              | Government Watchdogs (IGs)         | Oversight.gov (HTML), SSA OIG (RSS)                                                           | Inspector General independence, oversight infrastructure              |
| `hatch`            | Keeping Politics Out of Government | Hatch Act (FR), Special Counsel (FR)                                                          | Political activity restrictions for federal employees                 |
| `courts`           | Following Court Orders             | SCOTUS Opinions (RSS), Court Compliance (FR), Judicial Nominations (FR), Court Structure (FR) | Judicial compliance, court packing, jurisdiction stripping            |
| `military`         | Using Military Inside the U.S.     | DoD News (RSS), Military Contracts (RSS), Emergency Powers (FR)                               | Posse Comitatus, Insurrection Act, IEEPA, national emergencies        |
| `rulemaking`       | Independent Agency Rules           | New Rules (FR), Proposed Rules (FR)                                                           | Independent agency autonomy, centralized regulatory control           |
| `indices`          | Executive Power Volume             | Presidential Actions (FR), All New Regulations (FR)                                           | Volume and pace of executive actions                                  |
| `infoAvailability` | Information Availability           | Gov Site Uptime (JSON), GAO Reports (RSS)                                                     | Government website accessibility, transparency infrastructure         |
| `elections`        | Free and Fair Elections            | Election Assistance Commission (FR), Election Admin Rules (FR)                                | Election administration independence, voter access                    |
| `mediaFreedom`     | Press Freedom                      | Press & FOIA Rules (FR), FOIA Compliance (FR)                                                 | Press access, FOIA compliance, independent media threats              |

**Primary data source**: The Federal Register API (federalregister.gov/api/v1) — the official daily journal of the U.S. government. It publishes every executive order, rule, proposed rule, and notice. This is the most complete and reliable source of government actions.

**Supplementary sources**: GAO reports, SCOTUS opinions, DoD news, White House briefing room archive, GDELT media articles.

---

## 3. Keyword Dictionaries & Severity Tiers

### 3a. Category Assessment Keywords

Each category has keywords organized into three severity tiers:

- **Capture** (weight: 3): Explicit legal violations, institutional collapse, systematic override of statutory constraints
- **Drift** (weight: 2): Structural changes weakening protections, pattern of resistance to oversight
- **Warning** (weight: 1): Isolated incidents, investigations opened, elevated but potentially normal activity

Keywords are matched using **word-boundary-aware regex** (`\bkeyword\b`, case-insensitive) to prevent substring false positives (e.g., "mass" matching "Massachusetts").

Keywords are matched against **document title + summary only** — editorial notes and source metadata are excluded to prevent self-fulfilling assessments.

**Full keyword dictionary** (all 11 categories):

#### civilService

- **Capture**: schedule f, excepted schedule f, mass termination, mass removal, political appointee conversion, title 5 exemption, merit system violation, violated civil service protections, unlawful termination, systematic purge, political loyalty test, removed for political reasons
- **Drift**: reclassification, excepted service, policy-influencing position, career staff removed, reduced career positions, political control over hiring, at-will employment, bypassing merit system, categorical exclusion
- **Warning**: workforce reduction, reorganization, senior executive service, position eliminated, restructuring

#### fiscal

- **Capture**: violated impoundment control act, illegal impoundment, unlawful withholding, anti-deficiency act violation, gao decision, violated appropriations law, illegal rescission, unconstitutional refusal, contempt for withholding
- **Drift**: deferral, apportionment withheld, rescission, budget authority withheld, refused to obligate, selective implementation, funding freeze, impoundment, delayed obligation
- **Warning**: funding delay, obligation rate, apportionment, spend plan

#### igs

- **Capture**: inspector general removed, ig fired, ig terminated without cause, mass ig removal, defunded inspector general, eliminated ig office, systematic obstruction of oversight, ig independence violated
- **Drift**: acting inspector general, ig vacancy, funding cut to oversight, obstruction of investigation, denied access, ig report suppressed, oversight.gov, lack of apportionment, delayed ig appointment, restricted ig authority
- **Warning**: independence concern, access delayed, report delayed, investigation pending

#### hatch

- **Capture**: hatch act violation found, systematic hatch act violations, osc enforcement suspended, defunded office of special counsel, violated hatch act, osc found violation, unlawful partisan activity
- **Drift**: multiple hatch act violations, repeated partisan messaging, official channels for campaign, political activity in office, pattern of violations, weakened enforcement
- **Warning**: hatch act complaint, osc investigation, alleged violation, partisan communication

#### courts

- **Capture**: contempt of court, defied court order, refused to comply, violated injunction, ignored court ruling, non-compliance with order, contempt citation, willful violation of court order, jurisdiction stripped, court packing, abolished court, eliminated judicial review
- **Drift**: delayed compliance, partial compliance, slow-walking court order, emergency stay sought, appealing for delay, minimal compliance, procedural objections to compliance, judicial vacancy unfilled, court expansion proposal, forum shopping, judge reassignment
- **Warning**: injunction issued, preliminary injunction, temporary restraining order, court ordered, judicial review, judicial nomination, circuit court vacancy, appointment pace

#### military

- **Capture**: insurrection act invoked, martial law declared, military occupation, troops deployed domestically, military law enforcement, suspended habeas corpus, IEEPA invoked, national emergency declared for domestic, insurrection act preparations, emergency powers expanded
- **Drift**: domestic military deployment, law enforcement role for military, posse comitatus, preparing to invoke insurrection act, military on standby, federalized national guard, emergency declaration renewed, IEEPA authority cited, emergency powers invoked, national emergency extended
- **Warning**: national guard activated, border deployment, title 32 activation, state request for troops, emergency authority review, IEEPA compliance, national emergency renewal

#### rulemaking

- **Capture**: independent agency overridden, executive order supremacy over statute, violated apa, unlawful regulatory action, exceeded statutory authority, unconstitutional rule
- **Drift**: white house review required, oira clearance expanded, regulatory freeze, independent agency subject to review, centralized regulatory control, political clearance required
- **Warning**: significant increase in rules, review backlog, regulatory agenda, notice and comment

#### indices

- **Capture**: democracy downgrade, authoritarian shift, democratic decline, rule of law erosion, institutional collapse
- **Drift**: declining democratic score, erosion of norms, weakening checks, executive aggrandizement, institutional degradation
- **Warning**: concern raised, watchlist, monitoring situation, potential risk

#### infoAvailability

- **Capture**: website removed, data deleted, reports suppressed, foia denied, transparency blocked, records destroyed, website shutdown, portal defunded, data purged
- **Drift**: website offline, reports delayed, data unavailable, reduced transparency, foia backlog, publication halted, content removed, report missing, access restricted
- **Warning**: site maintenance, temporary outage, publication delayed, scheduled downtime, data migration

#### elections

- **Capture**: election official removed, election board replaced, voting suspended, election results overturned, ballots destroyed, election certification blocked
- **Drift**: voter roll purge, polling location closed, ballot restriction, reduced early voting, voter suppression, mail-in ballot restriction, ballot drop box removed, election official threatened
- **Warning**: election challenge, recount demanded, fraud allegation, voter ID requirement, election audit

#### mediaFreedom

- **Capture**: journalist arrested, newsroom raided, press banned, reporter imprisoned, broadcast license revoked, media outlet shut down
- **Drift**: press credentials revoked, FOIA denied, reporter subpoenaed, source surveillance, press pool restricted, public records classified, defunded public broadcasting
- **Warning**: press access limited, FOIA delayed, FOIA backlog increase, press briefing cancelled, journalist subpoena

### 3b. Volume Thresholds

Some categories also have document-count thresholds that trigger status changes when unusually high activity is detected, even without keyword matches:

| Category         | Warning | Drift | Capture |
| ---------------- | ------- | ----- | ------- |
| civilService     | 5       | 10    | 20      |
| fiscal           | 2       | 5     | 10      |
| igs              | 2       | 4     | 8       |
| hatch            | 3       | 6     | 12      |
| courts           | 5       | 10    | 15      |
| military         | 3       | 6     | 10      |
| rulemaking       | 50      | 100   | 200     |
| infoAvailability | 1       | 3     | 5       |
| elections        | 3       | 6     | 12      |
| mediaFreedom     | 2       | 5     | 10      |

---

## 4. Scoring Methodology

### 4a. Current Batch Assessment (Status Levels)

The existing `analyzeContent()` function processes all documents for a category as a batch and produces a categorical status:

1. Match all documents against keyword dictionaries (capture/drift/warning)
2. Deduplicate keyword matches
3. Apply corroboration requirements:
   - 2+ capture matches → **Capture**
   - 1 capture match → **Drift** (needs corroboration)
   - 2+ drift matches → **Drift**
   - 1 drift match → **Warning**
   - Warning matches only → **Warning**
   - No matches, sufficient data → **Stable**
   - Insufficient data → **Warning** with explanation
4. Authority weighting: matches from GAO, courts, or IGs are annotated as "authoritative source"
5. Pattern language escalation: if drift keywords co-occur with "systematic", "unprecedented", "pattern of", "multiple", or "repeated", they escalate to capture tier

**Limitation**: This produces a categorical label (Stable/Warning/Drift/Capture) but not a numerical score. It operates on the full batch, so we can't tell which specific document contributed to the assessment.

### 4b. Proposed Per-Document Scoring (New)

To enable experimentation with different aggregation methods, we plan to score each document individually and store the raw results:

**Score A — Keyword Severity Score** (per document):

```
severityA = (capture_matches × 3) + (drift_matches × 2) + (warning_matches × 1)
```

A document with 1 capture keyword and 2 warning keywords scores: 3 + 0 + 2 = 5.

**Score B — Volume-Weighted Severity Mix** (per week):

```
scoreB = (capture_proportion × 3) + (drift_proportion × 2) + (warning_proportion × 1)
```

Where proportions are the fraction of total keyword matches at each tier. This measures the severity composition of a week's activity.

**Score C — Semantic Drift** (current week only, requires embeddings):

Cosine distance between the current week's average document embedding and a Biden-era baseline centroid:

```
semanticDrift = 1 - cosineSimilarity(weekCentroid, baselineCentroid)
```

Range: 0 (identical to baseline) to 1 (orthogonal). Measures how much the language of government documents has changed relative to a "normal governance" baseline.

**Score E — AI Assessment** (current week only, requires API key):

An LLM (Claude or GPT-4) reads the top 20 documents with RAG-retrieved content and produces:

- A status level (Stable/Warning/Drift/Capture)
- A confidence score (0-1)
- Reasoning, evidence for/against, and counter-arguments
- The keyword engine is authoritative; AI provides depth and nuance

### 4c. Cumulative Tracking (Proposed)

From weekly per-document scores, compute three cumulative views:

1. **Running Sum**: Monotonically increasing total of weekly severity scores. Shows total institutional stress accumulated since inauguration. Never decreases — captures the idea that institutional damage accumulates even if current-week activity is low.

2. **Running Average**: Mean of all weekly scores so far. Can rise or fall. Shows whether the average week is getting better or worse. Less sensitive to individual spikes.

3. **High-Water Mark + Current**: The maximum weekly score ever recorded alongside the current week's score. Shows the peak of concern and where we are relative to it.

### 4d. Baseline

**Biden administration baseline** (Nov 1, 2024 — Jan 19, 2025):

Instead of using early Trump weeks (which would conflate the beginning of the phenomenon we're trying to measure with the baseline), we use the last ~11 weeks of the Biden administration as a "normal governance" reference point.

For each category, the baseline stores:

- Average weekly Score A during the baseline period
- Average weekly Score B during the baseline period
- Average documents per week during the baseline period
- Embedding centroid (mean of all document embeddings) — for semantic drift measurement

**Concern**: The Biden lame-duck period may not be representative of "normal governance." Executive activity typically slows in the final weeks. This could make the baseline artificially low, causing subsequent activity to appear more alarming than it is.

**Mitigation**: We could extend the baseline further back (e.g., Jan 2024 — Jan 2025) or use the Biden full-term average if historical data is available. The system stores the raw baseline parameters, so they can be recalibrated.

---

## 5. Rhetoric vs. Action Tracking

### 5a. Intent Keywords

Separate keyword dictionaries track **rhetoric** (what officials say) and **actions** (what the government does) across 5 policy areas:

| Policy Area                    | Sample Rhetoric Keywords                                          | Sample Action Keywords                                                              |
| ------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Rule of Law**                | "above the law", "total immunity", "witch hunt", "weaponized DOJ" | "defied court order", "pardoned allies", "fired investigators"                      |
| **Civil Liberties**            | "enemy of the people", "lock them up", "enemy within", "vermin"   | "detained without charge", "mass deportation", "surveilled journalists"             |
| **Elections**                  | "rigged election", "stolen election", "cancel the election"       | "replaced election officials", "purged voter rolls", "restricted early voting"      |
| **Media Freedom**              | "fake news", "revoke licenses", "sue the media"                   | "revoked press credentials", "blocked FOIA", "raided newsroom"                      |
| **Institutional Independence** | "fire them all", "deep state", "drain the swamp", "my generals"   | "fired inspector general", "schedule f implemented", "bypassed senate confirmation" |

Each policy area has both **authoritarian** keywords (positive score, toward power concentration) and **democratic** keywords (negative score, toward rule of law).

### 5b. Rhetoric Sources

| Source                           | Type                            | Access                | Historical Coverage            |
| -------------------------------- | ------------------------------- | --------------------- | ------------------------------ |
| **Federal Register**             | Action                          | API (free, unlimited) | Full archive (1994-present)    |
| **White House Briefing Room**    | Rhetoric                        | HTML scraping         | Current administration archive |
| **GDELT**                        | Media coverage (rhetoric proxy) | API (free)            | Full archive                   |
| **C-SPAN transcripts**           | Rhetoric                        | API (future)          | Full archive                   |
| **GovInfo Congressional Record** | Rhetoric (legislative)          | API (future)          | Full archive                   |

### 5c. Rhetoric → Action Trajectory

The system can detect when rhetoric themes translate into policy actions over time. For example:

- Week 1: "designate as terrorists" appears in rhetoric
- Week 8: "detained without charge" appears in action feeds
- This pattern suggests rhetoric is being operationalized

Currently tracked via separate keyword dictionaries. Future enhancement: semantic similarity between rhetoric and action document embeddings.

---

## 6. Authoritarian Infrastructure Overlay

### 6a. Concept

Three cross-cutting themes are monitored across all 11 categories. Items stay in their home categories; the infrastructure layer is a **cross-cutting analytical lens** that detects when authoritarian capacity is being built across multiple institutional domains simultaneously.

### 6b. Three Themes

**Detention & Incarceration** (28 keywords):
detention facility, detention center, detention capacity, facility construction, facility expansion, CoreCivic, GEO Group, private prison, ICE processing, CBP processing, immigration detention, expedited removal, removal proceedings, holding facility, emergency detention, military detention, tent city, temporary detention, internment, custody capacity, bed space, detention contract, detention beds, processing center, deportation flight, removal flight, detention facility award, migrant facility, family detention, mass detention

**Surveillance Apparatus** (27 keywords):
biometric database, biometric collection, facial recognition, social media monitoring, social media surveillance, data broker, cell-site simulator, stingray, bulk collection, mass surveillance, ALPR, license plate reader, predictive policing, surveillance contract, surveillance technology, phone tracking, location data, geofence warrant, tower dump, electronic surveillance, wiretap, FISA, section 702, metadata collection, data retention, monitoring program, intelligence sharing, fusion center, real-time tracking, AI surveillance

**Criminalization of Opposition** (27 keywords):
political prosecution, selective prosecution, domestic terrorist, domestic terrorism designation, protest criminalization, material support charge, enhanced penalties, RICO charge, conspiracy charge, seditious conspiracy, insurrection charge, targeting activists, targeting protesters, protest suppression, dissent criminalized, opposition investigated, political opponent charged, weaponized prosecution, retaliatory investigation, grand jury targeting, subpoena targeting, asset forfeiture political, tax-exempt status revoked, nonprofit investigation, debanking, financial penalty political, enemy of the people, designated organization, watchlist political, no-fly list political

### 6c. Convergence Detection

- **None** (0 themes active): "No authoritarian infrastructure patterns detected"
- **Emerging** (1 theme active): One dimension of infrastructure building is underway
- **Convergent** (2+ themes active): Multiple authoritarian infrastructure dimensions are developing simultaneously — the most concerning state

A theme is "active" when it has >= 2 keyword matches across any categories (the activation threshold).

---

## 7. Project 2025 Comparison (Future Phase)

### 7a. Concept

Project 2025 is a 920-page policy blueprint published by the Heritage Foundation. It provides a declared-intent baseline against which actual government actions can be measured.

### 7b. Planned Approach

1. **Extract** ~200-400 discrete policy proposals from the PDF using AI (Claude, chapter by chapter)
2. **Tag** each proposal with: target agency, dashboard category, policy area, severity
3. **Embed** each proposal using the same embedding model as documents
4. **Match** incoming government documents against proposals using cosine similarity (threshold ~0.7)
5. **Track** implementation status: not_started → in_progress → implemented → exceeded → abandoned

### 7c. Three Analytical Outputs

1. **Implementation scoreboard**: "X% of P2025 proposals implemented across Y categories"
2. **Escalation detector**: Actions that go beyond what P2025 proposed (scope expansion)
3. **Predictive watch list**: Unimplemented proposals ordered by rhetoric signal strength

---

## 8. Embedding & Semantic Analysis

### 8a. Embedding Model

- **Provider**: OpenAI text-embedding-ada-002 (via `openai` npm SDK)
- **Dimensions**: 1536
- **Storage**: pgvector extension in PostgreSQL
- **Cost**: ~$0.0001 per 1K tokens

### 8b. Current Uses

- **RAG retrieval**: When AI assessment runs, the system retrieves the top-K most semantically similar documents to enrich the AI prompt with actual document content (not just titles)
- **Document clustering**: The `semantic_clusters` table supports grouping related documents

### 8c. Proposed Use: Semantic Drift Measurement

Compute the average embedding of all documents in a category for a given week. Compare to the Biden-era baseline centroid using cosine similarity. The distance measures how much the language of government documents has shifted.

**Open questions**:

- Is ada-002 suitable for measuring institutional language drift, or would a domain-specific model perform better?
- What is the expected range of cosine distances for "normal" week-to-week variation? Without calibration data, raw distances may be hard to interpret.
- Should semantic drift be computed per-category or across all categories aggregated?

---

## 9. Tech Stack

| Component     | Technology                   | Purpose                                        |
| ------------- | ---------------------------- | ---------------------------------------------- |
| Framework     | Next.js 14 (Pages Router)    | Server-side API routes + client-side rendering |
| Language      | TypeScript (strict mode)     | Type safety                                    |
| UI            | Tailwind CSS + Recharts      | Styling + data visualization                   |
| Database      | PostgreSQL + pgvector        | Document storage, assessments, embeddings      |
| ORM           | Drizzle ORM                  | Type-safe SQL queries + migrations             |
| Cache         | Redis (in-memory fallback)   | API response caching (10 min TTL)              |
| AI Providers  | OpenAI + Anthropic           | Embeddings (OpenAI) + assessment (either)      |
| RSS Parsing   | xml2js                       | Government RSS feed parsing                    |
| HTML Scraping | cheerio                      | White House briefing room archive              |
| Media Data    | GDELT DOC 2.0 API            | Media article search                           |
| Testing       | Vitest + jsdom               | Unit tests (176 passing)                       |
| Linting       | ESLint + Prettier + OpenGrep | Code quality + custom pattern rules            |
| Deployment    | Render.com                   | Web service + PostgreSQL + Redis + cron        |

### Data Pipeline

```
Federal Register API ─────────┐
GAO/SCOTUS/DoD RSS feeds ─────┤
White House archive (scrape) ──┤──→ documents table ──→ per-document scoring ──→ weekly_scores
GDELT API ─────────────────────┘                      ──→ keyword assessment  ──→ assessments
                                                      ──→ AI assessment       ──→ assessments
                                                      ──→ embeddings          ──→ semantic drift
```

---

## 10. Known Limitations & Risks

### 10a. False Positives

- **Keyword matching is context-blind**: "court packing" in a news article discussing historical events would trigger the same score as an actual court-packing proposal. No negation detection ("no evidence of purge" still matches "purge").
- **Volume thresholds are static**: A surge in Federal Register activity during regulatory reform could trigger drift even if the content is benign.
- **Federal Register bias**: The system is heavily weighted toward documents published in the Federal Register. Actions taken through informal channels, executive memos, or verbal directives are invisible.

### 10b. False Negatives

- **Slow-motion capture**: Gradual institutional degradation through personnel changes, budget cuts, and procedural manipulation may not generate detectable keywords.
- **Novel tactics**: Actions without historical precedent may not match any keyword in the dictionary.
- **Non-FR actions**: Many impactful actions (informal pressure, personnel decisions, classified orders) never appear in the Federal Register.

### 10c. Methodological Concerns

- **Keyword dictionary bias**: The dictionaries were written by the developer, not by political scientists, constitutional lawyers, or domain experts. They may reflect implicit assumptions about what constitutes democratic erosion.
- **Severity tier assignments are subjective**: Why is "voter roll purge" drift-tier and not capture-tier? These judgments significantly affect scores but aren't empirically grounded.
- **No inter-rater reliability testing**: The keyword dictionaries haven't been validated against expert assessments or historical cases.
- **Baseline sensitivity**: The Biden lame-duck baseline (Nov 2024 — Jan 2025) may not represent normal governance. Government activity typically declines in transition periods.
- **Embedding model limitations**: OpenAI's ada-002 was trained on general internet text, not specifically on government/legal documents. It may not capture domain-specific semantic relationships well.
- **Single-country focus**: The system is built for U.S. institutions and cannot be generalized without significant rework.

### 10d. Data Source Risks

- **Federal Register API**: Free, stable, well-documented. Low risk.
- **RSS feeds**: Ephemeral — no historical backfill possible. Gaps in the record.
- **White House website**: Can change structure or block scrapers at any time.
- **GDELT**: Free but unreliable — may return incomplete results, has occasional outages.

---

## 11. Questions for Reviewers

1. **Keyword methodology**: Are the keyword dictionaries reasonable for detecting the phenomena they claim to measure? Are there obvious gaps or false-positive risks?

2. **Severity weighting**: Is the 3/2/1 weighting for capture/drift/warning appropriate? Should the weights be different, or should a different scoring function be used entirely?

3. **Cumulative scoring**: We propose three cumulative views (running sum, running average, high-water mark). Are these the right choices? Are there better ways to show institutional change accumulation over time?

4. **Semantic drift**: Is cosine distance from a baseline centroid a valid way to measure institutional language change? What are the pitfalls? What calibration would be needed to make the numbers interpretable?

5. **Baseline choice**: Is the Biden lame-duck period (Nov 2024 — Jan 2025) a reasonable baseline? What would be better?

6. **Infrastructure convergence**: Is the simple threshold model (2+ themes active = convergent) too simplistic? How should convergence be measured and communicated?

7. **Rhetoric → Action tracking**: Is there a more rigorous way to measure whether rhetoric is being operationalized than comparing keyword dictionaries?

8. **Overall validity**: Given all of the above, does this system have the potential to produce results that are both valid (measuring what it claims to measure) and useful (providing actionable insight)? What are the biggest risks to validity?

9. **What's missing**: What important dimensions of democratic erosion does this system fail to capture? What data sources should be added?

10. **P2025 comparison**: Is semantic similarity (cosine threshold ~0.7) a reasonable approach for matching government actions to P2025 proposals? What are the alternatives?

---

## 12. Summary of the Proposed Changes Under Review

The specific proposal being evaluated is the **per-document scoring foundation**:

1. Score every document individually (severity A = capture×3 + drift×2 + warning×1)
2. Store per-document scores in the database for re-aggregation
3. Compute weekly aggregates (Score A sum, Score B severity mix, semantic drift)
4. Compute three cumulative views (running sum, running average, high-water mark)
5. Use a Biden-era baseline as the reference point for semantic drift and score comparison
6. Keep AI assessment (Score E) and semantic drift (Score C) as current-week-only supplements

The goal is a **foundation for experimentation**: store raw ingredients so the aggregation methods can be adjusted without re-running the entire scoring pipeline.
