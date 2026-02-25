# Category Framework Analysis: Democracy Monitor vs. Established Frameworks

## The Question

Are Democracy Monitor's 11 categories organized around the right conceptual dimensions? Or have we inadvertently organized around **document sources** (Federal Register, White House, GDELT) rather than **democratic threat vectors** as understood by political science?

---

## Three Established Frameworks

### V-Dem (Varieties of Democracy) — Components

V-Dem measures democracy through **components**, each with dozens of indicators:

1. **Free and fair elections** — election quality, voter intimidation, fraud, irregularities
2. **Freedom of expression** — media censorship, harassment of journalists, media bias, internet filtering
3. **Freedom of association** — party bans, civil society repression, barriers to forming organizations
4. **Elected officials** — whether chief executive and legislature are actually elected
5. **Suffrage** — share of adult citizens with right to vote
6. **Judicial constraints on the executive** — compliance with judiciary, high court independence, lower court independence
7. **Legislative constraints on the executive** — legislature investigates executive, opposition parties function, executive oversight
8. **Equality before the law and individual liberties** — access to justice, transparent laws, property rights, freedom from torture, freedom of movement, freedom of religion
9. **Rule of law** (composite) — judicial compliance, court independence, executive respects constitution, transparent law enforcement, impartial public administration
10. **Civil society participation** — CSO entry/exit, CSO repression, CSO consultation
11. **Government censorship** — of media, internet, academic/cultural expression
12. **Government attacks on judiciary** — court packing, reducing jurisdiction, ignoring rulings
13. **Corruption** — executive, public sector, judicial
14. **Political killings/torture** — state violence against citizens for political reasons

### Freedom House — 7 Subcategories (25 questions)

**Political Rights:**

- **A. Electoral Process** (3 questions) — Free/fair elections for head of government and legislature, electoral framework
- **B. Political Pluralism & Participation** (4 questions) — Party competition, opposition, political choices free from domination, minority voting rights
- **C. Functioning of Government** (3 questions) — Elected officials determine policy, corruption, government transparency

**Civil Liberties:**

- **D. Freedom of Expression & Belief** (4 questions) — Free media, academic freedom, religious freedom, open private discussion
- **E. Associational & Organizational Rights** (3 questions) — Assembly, NGOs, labor unions
- **F. Rule of Law** (4 questions) — Independent judiciary, due process, police under civilian control, protection from political terror/unjustified imprisonment
- **G. Personal Autonomy & Individual Rights** (4 questions) — Freedom of movement, property rights, social freedoms, equality of opportunity

### Levitsky & Ziblatt — 4 Behavioral Indicators of Autocratization

1. **Rejection of democratic rules of the game** — Refusing election results, undermining electoral process
2. **Denial of legitimacy of political opponents** — Calling opponents traitors/criminals, claiming they are foreign agents
3. **Toleration or encouragement of violence** — Links to armed gangs, praise of political violence, refusing to condemn supporter violence
4. **Readiness to curtail civil liberties** — Threatening media, supporting restrictions on civil liberties of opponents

---

## Mapping: Democracy Monitor Categories → Established Dimensions

