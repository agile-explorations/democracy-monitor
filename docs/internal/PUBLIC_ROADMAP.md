# Democracy Monitor — Roadmap

Democracy Monitor is a searchable repository of over 230,000 U.S. government documents with AI-assisted analysis of democratic institutional health. This roadmap describes what we're building next.

The project is maintained by a sole developer and sponsored by [Agile Explorations](https://agile-explorations.com). The code, data, and methodology are fully open source. If you'd like to support this work, see our [GitHub Sponsors](https://github.com/sponsors/agile-explorations) page.

---

## Current State

The system ingests documents from 9 federal sources — the Federal Register, Congressional Record, CourtListener, Compilation of Presidential Documents, DOJ press releases, LegiScan federal bills, FEC advisory opinions, White House briefing room, and GDELT media references — and assesses each across 14 categories of democratic institutional health.

Detection has been validated against 39 known democratic erosion events across both Trump administrations (2017–2018 and 2025–present), including the travel ban executive orders, James Comey firing, DACA rescission, mass Inspector General firings, Schedule F reinstatement, and DOGE agency interventions. Six negative controls confirm the system does not produce false alarms during normal governance periods.

The system currently covers five analysis periods: Trump 2017, Trump 2018, Biden 2021, Biden 2022, and Trump second term (2025–present). New documents are processed weekly.

---

## What's Next

### Detection Quality & Platform Hardening _(in progress)_

Completing the foundation. This includes filling the gaps in our historical coverage (2019–2020 and 2023–2024) to produce a continuous record from 2017 to the present, improving the data download and API access on our Data page, and ongoing refinement of the detection methodology based on what we learn each week. The goal: the most complete, accurate, and accessible repository of assessed government documents available anywhere.

### Authoritarian Infrastructure Monitoring

Nobody systematically tracks whether the government is building the operational capacity for authoritarian action — not what officials say, and not what policies are announced, but whether the personnel, surveillance technology, enforcement networks, and funding are being put in place to act at scale.

Existing organizations do excellent work tracking detention capacity (the [Deportation Data Project](https://deportationdata.org) at UC Berkeley Law, [Detention Reports](https://detentionreports.com), the [National Immigrant Justice Center](https://immigrantjustice.org)). Rather than duplicate their work, we plan to integrate their data and focus on the dimensions nobody else watches:

- **Personnel buildup** — federal law enforcement hiring patterns across agencies, tracked through USAJobs data
- **Surveillance procurement** — technology contracts for facial recognition, border surveillance, biometric databases, and social media monitoring, tracked through SAM.gov
- **Information control** — degradation of public access to government data, including FOIA response times, removal of datasets from government websites, and reduced statistical publications
- **Enforcement network expansion** — the rate at which new agreements between federal immigration authorities and local law enforcement come online, expanding the reach of enforcement operations
- **Immigration court capacity** — judicial throughput for processing enforcement actions at scale

The unique contribution is the convergence: when detention expansion, personnel buildup, surveillance procurement, and document-level concern all point in the same direction simultaneously, that tells a story no single data source reveals.

### Rhetoric vs. Action Analysis

Democratic erosion often follows a pattern: officials first say something, then the government does something. A president calls an agency "corrupt and wasteful" — weeks later, thousands of employees are placed on leave. A secretary announces a "reorganization" — days later, career staff are terminated.

We plan to add new rhetoric sources — presidential social media (Truth Social), press conference transcripts (American Presidency Project at UCSB), and cabinet agency newsroom statements — alongside the congressional floor speeches and presidential documents we already track. Each document will be classified along two independent dimensions: **rhetoric vs. action** (is someone saying something, or is the government doing something?) and **channel formality** (official record, direct-to-public, or surrogate amplification).

The analysis will be built in stages:

1. **Standalone dashboards** showing rhetoric intensity and action intensity side by side per category, with no matching required — the visual juxtaposition is itself informative
2. **An expert matching tool** where domain experts draw connections between specific statements and specific government actions, building a dataset of confirmed rhetoric-to-action links with immediate feedback on how each connection improves the analysis
3. **Automation** only where expert-confirmed data proves it's reliable — if automated matching can't achieve sufficient precision, the expert tool is the product

### Democracy Index Evidence Mapping

V-Dem and Freedom House produce the most widely cited assessments of democratic health worldwide. What they cannot provide is the evidentiary trail: which specific government actions support their assessments? We plan to map their indicators to Democracy Monitor's 14 categories and present the documentary evidence — the specific regulations, court filings, executive orders, and enforcement actions — that a researcher would need to evaluate those assessments for themselves.

The documents may confirm an index's assessment, complicate it, or reveal dynamics the annual score missed entirely. Democracy Monitor does not validate or invalidate any specific index. It provides the primary-source documents and lets researchers form their own conclusions.

### Project 2025 Implementation Tracking

Existing trackers ([Project 2025 Observer](https://project2025.observer), [Center for Progressive Reform](https://progressivereform.org)) do comprehensive work tracking implementation status. Democracy Monitor's contribution would be narrower: linking each implementation to the specific government documents in our repository, identifying instances where government actions go beyond what was proposed, and connecting implementation data to the other analytical dimensions.

### State-Level Research Corpus

Significant threats to democratic governance originate at state legislatures, state courts, and governors' offices. We plan to extend the document repository to cover state-level bills, court opinions, and executive orders, beginning with states that democracy indices flag for declining democratic quality. Governor executive orders, which no one currently aggregates across all 50 states in machine-readable form, are a particular focus. State-level analysis will build incrementally — starting with making the documents searchable and downloadable, then adding assessment capabilities as we develop the state-specific context needed to distinguish genuine erosion signals from normal state governance variation.

---

## How You Can Help

**Use the site and tell us what's missing.** The most valuable feedback comes from domain experts who know the events and can tell us what we got right and wrong.

**Contribute data expertise.** The rhetoric-action analysis will need experts who can confirm connections between statements and government actions. If you study executive power, administrative law, or specific policy domains, your knowledge makes the analysis better.

**Sponsor the project.** Democracy Monitor runs on AI infrastructure that costs real money. Every document is assessed through two AI passes, narratives are generated weekly, and the system processes new documents on a continuous basis. [GitHub Sponsors](https://github.com/sponsors/agile-explorations) is the primary funding mechanism. Contributions go directly to infrastructure costs.

**Contribute code.** The project is open source on [GitHub](https://github.com/agile-explorations/democracy-monitor). Issues tagged "good first issue" are available for contributors.

---

## Principles

**Open methodology.** Every assessment traces to specific documents. The AI prompts, scoring thresholds, and detection methodology are published and versioned. When we change the methodology, we document why.

**Nonpartisan analysis.** The system reads government documents from all administrations using the same methodology. Biden-era documents are assessed with the same prompts and thresholds as Trump-era documents. The data shows what it shows.

**Credit others.** Where existing organizations do excellent work, we integrate and link rather than duplicate. Democracy Monitor is one tool in an ecosystem of civic technology, academic research, and investigative journalism.

**Honest about limitations.** The system is experimental. AI assessments can be wrong. Congressional floor speeches are partisan. Some categories have more data than others. We document these limitations alongside every assessment.

---

_Democracy Monitor is an open-source project maintained by [Michael Kelly](https://linkedin.com/in/yourprofile) and sponsored by [Agile Explorations](https://agile-explorations.com). Questions, feedback, and collaboration inquiries: democracymonitor.support@agileexplorations.com_
