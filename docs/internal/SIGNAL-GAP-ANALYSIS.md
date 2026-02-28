# Signal Gap Analysis: Why Major Events Aren't Detected

**Date:** 2026-02-19
**Context:** After running `pnpm backfill --from 2025-01-20 --model gpt-4o-mini` for the full Trump 2025 term, the dashboard shows nearly all categories as Stable with flat sparklines. This document analyzes why major events didn't produce signals and proposes remediation.

---

## 1. The Problem

The Democracy Monitor tracks 11 institutional categories for signs of democratic erosion. After backfilling January 20, 2025 through mid-February 2026, the results are:

| Category         | Total Weeks | Weeks with Activity | Peak Severity | Status Distribution            |
| ---------------- | ----------- | ------------------- | ------------- | ------------------------------ |
| civilService     | 55          | 8                   | 2.6           | 43 Stable, 13 Warning          |
| fiscal           | 2           | 1                   | 2.6           | 2 Warning                      |
| courts           | 57          | 1                   | 1.3           | 48 Stable, 10 Warning          |
| rulemaking       | 56          | 1                   | 0.5           | 49 Stable, 8 Warning           |
| military         | 57          | 0                   | 0.0           | 14 Stable, 43 Warning, 1 Drift |
| executiveActions | 57          | 0                   | 0.0           | 58 Stable                      |
| igs              | 57          | 0                   | 0.0           | 56 Stable, 2 Warning           |
| infoAvailability | 56          | 0                   | 0.0           | 54 Stable, 3 Warning           |
| mediaFreedom     | 56          | 0                   | 0.0           | 53 Stable, 4 Warning           |
| hatch            | 43          | 0                   | 0.0           | 25 Stable, 19 Warning          |
| elections        | 3           | 0                   | 0.0           | 1 Stable, 2 Warning            |

### What produced signals (all minor)

Only 11 weekly aggregates had any severity score at all:

| Week          | Category     | Total Severity | Keywords Matched                                           |
| ------------- | ------------ | -------------- | ---------------------------------------------------------- |
| 2025-06-29    | fiscal       | 2.6            | "rescission" (drift × 1)                                   |
| 2025-09-07    | civilService | 2.6            | "excepted service" (drift × 1)                             |
| 2025-12-15    | civilService | 2.0            | "reorganization", "senior executive service" (warning × 2) |
| 2025-09-14    | civilService | 1.3            | "senior executive service" (warning × 1)                   |
| 2025-06-01    | courts       | 1.3            | "judicial review" (warning × 1)                            |
| 2025-04-27    | civilService | 1.0            | "senior executive service" (warning × 1)                   |
| 2025-09-21    | rulemaking   | 0.5            | "regulatory agenda" (warning × 1)                          |
| 4 other weeks | civilService | 0.5            | "senior executive service" (warning × 1 each)              |

These are all low-severity, warning-tier matches on generic terms like "senior executive service" and "judicial review" that appear in routine government documents.

### What the Warning statuses actually are

The Warning statuses that appear on the dashboard are NOT signals of concern:

