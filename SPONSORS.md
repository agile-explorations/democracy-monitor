# Sponsoring Democracy Monitor

Democracy Monitor is an open-source project maintained by [Agile Explorations LLC](https://github.com/agile-explorations). Sponsorship funds go directly to project infrastructure and development — this page breaks down exactly where the money goes.

## Cost Breakdown

### Initial Development (~$250)

| Item                                                      | Cost      |
| --------------------------------------------------------- | --------- |
| Claude Code Max (1 month)                                 | $200      |
| AI API costs (4 baseline runs + embeddings + calibration) | ~$42      |
| **Total**                                                 | **~$242** |

The three-layer detection system was built over one month of intensive development using Claude Code. Four historical baselines (Biden 2021, Biden 2022, Trump 2017, Trump 2018) were processed through the AI two-pass assessment pipeline to establish reference flag rates.

### Ongoing Monthly Costs (~$260/mo)

| Item                   | Monthly       | What it covers                                                   |
| ---------------------- | ------------- | ---------------------------------------------------------------- |
| Render.com web service | $25           | Next.js app (Standard plan)                                      |
| Render.com PostgreSQL  | $19           | Document store, assessments, baselines (Basic 1GB)               |
| Render.com Redis       | $10           | API response caching (Starter)                                   |
| Render.com cron jobs   | ~$3-5         | Daily snapshot, daily digest, hourly uptime, weekly clustering   |
| Claude Code Max        | $200          | Development and maintenance tooling                              |
| AI API costs           | ~$0.50        | Daily pipeline: ~60 docs/day through GPT-4o-mini + Claude Sonnet |
| **Total**              | **~$258-260** |                                                                  |

The AI API costs are low because the daily document volume is small (~420 docs/week across 11 categories) and GPT-4o-mini is inexpensive. Claude Sonnet (Pass 2) only runs on flagged documents and a 3% audit sample.

## Sponsorship Tiers

### Sustain — $10/mo

Help keep Democracy Monitor running. Your sponsorship covers a share of the hosting infrastructure that powers daily monitoring of 11 institutional categories.

### Infrastructure — $60/mo

Cover the full hosting stack: web service, PostgreSQL database, Redis cache, and 4 cron jobs on Render.com. The project runs debt-free with this tier filled.

### Full Operations — $260/mo

Cover hosting plus development tools (Claude Code Max) used to build and maintain the three-layer detection system, convergence synthesis, and assessment pipeline.

### Maintainer — $1,000/mo

Fund dedicated maintainer time: dependency updates, bug fixes, pipeline monitoring, threshold calibration, issue triage, and keeping the daily snapshot pipeline healthy.

### Sprint Sponsor — $2,500 (one-time)

Fund a full development sprint from the [project roadmap](ROADMAP.md). Each sprint produces named deliverables tracked publicly — see [DECISIONS.md](DECISIONS.md) for retrospectives showing planned vs. built for every completed sprint.

## How to Sponsor

Click the **Sponsor** button on the [repository page](https://github.com/agile-explorations/democracy-monitor) or visit [github.com/sponsors/agile-explorations](https://github.com/sponsors/agile-explorations).
