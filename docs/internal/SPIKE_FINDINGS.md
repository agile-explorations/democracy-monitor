# Source Availability Spike Findings

**Date:** 2026-02-25
**Status:** All 8 spikes complete. LegiScan reassessment complete (upgraded to Strong Pass).

---

## Spike 1: LegiScan (elections) — STRONG PASS (revised)

_Originally assessed as "Partial Pass." Upgraded after API manual review confirmed Bulk API available on free tier._

| Dimension                     | Finding                                                                                                                                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API access**                | Free tier (public service key): 30,000 queries/month, all 50 states + Congress. Bulk API included — eliminates per-bill query overhead. ~500 queries/month ongoing = ~60× headroom.                                                                |
| **Bulk API**                  | `getDataset` downloads entire session as ZIP (all bills, votes, people as JSON). One call per session. Weekly snapshots with `dataset_hash` change detection.                                                                                      |
| **National search**           | `getSearchRaw(state=ALL)` — 2,000 results/page across entire national database. Boolean operators. Relevance scoring. May require paid tier for `state=ALL`; not needed for bulk download workflow.                                                |
| **Subject tags**              | `subjects[]` array on every bill. Filter locally after bulk download — no API query needed per bill.                                                                                                                                               |
| **SAST cross-state tracking** | 9 relationship types (Same As, Similar To, Cross-filed, etc.) linking related bills across states. **Unique signal: tracks model legislation propagation.**                                                                                        |
| **Volume**                    | ~1,000+ election bills/year nationally (~20/week). Exceeds 10/week threshold.                                                                                                                                                                      |
| **Historical coverage**       | Back to 2009-2010, all 50 states. All 4 baseline periods fully covered.                                                                                                                                                                            |
| **Metadata**                  | Exceptionally rich: title, description, sponsors (with party + 5 cross-reference IDs), subjects, full history with importance flags, roll call votes with individual legislator votes, bill text versions (base64), fiscal notes, calendar events. |
| **Push API**                  | Real-time updates (15 min–4 hours). 25 change-detection flags per bill. Paid add-on — not needed for weekly snapshot workflow.                                                                                                                     |
| **AI classification**         | ~75-80% accuracy for restrictive/expansive/neutral. Acceptable as Layer 2 signal (not Layer 1 gating).                                                                                                                                             |

### Why this is now a Strong Pass

**The original spike asked the wrong question.** It asked: "Can AI reliably classify state election bills as restrictive/expansive/neutral, validated against VRL ground truth?" with a 90% agreement bar. This framed LegiScan as needing an external validation source (VRL) that turned out to be inaccessible.

The revised approach separates the three pipeline layers:

**Layer 1 (structural baselines) — uses metadata only, no AI classification needed:**

- **Volume anomaly**: How many election bills are being introduced per state per week vs. baseline? A spike in restrictive bill introductions across multiple states is a structural signal regardless of AI classification accuracy.
- **Status progression distribution**: What fraction of election bills reach Engrossed/Enrolled/Passed vs. dying in committee? Shifts in passage rates are structural.
- **Sponsor party composition**: Are election bills increasingly single-party sponsored? Bipartisan vs. partisan sponsorship ratios are structural.
- **SAST propagation velocity**: How many states are introducing "Same As" or "Similar To" versions of the same bill? Model legislation spreading to 15 states in one session vs. 3 is a structural signal — and this metric requires zero AI classification. It's pure metadata.
- **Bill type distribution**: Shifts from Bills to Joint Resolutions or Constitutional Amendments signal different legislative strategies.

These Layer 1 signals work with LegiScan's existing structured metadata. No AI classification is required. The `subjects[]` field filters to election-relevant bills; everything else is counting, ratios, and distribution comparisons against baselines.

**Layer 2 (AI assessment) — AI classification as a probabilistic signal:**

- Run Sonnet/GPT-4o classification on bill title + description + text using Brennan Center definitions (restrictive: "makes it harder to register, stay registered, or vote"; expansive: "makes it easier").
- 75-80% accuracy is acceptable here because Layer 2 is already designed as a probabilistic signal — the existing pipeline uses AI flag rates and concern rates, not binary classifications.
- A 20-25% error rate on individual bills washes out in aggregate: if 60 of 80 flagged bills are correctly classified as restrictive, the aggregate signal is still valid.
- Layer 2 AI assessment runs independently of Layer 1 structural detection. They converge in the synthesis step.

**Layer 3 (thematic drift) — bill text embeddings:**

- Embed bill descriptions using the existing embedding pipeline.
- Track thematic drift: are this session's election bills semantically different from baseline sessions?
- A shift from "voter registration modernization" language toward "ballot security/integrity" language is detectable via cosine distance, independent of restrictive/expansive classification.

