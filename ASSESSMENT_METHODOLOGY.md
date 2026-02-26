# Assessment Methodology

Democracy Monitor is an open-source system that tracks signs of executive-power centralization across U.S. government institutions. It reads publicly available government documents — federal regulations, court filings, press releases, legislative reports — and uses three independent detection methods to identify when institutional norms may be shifting. When multiple methods flag the same category, confidence in the finding increases.

The system is designed to surface patterns worth human examination, not render definitive judgments. All assessments trace to specific documents, reproducible metrics, and published thresholds.

## Data Sources

Democracy Monitor ingests documents from seven source types, covering different facets of government activity:

| Source                 | What It Provides                                                                                 | Update Cadence |
| ---------------------- | ------------------------------------------------------------------------------------------------ | -------------- |
| **Federal Register**   | Executive orders, proposed and final rules, notices, presidential documents                      | Daily          |
| **White House**        | Briefing room statements, press releases, policy announcements                                   | Daily          |
| **GDELT**              | Global news coverage of U.S. government activity (filtered to U.S. sources)                      | Daily          |
| **CourtListener**      | Federal court opinions, docket entries, RECAP archive (civil rights, enforcement, habeas corpus) | Every few days |
| **DOJ Press Releases** | Department of Justice press releases across divisions (Criminal, Civil Rights, etc.)             | Every few days |
| **GovInfo / GAO**      | GAO audit reports, congressional reports, public laws                                            | Every few days |
| **FEC**                | Federal Election Commission advisory opinions and Matters Under Review (MURs)                    | Weekly         |

Additionally, RSS feeds from Inspector General offices and the FCC provide supplementary signals for specific categories.

Each source type has an expected publication cadence. When a source goes silent beyond its expected window, the system flags it for attention and may reduce confidence in assessments that depend on that source.

## Categories

The system monitors 13 institutional categories, aligned to frameworks used by V-Dem and Freedom House for measuring democratic governance. Each category tracks a specific dimension of executive-power constraint:

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

## Three-Layer Detection

Rather than relying on any single detection method, Democracy Monitor uses three independent layers. Each layer analyzes different aspects of the data and can operate without the others. This triangulated approach reduces false positives (a single noisy signal cannot trigger high-severity findings) and false negatives (different layers catch different kinds of shifts).

### Layer 1: Structural Anomaly Detection

Layer 1 is fully deterministic and uses only document metadata — no text analysis. It compares the current week's document patterns against historical baselines across six dimensions:

- **Volume** — Document count relative to baseline mean and standard deviation. A spike or drop in the number of documents published in a category may indicate unusual activity.
- **Type Composition** — Distribution of document types (executive orders, rules, notices, proclamations). Measured using Jensen-Shannon divergence, which quantifies how much the current distribution differs from the baseline.
- **Functional Distribution** — Shifts across nine institutional function buckets (rulemaking, personnel actions, organizational changes, enforcement, spending, oversight, rights/liberties, information control, judicial). Detects when the _kind_ of government activity changes, not just the volume.
- **Agency Activity** — Changes in which agencies are publishing documents. Unusual concentration or absence of specific agencies can signal institutional disruption.
- **Publication Tempo** — Daily variance within the week. A pattern where all documents arrive on one day rather than being spread across the week may indicate coordinated activity.
- **Source Convergence** — Ratio of government-origin documents to rhetoric/news sources. Large imbalances may indicate that government actions are generating disproportionate external attention, or that government publishing has gone quiet.

Each dimension produces a z-score. The composite structural score is a weighted average with exponential dampening for mild z-scores (to avoid noise from routine variation) and a cap on JSD outliers. A long-horizon component tracks cumulative deviation over 12 weeks to detect slow-building trends that wouldn't appear in any single week.

### Layer 2: AI Document Assessment

Layer 2 uses artificial intelligence to read and evaluate individual documents. To reduce single-provider bias, it uses a two-pass design with different AI providers:

- **Pass 1 (Screening)** — A fast model (GPT-4o-mini, from OpenAI) evaluates every document for relevance to democratic institutional concerns. Documents are flagged as relevant or routine. Most government documents are routine administrative activity; this pass filters to the small fraction worth closer examination.
- **Pass 2 (Detailed Review)** — A different provider (Claude, from Anthropic) independently assesses each flagged document, classifying it as: routine, novel but not concerning, potentially concerning, or clearly concerning. Using a different AI provider for each pass ensures that the two assessments are epistemically independent — they don't share the same biases or blind spots.

Two aggregate metrics determine whether Layer 2 is elevated:

- **Flag rate** — The fraction of documents flagged by Pass 1, compared against baseline flag rates using z-scores. A significantly higher flag rate than the baseline suggests more documents warranting attention.
- **Concern rate** — The fraction of Pass 2-reviewed documents classified as "potentially concerning" or "clearly concerning." When this exceeds 20%, the layer is considered elevated.

An audit sample (3% of unflagged documents) is independently reviewed by Pass 2 to estimate false negative rates — how many concerning documents Pass 1 might be missing.

### Layer 3: Thematic Drift

Layer 3 uses embedding-based analysis to detect when the _topics_ discussed in a category shift away from recent norms. Unlike Layers 1 and 2, it operates on an intra-administration rolling window (8 weeks), comparing the current week against the administration's own recent output rather than a historical baseline:

- **Centroid Distance** — How far the current week's document embeddings are from the rolling centroid of recent weeks. Large distances indicate the topics being discussed have shifted.
- **Novel Document Rate** — Fraction of documents dissimilar to any document in the rolling window. High novelty rates mean the government is publishing about topics it hasn't addressed recently.
- **Variance Ratio** — Whether document diversity is expanding or contracting. A sudden narrowing of topics may indicate focused institutional activity.
- **Cross-Administration Distance** — When available, comparison against a prior administration's baseline to contextualize whether a drift is historically unusual.

