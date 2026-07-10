# Assessment Methodology

Democracy Monitor is an open-source system that tracks signs of executive-power centralization across U.S. government institutions. It reads publicly available government documents — federal regulations, court filings, press releases, legislative reports — and uses three independent detection methods to identify when institutional norms may be shifting. When multiple methods flag the same category, confidence in the finding increases.

The system is designed to surface patterns worth human examination, not render definitive judgments. All assessments trace to specific documents, reproducible metrics, and published thresholds.

## Data Sources

Democracy Monitor ingests documents from multiple source types, covering different facets of government activity:

| Source                      | What It Provides                                                                                 | Update Cadence |
| --------------------------- | ------------------------------------------------------------------------------------------------ | -------------- |
| **Federal Register**        | Executive orders, proposed and final rules, notices, presidential documents                      | Daily          |
| **GovInfo / GAO**           | GAO audit reports, congressional reports, public laws, presidential documents (CPD collection)   | Every few days |
| **CourtListener**           | Federal court opinions, docket entries, RECAP archive (civil rights, enforcement, habeas corpus) | Every few days |
| **DOJ Press Releases**      | Department of Justice press releases across divisions (Criminal, Civil Rights, etc.)             | Every few days |
| **Inspector General (OIG)** | Audit reports and investigations from HHS, DOJ, and SSA Inspectors General                       | Every few days |
| **LegiScan**                | State and federal legislative bill tracking via bulk datasets                                    | Periodic       |
| **FEC**                     | Federal Election Commission advisory opinions and Matters Under Review (MURs)                    | Weekly         |
| **GDELT**                   | Global news coverage of U.S. government activity (filtered to U.S. sources)                      | Daily          |

Additionally, RSS feeds from the FCC provide supplementary signals for specific categories.

Each source type has an expected publication cadence. When a source goes silent beyond its expected window, the system flags it for attention and may reduce confidence in assessments that depend on that source.

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

Democracy Monitor uses multiple analysis methods. **One active detection method** — AI document review — drives concern status. Three additional methods provide **descriptive context** for narratives and research without influencing the status determination.

### Active Detection Method

#### AI Document Review (Sole Detection Layer)

The AI document review uses artificial intelligence to read and evaluate individual documents. To reduce single-provider bias, it uses a two-pass design with different AI providers:

- **Pass 1 (Screening)** — A fast model (GPT-4o-mini, from OpenAI) evaluates every document for relevance to democratic institutional concerns. Each document receives up to 8,000 characters of boilerplate-stripped content. Documents are flagged as relevant or routine. Most government documents are routine administrative activity; this pass filters to the small fraction worth closer examination.
- **Pass 2 (Detailed Review)** — A different provider (Claude, from Anthropic) independently assesses each flagged document, classifying it as: routine, novel but not concerning, potentially concerning, or clearly concerning. Pass 2 also receives up to 8,000 characters of boilerplate-stripped content, plus week-level context (flag rate, peer titles, trajectory). Using a different AI provider for each pass ensures that the two assessments are epistemically independent — they don't share the same biases or blind spots.

Concern status is determined by absolute Pass 2 classification counts — no cross-administration baseline comparison is needed:

- **Stable** — Pass 2 found no concerning documents (0 clearly concerning, ≤1 potentially concerning)
- **Elevated** — ≥1 clearly concerning OR ≥2 potentially concerning documents
- **Confirmed Concern** — ≥2 clearly concerning, OR ≥3 concerning documents with ≥20% concern rate

Pass 2 also records two descriptive classifications for each document: the **erosion mechanism** (formal override, operational hollowing, or noncompliance/refusal) and the **erosion actor** — which institutional actor performs the erosion-relevant action: `federal_executive`, `congress`, `judiciary`, `state_local`, or `other_unclear`. The actor is whoever performs the action, not the document's author or venue (a court opinion documenting a federal agency's defiance of court orders attributes to the federal executive; a ruling that itself removes a protection attributes to the judiciary; a bill that itself erodes attributes to Congress). Actor attribution is **context only**: it does not change how any document is assessed or how weekly concern status is computed. Per-actor confirmation counts are stored on weekly aggregates for research and for a future, data-informed decision about how attribution should shape the dashboard's headline framing — that decision is deliberately deferred until the attributed distributions can be examined. Historical assessments (before July 2026) were attributed retroactively by a separate lightweight classification pass over the stored assessment reasoning and document text; new assessments are attributed directly by Pass 2.

