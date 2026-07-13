# Design Brief: mediaFreedom Federal Register Routing Contamination (#524)

_Self-contained brief for external design discussion. 2026-07-11._

## System context

Democracy Monitor is an open-source platform that detects democratic-erosion signals by
analyzing the U.S. government's documentary record. It ingests documents from federal
sources (Federal Register, CourtListener, DOJ press releases, Congressional Record,
presidential documents, etc.) into 14 institutional categories. Detection is driven by a
two-pass AI review: Pass 1 (gpt-4o-mini) screens every document for potential
erosion-relevance; Pass 2 (Claude Sonnet) classifies flagged documents. A separate layer,
**silence detection**, flags categories where government sources go quiet while
independent sources (congressional speeches, court filings) remain active — the
volume of government documents per category per week is its core input.

Federal Register (FR) ingestion is signal-driven. Each category defines signals as
pseudo-URLs against the FR API, e.g.
`/api/federal-register?term=FOIA+|+"public records"&agency=...`. The FR API's `term`
parameter is a **full-text search** over the entire document body; there is no
title-only or abstract-only search. Agency filters (`agency=`) exist and were added to
16 term-only signals in an earlier contamination fix.

## The problem

The **mediaFreedom** (Press Freedom) category has exactly two FR signals, both
intentionally agency-unscoped because FOIA/press actions can originate from any agency:

1. `fr_press_foia`: `term = "freedom of information" | "press credentials"`
2. `fr_foia_compliance`: `term = FOIA | "FOIA compliance" | "public records"`

These phrases appear in the **administrative boilerplate** of routine notices from
virtually every agency — Privacy Act statements ("records are available under the
Freedom of Information Act"), Paperwork Reduction Act confidentiality clauses, docket-
examination paragraphs. Full-text search therefore matches enormous volumes of
irrelevant documents.

**Measured impact (production data, 2026-07-11):**

- FR documents are **88.5% of the category's T2 corpus** (2,827 of 3,193 docs since
  2025-01-20); **≥95% of those FR docs are off-topic**. Top agencies: FAA (565), SEC
  (403), Federal Reserve (304), Education (240), Maritime Administration (206) — none
  press-related. Typical matches: airworthiness directives, vessel coastwise-trade
  notices, information-collection notices.
- The pollution spans **every analysis period back to 2017**: ~17,500 FR docs total
  (Biden 2021–22: 7,409; gap years 2023–24: 4,423; Trump T1: 2,860; T2: 2,827),
  including calibrated baseline periods.
- **Detection contribution is near zero:** of 123 Pass-1 flags in T2 mediaFreedom, only
  8 came from FR documents. The category's real signal comes from floor speeches (60),
  judicial opinions (17), presidential interviews (16), legislative actions (16).
- **Silence detection is likely blinded** for this category: ~65 boilerplate FR docs
  arrive weekly, so government-source volume can never drop enough to register genuine
  silence on press freedom — the category where suppression-by-silence matters most.
- Also: only 8 of the 29 P1-flagged FR docs (all periods) are actually press-freedom
  relevant; the rest are org-chart and Privacy Act notices that P1 over-flags.

**Why the previous fix pattern doesn't apply:** the earlier FR contamination fix added
`agency=` scoping to term-only signals. That is wrong here — FOIA regulations genuinely
come from any agency (our labeled on-topic docs span OMB, EPA, NASA, OCC, FDIC, USAID,
IMLS, Commission of Fine Arts…). The terms, not the agency scope, are the problem.

## Labeled evaluation sample

We built a ground-truth sample: **234 mediaFreedom FR docs** from production, stratified
across all four periods, including all 29 P1-flagged FR docs and an oversampled
likely-positive stratum. Labels: **23 on-topic / 211 off-topic**
(`docs/internal/MEDIAFREEDOM_LABELED_SAMPLE.json`).

Label criteria — ON-topic if the document's **subject matter** is public information
access or the press: FOIA/public-records policy, procedures, fees, or rescissions; press
credentials/access; journalist protections; whistleblower-disclosure and
records-production rules; agency records-disclosure regulations. OFF-topic includes
Privacy Act system-of-records notices and implementations (individual privacy, not press
access), org-chart/delegation notices, meeting notices, paperwork/information-collection
notices, and all sector-regulatory boilerplate matches.

