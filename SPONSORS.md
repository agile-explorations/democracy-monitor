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

## Sponsorship Tiers

### Sustain — $10/mo

Help keep Democracy Monitor running. Your sponsorship covers a share of the hosting infrastructure that powers weekly monitoring of 14 institutional categories.

### Infrastructure — $60/mo

Cover the full hosting stack: web service, PostgreSQL database, Redis cache, and 3 weekly cron jobs on Render.com. The project runs debt-free with this tier filled.

### Full Operations — $260/mo

Cover hosting plus development tools (Claude Code Max) used to build and maintain the detection system (AI document review plus descriptive context layers), concern synthesis, and assessment pipeline.

### Maintainer — $1,000/mo

Fund dedicated maintainer time: dependency updates, bug fixes, pipeline monitoring, threshold calibration, issue triage, and keeping the daily snapshot pipeline healthy.

### Sprint Sponsor — $2,500 (one-time)

Fund a full development sprint from the [project roadmap](docs/ROADMAP.md). Each sprint produces named deliverables tracked publicly — see [DECISIONS.md](docs/DECISIONS.md) for retrospectives showing planned vs. built for every completed sprint.

## How to Sponsor

Click the **Sponsor** button on the [repository page](https://github.com/agile-explorations/democracy-monitor) or visit [github.com/sponsors/agile-explorations](https://github.com/sponsors/agile-explorations).