### What VRL would add (nice-to-have, not a blocker)

VRL's expert classifications would serve as a **calibration dataset** for Layer 2, not a gating requirement:

- Use VRL 2021+ data (if a partnership is established) to calibrate AI classification prompts and measure accuracy on a known sample.
- Use VRL issue-area tags (19 categories) to validate our subject-tag filtering approach.
- But the pipeline works without VRL. LegiScan metadata drives Layer 1; AI classification (at 75-80%) drives Layer 2; embeddings drive Layer 3.

### Cost and implementation

| Item                            | Cost                                   | Notes                                                                                                          |
| ------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| API access (free tier)          | $0                                     | 30,000 queries/month. Bulk API included. All 50 states + Congress. Already operational with 1,826 bills in DB. |
| National account (nice-to-have) | $1,000/year                            | Adds `getSearchRaw(state=ALL)` and SAST cross-state tracking. Not needed for bulk download workflow.           |
| Push API (optional)             | Additional subscription                | Real-time updates, 15 min–4 hours. Not needed for weekly snapshot workflow.                                    |
| AI classification               | ~$2-5/session for batch classification | Title + description for ~100 election bills per high-volume state                                              |
| Baseline construction           | One-time bulk download                 | ~384 `getDatasetList` + `getDataset` calls — already completed (332 sessions, 693,905 bills)                   |

### Revised verdict

**STRONG PASS.** LegiScan is operational at the free tier:

- ≥20 election-relevant bills/week nationally (exceeds 10/week threshold)
- Complete historical data for all 4 baseline periods (2009+)
- Rich structured metadata sufficient for Layer 1 without AI classification
- Bill text for Layer 2 AI classification and Layer 3 embedding analysis
- Bulk API (`getDatasetList` + `getDataset`) included on free tier — baseline construction and ongoing monitoring already working
- 1,826 classified bills already in DB (T1: 627, Biden: 515, T2: 676), 332 sessions from all 50 states + DC + PR

SAST cross-state tracking (model legislation propagation) may require the $1K/year national account — a nice-to-have refinement, not a blocker. The VRL validation step is similarly deferred to a calibration exercise.

**LegiScan API details (from manual v1.91, revision 20250317):**

- Bulk API: `getDatasetList` + `getDataset` — download entire session as ZIP (all getBill, getRollCall, getPerson as JSON). Weekly snapshots.
- `getSearchRaw`: 2,000 results per page (vs 50 for `getSearch`). Supports `state=ALL`, `year` filter (1=all, 2=current, 3=recent, 4=prior, >1900=exact).
- `getMasterList`: Returns all bills in a session with title, description, status, last_action — single API call per session.
- Push API: Real-time updates (15 min to 4 hours), paid subscription. 25 change-detection flags per bill.
- Subject tags: `subjects[]` array with `subject_id` + `subject_name` per bill (from `getBill`).
- SAST (Same As/Similar To): Cross-references between related bills across states (types: Same As, Similar To, Replaced By, Replaces, Cross-filed, Enabling For, Enabled By, Related, Carry Over).
- Status/Progress codes: 0=N/A, 1=Introduced, 2=Engrossed, 3=Enrolled, 4=Passed, 5=Vetoed, 6=Failed, 7=Override, 8=Chaptered, 9=Refer, 10=Report Pass, 11=Report DNP, 12=Draft.
- Bill Types: 23 types including Bill, Resolution, Concurrent Resolution, Joint Resolution, JRCA, Executive Order, Constitutional Amendment, Initiative, Petition, Repeal Bill, etc.
- Stance tracking: Watch (0), Support (1), Oppose (2) — via GAITS monitor system.
- Sponsor metadata: party, role, district, plus cross-references to FollowTheMoney, VoteSmart, OpenSecrets, KnowWho, Ballotpedia.
- Relevance scoring: search results include `relevance` field (0-100).

---

## Spike 2: CourtListener Volume (judicialIndependence, lawEnforcement) — STRONG PASS

| Dimension                       | Finding                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **API access**                  | Free, open API. 5,000 req/hour. Token auth (free account).                                                       |
| **Search**                      | Full-text, date range, court filter, NOS code (RECAP only), semantic search (new Nov 2025).                      |
| **judicialIndependence volume** | **~15-20 opinions/week** (2025). APA filings up 178% vs 2022 baseline. Injunctions vs agencies up 163%.          |
| **lawEnforcement volume**       | **~50-70 opinions/week** (2025). Selective prosecution claims up **663%**. Civil rights dockets up 83%.          |
| **Metadata**                    | Rich: court, judge, date, citations, full text. `suitNature` only reliable on RECAP dockets, not opinion search. |
| **Historical depth**            | Excellent. All 4 baseline periods fully covered (2017, 2018, 2021, 2022). 9M+ decisions, 365+ years.             |
| **Overlap**                     | ~15-25% between categories. Manageable via existing `(url, category)` composite unique pattern.                  |
| **Webhooks**                    | Real-time alerting via webhooks — could enable push-based monitoring instead of polling.                         |

