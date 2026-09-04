# Assessment Methodology

Democracy Monitor is an open-source system that tracks signs of executive-power centralization across U.S. government institutions. It reads publicly available government documents — federal regulations, court filings, press releases, legislative reports — and uses AI content assessment as its primary detection method — supported by three descriptive context methods (structural anomaly, silence detection, thematic drift) — to identify when institutional norms may be shifting.

The system is designed to surface patterns worth human examination, not render definitive judgments. It measures **departure from documented baseline practice** and leaves the evaluation of those departures to the reader — see the [epistemic charter](https://democracymonitor.us/charter). All assessments trace to specific documents, reproducible metrics, and published thresholds. Display language on the site uses departure vocabulary; the internal enum names shown in backticks below appear unchanged in the published data and the code.

## Data Sources

Democracy Monitor ingests documents from multiple source types, covering different facets of government activity:

| Source                            | What It Provides                                                                                                                             | Update Cadence                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Federal Register**              | Executive orders, proposed and final rules, notices, presidential documents                                                                  | Daily                                                                                               |
| **GovInfo**                       | Congressional reports, public laws, presidential documents (CPD collection)                                                                  | Every few days                                                                                      |
| **CourtListener**                 | Federal court opinions, docket entries, RECAP archive (civil rights, enforcement, habeas corpus)                                             | Every few days                                                                                      |
| **DOJ Press Releases**            | Department of Justice press releases across divisions (Criminal, Civil Rights, etc.)                                                         | Every few days                                                                                      |
| **DHS/ICE/CBP Press Releases**    | Operational press releases from DHS headquarters, ICE (full newsroom, incl. local enforcement operations), and CBP (national media releases) | Weekly                                                                                              |
| **Inspector General (OIG)**       | Audit reports and investigations from HHS, DOJ, SSA, and DHS Inspectors General                                                              | Every few days                                                                                      |
| **Oversight.gov (CIGIE)**         | IG reports from OPM, Treasury, TIGTA, State, EAC, FEC, and the Intelligence Community IG via the Council of Inspectors General aggregator    | Weekly                                                                                              |
| **Congressional Hearings (CHRG)** | Committee hearing transcripts from seven committees, routed to categories by subject                                                         | Weekly (transcripts publish months after hearings; past weeks gain documents as transcripts arrive) |
| **LegiScan**                      | State and federal legislative bill tracking via bulk datasets                                                                                | Periodic                                                                                            |
| **FEC**                           | Federal Election Commission advisory opinions and Matters Under Review (MURs)                                                                | Weekly                                                                                              |

Additionally, RSS feeds from the FCC provide supplementary signals for specific categories.

**DHS/ICE/CBP capture scope.** The homeland-security press corpus is captured in full within a deliberate scope, with no keyword or relevance filtering at ingest. From DHS headquarters, only the Press Releases news type is collected (speeches, testimony, fact sheets, and blog posts are not). From ICE, every newsroom release is collected, including local enforcement-operation announcements. From CBP, national media releases are collected while port-level local media releases (routine seizure and trade notices) are excluded by their URL class. Other DHS component newsrooms (USCIS, TSA, FEMA, Secret Service) are not monitored. Releases cross-posted by DHS headquarters and a component newsroom are deduplicated to the component original. Every captured release is stored with its full text and screened by the AI document-review layer downstream — relevance triage happens in assessment, never at ingest. Because the agencies' live newsroom listings only reach back to January 20, 2025, earlier releases are recovered from the agencies' own sitemaps where their robots.txt policies permit, and from the Internet Archive's Wayback Machine where they do not; every source's robots.txt is re-verified programmatically on each weekly ingest run. Releases attributed to Homeland Security Investigations describing criminal-enforcement work are additionally routed to the Federal Law Enforcement category.

**What counts as a document.** Nearly every stored document carries a complete body and is what document counts, search, and AI assessment operate on. Federal litigation is tracked separately: rather than storing a body-less row per docket filing (most filing texts sit behind the PACER paywall), each monitored case lives in a dedicated case-tracker table (`tracked_cases`) with its court, filing and termination dates, subject matter, and current posture — sourced from CourtListener's bulk docket data and refreshed weekly for active cases. Court _opinions_, which do have retrievable text, remain full documents in the corpus. The remaining metadata-only document rows are news-rhetoric records from the GDELT event database (headline-level signals whose full articles we do not republish) and a small set of documents whose bodies are unobtainable (for example, reports an agency stopped publishing openly); these are excluded from document counts, search results, and all detection layers so a body-less row can never masquerade as a substantive document. Anyone loading the downloadable dump will see the case tracker as its own table (as of August 2026, replacing roughly 283,000 docket-entry stub rows that previously inflated the raw row count) plus these metadata records.

Source ingestion is health-checked on every weekly run. A source that fails to fetch is marked unavailable; one that succeeds but returns zero documents for two consecutive checks is marked silent. Unhealthy sources surface as alerts on the System pages and roll up to the site-wide data-integrity level, which is shown on the overview page and gates the weekly email digest — no digest is sent for a week whose ingest looks degraded.

## Categories

The system monitors 14 institutional categories, aligned to frameworks used by V-Dem and Freedom House for measuring democratic governance. Each category tracks a specific dimension of executive-power constraint:

| Category                     | What It Monitors                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| **Civil Service**            | Protection of career government workers from political dismissal                   |
| **Fiscal Independence**      | Congressional control over spending; whether appropriated funds are being withheld |
| **Executive Oversight**      | Independence and functioning of Inspectors General                                 |
| **Hatch Act**                | Separation of government work from partisan political activity                     |
| **Judicial Independence**    | Executive compliance with court orders                                             |
| **Military Constraints**     | Restrictions on domestic military deployment                                       |
| **Rulemaking Autonomy**      | Independence of regulatory agencies from political interference                    |
| **Executive Actions**        | Volume and pace of presidential orders and directives                              |
| **Information Availability** | Public access to government data, reports, and websites                            |
| **Elections**                | Fair administration of elections, voter access, election infrastructure integrity  |
| **Media Freedom**            | Press access, FOIA compliance, threats to independent journalism                   |
| **Law Enforcement**          | Selective or political use of federal prosecution authority                        |
| **Civil Liberties**          | Protection of constitutional rights, due process, and equal protection             |
| **Immigration Enforcement**  | Detention, removal, asylum restrictions, and enforcement apparatus patterns        |

## Detection Architecture

Democracy Monitor uses multiple analysis methods. **One active detection method** — AI document review — drives the weekly status. Three additional methods provide **descriptive context** for narratives and research without influencing the status determination.

### Active Detection Method

#### AI Document Review (Sole Detection Layer)

The AI document review uses artificial intelligence to read and evaluate individual documents. To reduce single-provider bias, it uses a two-pass design with different AI providers:

- **Pass 1 (Screening)** — A fast model (GPT-4o-mini, from OpenAI) evaluates every document for relevance to departures from democratic institutional baselines. Each document receives up to 8,000 characters of boilerplate-stripped content. Documents are flagged as relevant or routine. Most government documents are routine administrative activity; this pass filters to the small fraction worth closer examination.
- **Pass 2 (Detailed Review)** — A different provider (Claude, from Anthropic) independently assesses each flagged document, classifying it as: routine, novel but within baseline, a possible departure, or a clear departure (stored as `routine`, `novel_not_concerning`, `potentially_concerning`, `clearly_concerning`). Pass 2 also receives up to 8,000 characters of boilerplate-stripped content, plus week-level context (flag rate, peer titles, trajectory). Using a different AI provider for each pass ensures that the two assessments are epistemically independent — they don't share the same biases or blind spots.

The weekly status is determined by absolute Pass 2 classification counts — no cross-administration baseline comparison is needed:

- **Consistent with norms** (`Stable`) — Pass 2 found no departures (0 clear-departure, ≤1 possible-departure documents)
- **Notable departure from norms** (`Elevated`) — ≥1 clear-departure OR ≥2 possible-departure documents
- **Sustained departure from norms** (`ConfirmedConcern`) — ≥2 clear-departure, OR ≥3 departure documents with a ≥20% departure rate

Pass 2's written reasoning is displayed beside documents as an annotation and follows an explicit discipline (August 2026): rhetoric is attributed to its source rather than restated as fact, real-world knowledge the document does not contain is marked as context, and causal actions are credited only to the instrument whose text performs them. A sampled audit of annotations against their documents runs periodically; corrections are logged publicly.

Pass 2 also records two descriptive classifications for each document: the **mechanism of change** (formal override, operational hollowing, or noncompliance/refusal — stored internally as the "erosion type") and the **erosion actor** — which institutional actor performs the erosion-relevant action: `federal_executive`, `congress`, `judiciary`, `state_local`, or `other_unclear`. The actor is whoever performs the action, not the document's author or venue (a court opinion documenting a federal agency's defiance of court orders attributes to the federal executive; a ruling that itself removes a protection attributes to the judiciary; a bill that itself erodes attributes to Congress). Actor attribution is **context only**: it does not change how any document is assessed or how the weekly status is computed. Per-actor confirmation counts are stored on weekly aggregates for research and for a future, data-informed decision about how attribution should shape the dashboard's headline framing — that decision is deliberately deferred until the attributed distributions can be examined. Attribution runs as a **separate lightweight classification pass** (GPT-4o-mini over the stored assessment reasoning and document text) — deliberately decoupled from Pass 2 itself: a controlled three-arm experiment measured that embedding attribution in the Pass 2 prompt shifted assessment outcomes by ~11 percentage points beyond the same-prompt noise floor, so the assessment prompt is kept byte-identical and attribution never influences any assessment. Historical assessments were attributed retroactively by the same pass; new confirmed documents are attributed weekly during the snapshot.

