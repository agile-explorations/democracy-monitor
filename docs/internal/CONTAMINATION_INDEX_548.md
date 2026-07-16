# Contamination Index: infoAvailability + executiveOversight FR Term Signals (#548)

_Measurement sprint R-SPARSE, 2026-07-15/16. Protocol per #524: stratified labeled samples,
re-derived per-category criteria, owner second-labeler adjudication. No filter built._

## Method

- Stratified samples from production (read-only): all T2 FR docs with confirmed P2 assessments,
  a seeded sample of T2 FR P1-flagged docs, and random FR docs across four periods
  (trump_2017, biden_2021_22, gap_2023_24, t2).
- Label criteria re-derived per category (documented in each sample file; NOT ported from
  mediaFreedom — an agency FOIA regulation is off-topic there but on-topic here).
- Single labeler + owner adjudication of a 50-doc stratified subsample per category.
  Owner refinements folded back into the labels: transparency-_adjacent_ regulatory changes
  (e.g., a compliance reg containing disclosure mechanisms; guidance withdrawals) are OFF unless
  the document's subject IS information access; direction doesn't matter (a records _release_
  is ON — relevance is topic, concern is L2's job).

## Results

|                                        | infoAvailability      | executiveOversight |
| -------------------------------------- | --------------------- | ------------------ |
| FR share of corpus (T2)                | 96.9% (10,227/10,557) | 18.4% (593/3,222)  |
| FR share, all periods                  | 96–98% every period   | 14–27%             |
| Random FR stratum on-topic             | **0/100**             | **1/113**          |
| P1-flagged FR on-topic                 | 5/37                  | 0/19               |
| P2-confirmed FR on-topic               | **20/50 (40%)**       | **15/19 (79%)**    |
| FR share of P1 flags (T2)              | 66% (225/339)         | 8% (38/476)        |
| FR share of P2 confirmations (T2)      | **49% (50/102)**      | 8% (19/249)        |
| Label reliability (owner adjudication) | 96.0% (48/50)         | 98.0% (49/50)      |
| Weekly gov-doc volume                  | 151.8/wk (flood)      | 14.8/wk (healthy)  |

**Cross-category overlap (the load-bearing fact for infoAvailability):** of the 30
confirmed-but-off-topic FR docs in the sample, 19 also exist under other categories but only
**10 are P2-confirmed elsewhere** — a mediaFreedom-style blunt retrieval filter would remove
**20 real confirmed detections from the system entirely** (NEPA rescissions, disclosure-rule
changes confirmed as erosion but routed to the wrong category).

## Interpretation

- **infoAvailability has a worse noise flood than mediaFreedom did** (random stratum 0% vs ~5%
  on-topic) **but a categorically different signal profile**: FR supplies half the category's
  confirmed detections, 40% of them genuinely on-topic, and the misrouted remainder are mostly
  real erosion signals living in the wrong bucket. The mediaFreedom cure (drop at retrieval)
  amputates detection here. Silence detection remains blinded by the ~152 docs/week flood
  (not sparse — #546's sparse mode does not apply).
- **executiveOversight's FR pipe is equally contaminated per-doc but strategically minor**: FR
  is 18% of the corpus, 8% of detections; confirmed FR docs are mostly on-topic accountability
  EOs that the presidential-documents pathway would carry regardless. Volume is healthy; silence
  works. The pathology exists but the blast radius is small.

## Recommendations (product call — options for the owner)

1. **infoAvailability: filter + reroute, as a designed sprint — not the #541 pattern as-is.**
   A v2 approach needs (a) a re-derived allowlist reflecting this category's wider ON scope,
   verified against this sample plus a fresh holdout; (b) a routing answer for the confirmed
   strays before any historical annotation (the #547 per-signal funnel diagnostic is the natural
   instrument); (c) the same annotation+recompute coupling discipline as #544. Payoff: un-blinds
   silence for the transparency category and removes ~10k junk docs/period from stats/search.
2. **executiveOversight: no action now.** Revisit after the funnel diagnostic (#547) exists;
   candidate light-touch fix is term retargeting rather than a filter.

## Artifacts

- Labeled samples: `CONTAMINATION_SAMPLE_INFOAVAILABILITY.json` (187 docs),
  `CONTAMINATION_SAMPLE_EXECUTIVEOVERSIGHT.json` (151 docs) — criteria embedded per row
  (`label_method` marks auto-proxy vs hand vs owner-adjudicated).
- Corpus profile queries + per-stratum stats: session scratchpad `contamination-profile.js`.
