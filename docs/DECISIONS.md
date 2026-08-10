# Decisions & Retrospectives

This file captures what was planned vs what was built, spec deviations, key decisions, and lessons learned for each sprint. Read this alongside relevant spec sections before starting a new sprint.

**Older sprints archived in `DECISIONS-ARCHIVE.md`** (R-FEEDBACK-RESPOND and earlier).

**Spec documents referenced:**

- `SYSTEM SPECIFICATION V3 ADDENDUM.md` (cited as "V3 Addendum §X")
- `UI DESIGN SPECIFICATION V3.md` (cited as "UI Spec §X")
- `ASSESSMENT_METHODOLOGY.md`

---

## Sprint R-DOCKET-CONTEXT: opinion docket timelines + posture lines + glossary (#686–#692, milestone 111) — ✅ built 2026-08-09, ships v1.7.0

**Origin**: owner discussion of the 283k metadata-only CL docket stubs' value. Pre-roadmap investigation found stored stubs CANNOT power timelines (median 1 query-matched entry/case, caption-only titles) — but every opinion's `case_id = cl:<docketId>` is a live gateway to CourtListener's v4 docket-entries API, whose entry descriptions are rich procedural text (live-probed before planning). Also settled en route: the stubs' real forward value is as the case-universe index for the future posture tracker, not as content; and the homepage corpus figure was a leftover (stubs counted in the hero number after R-POPULATION removed them from all analytics) — owner decided the hero cites only searchable full-text.

**Built (zero AI spend — fully deterministic)**:

