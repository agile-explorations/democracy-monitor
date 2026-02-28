# Source Availability Spikes

> **Status: All 8 spikes complete (2026-02-25).** 7 passed, 1 failed (GDELT diversity metrics). Results in `SPIKE_FINDINGS.md`. 13 categories confirmed viable for launch. Sprint R-S1 scope determined.

**Purpose:** Validate that proposed new document sources produce sufficient structured data for the three-layer pipeline before committing them as launch blockers. Each spike answers: "Does this source produce enough relevant, structured, historical documents to support Layer 1 statistical baselines?"

**Success criteria per source:**

- Produces ≥10 relevant documents/week consistently (structural dampening threshold)
- Historical data available for at least 3 of 4 baseline periods (Biden 2021, Biden 2022, Trump 2017, Trump 2018)
- API/access is stable, documented, and free or low-cost
- Document metadata is structured enough for Layer 1 (date, type/category, issuing entity at minimum)

**Spike methodology:** Each spike is 2-4 hours of work. Query the API, count documents, assess structure, report findings. No pipeline code — just data exploration and volume estimation.

---

## Spike 1: LegiScan Classification (elections)

**Question:** Can AI reliably classify state election bills as restrictive/expansive/neutral, validated against Voting Rights Lab ground truth?

**Method:**

1. Pull all 2023 Texas bills from LegiScan API (high-volume state, well-classified by VRL)
2. Filter to election/voting-related bills using LegiScan subject tags
3. Run filtered bills through Sonnet with classification prompt: election-relevant? restrictive/expansive/neutral?
4. Compare AI classifications against VRL's 2023 Texas classifications
5. Compute agreement rate

**Success:** ≥90% agreement with VRL classifications on the restrictive/expansive dimension.

**If it fails:** Elections launches with VRL (2021+ only) + FEC enforcement (all baselines). Trump first-term baseline gap documented as known limitation.

**Cost:** ~100-300 LegiScan API calls + ~$1-3 Sonnet batch. One day.

---

## Spike 2: CourtListener Volume (judicialIndependence, lawEnforcement)

**Question:** Does CourtListener produce enough _relevant_ federal court documents per week to support structural baselines?

**Method:**

1. Query CourtListener search API for one baseline month (e.g., Biden 2022, March 2022):
   - `judicialIndependence` queries: injunctions against federal agencies, compliance orders, contempt of court by federal officials, stays of executive action, judicial review of agency rules
   - `lawEnforcement` queries: DOJ enforcement actions challenged in court, civil rights cases against federal agencies, habeas corpus petitions, selective prosecution claims
2. Count unique opinions/orders per week
3. Assess document metadata structure (date_filed, court, case type, parties)
4. Repeat for one Trump baseline month (e.g., Trump 2018, March 2018)
5. Repeat for Trump 2025 monitoring period month (e.g., March 2025)

**Success:** ≥10 relevant documents/week for each category across both baseline eras. Structured metadata (date, court, type).

**If it fails:** CourtListener may still work for judicialIndependence alone (broader queries). lawEnforcement would need to rely more heavily on DOJ press releases.

**Cost:** Free API with token auth. A few hundred queries. Half day.

---

## Spike 3: DOJ/FBI/DHS Press Release Volume (lawEnforcement)

**Question:** Do federal law enforcement agency press releases produce enough structured, relevant documents per week?

**Method:**

1. Scrape/browse justice.gov press release archive for one baseline month and one monitoring month:
   - Count total press releases per week
   - Count enforcement-relevant releases (indictments, investigations, settlements, enforcement actions)
   - Note metadata available (date, division/component, case type, defendant type)
2. Same for fbi.gov/news/press-releases
3. Same for dhs.gov/news/press-releases
4. Assess: are these structured enough for Layer 1? Do they have consistent metadata fields?
5. Check historical archive depth — do archives go back to 2017?

**Success:** ≥10 relevant documents/week combined across DOJ+FBI+DHS. Consistent metadata. Archives back to at least 2017.