An audit sample (3% of unflagged documents) is independently reviewed by Pass 2 to estimate false negative rates — how many departure documents Pass 1 might be missing. Across historical baselines, the audit false negative rate ranges from 0% (Biden 2021) to under 1% (Trump 2017–2018), indicating that Pass 1 screening correctly filters the vast majority of routine documents while catching most documents that warrant closer review.

### Descriptive Context Methods

These methods are computed and stored for narrative grounding and research, but **do not influence the weekly status**:

#### Silence Detection (Descriptive Only)

Silence detection measures whether government-controlled sources (Federal Register, DOJ, OIG, FEC, GovInfo presidential documents) have gone unusually quiet while independent-branch sources (CourtListener, congressional records and reports, public laws, LegiScan) remain active. This contrast — government silence alongside continued independent activity — may indicate deliberate information suppression. Silence scores are preserved as narrative context but do not trigger status escalation.

- Uses an 8-week intra-administration rolling window to establish "normal" government volume
- Computes a z-score for government-source volume deviation
- Requires both government silence (z > 1.5σ below mean) AND independent activity to be conspicuous
- Cold-start periods (fewer than 4 weeks of data) are flagged as low confidence
- **Sparse-source mode:** categories whose true weekly government volume averages under 3 documents (e.g., Hatch Act enforcement) cannot support a z-test — week-to-week zeros are Poisson noise, not silence. For these, silence is instead assessed by a presence-rate and zero-streak test over a 16-week window: a streak of zero-weeks is conspicuous only when its probability under the category's own presence rate falls below 5%, and the category historically publishes in at least half of weeks