An audit sample (3% of unflagged documents) is independently reviewed by Pass 2 to estimate false negative rates — how many concerning documents Pass 1 might be missing. Across historical baselines, the audit false negative rate ranges from 0% (Biden 2021) to under 1% (Trump 2017–2018), indicating that Pass 1 screening correctly filters the vast majority of routine documents while catching most documents that warrant closer review.

### Descriptive Context Methods

These methods are computed and stored for narrative grounding and research, but **do not influence concern status**:

#### Silence Detection (Descriptive Only)

Silence detection measures whether government-controlled sources (Federal Register, DOJ, OIG, FEC, GovInfo) have gone unusually quiet while independent-branch sources (CourtListener, congressional records, LegiScan) remain active. This contrast — government silence alongside continued independent activity — may indicate deliberate information suppression. Silence scores are preserved as narrative context but do not trigger status escalation.

- Uses an 8-week intra-administration rolling window to establish "normal" government volume
- Computes a z-score for government-source volume deviation
- Requires both government silence (z > 1.5σ below mean) AND independent activity to be conspicuous
- Cold-start periods (fewer than 4 weeks of data) are flagged as low confidence

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

- **Centroid Distance** — Distance from the rolling centroid of recent weeks
- **Novel Document Rate** — Fraction of documents dissimilar to any in the rolling window
- **Variance Ratio** — Whether document diversity is expanding or contracting
- **Cross-Administration Distance** — Comparison against a prior administration's baseline

Thematic drift signals are preserved for research visualization but do not drive concern status.

## Concern Synthesis

AI document review is the primary active detection method, combined into a concern status for each category:

| Status                | Meaning                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| **Stable**            | AI content assessment within baseline range. No concerns detected.                               |
| **Elevated**          | AI two-pass review flags anomalous content with Pass 2 corroboration.                            |
| **Confirmed Concern** | AI content assessment elevated with high Pass 2 concern rate (>20%). Warrants close examination. |

Structural anomaly, silence detection, and thematic drift provide descriptive context but do not influence the concern status. This architecture was adopted after empirical validation showed that non-AI methods could not reliably distinguish signal from noise.

## Baselines

All anomaly detection requires a reference period for comparison. The system maintains four historical baselines:

| Baseline       | Period         | Role                                                                      |
| -------------- | -------------- | ------------------------------------------------------------------------- |
| **Biden 2022** | Year 2 of term | Primary baseline — chosen for stability and comprehensive source coverage |
| **Biden 2021** | Year 1 of term | First-year-in-term comparison                                             |
| **Trump 2017** | Year 1 of term | Cross-administration, first year                                          |
| **Trump 2018** | Year 2 of term | Cross-administration, same cycle year as primary                          |

All four baselines cover the same core data sources (Federal Register, CourtListener, DOJ, GovInfo, FEC, LegiScan, OIG) to ensure consistent comparison. Baselines that would have covered only a subset of sources were excluded to avoid confounding the analysis.

**Cycle-year adjustment:** First-year administrations systematically differ from second-year administrations (higher executive order volume, more personnel changes). Cycle adjustment factors, computed from baseline data, account for these predictable Year 1 vs. Year 2 differences so that expected seasonal patterns don't trigger false positives.

## Keywords as Annotations

Keywords were Democracy Monitor's original detection mechanism, but as the three-layer architecture was developed, their role changed. Keywords now serve as **contextual annotations** — they help explain what the system is detecting, but they do not drive the concern status.

Each category has curated keyword dictionaries organized by severity tier (capture, drift, warning). When documents contain these keywords, the matches are displayed alongside the assessment to provide interpretive context. An administration-specific keyword overlay adds time-bounded terms relevant to the current administration. Baselines use only the core keyword set to avoid anachronistic false positives.

## Source Health Monitoring

The system continuously monitors the availability and responsiveness of its data sources. Six "canary" sources — critical feeds whose absence would significantly degrade analysis — are tracked with special attention.