**If it fails:** lawEnforcement category may not have sufficient structural signal from press releases alone. Would need to lean heavily on CourtListener (Spike 2) for this category, or accept that lawEnforcement launches with thinner signal than ideal.

**Cost:** Manual browsing + light scripting. Half day.

---

## Spike 4: civilLiberties Source Availability

**Question:** Do the proposed civilLiberties sources (ACLU, DOJ-CRD, GDELT protest coverage, CourtListener civil rights cases) collectively produce enough structured documents?

**Method:**

1. **ACLU litigation tracker** — Browse aclu.org/cases. Count active cases per month. Assess: is case metadata structured (issue area, court, status, date)? Is the data scrapeable reliably? How far back does the archive go?
2. **DOJ Civil Rights Division** — Browse justice.gov/crt/recent-press-releases. Count relevant releases per month. Check archive depth. Assess metadata structure.
3. **GDELT protest/assembly coverage** — Query existing GDELT integration with US-only filter + protest/assembly/civil-rights themes. Count articles per week. Assess signal-to-noise ratio (what % is actually about US civil liberties vs. international noise?).
4. **CourtListener civil rights cases** — Query for civil rights cases in federal courts (1983 actions, First Amendment challenges, assembly/association cases). Count per week. Assess overlap with judicialIndependence queries from Spike 2.
5. Combine all four sources: total relevant documents per week.

**Success:** ≥10 relevant documents/week combined across all sources. At least 2 sources with historical archive back to 2017.

**If it fails:** civilLiberties category deferred to fast-follow. Launch with 12 categories + "coming soon" slot. Source story needs rethinking — may require different sources entirely (e.g., state ACLU affiliates, specific First Amendment trackers, or GDELT with better filtering).

**Cost:** Manual exploration + GDELT queries using existing integration. Half day to one day.

---

## Spike 5: FCC ECFS Volume (mediaFreedom)

**Question:** Does the FCC's Electronic Comment Filing System produce enough relevant commission documents per week?

**Method:**

1. Register for free FCC ECFS API key
2. Query commission documents (not public comments) for one baseline month:
   - Filter to: orders, NOPRMs, enforcement actions, license proceedings
   - Focus on media-relevant proceedings (media ownership, broadcast licensing, net neutrality, press freedom)
3. Count relevant documents per week
4. Assess metadata structure (proceeding number, document type, bureau, date)
5. Check volume across different eras (deregulatory vs. regulatory FCC periods)

**Success:** ≥5 relevant documents/week (lower bar than other sources — FCC is supplementary to existing FR + GDELT data for mediaFreedom). Structured metadata. Archive back to at least 2017.

**If it fails:** mediaFreedom relies on FR + GDELT diversity metrics (Spike 6) without FCC regulatory dimension. Still an improvement over current FR-only.

**Cost:** Free API key + queries. Half day.

---

## Spike 6: GDELT Media Diversity Metrics (mediaFreedom)

**Question:** Can meaningful media health metrics be computed from existing GDELT data without new ingestion?

**Method:**

1. Using existing GDELT integration, query articles for each of the 13 category topic areas over one baseline month
2. Compute per-category:
   - **Source count** — How many distinct news outlets cover this topic area?
   - **Local vs. national ratio** — What fraction of sources are local/regional vs. national outlets?
   - **Coverage volume trend** — Total article count per week
3. Compare metrics between baseline period and monitoring period
4. Assess: do these metrics show meaningful variation? Is there enough signal to detect consolidation or chilling effects?
5. Key concern: GDELT's ~50% non-US content. Test with US-only domain filtering — does sufficient volume remain?

**Success:** Metrics show meaningful week-to-week variation. US-only filtering retains ≥50% of volume. At least one metric (source diversity or coverage volume) shows detectable differences between baseline and monitoring periods.

**If it fails:** GDELT continues serving rhetoric pipeline only. mediaFreedom improvement comes from FCC (Spike 5) alone.

**Cost:** Queries against existing integration + computation. Half day.