#### Structural Anomaly Detection (Descriptive Only)

Structural anomaly detection is fully deterministic and uses only document metadata — no text analysis. It compares the current week's document patterns against historical baselines across six dimensions:

- **Volume** — Document count relative to baseline mean and standard deviation
- **Type Composition** — Distribution of document types, measured using Jensen-Shannon divergence
- **Functional Distribution** — Shifts across eleven institutional function buckets
- **Agency Activity** — Changes in which agencies are publishing documents
- **Publication Tempo** — Daily variance within the week
- **Source Convergence** — Ratio of government-origin to rhetoric/news sources

Each dimension produces a z-score. The composite structural score is a weighted average with exponential dampening for mild z-scores and a cap on JSD outliers. A long-horizon component tracks cumulative deviation over 12 weeks. Structural anomalies are preserved as metadata for narrative context but do not trigger status escalation.

#### Thematic Drift (Descriptive Only)

Thematic drift uses embedding-based analysis to detect when the _topics_ discussed in a category shift away from recent norms. It operates on an intra-administration rolling window (8 weeks):

- **Centroid Distance** — Cosine distance between the week's document centroid and the mean centroid of the preceding eight weeks (the current week is never part of its own window)
- **z-Score** — That distance expressed against the typical week-to-week centroid movement inside the window: (distance from window mean − mean consecutive-week distance) / standard deviation of consecutive-week distances
- **Novel Document Rate** — Fraction of the week's documents whose cosine distance from the rolling centroid exceeds the calibrated novelty threshold (0.5 ≈ the 90th percentile of typical document distances)
- **Variance Ratio** — Embedding variance of the week's documents relative to the window's: above 1 means topics are diversifying, below 1 means narrowing
- **Cross-Administration Distance** — Comparison against a prior administration's baseline centroid