- **hatch** (19 Warning weeks): `insufficientData: true` — only 74 documents total (some weeks have <3 docs, triggering the `MIN_ITEMS_FOR_STABLE = 3` threshold)
- **military** (43 Warning weeks): Same insufficient-data pattern — many weeks have <3 documents despite 11,723 total (they're concentrated in certain weeks)
- **fiscal** (2 Warning weeks): Only 5 documents fetched total; 1 matched "rescission" keyword

### What didn't produce signals

These major events during the period produced **zero signal** in the relevant categories:

1. **DOGE (Department of Government Efficiency)** — Elon Musk's team gained access to Treasury, OPM, and other agency systems to identify spending cuts. Mass federal workforce reduction followed.
2. **USAID closure** — The administration effectively shut down USAID, a Congressionally-funded agency, firing staff and halting programs.
3. **National Guard threats** — Threats to deploy National Guard to "blue cities" as immigration enforcement.
4. **Military domestic deployment speech** — A gathering of military leaders where Trump said they should prepare to be deployed in American cities.
5. **Career civil servant purges** — Mass removal of career civil servants deemed disloyal, including at DOJ, State Department, and intelligence agencies.
6. **Inspector General firings** — Multiple IGs fired simultaneously.
7. **Court order defiance** — Multiple instances of the administration ignoring or slow-walking compliance with federal court orders.
8. **Impoundment of Congressionally-appropriated funds** — Withholding funds that Congress had appropriated, echoing the constitutional crisis that led to the Impoundment Control Act.

---

## 2. Root Cause Analysis

### Root Cause 1: Architecture Gap — Two Disconnected Pipelines

The system has two data pipelines that don't communicate:

**Pipeline A: Category Assessment** (what the dashboard shows)

- Sources: Federal Register documents (fetched via FR API queries per category)
- Process: Keyword matching against assessment-rules.ts dictionaries → severity scoring → AI Skeptic review
- Output: Status levels (Stable/Warning/Drift/Capture) per category per week

**Pipeline B: Rhetoric/Intent Tracking** (stored but not surfaced in category assessments)

- Sources: White House briefings, GDELT news articles, WH archive
- Process: Stored as `category='intent'` → classified by policy area → intent weekly aggregates
- Output: Separate intent analysis (not connected to category status levels)

**The gap:** 231,760 rhetoric documents were collected covering the entire period. These include news coverage of DOGE, USAID, military threats, purges, etc. But they're stored in the `intent` pipeline and **never processed by the category keyword assessment engine**. The category assessments only see Federal Register documents.

```
White House briefings ──→ category='intent' ──→ Intent pipeline (not on dashboard)
GDELT news articles   ──→ category='intent' ──→ Intent pipeline (not on dashboard)
                                                       ✗ NOT fed to category assessments

Federal Register docs ──→ category='{cat}'  ──→ Keyword matching → Dashboard
```

### Root Cause 2: Federal Register Queries Are Too Narrow

The FR signal definitions use specific search terms that assume formal regulatory processes:

| Category      | FR Query Terms                                                                                                                | What's Missing                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| civilService  | `schedule+f+civil+service`, `agency=personnel-management-office`                                                              | DOGE, mass firings, loyalty tests, probationary employee terminations |
| fiscal        | `impoundment+rescission+deferral+withholding+appropriation`, `anti-deficiency+apportionment+obligation+sequestration+impound` | Funding freezes, USAID defunding, executive spending pauses           |
| courts        | `injunction+compliance`, `judicial+nomination+appointment`, `court+jurisdiction+judicial+reform`                              | Court order defiance, contempt proceedings                            |
| military      | `national+emergency`, `national+guard+deployment`, `agency=defense-department`                                                | Domestic deployment rhetoric, Insurrection Act discussions            |
| oversight/igs | `inspector+general`, `oversight+accountability+watchdog`                                                                      | IG firings (these aren't announced via FR)                            |

**Key insight:** Many of the concerning actions bypass the Federal Register entirely. The FR is for formal rulemaking, not for executive announcements, firings, or operational directives. An administration that circumvents normal processes will inherently evade an FR-focused monitoring system.

### Root Cause 3: Keywords Assume Formal Processes

The keyword dictionaries in `assessment-rules.ts` are calibrated for formal government language:

**civilService capture-tier keywords** (what we look for):

- "schedule f", "mass termination", "political loyalty test", "merit system violation"

**What's actually happening** (language used):

- "probationary employee", "DOGE workforce reduction", "voluntary resignation program", "return to office mandate", "agency restructuring"

**fiscal capture-tier keywords:**

- "violated impoundment control act", "illegal impoundment", "anti-deficiency act violation"

**What's actually happening:**

- "funding pause", "spending freeze", "agency closure", "budget efficiency review"

**military capture-tier keywords:**

- "insurrection act invoked", "martial law declared", "troops deployed domestically"

**What's actually happening:**

- "National Guard immigration enforcement", "military support for border", "prepared for domestic deployment"

The keywords look for the formal legal terminology that would describe the most severe version of these actions. The actions being taken use different, often euphemistic, language.

### Root Cause 4: Source Coverage Gaps

| Source                   | Status               | Impact                                                                                                        |
| ------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------- |
| oversight.gov            | Down since Oct 2025  | No IG report monitoring; `oversightGovDown: 'drift'` rule triggers but only for that category                 |
| Executive Orders         | Not directly scraped | EOs are on the WH website but only captured via rhetoric pipeline (intent), not routed to category assessment |
| Congressional Record     | Not monitored        | Appropriations violations, impeachment discussions invisible                                                  |
| Court filings (PACER)    | Not monitored        | Compliance/defiance only visible if covered by FR or news                                                     |
| WhiteHouse.gov briefings | Feeds intent only    | Announcements about firings, agency closures, DOGE etc. don't reach category assessments                      |

### Root Cause 5: Document Volumes and Statistical Thresholds

Document counts by category in the backfill:

| Category         | Documents Fetched | Documents Scoring > 0 | Notes                                           |
| ---------------- | ----------------- | --------------------- | ----------------------------------------------- |
| military         | 11,723            | 4                     | High volume from DoD, almost no keyword matches |
| executiveActions | 9,341             | 0                     | High volume, zero matches                       |
| igs              | 4,287             | 0                     | High volume, zero matches                       |
| civilService     | 2,755             | 4                     | Moderate volume, only generic matches           |
| rulemaking       | 2,751             | 1                     | Moderate volume, 1 match                        |
| courts           | 2,460             | 0                     | Moderate volume, zero matches                   |
| infoAvailability | 1,214             | 0                     |                                                 |
| mediaFreedom     | 359               | 0                     |                                                 |
| hatch            | 332               | 0                     | Low volume → insufficient data warnings         |
| elections        | 13                | 0                     | Extremely low volume                            |
| fiscal           | 5                 | 0                     | Near-zero volume                                |

**fiscal** has only 5 documents total across 57 weeks. The FR queries for impoundment/rescission terms simply aren't returning results, likely because the administration's fiscal actions aren't being documented through FR notices.

**elections** has only 13 documents — election-related FR activity is inherently low between election cycles.

---

## 3. Categories of Missing Signals

### 3.1 Actions That Bypass Formal Processes

These actions don't generate Federal Register notices:

- Firing career civil servants (done via personnel actions, not rulemaking)
- Firing Inspectors General (announced via press, not FR)
- Closing/defunding agencies like USAID (operational decision, not FR notice)
- DOGE accessing government systems (no regulatory process involved)
- Ignoring court orders (non-action produces no documents)

**Proposed fix:** Route rhetoric/news documents through category keyword matching in addition to the intent pipeline.

### 3.2 Actions Using Euphemistic Language

These actions produce FR documents but use language the keywords don't catch:

- "Workforce restructuring" instead of "mass termination"
- "Agency reorganization" instead of "political purge"
- "Spending review" instead of "impoundment"
- "Efficiency improvement" instead of "defunding oversight"

**Proposed fix:** Expand keyword dictionaries to include operational/euphemistic language.

### 3.3 Actions in Uncovered Sources

These are documented but not in sources we monitor:

- Executive Orders (on WH website, not systematically scraped for category assessment)
- Congressional testimony about appropriations violations
- Court filings showing non-compliance
- State AG lawsuits challenging federal actions

**Proposed fix:** Add source feeds for executive orders, major court dockets, Congressional actions.

### 3.4 Multi-Category Events Not Captured

Some events span multiple categories but aren't detected in any:

- DOGE affects civilService + fiscal + oversight + executiveActions
- USAID closure affects fiscal + oversight + infoAvailability
- Military deployment threats affect military + courts (if court orders ignored)

**Proposed fix:** Cross-category correlation signals when multiple categories show unusual activity simultaneously.

---

## 4. Specific Missed Events and Their Detection Gaps

### DOGE (Department of Government Efficiency)

| Aspect                               | Relevant Category | Why Missed                                                                                       |
| ------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------ |
| DOGE team accessing Treasury systems | fiscal            | Action outside FR; no FR notices for system access                                               |
| Mass federal hiring freeze           | civilService      | FR query for OPM only catches formal OPM rules, not operational freezes                          |
| DOGE-driven RIFs                     | civilService      | Keywords expect "mass termination" but actual language is "reduction in force", "reorganization" |
| Spending cut directives              | fiscal            | Only 5 FR docs found for fiscal; actual spending actions not published as FR notices             |
| Accessing personnel data             | oversight         | oversight.gov is down; no other source for data access concerns                                  |

**Missing keywords (civilService):** "doge", "government efficiency", "reduction in force", "rif", "probationary employee", "return to office", "telework ban", "voluntary resignation", "deferred resignation", "fork in the road"

**Missing keywords (fiscal):** "spending freeze", "funding pause", "budget cut directive", "agency closure", "defunded", "program termination"

### USAID Closure

| Aspect                                | Relevant Category | Why Missed                                                           |
| ------------------------------------- | ----------------- | -------------------------------------------------------------------- |
| Agency shutdown                       | fiscal            | No FR notices; operational directive                                 |
| Congressional appropriations violated | fiscal            | Keywords expect "impoundment" legal terms, not operational shutdowns |
| Staff fired                           | civilService      | Not published in FR; uses operational language                       |
| Oversight of foreign aid eliminated   | oversight         | oversight.gov down; IG reports not monitored                         |

**Missing keywords (fiscal):** "agency closure", "agency shutdown", "appropriations violation", "defunding congressionally-mandated program", "usaid"

### National Guard / Military Domestic Deployment

| Aspect                             | Relevant Category     | Why Missed                                              |
| ---------------------------------- | --------------------- | ------------------------------------------------------- |
| Threats to deploy in cities        | military              | Rhetoric pipeline only, not category assessment         |
| Immigration enforcement deployment | military, immigration | Immigration category has NO keywords or signals defined |
| Speech about domestic military use | military              | Speeches go to intent pipeline, not military category   |

**Missing keywords (military):** "deploy to american cities", "domestic law enforcement", "immigration enforcement military", "sanctuary city", "national guard to cities"

**Missing category:** `immigration` exists in assessment rules but has NO signals defined in `categories.ts`. The entire category is non-functional.

### Career Civil Servant Purges

| Aspect                                | Relevant Category | Why Missed                                                                                                              |
| ------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Mass firings for disloyalty           | civilService      | Keywords expect formal "schedule f" or "political loyalty test"; actual language is "performance-based", "probationary" |
| DOJ/State/Intel purges                | civilService      | Not documented via FR; personnel actions                                                                                |
| Replacing career staff with loyalists | civilService      | "Burrowing in" is a keyword but looks for formal conversion, not informal replacement                                   |

**Missing keywords (civilService):** "probationary period termination", "at-will termination", "political vetting", "loyalty screening", "political appointment to career role", "acting official replacement", "detailed to", "reassigned from"

### Inspector General Firings

| Aspect                            | Relevant Category | Why Missed                                                                                                         |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| Multiple IGs fired simultaneously | igs/oversight     | "inspector general removed" is a capture keyword BUT IG firings don't appear in FR; they're announced via WH press |
| Oversight capacity gutted         | igs/oversight     | oversight.gov is down; FR query for "inspector general" returns routine IG reports, not firing announcements       |

**Gap:** The keywords exist but the source data doesn't contain the relevant documents. IG firings are announced through press releases and news coverage, which flows to the intent pipeline, not the oversight category.

### Court Order Defiance

| Aspect                              | Relevant Category | Why Missed                                                                                |
| ----------------------------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| Refusing to comply with injunctions | courts            | "defied court order" is a capture keyword, but compliance failures aren't published in FR |
| Slow-walking court orders           | courts            | "delayed compliance" is a drift keyword, but court compliance isn't tracked via FR        |

**Gap:** Same pattern — the keywords exist but the source documents (court filings, news coverage) don't reach the category assessment pipeline.

---

## 5. Architectural Recommendations

### R1: Cross-Feed Rhetoric Documents to Category Assessments

**What:** When rhetoric documents (WH, GDELT, news) are fetched, also run them through the category keyword assessment engine.

**How:** In the backfill/snapshot pipeline, after storing rhetoric docs as `category='intent'`, also pass them to `analyzeContent()` for each relevant category. Use `classifyPolicyAreaWithScore()` to determine which categories a rhetoric doc is relevant to, then score it against those categories' keyword dictionaries.

**Impact:** The 231,760 rhetoric documents would start being scanned for category-specific keywords. News about DOGE, USAID, IG firings etc. would produce matches in the relevant categories.

**Complexity:** Medium. Requires modifying the backfill pipeline to route rhetoric docs to category assessment in addition to intent.

### R2: Expand Keyword Dictionaries for Operational Language

**What:** Add keywords that match the actual language used for informal, euphemistic, and operational government actions.

**Examples:**

- civilService: "probationary employee termination", "return to office mandate", "voluntary resignation program", "deferred resignation", "doge workforce", "reduction in force"
- fiscal: "spending freeze", "funding pause", "agency closure", "program termination", "operational halt"
- military: "deploy to cities", "domestic law enforcement military", "sanctuary city enforcement"
- courts: "ignored court order", "defied injunction", "refused to comply with ruling"
- oversight: "inspector general fired", "ig dismissed", "watchdog removed"

**Impact:** Existing FR documents that use operational language would start producing matches. Combined with R1 (rhetoric cross-feed), news coverage using this language would also produce matches.

**Complexity:** Low. Keyword additions to `assessment-rules.ts`.

### R3: Add Executive Order Source Feed

**What:** Directly scrape executive orders, presidential memoranda, and proclamations from the Federal Register's presidential documents section (which is more reliable than WH website) and route them to relevant categories.

**How:** Add a new signal type or modify existing FR queries to include `type=PRESDOCU` (presidential documents) for relevant categories.

**Impact:** Executive orders about government restructuring, spending directives, military deployment authorities, etc. would be directly assessed.

**Complexity:** Low. FR API supports `type=PRESDOCU` filter.

### R4: Fix Immigration Category

**What:** The `immigration` category exists in some code paths but has NO signals defined in `categories.ts` and NO keywords in `assessment-rules.ts`. It's completely non-functional.

**Impact:** Would enable monitoring of immigration-related executive actions, including National Guard deployment for immigration enforcement.

**Complexity:** Medium. Requires defining signals, keywords, and running baseline calibration.

### R5: Add Non-FR Source Feeds

**What:** Add sources beyond the Federal Register for events that don't generate FR notices:

- Congressional Research Service reports
- Major court docket feeds (key cases)
- State Attorney General action feeds
- Government accountability organizations (POGO, etc.)

**Impact:** Would capture events that bypass formal regulatory processes entirely.

**Complexity:** High. Each new source requires a parser, deduplication, and baseline calibration.

### R6: Separate "Insufficient Data" from "Warning"

**What:** The current system returns Warning status when fewer than 3 documents are available for a week (`MIN_ITEMS_FOR_STABLE = 3`). This conflates "we don't have enough data to assess" with "we detected something concerning."

**Impact:** Would eliminate false Warning signals on the dashboard (e.g., hatch with 19 Warning weeks that are all insufficient-data, military with 43 Warning weeks).

**Complexity:** Low. Add "InsufficientData" status level or display "Unknown" when `insufficientData: true`.

---

## 6. Prioritized Recommendations

| Priority | Recommendation                               | Impact    | Effort | Rationale                                                           |
| -------- | -------------------------------------------- | --------- | ------ | ------------------------------------------------------------------- |
| P0       | R2: Expand keywords for operational language | High      | Low    | Quick win — immediately improves detection in existing FR documents |
| P0       | R6: Separate insufficient data from Warning  | Medium    | Low    | Eliminates false warnings, improves dashboard signal-to-noise       |
| P1       | R1: Cross-feed rhetoric to categories        | Very High | Medium | Unlocks 231K documents that currently bypass category assessment    |
| P1       | R3: Add executive order feed                 | High      | Low    | EOs are a primary mechanism for the actions we're trying to detect  |
| P2       | R4: Fix immigration category                 | Medium    | Medium | Enables monitoring of a major action area                           |
| P3       | R5: Add non-FR sources                       | High      | High   | Long-term improvement, significant development effort               |

---

## 7. Data Appendix

### A. Current Keyword Dictionaries (relevant categories)

#### civilService

**Capture (16):** schedule f, excepted schedule f, mass termination, mass removal, political appointee conversion, title 5 exemption, merit system violation, violated civil service protections, unlawful termination, systematic purge, political loyalty test, removed for political reasons, political loyalty oath, mass reclassification to schedule f, political commissar, ideological screening

**Drift (14):** reclassification, excepted service, policy-influencing position, career staff removed, reduced career positions, political control over hiring, at-will employment, bypassing merit system, categorical exclusion, hiring freeze on career positions, political vetting of applicants, reassigned to lesser role, loyalty pledge, burrowing in

**Warning (7):** workforce reduction, reorganization, senior executive service, position eliminated, restructuring, voluntary separation incentive, buyout offer

#### fiscal

**Capture (12):** violated impoundment control act, illegal impoundment, unlawful withholding, anti-deficiency act violation, gao decision, violated appropriations law, illegal rescission, unconstitutional refusal, contempt for withholding, government shutdown, debt ceiling breach, unconstitutional spending

**Drift (12):** deferral, apportionment withheld, rescission, budget authority withheld, refused to obligate, selective implementation, funding freeze, impoundment, delayed obligation, continuing resolution only, budget proposal defunds, unilateral tariff

**Warning (8):** funding delay, obligation rate, apportionment, spend plan, sequestration risk, debt ceiling debate, continuing resolution, debt ceiling

#### courts

**Capture (14):** contempt of court, defied court order, refused to comply, violated injunction, ignored court ruling, non-compliance with order, contempt citation, willful violation of court order, jurisdiction stripped, court packing, abolished court, eliminated judicial review, judge threatened, marshal defied

**Drift (15):** delayed compliance, partial compliance, slow-walking court order, emergency stay sought, appealing for delay, minimal compliance, procedural objections to compliance, judicial vacancy unfilled, court expansion proposal, forum shopping, judge reassignment, compliance delayed months, nationwide injunction challenged, standing denied, justiciability

**Warning (10):** injunction issued, preliminary injunction, temporary restraining order, court ordered, judicial review, judicial nomination, circuit court vacancy, appointment pace, standing questioned, mootness argument

#### military

**Capture (12):** insurrection act invoked, martial law declared, military occupation, troops deployed domestically, military law enforcement, suspended habeas corpus, IEEPA invoked, national emergency declared for domestic, insurrection act preparations, emergency powers expanded, civilian officials replaced by military, military tribunals for civilians

**Drift (12):** domestic military deployment, law enforcement role for military, posse comitatus, preparing to invoke insurrection act, military on standby, federalized national guard, emergency declaration renewed, IEEPA authority cited, emergency powers invoked, national emergency extended, military advisor appointed to civilian role, pentagon budget used for domestic

**Warning (8):** national guard activated, border deployment, title 32 activation, state request for troops, emergency authority review, IEEPA compliance, national emergency renewal, civil-military tension reported

#### oversight/igs

**Capture (10):** inspector general removed, ig fired, ig terminated without cause, mass ig removal, defunded inspector general, eliminated ig office, systematic obstruction of oversight, ig independence violated, whistleblower retaliation, ig subpoena power revoked

**Drift (13):** acting inspector general, ig vacancy, funding cut to oversight, obstruction of investigation, denied access, ig report suppressed, oversight.gov, lack of apportionment, delayed ig appointment, restricted ig authority, ig budget reduced, ig report classified, whistleblower complaint dismissed

**Warning (6):** independence concern, access delayed, report delayed, investigation pending, ig staffing reduced, ig hiring freeze

#### elections

**Capture (9):** election official removed, election board replaced, voting suspended, election results overturned, ballots destroyed, election certification blocked, election postponed, candidate disqualified, election monitor expelled

**Drift (11):** voter roll purge, polling location closed, ballot restriction, reduced early voting, voter suppression, mail-in ballot restriction, ballot drop box removed, election official threatened, redistricting overturned, campaign finance rules suspended, observer access denied

**Warning (8):** election challenge, recount demanded, fraud allegation, voter ID requirement, election audit, election security funding cut, voter registration deadline shortened, preclearance

#### hatch

**Capture (7):** hatch act violation found, systematic hatch act violations, osc enforcement suspended, defunded office of special counsel, violated hatch act, osc found violation, unlawful partisan activity

**Drift (6):** multiple hatch act violations, repeated partisan messaging, official channels for campaign, political activity in office, pattern of violations, weakened enforcement

**Warning (4):** hatch act complaint, osc investigation, alleged violation, partisan communication

### B. Federal Register Signal Queries

| Category     | Signal ID               | Query                                                                 |
| ------------ | ----------------------- | --------------------------------------------------------------------- |
| civilService | fr_opm                  | `agency=personnel-management-office`                                  |
| civilService | fr_schedule_f           | `term=schedule+f+civil+service`                                       |
| fiscal       | fr_impoundment          | `term=impoundment+rescission+deferral+withholding+appropriation`      |
| fiscal       | fr_anti_deficiency      | `term=anti-deficiency+apportionment+obligation+sequestration+impound` |
| courts       | fr_court_compliance     | `term=injunction+compliance`                                          |
| courts       | fr_judicial_nominations | `term=judicial+nomination+appointment`                                |
| courts       | fr_court_structure      | `term=court+jurisdiction+judicial+reform`                             |
| military     | fr_national_emergency   | `term=national+emergency`                                             |
| military     | fr_national_guard       | `term=national+guard+deployment`                                      |
| military     | fr_dod                  | `agency=defense-department`                                           |
| oversight    | fr_inspector_general    | `term=inspector+general`                                              |
| oversight    | fr_oversight            | `term=oversight+accountability+watchdog`                              |
| elections    | fr_election_integrity   | `term=election+integrity+interference+voting+rights+ballot+access`    |
| elections    | fr_election_admin       | `term=election+commission+certification+recount+polling+place`        |
| hatch        | fr_hatch_act            | `term=hatch+act`                                                      |
| hatch        | fr_special_counsel      | `agency=special-counsel-office`                                       |

### C. Assessment Thresholds

| Parameter                 | Value | Purpose                                                                          |
| ------------------------- | ----- | -------------------------------------------------------------------------------- |
| MIN_ITEMS_FOR_STABLE      | 3     | Min documents needed to assess as Stable (below = Warning with insufficientData) |
| CAPTURE_MATCH_THRESHOLD   | 2     | Min capture-tier keyword matches for Capture status                              |
| DRIFT_MATCH_THRESHOLD     | 2     | Min drift-tier keyword matches for Drift status                                  |
| Tier weight: capture      | 4     | Severity multiplier for capture-tier matches                                     |
| Tier weight: drift        | 2     | Severity multiplier for drift-tier matches                                       |
| Tier weight: warning      | 1     | Severity multiplier for warning-tier matches                                     |
| Volume threshold: warning | 10    | Document count triggering volume-based Warning                                   |
| Volume threshold: drift   | 25    | Document count triggering volume-based Drift                                     |
| Volume threshold: capture | 50    | Document count triggering volume-based Capture                                   |

### D. Pipeline Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     DATA SOURCES                                 │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│ Federal      │ White House  │ GDELT News   │ RSS Feeds          │
│ Register API │ Briefings    │ Articles     │ (SCOTUS, DoD, etc) │
└──────┬───────┴──────┬───────┴──────┬───────┴────────┬───────────┘
       │              │              │                │
       ▼              ▼              ▼                ▼
┌──────────────┐ ┌────────────────────────────┐ ┌──────────────┐
│ FR Documents │ │ Rhetoric Documents         │ │ RSS Documents│
│ category=    │ │ category='intent'          │ │ category=    │
│ {cat_key}    │ │ (ALL WH + GDELT go here)  │ │ {cat_key}    │
└──────┬───────┘ └────────────┬───────────────┘ └──────┬───────┘
       │                      │                        │
       ▼                      ▼                        ▼
┌──────────────────────┐ ┌──────────────────┐ ┌──────────────────────┐
│ CATEGORY ASSESSMENT  │ │ INTENT PIPELINE  │ │ CATEGORY ASSESSMENT  │
│ Keyword matching     │ │ Policy area      │ │ Keyword matching     │
│ against assessment-  │ │ classification   │ │ against assessment-  │
│ rules.ts dictionaries│ │ Intent weekly    │ │ rules.ts dictionaries│
│ → Status levels      │ │ aggregation      │ │ → Status levels      │
│ → AI Skeptic review  │ │ → NOT on         │ │ → AI Skeptic review  │
│ → Dashboard display  │ │    dashboard     │ │ → Dashboard display  │
└──────────────────────┘ └──────────────────┘ └──────────────────────┘
       ▲                                              ▲
       │        ╔══════════════════════════╗           │
       │        ║  231,760 RHETORIC DOCS   ║           │
       │        ║  NEVER REACH CATEGORY    ║           │
       │        ║  ASSESSMENT PIPELINE     ║           │
       │        ╚══════════════════════════╝           │
       │                                              │
       └──── Only FR + RSS documents assessed ────────┘
```

---

## 8. Questions for Discussion

1. **Architecture priority:** Should we cross-feed rhetoric to categories (R1) or expand keywords first (R2)? R2 is faster but R1 has broader impact since most concerning actions aren't in FR at all.

2. **Keyword expansion scope:** How aggressively should we add operational/euphemistic language? Risk of false positives vs. current false negatives.

3. **InsufficientData handling:** Should we add a new status level ("Unknown"/"InsufficientData"), or just change the display to not show Warning for these cases?

4. **Immigration category:** Should we build this out now, or defer until after the architecture fixes?

5. **What other major events or patterns are we missing?** The list in Section 4 is based on what I know — a broader review of Trump 2025 actions would likely reveal additional gaps.

6. **Non-FR sources (R5):** Which non-FR sources would have the highest value-to-effort ratio? Congressional Research Service? Court docket feeds? GAO reports?

7. **Should the system detect absence of expected documents?** For example, if an agency normally publishes weekly FR notices and suddenly stops, that silence itself could be a signal.