- `lib/services/docket-timeline.ts` — pure keyword classifier (10 event types, ordered precedence) + posture derivation + one-page CL fetch. `pages/api/case/timeline` — validated (`^cl:\d{1,10}$`), rate-limited (30/min), Redis-cached 24h with **asOf captured at CL-fetch time** so the staleness stamp reports data age across cache hits; CL failure → 502, never cached.
- `useCaseTimeline` (module cache + in-flight dedupe + concurrency-3 queue) + `CaseContext` (EditorialPanel-pattern disclosure). Rendered on all three opinion surfaces; research citations auto-load the posture line (owner decision — visibility is the point; ~5–10 opinion cites/answer vs CL's 5k/hr budget).
- caseId plumbed through both search query paths, research formatDocList whitelist (optional field — 24h-cached payloads predate it), and the week-detail explanation query (+sourceType).
- **Glossary tooltips** (owner request mid-review): `lib/data/docket-glossary.ts` — 10 event-type tips + ~30 legal terms of art ("per curiam", R&R, habeas, en banc…), longest-phrase-first matching, composed into native title tooltips per the ASSESSMENT_TIPS precedent. Touch-device limitation matches every existing tooltip in the app.
- case_id join documented for dump consumers (dictionary entry + table-level note); hero count now full-text-only.

**Key decisions (owner)**: auto-load posture on research; all three surfaces at once; hero shows ~270k searchable full-text only (the ~470k records figure was an unrevisited leftover — recorded as such); glossary added.

**Lessons learned**:

- **A test can bless a bug.** The classifier initially marked "Order on Motion for Summary Judgment" as terminal `judgment` — and the fixture I wrote asserted exactly that. Caught only on re-reading the fixtures as legal facts rather than expected outputs. Fixture review is domain review.
- **The no-negative-mock-assertions OpenGrep rule earned its keep**: restructuring "cacheSet not called" into "a later request retries successfully" produced a strictly better test (real cache map, observable behavior).
- **Probe before roadmap**: the docket-stub investigation (1-entry medians, caption titles) killed the naive display-join design before anything was planned around it; the CL API probe then settled classifier feasibility with real descriptions. Both took minutes and reshaped the feature.

**Spec deviations**: none; UI-only + one cached proxy endpoint. Detection untouched (post-opinion activity surfaces as displayed context only — any status-driving use remains an explicit future methodology decision).

## Sprint R-DHS-PRESS: DHS/ICE/CBP press releases as a corpus source (#676–#683, milestone 110) — ✅ built + locally verified 2026-08-07

**Origin**: #605 research issue — immigrationEnforcement had ZERO executive-branch operational documents (recent weeks: floor speeches, bills, FR notices only), the twice-named corroboration gap (ICE operational claims uncheckable against our corpus). Sprint was gated on an archive-depth probe.

**The gate fired, then resolved**: all three live newsrooms (dhs.gov/news-releases 119pp, ice.gov/newsroom 41pp, cbp.gov/newsroom 107pp) are purged to inauguration day 2025-01-20/21 — no live baseline series. But recovery paths exist without Wayback content-fetching: DHS has an `/archive/news` subsite with a server-side press-release facet (`field_news_type_target_id=436`, 412pp back to 2008, dates in URL paths); ICE/CBP sitemaps still enumerate delisted-but-live release URLs (canaries: 50/50 per host fetched+dated+full-bodied, incl. 2022-era). Wayback CDX first-capture timestamps serve as date HINTS for the dateless sitemaps (on-page date authoritative post-fetch). The purge itself is filed as infoAvailability research (#683).

**Built**: `dhs-press-parsers.ts` (pure per-host parsers), `dhs-press-fetcher.ts` (standard fetcher module, SignalType `dhs_press`, origin `dhs_press`), `dhs-press-archive.ts` (sitemap/CDX/archive enumeration), `backfill-dhs-press.ts` driver (`--host/--period/--from/--to/--dry-run/--skip-existing/--no-cdx/--canary`), full pipeline wiring (backfill groups, incremental fetcher, ACTIVE_SOURCES, fetch_log, silence detection, validate:ingest, data dictionary, origin-aware press_release labels, `dhs_press` boilerplate stripper). 4 signals: 3 in immigrationEnforcement + `dhspress://ice?filter=hsi-criminal` fan-out in lawEnforcement (signal-level fan-out mirrors `oig://dhs?components=immigration` — the weekly cron dual-stores with zero extra machinery). CBP local-media-release URL class excluded at fetch (owner decision; deterministic → parity-safe). 50 new tests; suite 2,767 green.

**Key decisions (owner, 2026-08-07)**: current-term + historical gated (runbooks #680/#681 separately approved); ICE full + DHS + CBP national-only; immigrationEnforcement primary + HSI-criminal fan-out to lawEnforcement; purge finding → research issue. Constraint amendment signed off: PROJECT_KNOWLEDGE data-source rule now names a probe-gated newsroom-HTML exception list instead of a blanket scraping ban.

**Markup traps (live-capture verified, all regression-tested)**:

- ICE article bodies live in `.nr-body`, NOT the Drupal `.field--name-body` convention — the largest `.field--name-body` on ICE pages is an 807-char standing mission blurb. Naive selection stored boilerplate as content.
- CBP listing `<time datetime>` is a static template placeholder (same 2020-09-30 value on every row); real dates are in the visible spans, whose month/day classes are mislabeled upstream.
- `document-store.inferSourceOrigin` maps `press_release` → `'doj'`; the fetcher must set sourceOrigin explicitly (tested + rehearsal-verified 0 mis-origined rows).

**Live-measured infra facts**: Wayback CDX `limit=20000` 504s at the gateway (~60s); `limit=3000` answers in ~25s (10,270 ICE first-captures in ~6 requests). Gov hosts throw transient undici connect timeouts (host answering in <100ms moments later) — enumeration fetches retry 3× with linear backoff; canary hosts are fault-isolated so one host's outage is a result, not a crash.

**Rehearsal (local DB, week 2026-07-27)**: 30 releases stored (DHS 22/ICE 5/CBP-national 3), median body 2.2k chars, 0 stubs; 2 HSI releases fan-out to lawEnforcement, both verified genuinely HSI-criminal; validate:ingest shows the origin with only the expected T2-start warning; generic backfill + weekly group-fetcher paths smoke-tested.

**Deviation from plan**: cross-host title+day dedup found ZERO mirrors in rehearsal — DHS rewrites component headlines rather than reposting, so both versions store as distinct documents (arguably correct: the HQ rewrite is its own rhetoric artifact). The post-backfill residue audit carries the dedup burden. HSI predicate calibrated against live samples (10/10 correct on inspection) instead of the planned 50-release labeled set; formal calibration deferred to #680's canary week.

**Lessons learned**:

- **Purged listings ≠ purged content.** All three newsrooms delisted pre-2025 releases, but the documents remain live at their URLs, enumerable via sitemap/archive side channels. Check sitemaps and /archive subsites before declaring a baseline unrecoverable (or reaching for Wayback content).
- **Verify parsers against saved live captures before writing tests** — two of three hosts had markup traps (bogus datetime attrs, decoy body nodes) that inline-fixture tests written from assumptions would have enshrined as green.
- **Baseline-period runbook shape matters**: the 8 baseline periods are contiguous; one driver invocation over 2017-01-20→2025-01-19 does one enumeration + one detail pass instead of 8 (and never re-fetches the ~5k date-unknown sitemap URLs per period).

**Spec deviations**: none against V3 (new source class; methodology unchanged — press releases enter the standard L2 review path).

## Sprint R-LINKIFY-RESPONSES: clickable URLs in feedback responses (#675, milestone 109) — ✅ deployed 2026-08-04 (v1.5.10, main @ 5a40b43)

**Origin**: the owner's feedback responses render as escaped plain text, so links (e.g. the methodology URL) weren't clickable. Wanted them clickable without opening an XSS hole.

**Planned vs built**: shipped as planned; responses-only, links open in a new tab (owner decisions).

- `lib/utils/linkify.ts` — pure `splitLinkified(text)` → ordered text/link segments. `http(s)://` only; trailing sentence punctuation trimmed off the URL; `javascript:`, `data:`, and bare `www.` stay plain text (scheme allowlist by construction).
- `components/ui/Linkified.tsx` — maps segments to React `<a target="_blank" rel="noopener noreferrer">` elements. **No `dangerouslySetInnerHTML`** anywhere, so untrusted input can neither inject markup nor produce an unsafe scheme.
- Wire-in: `pages/feedback.tsx` response line only; user-submitted feedback stays plain text.
- Tests: 9 util + 4 component, incl. the security guarantees (`javascript:`/`data:` never linked; raw HTML renders inert).

**Key decisions (owner):** responses-only (authored by us — no "link launchpad" exposure that linkifying arbitrary user feedback would carry); open in a new tab; a narrow autolink helper over pulling the react-markdown `Markdown` component into the feedback page (less surface).

**Lessons learned:**

- **Autolink safely by construction, not by sanitization.** Building React `<a>` elements from parsed segments with an http(s)-only allowlist means there is no HTML-injection path to sanitize away — the escaping guarantee is preserved and the unsafe-scheme class is excluded by the regex. Verified by tests asserting no anchor for `javascript:`/`data:` and inert rendering of `<img onerror=…>`.
- **Keep the fiddly logic pure.** URL boundary detection + trailing-punctuation trimming live in a unit-tested function; the component is a thin map — the risky part is fully covered.

**Spec deviations**: none. Display-only; user feedback unchanged.

## Sprint R-FEEDBACK-PASTE-FIX: interactive --respond dropped pasted reply lines (#674, milestone 108) — ✅ deployed 2026-08-04 (v1.5.9, main @ 5019998)

**Origin**: the owner responded to a real feedback item and the published reply was missing its main line (a methodology link). Diagnostic (data-first): the _stored_ `feedback_responses.message` was already truncated — "Here are the pages…:" followed by nothing, then the closing sentence — so the loss was at **input time**, not display. The truncated text had also been emailed to the submitter.

**Root cause**: the interactive `--respond` reader (v1.5.7) used a per-line `rl.question()` loop. On a multi-line **paste**, lines arrive faster than the loop re-arms; readline discards the ones that land between prompts. A pty repro dropped everything after the first line.

**Fix**: read both the menu selection and the reply from a **single async line iterator** (`rl[Symbol.asyncIterator]()`), which buffers every line. `readMultilineReply` now takes an `AsyncIterator<string>` — which also made it unit-testable without a TTY (4 new cases incl. paste-as-one-batch). Verified: pty repro before = 1 line stored, after = all lines stored.

**Prod repair**: updated the existing feedback #1 response row (no duplicate) with the corrected text and re-emailed the submitter the correction via the app's own `notifySubmitterOfResponse` path. Public API confirmed serving the complete response.

**Lessons learned:**

- **Repeated `rl.question()` is a paste-drop footgun.** Reading N lines by calling `question()` N times loses buffered lines; the drop-free pattern is one persistent line source (async iterator or a single `on('line')`). Applies to any interactive multi-line CLI input.
- **Diagnose from stored data, not the screenshot.** Comparing the DB value to the rendered output localized the bug to input vs. display in one query — the display was faithful; the data was already wrong.
- **Interactive glue resists CI, so push the logic out of it.** Reshaping `readMultilineReply` to take an iterator moved the buggy part into a pure, unit-tested function; only the thin readline wiring stays uncovered.

**Spec deviations**: none. Bugfix + one-off prod data repair (feedback response, not baseline data).

## Sprint R-METHODOLOGY-CALC: show concern-status calculation in both methodology views (#673, milestone 107) — ✅ deployed 2026-08-04 (v1.5.8, main @ 56a22ce)

**Origin**: recurring user feedback (the khluerken item #1) asked how a category-week's concern score is calculated. Diagnostic: the site's one methodology page (`/system/methodology`) described the three statuses _qualitatively_ in the Concern Synthesis section of **both** reading levels, but the actual count-based calculation lived only in the detailed view's separate "AI Document Review" section. A reader looking at Concern Synthesis — the section literally about how status is set — found no numbers.

**Planned vs built**: shipped as planned.

- New `CONCERN_LEVEL_THRESHOLDS` in `lib/data/concern-level-explanations.ts` (single source of truth for the count-rule copy; typed `Exclude<ConcernLevel, 'Divergent'>` — the retired status has no live threshold).
- Summary Concern Synthesis: a per-status "Set when: …" line under each status card. Detailed Concern Synthesis: a third `How it's set (Pass 2 counts)` table column. Both read the shared constant.
- Render test asserting all three thresholds appear in **both** views (exported `SummaryContent`/`DetailedContent` to test each without the reading-level provider).

**Key framing (product):** the honest answer to "how is the concern _score_ calculated" is that there is no composite numeric score — there's a _status_ (Stable/Elevated/ConfirmedConcern) derived from absolute Pass 2 document counts, with structural/silence/thematic signals deliberately descriptive-only. The copy makes that derivation visible rather than implying a weighted multi-signal score.

**Lessons learned:**

- **Put the "how" where the reader asks the question.** The thresholds already existed on the page — just in a different section from the one titled "Concern Synthesis." Surfacing the calculation _at the definition_ is what closed the feedback, not adding new facts.
- `ASSESSMENT_METHODOLOGY.md` is a repo-only doc — grep shows zero site references; the public methodology copy is entirely hardcoded in `methodology.tsx`. Worth remembering before editing one and assuming the other updates.
- Exporting page-internal content components for a behavior render-test is an acceptable encapsulation trade vs. driving the whole page through the `ReadingLevelProvider` and toggling (heavier, more brittle); knip counts the test import as usage.

**Spec deviations**: none. Display copy only; no data/pipeline touch.