**Verdict:** Both categories exceed ≥10 docs/week. Historical coverage is complete. Free API with generous limits. The 2025 signal is remarkably strong. Real-time webhooks could enable push-based monitoring.

---

## Spike 3: DOJ/FBI/DHS Press Releases (lawEnforcement) — STRONG PASS

| Dimension               | Finding                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DOJ API**             | **Open JSON API** (`justice.gov/api/v1/press_releases.json`) — no auth, no bot protection. 261,959 releases since 2009. Rich metadata: `component` (93 districts), `topic` (40+ tags), UUID, full body. |
| **DOJ volume**          | ~360-400/week. **~96% enforcement-relevant** (indictments, sentencing, pleas, settlements).                                                                                                             |
| **FBI**                 | RSS feeds available (national + 56 field offices). ~80-120/week, ~85-90% enforcement-relevant. No API. HTML protected by 403.                                                                           |
| **DHS/ICE**             | ICE has 26 topic-specific + 51 state-specific RSS feeds. ~15-25/week from ICE (~90% enforcement). DHS HQ ~12-15/week (only ~40-50% enforcement).                                                        |
| **Combined**            | **~435-520 enforcement-relevant releases/week.** After dedup ~370-470/week.                                                                                                                             |
| **Historical depth**    | DOJ API: 2009-present. FBI: ~2010+ with archives. DHS/ICE: 2003+ via archives. All 4 baselines covered.                                                                                                 |
| **Layer 1 suitability** | DOJ API is **excellent** — `component` + `topic` fields directly enable structural anomaly detection. FBI RSS marginal (no topic tags). ICE RSS good (26 categories).                                   |

**Verdict:** The DOJ API alone is a major discovery — an open, structured, metadata-rich source with 360-400 enforcement documents/week going back to 2009. This massively exceeds the ≥10/week threshold. Combined with ICE RSS, this would more than double the pipeline's document corpus.

---

## Spike 4: civilLiberties Source Availability — STRONG PASS

| Source                      | Docs/Week                        | Quality                          | Archive to 2017?    |
| --------------------------- | -------------------------------- | -------------------------------- | ------------------- |
| **CourtListener NOS 440**   | 67-123                           | High (structured, authoritative) | Yes                 |
| **DOJ CRT press releases**  | ~4                               | High (authoritative, API)        | Yes                 |
| **GDELT (narrow query)**    | ~1,300 raw, ~7-35 flagged        | Medium (needs filtering)         | No (3-month window) |
| **ACLU litigation tracker** | ~1-2                             | High (curated)                   | Yes (scrape only)   |
| **Combined**                | **~79-164 high-quality + GDELT** |                                  | **3 of 4 sources**  |

**Verdict:** CourtListener alone exceeds ≥10/week by 6-12x. NOS 440 (Other Civil Rights) is the anchor — 6,380 RECAP dockets in 2025 (+83% vs 2022). Three sources have full historical archives. The 15-25% overlap with judicialIndependence is manageable via existing `(url, category)` composite unique pattern.

---

## Spike 5: FCC ECFS Volume (mediaFreedom) — PASS

| Dimension                 | Finding                                                                                                                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ECFS API**              | Public API exists (`publicapi.fcc.gov/ecfs`), free key via api.data.gov. But ECFS is primarily a **comment filing system** — dominated by millions of public comments, not commission documents. Low value for our use case. |
| **EDOCS**                 | The real treasure — all FCC commission documents since March 1996. Orders, NOPRMs, enforcement actions, public notices. **No API** though — web-form search only.                                                            |
| **FCC RSS feeds**         | Best programmatic entry point. Bureau-specific RSS feeds (Media Bureau, Enforcement Bureau) provide structured daily updates. No auth needed. Compatible with existing RSS parser infrastructure.                            |
| **Media-relevant volume** | **~5-10 media-relevant documents/week** from Media Bureau + Enforcement Bureau RSS. Elevated under Carr FCC (broadcast license investigations, DEI probes, ownership deregulation).                                          |
| **Historical depth**      | EDOCS back to March 1996. All 4 baseline periods covered.                                                                                                                                                                    |
| **High-signal dockets**   | 6 identified: Quadrennial Review (22-459), TV ownership cap (17-318), network-affiliate (25-322), net neutrality (17-108, 23-320), media ownership (07-294).                                                                 |