| DM Category                | V-Dem Component(s)                             | Freedom House                        | Levitsky & Ziblatt                 | Coverage Quality                          |
| -------------------------- | ---------------------------------------------- | ------------------------------------ | ---------------------------------- | ----------------------------------------- |
| **courts**                 | Judicial constraints on executive, Rule of law | F1 (independent judiciary)           | Rules of the game                  | ⚠️ Right dimension, wrong sources         |
| **elections**              | Free/fair elections, Suffrage                  | A (Electoral Process), B (Pluralism) | Rules of the game, Deny legitimacy | ⚠️ Right dimension, wrong sources         |
| **civilService**           | Impartial public administration                | C (Functioning of Gov't)             | —                                  | ✅ Strong (unique strength of DM)         |
| **executiveActions**       | Legislative/judicial constraints on executive  | C (Functioning of Gov't)             | Rules of the game                  | ✅ Strong                                 |
| **rulemaking**             | — (no direct equivalent)                       | C3 (transparency)                    | —                                  | ✅ Strong (unique strength of DM)         |
| **fiscal**                 | — (partial: corruption)                        | C2 (corruption)                      | —                                  | ✅ Adequate                               |
| **infoAvailability**       | Government censorship, Freedom of expression   | D1 (free media), C3 (transparency)   | Curtail civil liberties            | ✅ Strong                                 |
| **mediaFreedom**           | Freedom of expression, Media censorship        | D (Expression & Belief)              | Curtail civil liberties            | ⚠️ Right dimension, needs FCC + diversity |
| **igs**                    | Executive oversight, Anti-corruption           | C (Functioning of Gov't)             | Rules of the game                  | ⚠️ Right dimension, thin corpus           |
| **military**               | Political killings/torture (partial)           | F3 (political terror)                | Encourage violence                 | ⚠️ Inherently limited                     |
| **immigrationEnforcement** | —                                              | G1 (movement), F2 (due process)      | —                                  | ✅ Adequate via FR + GDELT                |

### What's Missing Entirely

| Established Dimension                   | V-Dem                                              | Freedom House                              | Levitsky & Ziblatt                       | DM Coverage                                  |
| --------------------------------------- | -------------------------------------------------- | ------------------------------------------ | ---------------------------------------- | -------------------------------------------- |
| **Weaponization of law enforcement**    | Rule of law, political killings                    | F2 (due process), F3 (political terror)    | Deny legitimacy (opponents as criminals) | ❌ **Not covered**                           |
| **Freedom of assembly/association**     | Freedom of association, CSO repression             | E (Associational Rights)                   | Curtail civil liberties                  | ❌ **Not covered**                           |
| **Political violence / state coercion** | Political killings, torture, forced disappearance  | F3 (political terror), F4 (war/insurgency) | Encourage violence                       | ⚠️ Partially in military, mostly missing     |
| **Corruption & self-dealing**           | Executive corruption, public sector corruption     | C2 (corruption)                            | —                                        | ⚠️ Partially in fiscal, not explicit         |
| **Civil liberties / individual rights** | Equality before law, freedom of movement, religion | G (Personal Autonomy)                      | Curtail civil liberties                  | ⚠️ Scattered, no dedicated tracking          |
| **Denial of opponent legitimacy**       | — (behavioral, not institutional)                  | B (Pluralism)                              | Deny legitimacy                          | ⚠️ Only in rhetoric pipeline, not categories |

---

## Diagnosis

You've identified the core issue accurately: **Democracy Monitor's categories are organized partly around threat vectors and partly around document sources.** The categories that work well — civilService, executiveActions, rulemaking, infoAvailability — work because the threat vector and the primary document source happen to align. The Federal Register is literally the instrument through which executive overreach, regulatory capture, and information suppression happen. These are genuine strengths that no other framework monitors at this granularity.

The categories that don't work well — courts, elections, mediaFreedom — are cases where the threat vector generates documents in places other than the Federal Register. Courts issue orders on CourtListener/PACER, not in the FR. Elections happen at the state level through legislation, not federal rulemaking. Media suppression happens through FCC actions and market effects, not FR notices.

And then there are vectors that aren't covered at all because no document source was identified for them:

**Weaponization of enforcement agencies** is the most critical gap. Every framework covers it. V-Dem measures it through rule of law indicators. Freedom House asks four specific questions about it (all of section F). Levitsky & Ziblatt's second indicator — "denial of legitimacy of political opponents" — manifests primarily through selective prosecution. This is one of the most widely tracked erosion dimensions across all three established frameworks, and Democracy Monitor has no category for it.

**Freedom of assembly/association** is the second gap. V-Dem tracks it, Freedom House devotes an entire section (E) to it, and Levitsky & Ziblatt include it under "curtail civil liberties." Crackdowns on protests, restrictions on NGOs, targeting of advocacy organizations — none of this is tracked by DM.

**Corruption/self-dealing** is partially in fiscal but not explicit. V-Dem and Freedom House both treat corruption as a distinct dimension. Emoluments violations, conflicts of interest, and self-enrichment through office are important erosion signals.

---

## What Should Change

### Categories to Add (bringing total to 13-14)

**1. `lawEnforcement` — Selective Enforcement & Rule of Law**

This is the biggest gap. Tracks: DOJ enforcement patterns, FBI investigative priorities, DHS/ICE targeting patterns, selective prosecution, politically-motivated investigations, due process erosion.

Sources: DOJ press releases, FBI press releases, DHS enforcement announcements, CourtListener (for resulting cases), ICE/CBP statistics.

Maps to: V-Dem rule of law index, Freedom House F1-F4, Levitsky & Ziblatt indicators 2 and 4.

**2. `civilLiberties` — Assembly, Association & Individual Rights**

Tracks: Protest crackdowns, NGO restrictions, targeting of advocacy organizations, religious freedom changes, restrictions on movement, academic freedom.

Sources: ACLU litigation tracker, DOJ civil rights division output, GDELT protest coverage, court injunctions related to assembly/speech.

Maps to: V-Dem freedom of association + individual liberties, Freedom House E + G, Levitsky & Ziblatt indicator 4.

### Renames from Prior Architecture

- `courts` → `judicialIndependence` — Makes clear we're tracking the _threat vector_ (erosion of judicial independence and rule of law compliance) not the _institution_
- `igs` → `executiveOversight` — Broadens naturally to include congressional oversight, GAO, and IG functions under one threat vector

### Categories That Are Genuine Strengths (keep as-is)

- `civilService` — No other framework tracks this at document-level granularity. DOGE-era signal proves the concept.
- `rulemaking` — Regulatory capture through independent agency manipulation. DM's most unique contribution — V-Dem doesn't measure this at all.
- `executiveActions` — EO/presidential action tempo and scope. Well-sourced from FR.
- `infoAvailability` — Government transparency/FOIA erosion. Closely maps to V-Dem censorship + Freedom House C3.
- `fiscal` — Budget as policy weapon. Could be strengthened with explicit corruption indicators.
- `immigrationEnforcement` — Well-sourced, maps to Freedom House F2/G1.
- `mediaFreedom` — Right vector, just needs source expansion (FCC + GDELT diversity).
- `elections` — Right vector, just needs source expansion (VRL + LegiScan + FEC).

---

## Revised Category Architecture (13 categories)

| #   | Category Key             | Threat Vector                              | Primary Sources              | Framework Alignment               |
| --- | ------------------------ | ------------------------------------------ | ---------------------------- | --------------------------------- |
| 1   | `executiveActions`       | Executive overreach & constraint erosion   | FR, WH                       | V-Dem exec constraints, FH-C      |
| 2   | `rulemaking`             | Independent agency capture                 | FR                           | Unique to DM                      |
| 3   | `civilService`           | Politicization of bureaucracy              | FR, WH, OPM                  | V-Dem impartial admin, FH-C       |
| 4   | `judicialIndependence`   | Erosion of judicial independence           | CourtListener, FR            | V-Dem judicial constraints, FH-F1 |
| 5   | `elections`              | Electoral integrity & access               | VRL/LegiScan, FEC, FR        | V-Dem elections, FH-A/B           |
| 6   | `lawEnforcement`         | Selective enforcement & due process        | DOJ, FBI, DHS, CourtListener | V-Dem rule of law, FH-F2/F3       |
| 7   | `civilLiberties`         | Assembly, association, individual rights   | ACLU, DOJ-CRD, GDELT, courts | V-Dem association, FH-E/G         |
| 8   | `mediaFreedom`           | Press freedom & media landscape health     | FCC, FR, GDELT diversity     | V-Dem expression, FH-D            |
| 9   | `infoAvailability`       | Government transparency & censorship       | FR, WH, agency websites      | V-Dem censorship, FH-C3/D         |
| 10  | `fiscal`                 | Budget weaponization & corruption          | FR, CBO, GAO                 | V-Dem corruption, FH-C2           |
| 11  | `executiveOversight`     | Watchdog independence (IGs, GAO, Congress) | IG reports, GAO, FR          | V-Dem oversight, FH-C             |
| 12  | `military`               | Military/security in domestic politics     | FR, DOD, GDELT               | V-Dem political violence, FH-F3   |
| 13  | `immigrationEnforcement` | Immigration enforcement patterns           | FR, DHS, ICE/CBP stats       | FH-F2/G1                          |

### What This Achieves

**Full coverage of all major V-Dem components:** Every V-Dem liberal democracy sub-index has at least one DM category tracking it through document analysis.

**Full coverage of all Freedom House subcategories:** All 7 FH sections (A through G) are covered.

**Full coverage of Levitsky & Ziblatt indicators:**

- Indicator 1 (reject democratic rules) → executiveActions, elections, judicialIndependence
- Indicator 2 (deny opponent legitimacy) → lawEnforcement (selective prosecution), rhetoric pipeline
- Indicator 3 (tolerate/encourage violence) → military, lawEnforcement, civilLiberties
- Indicator 4 (curtail civil liberties) → civilLiberties, mediaFreedom, infoAvailability

**Unique DM contributions** (things no other framework tracks at this granularity): civilService (document-level DOGE detection), rulemaking (regulatory capture through metadata analysis), infoAvailability (transparency erosion in real-time), and the three-layer triangulation approach itself.

---

## Impact Assessment

### On existing work

- 9 of 11 existing categories carry forward (2 renamed)
- All existing baselines for unchanged categories are valid
- `courts` → `judicialIndependence` gets CourtListener sources (already planned) — needs baseline recomputation
- `igs` → `executiveOversight` broadens scope slightly — may need baseline adjustment

### New baselines needed

- `lawEnforcement` — New category, needs full baseline computation from DOJ/FBI/DHS historical data
- `civilLiberties` — New category, needs baseline from ACLU/DOJ-CRD/court data

### On Sprint R-S1 (Source Expansion)

The source expansion sprint already planned now has a clearer organizing principle. Instead of "add sources to fill gaps," it becomes "ensure every democratic threat vector has adequate document sources." The new categories (lawEnforcement, civilLiberties) need sources identified and ingestion pipelines built alongside the already-planned CourtListener, FCC, and election source work.

### On the three-layer architecture

No architectural changes needed. The three-layer pipeline (structural anomaly → AI assessment → thematic drift) works identically for 13 categories as for 11. New categories flow through the same pipeline. The convergence logic, dampening, and thresholds all apply.

### On launch timeline

Adding 2 categories with new source pipelines is meaningful work. But it's parallelizable with the UI build. The question is whether it's a launch blocker or a fast-follow. Given your stated position — "I can't be convinced to launch without meaningfully filling these holes" — these should be launch blockers, but they can be built in parallel with everything else.

---

## Recommendation

1. **Approve the 13-category framework** as the launch target
2. **Rename** courts → judicialIndependence, igs → executiveOversight
3. **Add** lawEnforcement and civilLiberties as new categories
4. ~~**Run the LegiScan spike** to validate election bill classification~~ ✅ Done — all 8 spikes complete. See `SPIKE_FINDINGS.md`.
5. ~~**Expand Sprint R-S1** to include DOJ/FBI/DHS/ACLU source pipelines for new categories~~ ✅ Done — Sprint R-S1 scoped with P0/P1/P2 prioritization. See `ARCHITECTURE_PROPOSAL.md` §Sprint R-S1.
6. **Recompute baselines** only for categories with new/changed sources (judicialIndependence, elections, mediaFreedom, executiveOversight, lawEnforcement, civilLiberties) — 6 of 13 categories
7. **Preserve existing baselines** for the 7 unchanged categories
8. **Document the framework alignment** in the methodology section — cite V-Dem, Freedom House, and Levitsky & Ziblatt. This gives the project instant academic credibility and demonstrates that category selection was principled, not arbitrary.
