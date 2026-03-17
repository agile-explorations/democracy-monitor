# P2 Variant Spike — Pre-Backfill Routing Baseline

> Ephemeral doc. Delete after spike (#409) is complete.

Generated 2026-03-17 from live GovInfo API routing audits using `scripts/test-crec-routing.ts`. All routing used the final CREC_ROUTING_TERMS (post-calibration: "Supreme Court" removed, "appropriation" tightened, bulk-listing filter added, "classified"/"accountability"/"transparency" tightened, "DOGE" added to executiveOversight).

## Missed Events — CREC Routing Summary

### T1-2: Comey Firing (May 8–12, 2017)

**Missed:** executiveOversight (Stable, expected Elevated), judicialIndependence (Stable, expected Elevated)
**Detected:** lawEnforcement (Elevated)

| Category             | CREC docs | Quality   | Key documents                                                                                                                    |
| -------------------- | --------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| lawEnforcement       | 11        | High      | 3+ "Firing of James Comey" floor speeches (Cardin, Franken, Peters); "Russia Investigation" hearing                              |
| rulemaking           | 9         | Unrelated | Congressional Review Act resolutions (coincidental)                                                                              |
| executiveOversight   | 4         | Mixed     | Grassley IG/whistleblower mention (relevant); "accountability" in Office of Compliance (noise); cosmetics oversight bill (noise) |
| military             | 4         | Unrelated | DoD lab day resolution, National Guard bill                                                                                      |
| fiscal               | 3         | Unrelated | Treasury nomination, omnibus                                                                                                     |
| executiveActions     | 3         | Mixed     | "executive action" in CRA debate, Feinstein EO bill                                                                              |
| civilLiberties       | 3         | Mixed     | Religious freedom resolutions, Feinstein bill (LGBTQ/discrimination)                                                             |
| judicialIndependence | 1         | Relevant  | "Russia Investigation" speech mentioning judiciary committee                                                                     |
| civilService         | 2         | Relevant  | "Russia Investigation" speech mentioning "civil servant"; MSPB quorum bill                                                       |

**Analysis:** lawEnforcement signal is strong (11 docs, high quality). executiveOversight has 4 docs but only the Grassley IG/whistleblower mention is directly relevant to the firing-as-oversight-erosion angle. judicialIndependence has just 1 doc. CREC will boost lawEnforcement further but may not flip executiveOversight or judicialIndependence alone — those need P2 to correctly assess the few relevant docs.

### T1-4: DACA Rescission (Sep 4–8, 2017)

**Missed:** civilLiberties (Stable, expected Elevated), immigrationEnforcement (Stable, expected Elevated)
**Detected:** executiveActions (Elevated)

| Category               | CREC docs | Quality        | Key documents                                                                                              |
| ---------------------- | --------- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| military               | 86        | Unrelated      | NDAA FY2018 floor debate (coincidental — massive amendment volume)                                         |
| immigrationEnforcement | 45        | High           | Multiple "DACA" and "DACA AND PROTECTING DREAMERS" speeches; border security debate; Feinstein DACA speech |
| executiveOversight     | 14        | Mixed          | GAO amendments, oversight mentions in NDAA context                                                         |
| infoAvailability       | 13        | Mixed          | "transparency" in education aid bill titles                                                                |
| fiscal                 | 13        | Mixed          | Debt ceiling debate, budget scorekeeping (legitimate fiscal)                                               |
| lawEnforcement         | 8         | Low            | Law enforcement torch run, sheriff tributes, criminal justice mention                                      |
| rulemaking             | 8         | Mixed          | Regulatory nominations, SEC bill                                                                           |
| executiveActions       | 2         | Relevant       | Feinstein DACA speech mentioning executive order; presidential memorandum                                  |
| civilLiberties         | 1         | False positive | "surveillance" matched mosquito abatement bill                                                             |
| judicialIndependence   | 1         | Marginal       | "court order" in NDAA amendment                                                                            |

**Analysis:** immigrationEnforcement at 45 docs is the strongest CREC signal in any missed-event week. This alone should flip the detection — massive volume spike + high P1 flag rate. civilLiberties routing failed entirely (1 false match). This is a routing gap, not a P2 problem — DACA speeches use immigration vocabulary, not civil liberties vocabulary. The NDAA coincidence (86 military docs) demonstrates why Variant C (family context) would be noisy — military would leak into unrelated family categories.

### T2-3: DOGE/USAID Shutdown (Feb 3–7, 2025)

**Missed:** executiveOversight (Stable, expected Elevated), executiveActions (Stable, expected Elevated)
**Detected:** (neither category detected)

| Category               | CREC docs | Quality  | Key documents                                                                                                                                                                |
| ---------------------- | --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| civilService           | 21        | High     | "Department of Government Efficiency" (Schumer DOGE speech); "CAUTIONING FEDERAL WORKERS AGAINST TAKING BUYOUTS"; "SUPPORT FEDERAL EMPLOYEES"; Vought OMB nomination debates |
| lawEnforcement         | 20        | High     | Bondi AG confirmation (Durbin, Schmitt); Kash Patel FBI nomination; "Immigration" enforcement debate                                                                         |
| fiscal                 | 15        | High     | "PROTECTING TREASURY PAYMENT SYSTEM" (Min); Vought OMB nomination (Treasury/OMB access); "GOLDEN AGE OF AMERICAN FISCAL RESPONSIBILITY"                                      |
| civilLiberties         | 14        | Mixed    | USAID/due process speech; LGBTQ rights; DEI in DoD; privacy/Treasury access                                                                                                  |
| executiveActions       | 13        | High     | Multiple "Trump Executive Orders" speeches (Kaine, Blunt Rochester); "ELIMINATING THE DEPARTMENT OF EDUCATION" EO; border security EO                                        |
| immigrationEnforcement | 12        | High     | ICE enforcement, Laken Riley Act, "PROTECTING SENSITIVE LOCATIONS"                                                                                                           |
| rulemaking             | 10        | Mixed    | Regulatory mentions in Vought nomination, Reagan birthday (deregulation)                                                                                                     |
| infoAvailability       | 9         | Low      | 5 Arms Sales Notifications ("classified" — now fixed), Epstein redaction, Vought transparency                                                                                |
| military               | 6         | Mixed    | Burma national emergency, DoD/DEI, National Guard tribute                                                                                                                    |
| judicialIndependence   | 4         | Mixed    | Bondi/judiciary committee, Patel/FBI-January 6, Epstein                                                                                                                      |
| executiveOversight     | 4         | Mixed    | Epstein subpoena, "ELON MUSK TAKEOVER" (oversight/accountability), Kevin Jones tribute (accountability — now fixed), fiscal responsibility                                   |
| hatch                  | 1         | Relevant | "political appointee" in Trump administration speech                                                                                                                         |

**Analysis:** 321 total entries, 93 routed (29%). Extremely active congressional week. executiveActions has 13 strong docs — should flip with within-category P2 context. executiveOversight has 4 docs but post-fix only 2 are relevant: "ELON MUSK TAKEOVER" and the Epstein subpoena speech. The "ELON MUSK TAKEOVER" speech is the critical P2 test case — it's a floor speech about institutional pressure, not a formal action.

### T2-12: Government Shutdown / civilService (Sep 29 – Oct 3, 2025)

**Missed:** civilService (Stable, expected Elevated)
**Detected:** fiscal (Divergent)

| Category               | CREC docs | Quality        | Key documents                                                                         |
| ---------------------- | --------- | -------------- | ------------------------------------------------------------------------------------- |
| military               | 18        | Unrelated      | NDAA FY2026 amendments                                                                |
| lawEnforcement         | 7         | Mixed          | DOJ nominations, NDAA law enforcement amendments                                      |
| fiscal                 | 5         | High           | "GOVERNMENT FUNDING" shutdown debates (Whitehouse, Thune, Hoeven, Sullivan); CR votes |
| infoAvailability       | 5         | False positive | All Arms Sales Notifications ("classified" — now fixed)                               |
| executiveActions       | 3         | Mixed          | Executive order mentions in NDAA amendments                                           |
| civilService           | 1         | Relevant       | "GOVERNMENT FUNDING" (Whitehouse) mentioning "federal employees" in shutdown mode     |
| civilLiberties         | 2         | Mixed          | First Amendment resolution, Religious Education Week                                  |
| immigrationEnforcement | 2         | Marginal       | Immigration amendment in NDAA, Customs/Border in committee report                     |
| executiveOversight     | 2         | Marginal       | Inspector general in presidential withdrawals, oversight in committee report          |

**Analysis:** fiscal signal is strong (5 shutdown debate docs). civilService only gets 1 CREC doc — the Whitehouse speech mentioning federal employees. CREC alone won't flip civilService for this event; the gap is that shutdown-as-workforce-impact isn't well-represented in floor speeches (senators focused on the fiscal/political angle, not the employee impact angle).

## Validation Weeks (Non-Event)

### Inauguration Week (Jan 20–24, 2025) — Already has detected events

264 total, 41 routed (15.5%). Distribution reasonable. No false-positive concerns post-fix.

### Biden Baseline (Mar 7–11, 2022)

221 total, 37 routed (16.7%). Known noise: "accountability" in Haiti bill (4 executiveOversight matches — now fixed), "transparency" in same bill (4 infoAvailability matches — now fixed). Post-fix, both categories should drop significantly for this week.

## Key Test-Case Documents for the Spike

These specific documents are where P2's assessment is the decisive question. The spike should report P2's verdict on each across all variants.

### Documents where Variant E (rhetoric framing) should make the difference

| Document                                        | Week       | Category               | Why it matters                                                                                                                                          |
| ----------------------------------------------- | ---------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "ELON MUSK TAKEOVER" (Rivas)                    | DOGE/USAID | executiveOversight     | Floor speech about institutional pressure. Current P2 may dismiss as "opinion, not formal action." E should cause P2 to flag as potentially_concerning. |
| "Firing of James Comey" (Cardin)                | Comey      | lawEnforcement         | "I was shocked... this decision crossed the line." Rhetoric signaling institutional crisis.                                                             |
| "Firing of James Comey" (Franken)               | Comey      | lawEnforcement         | "We know the Russians interfered... we know the Russians did so in order to undermine confidence in our democracy."                                     |
| "Department of Government Efficiency" (Schumer) | DOGE/USAID | civilService           | "DOGE is not a real government agency. DOGE has no authority to make spending decisions." Direct institutional challenge rhetoric.                      |
| "DACA AND PROTECTING DREAMERS" (Maloney)        | DACA       | immigrationEnforcement | "allowed nearly 800,000 young people to come out of the shadows." Rhetoric about policy reversal impact.                                                |

### Documents where Variant B-full (peer context) should make the difference

| Document                                   | Week       | Category               | Why it matters                                                                                                                                 |
| ------------------------------------------ | ---------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Grassley IG/whistleblower mention          | Comey      | executiveOversight     | Borderline doc on its own. With peer context showing 3 other executiveOversight docs flagged, P2 should take it more seriously.                |
| "PROTECTING TREASURY PAYMENT SYSTEM" (Min) | DOGE/USAID | fiscal                 | One of 15 fiscal docs. Peer titles like "Nomination of Russell Vought" (OMB) provide budget-access-abuse context.                              |
| Any single DACA speech                     | DACA       | immigrationEnforcement | Individually each speech is "Member states opinion on immigration policy." With 44 flagged peers, the volume signal transforms the assessment. |

### Documents that should remain "routine" across ALL variants (FP controls)

| Document                                     | Week         | Category               | Why it should stay routine                                                |
| -------------------------------------------- | ------------ | ---------------------- | ------------------------------------------------------------------------- |
| "HONORING MASTER SERGEANT LINDA FAYE JULIAN" | Inauguration | military               | Tribute speech. No erosion signal regardless of context.                  |
| "HAPPY LUNAR NEW YEAR" (Tran)                | Inauguration | immigrationEnforcement | Matched on "refugee" (speaker is a refugee). Off-topic.                   |
| "CELEBRATING CUYAHOGA VALLEY NATIONAL PARK"  | Inauguration | fiscal                 | Matched on "appropriations bill" in passing. Park anniversary.            |
| Arms Sales Notifications                     | Any week     | infoAvailability       | Boilerplate "classified annex" language. Should no longer match post-fix. |

## Predictions

### Expected variant ranking (detection improvement / FP rate)

| Variant              | Detection gain              | FP risk     | Prediction                                                                                                                                                                                                                                                                          |
| -------------------- | --------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B-full + E**       | Highest                     | Low         | **Winner.** B-full handles volume signal (DACA 45 docs, DOGE 13 executiveActions). E handles document-type signal (floor speeches assessed as rhetoric, not formal actions).                                                                                                        |
| **B-full**           | High                        | Low         | Strong standalone. Handles all high-volume weeks. Misses rhetoric-dismissal problem for thin-signal categories.                                                                                                                                                                     |
| **E alone**          | Medium                      | Low         | Helps CREC docs specifically but doesn't provide week-level volume context.                                                                                                                                                                                                         |
| **C (family)**       | Medium-high for thin-signal | Medium-high | Theoretically helps Comey/executiveOversight (sees lawEnforcement signal) and DOGE/executiveOversight (sees civilService signal). But NDAA weeks (86 military docs in DACA week) demonstrate why family leakage is noisy most weeks. Expect FP increase to outweigh detection gain. |
| **D (all-category)** | Marginal over C             | High        | 14 categories of context overwhelms the prompt. Signal-to-noise drops.                                                                                                                                                                                                              |
| **B-reduced**        | Moderate                    | Low         | Counts without peer titles lose the most informative signal ("Firing of James Comey" as a peer title vs "3/4 flagged").                                                                                                                                                             |
| **A (baseline)**     | None                        | None        | Control. Current prompt.                                                                                                                                                                                                                                                            |

### What the spike can't fix (routing/coverage gaps, not P2 problems)

- DACA/civilLiberties (1 false-match doc) — routing gap, not P2
- Govt shutdown/civilService (1 relevant doc) — thin CREC signal for workforce angle
- Comey/judicialIndependence (1 marginal doc) — thin CREC signal for judicial angle

These require either routing term additions (encoding analytical conclusions — architecturally wrong) or cross-category convergence synthesis (already exists at the convergence layer).