**Verdict:** FCC RSS feeds are the recommended approach — ~5-10 media-relevant items/week, no scraping needed. Meets the lower ≥5/week bar. The Carr FCC's elevated enforcement posture makes this source particularly relevant right now.

---

## Spike 6: GDELT Media Diversity Metrics (mediaFreedom) — FAIL

| Dimension                     | Finding                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ArtList domain field**      | Yes — each article returns `domain`. You CAN count distinct domains per query. But ArtList caps at ~250 articles.                                             |
| **TimelineSourceCountry**     | Breaks coverage volume by source country — useful for confirming US-only filter, not for within-US diversity.                                                 |
| **Local vs national**         | GDELT cannot reliably distinguish local from national outlets within the same country.                                                                        |
| **Wire service problem**      | AP/Reuters stories appear under many subscriber domains. ~20% data redundancy. Distinct-domain counts conflate editorial diversity with distribution breadth. |
| **Chilling effect detection** | **Not feasible.** Normal news-cycle variation, GDELT source list changes over time, and wire syndication noise would overwhelm any real media freedom signal. |
| **Data quality**              | ~55% accuracy on key fields. Only 21% of URLs in one study covered actual events.                                                                             |
| **US-only filtering**         | PASS — US articles are ~61.6% of GDELT. `sourcecountry:US` retains ≥50% of volume.                                                                            |

**Verdict:** GDELT can measure "how much is the media talking about media freedom" (rhetoric volume — already in the pipeline via cross-feed). It **cannot** measure "how free/diverse is the media" (structural health). mediaFreedom should rely on FCC data (Spike 5) + FR signals + existing GDELT rhetoric, not new GDELT diversity metrics.

---

## Spike 7: FEC Enforcement Data (elections) — PASS (supplementary)

| Dimension                | Finding                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **API access**           | Free OpenFEC API (`api.open.fec.gov/v1/`). Data.gov API key required. 1,000 req/hour.                                                     |
| **MUR volume**           | 77-222/year (1.5-4.3/week). Strong election cycle effect (midterm years 2x off-years). **Below 10/week threshold.**                       |
| **Admin fines**          | ~180/year (~3.5/week). Higher volume than MURs. Rich financial metadata.                                                                  |
| **Combined volume**      | ~280-450/year (~5.4-8.7/week). **Still below 10/week** — confirms spike doc's note that FEC won't contribute to weekly Layer 1 baselines. |
| **Temporal granularity** | Day-precise dates (not quarterly as assumed). But volume too low for weekly analysis. Monthly/quarterly aggregation required.             |
| **Historical coverage**  | MURs from 1999-present. All 4 baseline periods covered.                                                                                   |
| **Metadata**             | Excellent: case number, respondent, subjects (violation type), dispositions, penalties, commissioner votes, dates.                        |
| **Deadlock detection**   | YES — `commission_votes` array contains vote actions. Deadlock rate trackable: 5% average pre-2008, 24% post-2008, 45% in 2013.           |
| **2025 crisis**          | **Only 1 MUR opened in all of 2025.** FEC lost quorum Apr 30, down to 2 commissioners by Oct. The absence of enforcement IS the signal.   |

**Verdict:** Volume too low for weekly Layer 1 baselines, as predicted. But FEC provides a unique **institutional enforcement capacity** dimension — deadlock rate, penalty trends, quorum status — that no other source offers. The 2025 quorum collapse is itself a powerful elections signal. Best used as a monthly-aggregated structural metric.

---

## Spike 8: GAO/CIGIE Volume (executiveOversight) — STRONG PASS

| Source                                          | Relevant Docs/Week | Access Method                     | Difficulty |
| ----------------------------------------------- | ------------------ | --------------------------------- | ---------- |
| **GAO via GovInfo API**                         | ~4-6               | REST API (free key, 36K req/hour) | **Easy**   |
| **Individual IG RSS feeds** (DOD, HHS, DOJ OIG) | ~5-10              | RSS                               | **Easy**   |
| **Oversight.gov** (all 75 IGs)                  | ~40                | HTML scraping only (no API)       | Hard       |
| **POGO RSS**                                    | ~1-2               | RSS                               | Easy       |
| **FR (existing)**                               | 5-15               | Already integrated                | Done       |
| **Combined (easy sources only)**                | **~15-30**         |                                   |            |

**Key findings:**