Thematic drift signals are preserved for research visualization but do not drive the weekly status.

**Data reprocessing.** When scoring, filtering, or counting rules change, all historical periods are reprocessed under the new rules, so cross-era comparisons remain valid — rule changes do not create breaks in the data. When court-record collection was reworked in February 2026, document counts were made consistent in July 2026 by defining the counting population with a documented classifier applied uniformly to all periods (the `counting_scope` flag in the published data; see the Data page). If a future collection change cannot be reconciled this way, the volume-based research views mark it with ▲ and suppress "findings" that overlap it rather than presenting them as detection. Weekly statuses are derived from document _content_ against absolute thresholds and are verified to remain comparable across every change (each pipeline change is gated on producing zero unexplained status flips), so status-based displays carry no breaks.

## Status Synthesis

AI document review is the primary active detection method, combined into a weekly status for each category (internal module name: concern synthesis):

| Status                                                  | Meaning                                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Consistent with norms** (`Stable`)                    | AI content assessment within the baseline range. No departures detected.                             |
| **Notable departure from norms** (`Elevated`)           | AI two-pass review flags departure documents with Pass 2 corroboration.                              |
| **Sustained departure from norms** (`ConfirmedConcern`) | AI content assessment elevated with a high Pass 2 departure rate (>20%). Warrants close examination. |

Structural anomaly, silence detection, and thematic drift provide descriptive context but do not influence the weekly status. This architecture was adopted after empirical validation showed that non-AI methods could not reliably distinguish signal from noise.

### Graded evidence: actions and discussions (September 2026)

Every document in the record is one of two kinds, and both are labeled wherever documents are listed: an **action** — an instrument of government (an executive order, rule, judicial opinion, bill, enforcement release, inspector-general report, or text entered into the Congressional Record such as resolution text, appropriations statements, and presidential messages) — or a **discussion** of government actions (a floor speech, hearing, or presidential remarks). The boundary is the instrument, not the speaker.

Both kinds count toward the weekly status, deliberately and unequally:

- **Discussions count in full toward "Notable departure."** Congress debating a change in norms is itself worth attention, and a week evidenced only by floor speeches can reach Elevated.
- **"Sustained departure" is anchored to actions.** The strongest status this site publishes requires at least one action-tier document confirmed by the AI review, and discussion documents count at **half weight** toward its thresholds. A week whose only departure evidence is rhetoric — however heated — is held at "Notable departure," and the page says so.

This choice was made after a September 2026 audit found more than half of confirmed detections in six categories resting on floor speeches. Discussions about changing norms matter and remain counted; the site reserves its strongest claim for weeks where the government _did_ something, not only where it was said to have. When the rule was adopted, every affected historical week was re-evaluated in rehearsal, the complete list of status changes was reviewed and accepted before publication, and the change is recorded on the public reversals ledger. Each week's page discloses its evidence mix (actions and discussions confirmed) alongside the status.

## Baselines

All anomaly detection requires a reference period for comparison. The system maintains eight historical baselines — every year of the two preceding administrations:

| Baseline       | Period         | Role                                                                      |
| -------------- | -------------- | ------------------------------------------------------------------------- |
| **Biden 2022** | Year 2 of term | Primary baseline — chosen for stability and comprehensive source coverage |
| **Biden 2021** | Year 1 of term | First-year-in-term comparison                                             |
| **Biden 2023** | Year 3 of term | Late-term comparison                                                      |
| **Biden 2024** | Year 4 of term | Election-year comparison                                                  |
| **Trump 2017** | Year 1 of term | Cross-administration, first year                                          |
| **Trump 2018** | Year 2 of term | Cross-administration, same cycle year as primary                          |
| **Trump 2019** | Year 3 of term | Cross-administration, late term                                           |
| **Trump 2020** | Year 4 of term | Cross-administration, election year                                       |