During the bootstrap period (first weeks of a new administration), confidence is reduced because the rolling window lacks sufficient history for meaningful comparison.

## Convergence Synthesis

The three layers are combined into a single convergence status for each category. Each layer independently determines whether it is "elevated" (showing anomalous signals). The convergence status reflects how many layers agree:

| Status                | Meaning                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Stable**            | No layers elevated. Patterns are within normal baseline range.                                                         |
| **Elevated**          | One layer elevated. May reflect a single-dimension anomaly worth monitoring.                                           |
| **Divergent**         | Two or more layers independently flag anomalies. Multiple detection methods see something unusual.                     |
| **Confirmed Concern** | Two or more layers elevated AND the AI concern rate is above 20%. Independent methods converge on concerning findings. |

The key design principle is that **no single layer can escalate a category beyond Elevated on its own**. Divergent and Confirmed Concern require agreement from multiple independent detection methods. This prevents any one noisy signal — a spike in document volume, a single AI misjudgment, or a thematic shift from a policy change — from triggering high-severity findings.

## Baselines

All anomaly detection requires a reference period for comparison. The system maintains four historical baselines:

| Baseline       | Period         | Role                                                                      |
| -------------- | -------------- | ------------------------------------------------------------------------- |
| **Biden 2022** | Year 2 of term | Primary baseline — chosen for stability and comprehensive source coverage |
| **Biden 2021** | Year 1 of term | First-year-in-term comparison                                             |
| **Trump 2017** | Year 1 of term | Cross-administration, first year                                          |
| **Trump 2018** | Year 2 of term | Cross-administration, same cycle year as primary                          |

All four baselines cover the same data sources (Federal Register, White House, GDELT) to ensure consistent comparison. Baselines that would have covered only a subset of sources were excluded to avoid confounding the analysis.

**Cycle-year adjustment:** First-year administrations systematically differ from second-year administrations (higher executive order volume, more personnel changes). Cycle adjustment factors, computed from baseline data, account for these predictable Year 1 vs. Year 2 differences so that expected seasonal patterns don't trigger false positives.

## Keywords as Annotations

Keywords were Democracy Monitor's original detection mechanism, but as the three-layer architecture was developed, their role changed. Keywords now serve as **contextual annotations** — they help explain what the system is detecting, but they do not drive the convergence status.

Each category has curated keyword dictionaries organized by severity tier (capture, drift, warning). When documents contain these keywords, the matches are displayed alongside the three-layer assessment to provide interpretive context. An administration-specific keyword overlay adds time-bounded terms relevant to the current administration. Baselines use only the core keyword set to avoid anachronistic false positives.

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

For categories at Elevated status or above, the system generates plain-language narrative summaries explaining what the detection layers found and why. Narratives are produced in two versions:

- **Expert** — Technical analysis (400-800 words) for researchers and policy analysts, citing specific metrics, z-scores, and document references.
- **Public** — Accessible summary (200-500 words) for general audiences, avoiding jargon and focusing on what the findings mean in practical terms.

Categories at Stable status use a template-based summary rather than AI generation, since there is nothing unusual to explain.

## Limitations

Democracy Monitor is an automated monitoring system, not a substitute for expert judgment. Key limitations include:

- **Federal focus** — The system monitors federal government activity. State and local government actions, which can significantly affect democratic governance, are not covered.
- **Public information only** — The system analyzes publicly available documents. Actions taken through informal channels, verbal directives, or documents not yet published are invisible to the system.
- **Structural detection is descriptive, not evaluative** — Layer 1 identifies statistical departures from baselines. It cannot determine whether a departure is concerning or benign — a spike in executive orders could reflect either an emergency response or a power grab.
- **AI assessment limitations** — AI quality depends on the models used and their training data. The two-pass design mitigates single-provider bias but cannot eliminate it entirely. AI models may also have difficulty with highly technical legal or regulatory language.
- **Thematic drift requires volume** — Categories with few documents per week produce noisy drift signals. The system reduces confidence during low-volume periods, but sparse categories may generate unreliable Layer 3 results.
- **Source availability dependence** — The system depends on government websites remaining accessible and APIs remaining stable. Deliberate restriction of government data sources would degrade the system's ability to detect other changes.
- **Baseline assumptions** — Baselines reflect specific historical periods. Structural changes in government publishing practices (new document formats, API changes, publication frequency shifts) could invalidate baseline comparisons over time.
- **Embedding coverage gaps** — Layer 3 thematic drift analysis depends on document embeddings. Not all documents may have embeddings available, particularly older documents or those from newer source types.
- **Automation bias** — Presenting automated assessments alongside official government documents risks creating an impression of certainty that the methodology does not support. All findings are indicators warranting human review, not conclusions.

## Reproducibility

All scoring thresholds, dimension weights, and configuration constants are defined in a single file: [`lib/methodology/scoring-config.ts`](lib/methodology/scoring-config.ts). Key values include:

- Structural anomaly threshold: composite z-score > 2.5
- AI flag rate threshold: z-score > 1.5
- AI concern rate threshold: 20% of reviewed documents
- Convergence escalation: 1 layer = Elevated, 2+ layers = Divergent, 2+ layers + high AI concern = Confirmed Concern
- Thematic drift window: 8 weeks rolling
- Long-horizon cumulative tracking: 12 weeks
- Structural dampening: exponential decay for mild z-scores, JSD outlier cap

The methodology constants are also available programmatically via the `/api/methodology` JSON endpoint.

Seed data for local reproduction is available via `pnpm seed:import`, which loads baseline assessments, document scores, and weekly aggregates without requiring API keys. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions.