---

## Spike 7: FEC Enforcement Data (elections)

**Question:** Does FEC enforcement data provide a clean, structured signal for elections monitoring?

**Method:**

1. Query OpenFEC API (api.open.fec.gov) for enforcement actions (MURs — Matters Under Review)
2. Count enforcement actions per quarter across baseline periods
3. Check for: deadlocked votes (3-3 commissioner splits that effectively kill enforcement), case dismissals, average case duration
4. Assess metadata structure (case number, respondent type, violation type, disposition, dates)
5. Check if data volume is sufficient for weekly structural baselines or if quarterly aggregation is necessary

**Success:** Structured enforcement data available for all baseline periods. Metadata supports tracking enforcement patterns (volume, disposition, deadlock rate).

**Note:** FEC data is inherently quarterly, not weekly. This means FEC data **will not contribute to Layer 1 weekly structural baselines** — there isn't enough temporal granularity. It functions as a supplementary signal (like external democracy indices) rather than a primary Layer 1 input. This is still valuable for elections, but it means: elections without LegiScan validating (Spike 1) is thin even with FEC.

**Cost:** Free API. A few dozen queries. 2-3 hours.

---

## Spike 8: GAO/CIGIE Volume (executiveOversight)

**Question:** Do IG semiannual reports + GAO reports bring executiveOversight (currently one of the thinnest categories at 5-15 FR docs/week) above the structural dampening threshold?

**Method:**

1. Browse oversight.gov for IG semiannual reports — count per agency per half-year. How many are there total?
2. Browse gao.gov/reports-testimonies for GAO reports — count per month. Filter to oversight-relevant reports (agency audits, management challenges, recommendation compliance).
3. Check CIGIE.gov for aggregated data (inspection/evaluation reports, management advisories).
4. Assess combined volume: existing FR documents + IG reports + GAO reports per week.
5. Check metadata structure and historical archive depth.

**Success:** Combined sources bring executiveOversight to ≥10 relevant documents/week consistently. Historical data available for all 4 baseline periods.

**If it fails:** executiveOversight continues with FR-only sources. Structural dampening remains in effect for this category (acceptable — dampening is designed for exactly this scenario). The category still provides signal through Layers 2 and 3 even with thin Layer 1 corpus.

**Cost:** Manual browsing. 2-3 hours.

---

## Spike Execution Plan

| Spike | Source                     | Category                             | Effort     | Dependencies                            |
| ----- | -------------------------- | ------------------------------------ | ---------- | --------------------------------------- |
| 1     | LegiScan                   | elections                            | 1 day      | None                                    |
| 2     | CourtListener              | judicialIndependence, lawEnforcement | Half day   | None                                    |
| 3     | DOJ/FBI/DHS press releases | lawEnforcement                       | Half day   | None                                    |
| 4     | civilLiberties sources     | civilLiberties                       | Half-1 day | Spike 2 results (CourtListener overlap) |
| 5     | FCC ECFS                   | mediaFreedom                         | Half day   | None                                    |
| 6     | GDELT diversity metrics    | mediaFreedom                         | Half day   | None                                    |
| 7     | FEC enforcement            | elections                            | 2-3 hours  | None                                    |
| 8     | GAO/CIGIE                  | executiveOversight                   | 2-3 hours  | None                                    |

**Total effort:** ~5-6 days if sequential. ~3 days with parallelism (Spikes 1-3, 5-8 have no dependencies on each other; Spike 4 depends on Spike 2 for overlap assessment).

**Decision points after spikes:**

After all spikes report back, we decide:

- Which new sources are viable for launch?
- Is lawEnforcement a launch blocker or fast-follow?
- Is civilLiberties a launch blocker or fast-follow?
- Which existing thin categories (judicialIndependence, elections, mediaFreedom, executiveOversight) get meaningfully enriched?
- What's the final category count for launch (11, 12, or 13)?
- What's the scope of Sprint R-S1?

This gives us data-driven answers instead of speculation.