All eight baselines cover the same core data sources (Federal Register, CourtListener, DOJ, GovInfo, FEC, LegiScan, OIG) under uniform routing and filtering rules — see the coverage-parity note on the methodology page for the July 2026 repairs that made this true across every period.

**Cycle-year adjustment:** First-year administrations systematically differ from second-year administrations (higher executive order volume, more personnel changes). Cycle adjustment factors, computed from baseline data, account for these predictable Year 1 vs. Year 2 differences so that expected seasonal patterns don't trigger false positives.

## Keywords as Annotations

Keywords were Democracy Monitor's original detection mechanism, but as the three-layer architecture was developed, their role changed. Keywords now serve as **contextual annotations** — they help explain what the system is detecting, but they do not drive the weekly status.

Each category has curated keyword dictionaries organized by severity tier (capture, drift, warning — displayed as strong and moderate keyword signals). When documents contain these keywords, the matches are displayed alongside the assessment to provide interpretive context. An administration-specific keyword overlay adds time-bounded terms relevant to the current administration. Baselines use only the core keyword set to avoid anachronistic false positives.

## Source Health Monitoring

The system continuously monitors the availability and responsiveness of its data sources. Six "canary" sources — critical feeds whose absence would significantly degrade analysis — are tracked with special attention.

Source health maps to four integrity levels:

| Level        | Meaning                                       |
| ------------ | --------------------------------------------- |
| **High**     | All or nearly all sources responding normally |
| **Moderate** | Some degradation or canary-source issues      |
| **Low**      | Significant source unavailability             |
| **Critical** | Majority of sources unavailable               |

When overall source health degrades, the site-wide data-integrity level drops (surfaced on the overview page) and the weekly digest is withheld until ingest is repaired, so findings are not distributed on incomplete data.

A source is marked silent after two consecutive scheduled checks return zero documents; silent sources are flagged for investigation on the System health pages.

## AI Narrative Generation

For categories at Notable departure from norms (`Elevated`) or above, the system generates plain-language narrative summaries explaining what the detection system found and why. Narratives are produced in two versions:

- **Expert** — Technical analysis (400-800 words) for researchers and policy analysts, citing specific documents with links, counter-arguments, and limitations.
- **Public** — Accessible summary (200-500 words) for general audiences, avoiding jargon and focusing on what the findings mean in practical terms.

Categories consistent with baseline use a template-based summary rather than AI generation, since there is nothing unusual to explain.

## Limitations

Democracy Monitor is an automated monitoring system, not a substitute for expert judgment. Key limitations include:

- **Federal focus** — The system monitors federal government activity. State and local government actions, which can significantly affect democratic governance, are not covered.
- **Public information only** — The system analyzes publicly available documents. Actions taken through informal channels, verbal directives, or documents not yet published are invisible to the system.
- **Structural detection is descriptive, not evaluative** — Structural anomaly detection identifies statistical departures from baselines. It cannot determine whether a departure is concerning or benign — a spike in executive orders could reflect either an emergency response or a power grab.
- **AI assessment limitations** — AI quality depends on the models used and their training data. The two-pass design mitigates single-provider bias but cannot eliminate it entirely. AI models may also have difficulty with highly technical legal or regulatory language.
- **Thematic drift requires volume** — Categories with few documents per week produce noisy drift signals. The system reduces confidence during low-volume periods, but sparse categories may generate unreliable thematic drift results.
- **Source availability dependence** — The system depends on government websites remaining accessible and APIs remaining stable. Deliberate restriction of government data sources would degrade the system's ability to detect other changes.
- **Aggregator completeness (Oversight.gov)** — IG reports from OPM, Treasury, TIGTA, State, EAC, FEC, and the IC IG are ingested via Oversight.gov, the CIGIE aggregator, because several of those OIGs block automated access to their own sites. Aggregator coverage depends on each OIG's self-submission to CIGIE and varies by OIG: spot-checks found 100% parity for TIGTA (FY2025) and OPM OIG (FY2024), but DHS OIG ground truth measured only 75–80%, so per-OIG volumes from this source should be read as floors. DoD OIG is not reachable through the aggregator's OIG filter and is not yet covered.
- **Recurring oversight genres always describe problems — to different degrees at different times** — Inspectors General publish recurring statutory documents (semiannual reports to Congress, annual "management challenges" assessments, program plans) whose purpose is to enumerate institutional problems. Such documents can be flagged in any era; the AI assessment is asked to read the severity of the described conditions, not the document's genre. The measured cross-era differential on identical genres — roughly 1.5–2% of IG documents confirmed as departures in 2017–2024 versus ~10% in the current term — indicates content rather than format drives classification. Even so, weeks whose status rests on these recurring documents deserve a read of the underlying reports before drawing conclusions.
- **Baseline assumptions** — Baselines reflect specific historical periods. Structural changes in government publishing practices (new document formats, API changes, publication frequency shifts) could invalidate baseline comparisons over time.
- **Embedding coverage gaps** — Thematic drift analysis depends on document embeddings. Not all documents may have embeddings available, particularly older documents or those from newer source types.
- **Automation bias** — Presenting automated assessments alongside official government documents risks creating an impression of certainty that the methodology does not support. All findings are indicators warranting human review, not conclusions.
- **Category relevance filtering (Press Freedom, Government Information Availability, Government Watchdogs)** — Three categories whose retrieval terms match large volumes of unrelated Federal Register text carry a validated relevance filter: documents whose subject is not the category's are excluded from its counts and assessment (July 2026 for Press Freedom; September 2026 for Government Information Availability, where a measurement audit had found a random sample on-topic zero times in one hundred; September 2026 for Government Watchdogs). The Government Watchdogs filter is exclusion-driven — relevant documents in that category are lexically indistinguishable from routine text, so only measured noise classes are named and everything else is kept, erring toward inclusion. Every filter is derived against a labeled corpus, gated on a holdout of confirmed documents with zero false drops, enforced by standing regression tests, and audited weekly by an LLM pass over the drop ledger. The September 2026 Information Availability correction changed twenty weekly statuses, all downward; the Government Watchdogs cleanup removed roughly two thousand routine documents from that category's counts while changing zero weekly statuses. Both are recorded on the public reversals ledger with the evidence trail. Misrouted documents found to carry real signal were re-assessed under their correct categories rather than discarded.
- **Known detection-health findings (September 2026 audit, publicly tracked)** — A cross-category audit measured two open weaknesses that are being fixed in the open rather than silently: the first-pass AI screen misses concerning documents at measured rates of 14–25% in five categories (the audit sample that quantifies this runs continuously and the miss rates are watched in weekly validation), and in six categories more than half of confirmed detections rest on congressional floor speeches rather than primary instruments. The findings, their numbers, and the remediation work are tracked in the public issue record.

## Reproducibility

**Content preparation:** Raw document content is stored in full (no character caps). Before AI assessment, content is loaded up to 16,000 characters from the database, boilerplate is stripped (Federal Register GPO headers, CPD CSS contamination, GovInfo report headers, CREC title repetition), and then sliced to 8,000 characters for both Pass 1 and Pass 2. Boilerplate stripping is applied at assessment time only — raw content remains intact in the database for future reprocessing.

All scoring thresholds, dimension weights, and configuration constants are defined in a single file: [`lib/methodology/scoring-config.ts`](lib/methodology/scoring-config.ts). Key values include:

- Structural anomaly threshold: composite z-score > 2.5 (descriptive only)
- P2 Notable departure from norms (`Elevated`): ≥1 clear-departure OR ≥2 possible-departure documents
- P2 Sustained departure from norms (`ConfirmedConcern`): ≥2 clear-departure, OR ≥3 departure documents with ≥20% rate
- Thematic drift window: 8 weeks rolling (descriptive only)
- Long-horizon cumulative tracking: 12 weeks
- Structural dampening: exponential decay for mild z-scores, JSD outlier cap

The methodology constants are also available programmatically via the `/api/methodology` JSON endpoint.

The full dataset is available as a database dump in [GitHub Releases](https://github.com/agile-explorations/democracy-monitor/releases). See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions.
