# Sponsoring Democracy Monitor

Democracy Monitor is an open-source project maintained by [Agile Explorations LLC](https://github.com/agile-explorations). Sponsorship funds go directly to project infrastructure and development — this page breaks down exactly where the money goes.

## Cost Breakdown

### Initial Development (~$250)

| Item                                                      | Cost      |
| --------------------------------------------------------- | --------- |
| Claude Code Max (1 month)                                 | $200      |
| AI API costs (4 baseline runs + embeddings + calibration) | ~$42      |
| **Total**                                                 | **~$242** |

The three-layer detection system was built over one month of intensive development using Claude Code. Eight historical baselines (Trump 2017–2020, Biden 2021–2024) have been processed through the AI two-pass assessment pipeline to establish reference flag rates.

### Ongoing Monthly Costs (~$260/mo)

| Item                   | Monthly       | What it covers                                                          |
| ---------------------- | ------------- | ----------------------------------------------------------------------- |
| Render.com web service | $25           | Next.js app (Standard plan)                                             |
| Render.com PostgreSQL  | $19           | Document store, assessments, baselines (Basic 1GB)                      |
| Render.com Redis       | $10           | API response caching (Starter)                                          |
| Render.com cron jobs   | ~$3-5         | Weekly LegiScan fetch, weekly snapshot, weekly database dump            |
| Claude Code Max        | $200          | Development and maintenance tooling                                     |
| AI API costs           | ~$1-2         | Weekly pipeline: ~500-800 docs/week through GPT-4o-mini + Claude Sonnet |
| **Total**              | **~$258-260** |                                                                         |

The AI API costs are low because the weekly document volume is modest (~500-800 docs/week across 14 categories) and GPT-4o-mini is inexpensive. Claude Sonnet (Pass 2) only runs on flagged documents and a 3% audit sample.

## How to Support

There are two channels, serving different audiences:

- **GitHub Sponsors** (this page's home turf) — for developers and organizations who found the project through the code. Click the **Sponsor** button on the [repository page](https://github.com/agile-explorations/democracy-monitor) or visit [github.com/sponsors/agile-explorations](https://github.com/sponsors/agile-explorations). GitHub Sponsors tiers mirror the amounts below.
- **Direct support** (no GitHub account needed) — one-time or monthly contributions at [democracymonitor.us/support](https://democracymonitor.us/support). This is the canonical tier list ($5 / $10 / $25 monthly, or any one-time amount); the site page always reflects the current options.

For larger commitments — dedicated maintainer time, or sponsoring a full development sprint from the [project roadmap](docs/ROADMAP.md) with named deliverables tracked publicly in [DECISIONS.md](docs/DECISIONS.md) — email [michaelk@agileexplorations.com](mailto:michaelk@agileexplorations.com).

## A note on tax deductibility

Democracy Monitor is built and operated by Agile Explorations LLC, a for-profit company. The project itself is free civic technology — open source, open methodology, open data — but contributions support the project directly and are **not tax-deductible charitable donations**.