Source health maps to four integrity levels:

| Level        | Meaning                                       |
| ------------ | --------------------------------------------- |
| **High**     | All or nearly all sources responding normally |
| **Moderate** | Some degradation or canary source concerns    |
| **Low**      | Significant source unavailability             |
| **Critical** | Majority of sources unavailable               |

When source availability drops below critical thresholds, data coverage scores are capped to prevent high-confidence assessments based on incomplete data. A critical source health level caps the maximum confidence at 30%, ensuring the system does not present findings with false certainty when it lacks the data to support them.

Source silence detection compares each source's output against its expected publication cadence. A source that has been silent for more than twice its expected cadence is flagged for investigation.

## AI Narrative Generation

For categories at Elevated status or above, the system generates plain-language narrative summaries explaining what the detection system found and why. Narratives are produced in two versions:

- **Expert** — Technical analysis (400-800 words) for researchers and policy analysts, citing specific documents with links, counter-arguments, and limitations.
- **Public** — Accessible summary (200-500 words) for general audiences, avoiding jargon and focusing on what the findings mean in practical terms.

Categories at Stable status use a template-based summary rather than AI generation, since there is nothing unusual to explain.

## Limitations

Democracy Monitor is an automated monitoring system, not a substitute for expert judgment. Key limitations include:

- **Federal focus** — The system monitors federal government activity. State and local government actions, which can significantly affect democratic governance, are not covered.
- **Public information only** — The system analyzes publicly available documents. Actions taken through informal channels, verbal directives, or documents not yet published are invisible to the system.
- **Structural detection is descriptive, not evaluative** — Structural anomaly detection identifies statistical departures from baselines. It cannot determine whether a departure is concerning or benign — a spike in executive orders could reflect either an emergency response or a power grab.
- **AI assessment limitations** — AI quality depends on the models used and their training data. The two-pass design mitigates single-provider bias but cannot eliminate it entirely. AI models may also have difficulty with highly technical legal or regulatory language.
- **Thematic drift requires volume** — Categories with few documents per week produce noisy drift signals. The system reduces confidence during low-volume periods, but sparse categories may generate unreliable thematic drift results.
- **Source availability dependence** — The system depends on government websites remaining accessible and APIs remaining stable. Deliberate restriction of government data sources would degrade the system's ability to detect other changes.
- **Baseline assumptions** — Baselines reflect specific historical periods. Structural changes in government publishing practices (new document formats, API changes, publication frequency shifts) could invalidate baseline comparisons over time.
- **Embedding coverage gaps** — Thematic drift analysis depends on document embeddings. Not all documents may have embeddings available, particularly older documents or those from newer source types.
- **Automation bias** — Presenting automated assessments alongside official government documents risks creating an impression of certainty that the methodology does not support. All findings are indicators warranting human review, not conclusions.

## Reproducibility

**Content preparation:** Raw document content is stored in full (no character caps). Before AI assessment, content is loaded up to 16,000 characters from the database, boilerplate is stripped (Federal Register GPO headers, CPD CSS contamination, GovInfo report headers, CREC title repetition), and then sliced to 8,000 characters for both Pass 1 and Pass 2. Boilerplate stripping is applied at assessment time only — raw content remains intact in the database for future reprocessing.

All scoring thresholds, dimension weights, and configuration constants are defined in a single file: [`lib/methodology/scoring-config.ts`](lib/methodology/scoring-config.ts). Key values include:

- Structural anomaly threshold: composite z-score > 2.5 (descriptive only)
- P2 Elevated: ≥1 clearly concerning OR ≥2 potentially concerning
- P2 Confirmed Concern: ≥2 clearly concerning, OR ≥3 concerning with ≥20% rate
- Thematic drift window: 8 weeks rolling (descriptive only)
- Long-horizon cumulative tracking: 12 weeks
- Structural dampening: exponential decay for mild z-scores, JSD outlier cap

The methodology constants are also available programmatically via the `/api/methodology` JSON endpoint.

The full dataset is available as a database dump in [GitHub Releases](https://github.com/agile-explorations/democracy-monitor/releases). See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions.