Known caveats: single labeler; borderline calls documented (Privacy Act → off, FCC
routine media paperwork → off, FOIA advisory-committee meeting notices → off); the
sample oversamples positives (true base rate ~2%).

## Options evaluated against the sample

| Approach                                                      |       Recall | Precision | Notes                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------- | -----------: | --------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Post-fetch title relevance allowlist**                   | 100% (23/23) |     85.2% | Regex allowlist on **title** (FOIA, freedom of information, public records, press credentials/access, journalis\*, disclosure/availability of information/records, open government, declassification, shield law, leak investigation). 4 false keeps: FOIA advisory-committee meetings + a FOIA-form paperwork notice. |
| **A + 3 exclusion patterns** (meetings, info collections)     |         100% |      100% | On this sample. Exclusions were tuned on the same sample — needs holdout verification.                                                                                                                                                                                                                                 |
| **B. Document-class blocklist**                               |         100% |     31.5% | Drop known boilerplate classes (airworthiness, PRA notices, SROs…). 50 noise docs still pass; new boilerplate classes appear over time — a treadmill.                                                                                                                                                                  |
| **C. FR `topics` facet query**                                |    **65.2%** |      poor | Replace term search with `conditions[topics][]="Freedom of information"`. FR topic tagging is inconsistent: several FOIA rules carry zero topics; Notices are almost never tagged. Silently drops a third of true positives. **Ruled out by the data.**                                                                |
| **D. LLM relevance gate (gpt-4o-mini, title+agency, pre-P1)** |         100% |     79.3% | ~$0.001/week at current volume (~40 docs/wk). False keeps similar to A's plus two odd ones. Adds an API dependency + nondeterminism to the ingest path.                                                                                                                                                                |

Working recommendation going into this discussion: **A (allowlist + exclusions) as the
primary filter**, applied post-fetch before storage (same pattern as our existing
content-based classifier for Congressional Record speeches), optionally with **D as a
periodic audit** (run the LLM gate over what A drops; alert on disagreement).

## Constraints

- FR API: full-text `term` search only; no title/abstract search parameter. Topics
  facets exist but are unreliably tagged (see C).
- Deterministic, testable ingest is strongly preferred; the project has been burned by
  routing changes that weren't data-verified. Any change must be re-verified against
  the labeled sample plus a fresh holdout week.
- The stored document's `content` begins with FR header boilerplate, so naive
  content-prefix matching is not a substitute for title/abstract matching. (The FR API
  can return a true `abstract` field at fetch time, which IS available to a post-fetch
  filter.)
- Two adjacent categories (infoAvailability, executiveOversight) have similar
  intentionally-unscoped term signals (FOIA/transparency, inspector-general terms). The
  chosen design should generalize to them if they show the same pathology (not yet
  measured at this depth).
- Historical cleanup (~17,500 polluted docs, including calibrated baseline periods) is
  a **separate, approval-gated decision** — the filter design should not assume the
  backlog is purged.

## Questions for discussion

1. Is a title(+abstract) regex allowlist the right primary mechanism, or is there a
   failure mode we're missing (e.g., genuinely concerning press-freedom actions whose
   FR titles are euphemistic and would evade an allowlist)? What title would a
   press-freedom-eroding FR document have that our allowlist would miss?
2. Where should the filter sit — at fetch time (documents never stored) vs. post-store
   annotation (stored but excluded from assessment/statistics)? Fetch-time keeps the
   corpus clean; post-store preserves auditability of what was dropped.
3. How should the allowlist be maintained over time (drift, new phrasings)? Is the
   LLM-audit-over-drops pattern (D auditing A) sound, or is there a better
   verification loop?
4. Should the same mechanism replace the current term signals entirely (fetch broad,
   filter locally) vs. keeping the FR term query as-is and filtering? Any reason to
   narrow the FR query itself (e.g., drop `"public records"`, the noisiest term)?
5. Does anything about this design conflict with the silence-detection use case — i.e.,
   after filtering, weekly FR volume in mediaFreedom drops from ~65 to ~1-2; is a
   near-zero-baseline category workable for volume-based silence detection, or does the
   silence layer need a different source-health notion here?
6. Generalization: what would you check before applying the same filter pattern to
   infoAvailability (FOIA/transparency terms) and executiveOversight (inspector-general
   terms), where relevance criteria are fuzzier?