- **GovInfo API** — free REST API with MODS XML metadata (report type, subjects, date, abstract). Historical depth to 1995+. 718 GAO reports/year (FY2024). Collection code: `GAOREPORTS`.
- **Oversight.gov** aggregates reports from 75 federal IGs (~2,042 reports/year) but has **no API** — scraping only. Community scraper: `github.com/unitedstates/inspectors-general` (65 IGs, spotty maintenance).
- **2025 context**: Trump fired 17 IGs in one night (Jan 24, 2025). IG report volume likely declining. GAO under budget pressure (~126 staffers lost to CR). **The drop in oversight output IS itself the signal.**

**Verdict:** GovInfo API + 3-4 IG RSS feeds would bring executiveOversight from 5-15 docs/week to **15-30 docs/week** — well above the 10/week threshold with excellent Layer 1 metadata.

---

## Consolidated Results

| Spike | Source                     | Category                             | Verdict                   | Key Finding                                                                                                                                                          |
| ----- | -------------------------- | ------------------------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | LegiScan                   | elections                            | **Strong pass** (revised) | Free tier includes Bulk API (30K queries/month, ~60× headroom). Layer 1 uses metadata (no AI needed). ~20 election bills/week nationally. 1,826 bills already in DB. |
| **2** | CourtListener              | judicialIndependence, lawEnforcement | **Strong pass**           | Free API, 15-20/week (judicial) + 50-70/week (law). Selective prosecution up 663% in 2025.                                                                           |
| **3** | DOJ/FBI/DHS press releases | lawEnforcement                       | **Strong pass**           | DOJ has open JSON API — 360-400 enforcement docs/week. Major discovery.                                                                                              |
| **4** | civilLiberties sources     | civilLiberties                       | **Strong pass**           | CourtListener NOS 440 alone gives 67-123/week. 3 of 4 sources have 2017+ archives.                                                                                   |
| **5** | FCC ECFS                   | mediaFreedom                         | **Pass**                  | RSS feeds give ~5-10 media-relevant docs/week (meets lower ≥5 bar).                                                                                                  |
| **6** | GDELT diversity metrics    | mediaFreedom                         | **Fail**                  | Wire syndication inflates domain counts. Keep existing rhetoric pipeline only.                                                                                       |
| **7** | FEC enforcement            | elections                            | **Pass (supplementary)**  | ~5-8/week (below 10/week for Layer 1). Unique institutional signal: deadlock rate + 2025 quorum collapse.                                                            |
| **8** | GAO/CIGIE                  | executiveOversight                   | **Strong pass**           | GovInfo API is excellent (free, structured, 4-6 GAO reports/week). Combined with IG RSS = 15-30/week.                                                                |

---

## Decision Points

1. **Which new sources are viable for launch?**
   - **CourtListener** (Spike 2): Yes — anchor source for judicialIndependence + lawEnforcement + civilLiberties
   - **DOJ API** (Spike 3): Yes — massively enriches lawEnforcement
   - **GovInfo/GAO API** (Spike 8): Yes — fixes executiveOversight thinness
   - **FCC RSS** (Spike 5): Yes (supplementary) — enriches mediaFreedom
   - **FEC API** (Spike 7): Yes (supplementary, monthly aggregation) — unique institutional signal for elections
   - **LegiScan** (Spike 1): Yes — free tier includes Bulk API. Operational with 1,826 bills in DB. Anchor source for elections.

2. **Is lawEnforcement a launch blocker or fast-follow?**
   - **Launch candidate.** CourtListener + DOJ API together provide 420-540 relevant docs/week.

3. **Is civilLiberties a launch blocker or fast-follow?**
   - **Launch candidate.** CourtListener NOS 440 alone provides 67-123/week with full historical coverage.

4. **Which thin categories get meaningfully enriched?**
   - executiveOversight: 5-15 → 15-30/week (GovInfo API + IG RSS)
   - mediaFreedom: gains FCC RSS (~5-10/week supplementary)
   - elections: gains FEC as institutional signal (monthly aggregation)
   - judicialIndependence: gains CourtListener (15-20/week)

5. **Final category count for launch?**
   - **13 categories** is viable (11 existing + lawEnforcement + civilLiberties)

6. **Sprint R-S1 scope?**
   - P0: CourtListener integration (serves 3 categories), DOJ API, GovInfo/GAO API, LegiScan pipeline wiring (elections anchor — data already in DB)
   - P1: FCC RSS, FEC API, IG RSS feeds
   - P2: oversight.gov scraping, VRL partnership (calibration dataset for LegiScan AI classification), SAST tracking ($1K/yr national account)

---

_All spikes complete. Findings ready for Sprint R-S1 planning._
