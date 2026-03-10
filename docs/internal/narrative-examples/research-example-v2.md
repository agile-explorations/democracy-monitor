# Research Synthesis Example (v2)

> Generated: 2026-03-10T07:02:55.373Z
> Pipeline: corpus stats + P2 assessments + keyword pre-filter

## Table of Contents

1. [Question](#1-question)
2. [Document Retrieval](#2-document-retrieval)
3. [Pass 1: Draft](#3-pass-1-draft)
4. [Pass 2: Feedback](#4-pass-2-feedback)
5. [Pass 3: Final Revision](#5-pass-3-final-revision)
6. [Timing](#6-timing)

---

## 1. Question

**Have the courts been pushing back on immigration due process violations?**

---

## 2. Document Retrieval

- **Documents retrieved**: 20
- **Date range**: Oct 22, 2025 to Feb 17, 2026
- **Average cosine similarity**: 0.544
- **Documents with P2 assessments**: 1
- **Retrieval time**: 428ms

### Corpus Statistics

- **Total matching documents**: 167

**Monthly distribution:**

| Month   | Count |
| ------- | ----- |
| 2018-10 | 1     |
| 2020-01 | 1     |
| 2020-02 | 2     |
| 2020-03 | 1     |
| 2020-05 | 1     |
| 2020-09 | 1     |
| 2020-11 | 2     |
| 2021-05 | 2     |
| 2021-06 | 4     |
| 2021-08 | 2     |
| 2021-09 | 2     |
| 2021-11 | 3     |
| 2022-01 | 1     |
| 2022-05 | 1     |
| 2022-07 | 1     |
| 2022-08 | 2     |
| 2022-09 | 2     |
| 2022-12 | 2     |
| 2023-01 | 2     |
| 2023-03 | 1     |
| 2023-07 | 4     |
| 2023-09 | 1     |
| 2024-01 | 1     |
| 2024-02 | 2     |
| 2024-07 | 1     |
| 2024-08 | 1     |
| 2025-02 | 2     |
| 2025-03 | 2     |
| 2025-05 | 6     |
| 2025-06 | 2     |
| 2025-07 | 3     |
| 2025-08 | 5     |
| 2025-09 | 9     |
| 2025-10 | 11    |
| 2025-11 | 18    |
| 2025-12 | 25    |
| 2026-01 | 30    |
| 2026-02 | 9     |
| 2026-03 | 1     |

**Category distribution:**

| Category       | Count |
| -------------- | ----- |
| civilLiberties | 131   |
| lawEnforcement | 36    |

### Document List

| #   | Title                                                                  | Date         | Source        | Category       | Similarity | P2 Assessment     |
| --- | ---------------------------------------------------------------------- | ------------ | ------------- | -------------- | ---------- | ----------------- |
| 1   | Quinonez Orosco v. Lyons                                               | Dec 9, 2025  | courtlistener | lawEnforcement | 0.599      | -                 |
| 2   | Perez Camacho v. Hollinshead                                           | Nov 18, 2025 | courtlistener | lawEnforcement | 0.568      | -                 |
| 3   | TREGA v. BONDI                                                         | Jan 15, 2026 | courtlistener | civilLiberties | 0.551      | -                 |
| 4   | Esparza Ibarra v. Bondi                                                | Nov 18, 2025 | courtlistener | civilLiberties | 0.559      | -                 |
| 5   | Ortega Casarez v. Hollinshead                                          | Nov 18, 2025 | courtlistener | civilLiberties | 0.559      | -                 |
| 6   | Villafana Rodriguez v. Noem                                            | Nov 18, 2025 | courtlistener | civilLiberties | 0.557      | -                 |
| 7   | Guillen-Mora v. Lyons                                                  | Jan 8, 2026  | courtlistener | civilLiberties | 0.544      | -                 |
| 8   | (HC) Singh Sekhon v. Warden of the Golden State Annex Detention Facili | Jan 8, 2026  | courtlistener | civilLiberties | 0.543      | -                 |
| 9   | Elias v. Bondi                                                         | Nov 18, 2025 | courtlistener | civilLiberties | 0.552      | -                 |
| 10  | Estrada Elias v. Bondi                                                 | Nov 18, 2025 | courtlistener | civilLiberties | 0.551      | -                 |
| 11  | Rodas v. Noem                                                          | Dec 7, 2025  | courtlistener | civilLiberties | 0.544      | -                 |
| 12  | Singh v. Stevens                                                       | Feb 17, 2026 | courtlistener | civilLiberties | 0.522      | -                 |
| 13  | (HC) P.S. v. Chestnut                                                  | Dec 29, 2025 | courtlistener | civilLiberties | 0.532      | -                 |
| 14  | Gutierrez Gutierrez v. Miami Field Office Director., Immigration and C | Jan 13, 2026 | courtlistener | civilLiberties | 0.528      | routine (routine) |
| 15  | Vasquez Chinchilla v. De Anda-Ybarra                                   | Dec 15, 2025 | courtlistener | civilLiberties | 0.534      | -                 |
| 16  | Amaya-Velis v. Director of the Detroit Field Office for U.S. Immigrati | Jan 27, 2026 | courtlistener | civilLiberties | 0.522      | -                 |
| 17  | Ramirez-Contreras v. Noem                                              | Dec 7, 2025  | courtlistener | civilLiberties | 0.533      | -                 |
| 18  | Drammeh v. Warden, Otay Mesa Detention Center                          | Jan 5, 2026  | courtlistener | civilLiberties | 0.522      | -                 |
| 19  | Ebu v. Tindall                                                         | Jan 29, 2026 | courtlistener | civilLiberties | 0.516      | -                 |
| 20  | CONTRERAS MALDONADO v. CABEZAS                                         | Oct 22, 2025 | courtlistener | civilLiberties | 0.538      | -                 |

---

## 3. Pass 1: Draft

> Model: claude-opus-4-6
> Time: 33562ms

### Draft Prompt

<details>
<summary>Click to expand draft prompt</summary>

```
You are answering a question about U.S. government actions based solely on the
documents provided below. These are real government documents from the Federal Register,
court filings, congressional reports, and other official sources.

Rules:
1. Only make claims supported by the provided documents.
2. Cite each claim with [Doc N] where N matches the document number below.
3. If the documents don't contain enough information to answer, say so explicitly.
4. Note the date range of available documents.
5. If documents suggest conflicting actions, present both sides.
6. Do not editorialize or assess democratic health — present what the documents show.
7. Present alternative explanations and stated justifications where available.
8. Where documented evidence supports it, briefly note why a finding might matter for
   institutional checks and balances. Ground this in specific document evidence, not
   speculation. Use conditional language ("this could indicate", "this may reflect").
9. Explicitly state the date range of retrieved documents in your answer and note that
   documents are weighted toward recent publications. If corpus statistics show many
   matching documents outside the retrieval window, note this.
10. 1 of 20 documents include prior AI assessments. Reference these
    where relevant ("the system previously assessed this document as...").

--- USER QUESTION ---
Have the courts been pushing back on immigration due process violations?

--- DOCUMENT COVERAGE ---
Date range of retrieved documents: Oct 22, 2025 to Feb 17, 2026
Documents retrieved: 20 (most relevant by semantic similarity, weighted toward recent)
Note: Retrieval uses vector similarity with a recency boost. Older relevant documents
may be underrepresented. The corpus statistics below provide the full-corpus picture.

--- CORPUS STATISTICS ---
Total matching documents across full corpus: 167
(The documents below are the most relevant sample.)

Monthly distribution:
  2018-10: 1
  2020-01: 1
  2020-02: 2
  2020-03: 1
  2020-05: 1
  2020-09: 1
  2020-11: 2
  2021-05: 2
  2021-06: 4
  2021-08: 2
  2021-09: 2
  2021-11: 3
  2022-01: 1
  2022-05: 1
  2022-07: 1
  2022-08: 2
  2022-09: 2
  2022-12: 2
  2023-01: 2
  2023-03: 1
  2023-07: 4
  2023-09: 1
  2024-01: 1
  2024-02: 2
  2024-07: 1
  2024-08: 1
  2025-02: 2
  2025-03: 2
  2025-05: 6
  2025-06: 2
  2025-07: 3
  2025-08: 5
  2025-09: 9
  2025-10: 11
  2025-11: 18
  2025-12: 25
  2026-01: 30
  2026-02: 9
  2026-03: 1

Category distribution:
  civilLiberties: 131
  lawEnforcement: 36

--- GOVERNMENT DOCUMENTS ---
[Doc 1] Quinonez Orosco v. Lyons
  Date: Dec 9, 2025 · Source: judicial_opinion (courtlistener) · Category: lawEnforcement · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10755611/edin-eleazar-quinonez-orosco-v-todd-lyons-et-al/
  Content: 1
2
3
4                     UNITED STATES DISTRICT COURT
5                          DISTRICT OF NEVADA
6                                 * * *

7   EDIN ELEAZAR QUINONEZ OROSCO,     Case No. 2:25-cv-02240-RFB-EJY

8               Petitioners,                   ORDER

9        v.

10
   TODD LYONS, et al.,
11
               Respondents.
12

13
14     I.  INTRODUCTION
15       This case is one of a rapidly growing number before this Court challenging the federal
16  government’s reading of the Immigration and Nationality Act (INA) to authorize mandatory
17  detention of all noncitizens charged with entering the United States without inspection.1 The
18

[Doc 2] Perez Camacho v. Hollinshead
  Date: Nov 18, 2025 · Source: judicial_opinion (courtlistener) · Category: lawEnforcement · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10739159/antonio-perez-camacho-v-mike-hollinshead-sheriff-elmore-county-kenneth/
  Content:                 UNITED STATES DISTRICT COURT

                 FOR THE DISTRICT OF IDAHO


ANTONIO PEREZ CAMACHO,           Case No. 1:25-cv-00593-BLW

        Petitioner,            MEMORANDUM DECISION AND
                               ORDER
   v.

MIKE HOLLINSHEAD, Sheriff,
Elmore County; KENNETH
PORTER, Director of Boise
Immigration and Customs
Enforcement Field Sub-Office;
JASON KNIGHT, Director of the Salt
Lake City U.S. Immigration and
Customs Enforcement Field Office;
KRISTI NOEM, Secretary of the U.S.
Department of Homeland Security;
and PAM BONDI, Attorney General
of the United States, in their official
capacities,

        Respondents.




[Doc 3] TREGA v. BONDI
  Date: Jan 15, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10775743/samara-pereira-trega-v-pamela-bondi-in-her-official-capacity-as-attorney/
  Content:             UNITED STATES DISTRICT COURT
                  DISTRICT OF MAINE

SAMARA PEREIRA TREGA,         )
                         )
     Petitioner,         )
                         )
v.                       )         No. 2:25-cv-00643-JAW
                         )
PAMELA BONDI, in her official   )
capacity as Attorney General     )
of the United States, et al.,    )
                         )
     Respondents.        )

   ORDER ON PETITION FOR WRIT OF HABEAS CORPUS
A noncitizen from Brazil brings a petition for habeas corpus, claiming her
detention pending removal proceedings violates due process.  The court dismisses her
petition because her courthouse arrest does not violate due process and because it
does not have subject matter jurisdiction over her remaining claims.
I.   BACKGROUND
Samara Pereira Trega is a Brazilian citizen who arrived in the United States
without inspection in No

[Doc 4] Esparza Ibarra v. Bondi
  Date: Nov 18, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10739185/edmundo-esparza-ibarra-v-jason-knight-field-office-director-of/
  Content:                  UNITED STATES DISTRICT COURT

                  FOR THE DISTRICT OF IDAHO


EDMUNDO ESPARZA IBARRA,           Case No.  1:25-cv-00597-BLW

         Petitioner,             MEMORANDUM DECISION AND
                                 ORDER
    v.

JASON KNIGHT, Field Office
Director of Enforcement and Removal
Operations, Salt Lake City Field Office,
Immigration and Customs
Enforcement; KENNETH PORTER,
Acting Director of the Boise U.S.
Immigration and Customs Enforcement
Field Sub-Office; KRISTI NOEM,
Secretary, U.S. Department of
Homeland Security; PAMELA BONDI,
U.S. Attorney General,

         Respondents.


                       INTRODUCTION
    Since the United States began restricting immigration into this countr

[Doc 5] Ortega Casarez v. Hollinshead
  Date: Nov 18, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10739166/apolonio-ortega-casarez-v-jarrod-thompson-sheriff-cassia-county-mike/
  Content:                  UNITED STATES DISTRICT COURT

                  FOR THE DISTRICT OF IDAHO


APOLONIO ORTEGA CASAREZ,         Case No. 1:25-cv-00596-BLW

         Petitioner,            MEMORANDUM DECISION AND
                                ORDER
    v.

JARROD THOMPSON, Sheriff,
Cassia County; MIKE
HOLLINSHEAD, Sheriff, Elmore
County; KENNETH PORTER,
Director of Boise U.S. Immigration
and Customs Enforcement Field Sub-
Office; JASON KNIGHT, Director of
the Salt Lake City U.S. Immigration
and Customs Enforcement Field
Office; KRISTI NOEM, Secretary of
the U.S. Department of Homeland
Security; and PAM BONDI, Attorney
General of the United States, in their
official capacities,


[Doc 6] Villafana Rodriguez v. Noem
  Date: Nov 18, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10739196/adela-villafana-rodriguez-v-jason-knight-field-office-director-of/
  Content:                  UNITED STATES DISTRICT COURT

                  FOR THE DISTRICT OF IDAHO


ADELA VILLAFANA RODRIGUEZ,        Case No.  1:25-cv-00600-BLW

         Petitioner,             MEMORANDUM DECISION AND
                                 ORDER
    v.

JASON KNIGHT, Field Office
Director of Enforcement and Removal
Operations, Salt Lake City Field Office,
Immigration and Customs
Enforcement; KENNETH PORTER,
Acting Director of the Boise U.S.
Immigration and Customs Enforcement
Field Sub-Office; KRISTI NOEM,
Secretary, U.S. Department of
Homeland Security; PAMELA BONDI,
U.S. Attorney General,

         Respondents.


                       INTRODUCTION
    Since the United States began restricting immigration into this countr

[Doc 7] Guillen-Mora v. Lyons
  Date: Jan 8, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10797075/digna-carolina-guillen-mora-v-acting-director-todd-m-lyons-miguel/
  Content:                  UNITED STATES DISTRICT COURT
                   WESTERN DISTRICT OF TEXAS
                     SAN ANTONIO DIVISION

DIGNA CAROLINA GUILLEN-MORA,  §
Petitioner                    §
                              §
v.                            §       Case No.  SA-25-CA-01864-XR
                              §
ACTING DIRECTOR TODD M. LYONS,  §
MIGUEL VERGARA, DIRECTOR      §
DAREN K. MARGOLIN,  WARDEN,   §
DILLEY IMMIGRATION PROCESSING  §
CENTER,                       §
Respondents                   §

      ORDER GRANTING PETITION FOR WRIT OF HABEAS CORPUS
    On this date, the Court considered Digna Carolina Guillen-Mora’s Petition for a Writ of
Habeas Corpus (ECF No. 1) and the Federal Respondents’ Abbreviated Response (ECF No. 4).
After careful consideration, the petition is GRANTED. It is ORDERED that:
    1.   Respondents are DIRECTED to RELEASE Petitioner Digna Carolina Guillen-
Mora (A 243 076 070) from custody, under condition

[Doc 8] (HC) Singh Sekhon v. Warden of the Golden State Annex Detention Facility
  Date: Jan 8, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10785571/sukhjot-singh-sekhon-v-warden-of-the-golden-state-annex-detention/
  Content: 1
2
3
4
5
6
7
8                      UNITED STATES DISTRICT COURT
9                 FOR THE EASTERN DISTRICT OF CALIFORNIA
10
11  SUKHJOT SINGH SEKHON,            Case No.  1:25-cv-1692-JDP
12               Petitioner,
13       v.                          ORDER
14  WARDEN OF THE GOLDEN STATE
   ANNEX DETENTION FACILITY, et al.,
15
                Respondents.
16
17
        Sukhjot Singh Sekhon, an asylum applicant who has lived in the United States f

[Doc 9] Elias v. Bondi
  Date: Nov 18, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10739160/ramon-estrada-elias-v-jason-knight-director-of-the-salt-lake-city-us/
  Content:                 UNITED STATES DISTRICT COURT

                 FOR THE DISTRICT OF IDAHO


RAMON ESTRADA ELIAS,             Case No. 1:25-cv-00594-BLW

        Petitioner,            MEMORANDUM DECISION AND
                               ORDER
   v.

JASON KNIGHT, Director of the Salt
Lake City U.S. Immigration and
Customs Enforcement Field Office;
KENNETH PORTER, Director of
Boise Immigration and Customs
Enforcement Field Sub-Office;
KRISTI NOEM, Secretary of the U.S.
Department of Homeland Security;
and PAMELA BONDI, U.S. Attorney
General; STEVE ANDERSON,
Sheriff of Jefferson County,

        Respondents.


                      INTRODUCTION
   Since the United States began restricting immigration into this country in the

[Doc 10] Estrada Elias v. Bondi
  Date: Nov 18, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10739222/ruben-estrada-elias-v-jason-knight-field-office-director-of-enforcement/
  Content:                  UNITED STATES DISTRICT COURT

                  FOR THE DISTRICT OF IDAHO


RUBEN ESTRADA ELIAS,              Case No.  1:25-cv-00604-BLW

         Petitioner,             MEMORANDUM DECISION AND
                                 ORDER
    v.

JASON KNIGHT, Field Office
Director of Enforcement and Removal
Operations, Salt Lake City Field Office,
Immigration and Customs
Enforcement; KENNETH PORTER,
Acting Director of the Boise U.S.
Immigration and Customs Enforcement
Field Sub-Office; KRISTI NOEM,
Secretary, U.S. Department of
Homeland Security; PAMELA BONDI,
U.S. Attorney General; STEVE
ANDERSON, Sheriff, Jefferson
County,

         Respondents.


[Doc 11] Rodas v. Noem
  Date: Dec 7, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10755456/moises-rodas-v-kristi-noem-et-al/
  Content: 1
2
3                     UNITED STATES DISTRICT COURT
4                          DISTRICT OF NEVADA
5                                 * * *

6   MOISES RODAS,

7                Petitioner,
                                         Case No. 2:25-cv-02216-RFB-BNW
8        v.
                                       ORDER GRANTING PRELIMINARY
9                                               INJUNCTION
   KRISTI NOEM, et al.,
10
               Respondents.
11

12       Pending before the Court is Petitioner Moises Rodas’s amended motion for preliminary
13  injunctive relief (ECF No. 9), challenging the lawfulness of his detention at Henderson Detention
14  Center in the custody of the Federal Respondents. For the following reasons, the Court grants the
15  Motion.
16       On Nove

[Doc 12] Singh v. Stevens
  Date: Feb 17, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10801431/samanpreet-singh-v-fredrick-w-stevens-et-al/
  Content: PEARSON, J.        UNITED STATES DISTRICT COURT
                   NORTHERN DISTRICT OF OHIO
                        EASTERN DIVISION


SAMANPREET SINGH,              )
                               )  CASE NO.  3:26-CV-133
                               Petitioner,  )
                               )
                              v.  )  JUDGE BENITA Y. PEARSON
                               )
FREDRICK W. STEVENS, et al.,   )  MEMORANDUM OF OPINION AND
                               )  ORDER
                               Respondents.  )  [Resolving ECF No. 1 and ECF No. 10]


    Pending before the Court is Samanpreet Singh’s Petition for Writ of Habeas Corpus
pursuant to 28 U.S.C. § 2241.  ECF No. 1.  The matter is fully briefed.  Resp. Response Br., ECF
No. 8; Pet. Traverse Br., ECF No. 9.  Being duly advised, having reviewed the parties’ briefs and
the applicable law, the petition for habeas relief under § 2241 (ECF No. 1) is granted.
Petitioner’s Motion for Temporary Restraining Order (ECF No. 10) is denied as moot.
                       I.   BACKGROUND
    A.  Statutory Framework
    Under the Trafficking Victims Protection Re

[Doc 13] (HC) P.S. v. Chestnut
  Date: Dec 29, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10767980/ericka-ps-v-christopher-chestnut-in-his-official-capacity-as-the-warden/
  Content: 1
2
3
4
5
6
7
8                      UNITED STATES DISTRICT COURT
9                     EASTERN DISTRICT OF CALIFORNIA
10
11   ERICKA P.S.,1

12              Petitioner,          No. 1:25-cv-02049-TLN-CKD

13
14        v.                         ORDER
    CHRISTOPHER CHESTNUT, in his
15
    official capacity as the Warden of the
    California City Detention Center; et al.,
16
              Respondents.
17

[Doc 14] Gutierrez Gutierrez v. Miami Field Office Director., Immigration and Custom Enforcement's Enforcement and Removal Operations
  Date: Jan 13, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  AI Assessment: routine (erosion: routine) · confidence: 0.85
  AI Summary: This is a standard habeas corpus petition where a court reviews the legality of immigration detention, a routine judicial check on executive authority. The document shows the court granting relief to the petitioner, demonstrating that judicial oversight mechanisms are functioning normally. The prese
  URL: https://www.courtlistener.com/opinion/10779719/mario-benito-gutierrez-v-miami-field-office-director-et-al/
  Content:              UNITED STATES DISTRICT COURT
              MIDDLE DISTRICT OF FLORIDA
                  FORT MYERS DIVISION

MARIO BENITO GUTIERREZ
GUTIERREZ,

     Petitioner,

v.                                   Case No.2:25-cv-1223-JES-DNF

MIAMI FIELD OFICE DIRECTOR,
et al.,

     Respondents.
                        /

                   OPINION AND ORDER
Before  the  Court  are  Mario  Benito  Gutierrez  Gutierrez’s
petition  for  writ  of  habeas  corpus  (Doc.  1),  the  government’s
response  (Doc.  7),  and  Gutierrez’s  reply.  (Doc.  8).    For  the
reasons below, the Court grants the petition.
                    I.   Background
Gutierrez is a citizen of Nicaragua who entered the United
States on or around March 30, 2021 without inspection.  (Doc. 1
at 12).  He was taken into custody shortly thereafter but released
on bond in June of 2021.  (Id. at 12).  He r

[Doc 15] Vasquez Chinchilla v. De Anda-Ybarra
  Date: Dec 15, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10760704/orlin-yovani-vasquez-chinchilla-v-mary-de-anda-ybarra-acting-field-office/
  Content:           IN THE UNITED STATES DISTRICT COURT
           FOR THE WESTERN DISTRICT OF TEXAS
                    EL PASO DIVISION

ORLIN YOVANI VASQUEZ            §
CHINCHILLA,                     §
Petitioner,                §
                           §        EP-25-CV-00548-DB
v.                              §
                           §
MARY DE ANDA-YBARRA, Acting Field  §
Office Director of Enforcement and  §
Removal Operations, El Paso Field Office,  §
Immigration and Customs Enforcement, et  §
al.,                            §
Respondents.               §
       AMENDED1 MEMORANDUM OPINION AND ORDER

On  this  day,  the  Court  considered  Petitioner  Orlin  Yovani  Vasquez  Chinchilla’s
(“Petitioner”) “Petition for Writ of Habeas Corpus,” ECF No.2 1, filed on November 14, 2025.
After due consideration, this Court asserts its jurisdiction over Petitioner’s claims and hereby
orders Petitioner’s bond hearing be held in accordance

[Doc 16] Amaya-Velis v. Director of the Detroit Field Office for U.S. Immigration and Customs Enforcement
  Date: Jan 27, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10781149/carlos-rene-amaya-velis-v-kevin-raycraft-director-of-the-detroit-field/
  Content:                UNITED STATES DISTRICT COURT
                 NORTHERN DISTRICT OF OHIO
                      EASTERN DIVISION
CARLOS RENE AMAYA-VELIS,        )   Case No. 4:26-cv-73
                               )
    Petitioner,                )
                               )    Judge J. Philip Calabrese
v.                              )
                               )   Magistrate Judge
KEVIN RAYCRAFT, Director of the  )  Jennifer Dowdell Armstrong
Detroit Field Office, U.S.      )
Immigration and Customs         )
Enforcement, et al.,            )
                               )
    Respondents.               )
                               )
                     OPINION AND ORDER
    On  January  14,  2026,  the  Court  dismissed  without  prejudice  the  habeas
petition of Petitioner Carlos Amaya-Velis.  He timely filed a motion under Rule 59(e)
to alter or amend the judgment.  Under Section 9.M of its Civil

[Doc 17] Ramirez-Contreras v. Noem
  Date: Dec 7, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10755455/filogonio-ramirez-contretras-v-kristi-noem-et-al/
  Content: 1
2
3                     UNITED STATES DISTRICT COURT
4                          DISTRICT OF NEVADA
5                                 * * *

6   FILOGONIO RAMIREZ-CONTRETRAS,

7                Petitioner,
                                         Case No. 2:25-cv-02218-RFB-EJY
8        v.
                                       ORDER GRANTING PRELIMINARY
9                                               INJUNCTION
   KRISTI NOEM, et al.,
10
               Respondents.
11

12       Pending  before  the  Court  is  Petitioner  Filogonio  Ramirez-Contretras’s  motion  for
13  preliminary injunctive relief (ECF No. 6), challenging the lawfulness of his detention at Nevada
14  Southern Detention Center (NSDC) in the custody of the Federal Respondents. For the following
15  reasons, the Court grants the Motion.
16       On Octo

[Doc 18] Drammeh v. Warden, Otay Mesa Detention Center
  Date: Jan 5, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10770162/muhamadou-drammeh-v-kristi-noem-secretary-of-the-department-of-homeland/
  Content: 1
2
3
4
5
6
7
8                     UNITED STATES DISTRICT COURT
9                   SOUTHERN DISTRICT OF CALIFORNIA
10
11  MUHAMADOU DRAMMEH,                   Case No.:  25-CV-3412 JLS (JLB)

12                            Petitioner,
                                        ORDER GRANTING FIRST
13  v.                                   AMENDED PETITION FOR WRIT
                                        OF HABEAS CORPUS
14  KRISTI NOEM, Secretary of the

   Department of Homeland Security, et al.,
15                                       (ECF No. 5)
                          Respondents.
16

[Doc 19] Ebu v. Tindall
  Date: Jan 29, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10782144/joseph-ebu-v-jeff-tindall-oldham-county-jailer-samuel-olson-field/
  Content:                   UNITED STATES DISTRICT COURT
                 WESTERN DISTRICT OF KENTUCKY
                       LOUISVILLE DIVISION

JOSEPH EBU,                                               Petitioner,

v.                                       Civil Action No. 3:25-cv-779-RGJ

JEFF TINDALL, Oldham County Jailer;
SAMUEL OLSON, Field Office Director for U.S.
Immigration and Customs Enforcement;
KRISTI NOEM, in her official capacity as Secretary,
U.S. Department of Homeland Security,                   Respondents.

                           *  *  *  *  *

                MEMORANDUM OPINION AND ORDER

    This matter is before the Court on Petitioner Joseph Ebu’s Amended Writ of Habeas
Corpus. [DE 6]. Respondents responded on December 23, 2025. [DE 9]. Petitioner replied on
December 25, 2025. [DE 10]. The Parties agreed to forgo an evidentiary hearing. [DE 7; DE 8].
This matter is ripe for adjudication. For the reasons below, the Court will GRANT Joseph Ebu’s
Petition for a Writ of Habeas Corpus.
                        I.   Background
    Petitioner Joseph Ebu (“Ebu”) is a lawful permanent resident (“LPR”) of the U

[Doc 20] CONTRERAS MALDONADO v. CABEZAS
  Date: Oct 22, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10710173/yanddiry-yaneth-contreras-maldonado-v-alexander-cabezas-et-al/
  Content: NOT FOR PUBLICATION

                 UNITED STATES DISTRICT COURT
                    DISTRICT OF NEW JERSEY



YANDDIRY YANETH CONTRERAS
MALDONADO,

               Plaintiff,            Civil Action No. 25-13004

     v.                                   OPINION

ALEXANDER CABEZAS et al.,               October 23, 2025

              Respondents.
SEMPER, District Judge.
    THIS  MATTER  comes  before  the  Court  is  Petitioner  Yanddiry  Yaneth  Contreras
Maldonado’s (“Petitioner”) Amended Petition for a Writ of Habeas Corpus pursuant to 28 U.S.C.
§ 2241, in which she challenges the lawfulness of her immigration detention. (ECF 18, “Amended
Petition” or “Am. Pet.”) The Amended  Petition raises complex statutory and constitutional
questions concerning whether Petitioner’s custody falls under 8 U.S.C. §§ 1225(b)(2) or 1226(a).
(Id.) Respondents filed a response to the Amended Petition on September 2, 2025. (ECF 26,
“Response”.) Petitioner filed a reply on September 10, 2025. (ECF 29, “Reply”.) The Court held
a hearing on October 9, 2025, and reserved ruling on the ultimate merits of the habeas petit

--- OUTPUT FORMAT ---
Produce ALL THREE sections in your response:

=== EXPERT ANSWER ===
(400-800 words. Technical analysis for researchers. Reference specific documents by
title and [Doc N] citation. Include date qualifications. Note limitations of the
documentary record. Present counter-arguments. Where evidence supports it, note
institutional implications.)

=== PUBLIC ANSWER ===
(200-500 words. Plain language for journalists and citizens. No jargon. Every factual
claim still cites [Doc N]. Include a sentence about what the answer does NOT cover.
Present alternative explanations.)

=== RELATED QUESTIONS ===
(Exactly 3 follow-up questions the user might want to explore based on this topic.)
```

</details>

### Expert Draft

The retrieved documents, spanning October 22, 2025 to February 17, 2026, provide strong evidence that federal district courts across multiple jurisdictions have been actively pushing back on immigration detention practices through habeas corpus proceedings, frequently granting relief to detained noncitizens on due process and statutory grounds.

**Volume and Geographic Breadth of Challenges.** The corpus statistics reveal 167 matching documents, with a dramatic spike in late 2025 and early 2026 (25 documents in December 2025 and 30 in January 2026). The 20 retrieved documents represent cases from at least eight federal districts: Nevada [Doc 1, 11, 17], Idaho [Doc 2, 4, 5, 6, 9, 10], Maine [Doc 3], Western Texas [Doc 7, 15], Eastern California [Doc 8, 13], Middle Florida [Doc 14], Southern California [Doc 18], Northern Ohio [Doc 12, 16], Western Kentucky [Doc 19], and New Jersey [Doc 20]. This geographic breadth suggests a systemic pattern of judicial scrutiny rather than isolated rulings.

**Grants of Habeas Relief.** Multiple courts explicitly granted habeas petitions or preliminary injunctions ordering release or bond hearings. In _Guillen-Mora v. Lyons_, the Western District of Texas ordered the respondents to release the petitioner from custody [Doc 7]. In _Rodas v. Noem_ and _Ramirez-Contreras v. Noem_, the District of Nevada granted preliminary injunctions challenging detention lawfulness [Doc 11, 17]. In _Gutierrez Gutierrez v. Miami Field Office Director_, the Middle District of Florida granted the habeas petition [Doc 14]. The system previously assessed this document as "routine," noting it demonstrated "judicial oversight mechanisms are functioning normally" [Doc 14]. In _Singh v. Stevens_, the Northern District of Ohio granted habeas relief under 28 U.S.C. § 2241 [Doc 12]. In _Drammeh v. Warden_, the Southern District of California granted a first amended petition for writ of habeas corpus [Doc 18]. In _Ebu v. Tindall_, the Western District of Kentucky granted a habeas petition for a lawful permanent resident [Doc 19]. In _Vasquez Chinchilla v. De Anda-Ybarra_, the court ordered a bond hearing [Doc 15].

**Key Legal Issues.** The cases reveal several recurring legal disputes. The District of Nevada noted "a rapidly growing number" of cases "challenging the federal government's reading of the Immigration and Nationality Act (INA) to authorize mandatory detention of all noncitizens charged with entering the United States without inspection" [Doc 1]. The Idaho cases repeatedly reference the historical arc of U.S. immigration restriction [Doc 4, 6, 9, 10]. The New Jersey court noted "complex statutory and constitutional questions concerning whether Petitioner's custody falls under 8 U.S.C. §§ 1225(b)(2) or 1226(a)" — a critical distinction because the statutory provision determines what procedural protections apply [Doc 20].

**Counter-Evidence.** Not all courts ruled in favor of petitioners. In _Trega v. Bondi_, the District of Maine dismissed the habeas petition, finding that a courthouse arrest did not violate due process and that the court lacked subject matter jurisdiction over remaining claims [Doc 3]. This demonstrates that judicial pushback is not uniform.

**Institutional Implications.** The sheer volume of habeas filings — and the frequency of granted petitions across multiple circuits — could indicate that courts are serving as a significant check on executive branch immigration enforcement authority. The Nevada court's characterization of "rapidly growing" case numbers [Doc 1] may reflect a pattern where aggressive enforcement policies are generating substantial judicial review. However, the documents are weighted toward recent publications and habeas grants (which generate written opinions more frequently than denials), so the retrieval may overrepresent successful challenges.

**Limitations.** The retrieved documents provide only partial text of opinions, making it difficult to fully assess the legal reasoning. The corpus is heavily weighted toward late 2025 and early 2026, and earlier periods of similar judicial activity may be underrepresented.

### Public Draft

Yes, based on the available documents from October 2025 through February 2026, federal courts across the country have been actively challenging the government's immigration detention practices. Courts in at least eight states have been hearing cases from detained immigrants who argue their detention is unlawful.

Many of these courts have sided with the detainees. A federal judge in Texas ordered the government to release a detained Nicaraguan woman [Doc 7]. Courts in Nevada granted emergency orders challenging the lawfulness of detentions [Doc 11, 17]. Federal judges in Florida [Doc 14], Ohio [Doc 12], California [Doc 18], Kentucky [Doc 19], and Texas [Doc 15] all ruled in favor of detained immigrants, ordering their release or requiring the government to hold proper bond hearings.

A judge in Nevada specifically noted that there is "a rapidly growing number" of cases challenging the government's position that it can mandatorily detain all noncitizens charged with entering without inspection [Doc 1]. This suggests the courts are seeing a wave of challenges to current enforcement policies.

However, not every court ruled against the government. A federal judge in Maine dismissed one detainee's case, finding no due process violation in a courthouse arrest and ruling the court lacked jurisdiction over other claims [Doc 3].

The 167 matching documents in the full database — with the highest concentration in December 2025 and January 2026 — suggest this is a widespread and growing phenomenon across the federal court system.

This answer does not cover appeals court or Supreme Court rulings on these issues, nor does it address the government's full legal arguments in defense of its detention practices, as these are only partially reflected in the retrieved documents.

### Related Questions (from Draft)

1. What specific statutory provisions (such as 8 U.S.C. § 1225 vs. § 1226) are courts interpreting differently from the government in immigration detention cases?
2. Has the government appealed any of these district court rulings granting habeas relief, and how have appellate courts responded?
3. How does the current volume of immigration habeas corpus filings compare to historical levels under previous administrations?

---

## 4. Pass 2: Feedback

> Model: gpt-4o-2024-08-06
> Time: 11744ms

### Feedback Prompt

<details>
<summary>Click to expand feedback prompt</summary>

```
You are an editorial reviewer for a government document search system.
Review the following AI-generated answers against the source documents.

--- USER QUESTION ---
Have the courts been pushing back on immigration due process violations?

--- EXPERT DRAFT ---
The retrieved documents, spanning October 22, 2025 to February 17, 2026, provide strong evidence that federal district courts across multiple jurisdictions have been actively pushing back on immigration detention practices through habeas corpus proceedings, frequently granting relief to detained noncitizens on due process and statutory grounds.

**Volume and Geographic Breadth of Challenges.** The corpus statistics reveal 167 matching documents, with a dramatic spike in late 2025 and early 2026 (25 documents in December 2025 and 30 in January 2026). The 20 retrieved documents represent cases from at least eight federal districts: Nevada [Doc 1, 11, 17], Idaho [Doc 2, 4, 5, 6, 9, 10], Maine [Doc 3], Western Texas [Doc 7, 15], Eastern California [Doc 8, 13], Middle Florida [Doc 14], Southern California [Doc 18], Northern Ohio [Doc 12, 16], Western Kentucky [Doc 19], and New Jersey [Doc 20]. This geographic breadth suggests a systemic pattern of judicial scrutiny rather than isolated rulings.

**Grants of Habeas Relief.** Multiple courts explicitly granted habeas petitions or preliminary injunctions ordering release or bond hearings. In *Guillen-Mora v. Lyons*, the Western District of Texas ordered the respondents to release the petitioner from custody [Doc 7]. In *Rodas v. Noem* and *Ramirez-Contreras v. Noem*, the District of Nevada granted preliminary injunctions challenging detention lawfulness [Doc 11, 17]. In *Gutierrez Gutierrez v. Miami Field Office Director*, the Middle District of Florida granted the habeas petition [Doc 14]. The system previously assessed this document as "routine," noting it demonstrated "judicial oversight mechanisms are functioning normally" [Doc 14]. In *Singh v. Stevens*, the Northern District of Ohio granted habeas relief under 28 U.S.C. § 2241 [Doc 12]. In *Drammeh v. Warden*, the Southern District of California granted a first amended petition for writ of habeas corpus [Doc 18]. In *Ebu v. Tindall*, the Western District of Kentucky granted a habeas petition for a lawful permanent resident [Doc 19]. In *Vasquez Chinchilla v. De Anda-Ybarra*, the court ordered a bond hearing [Doc 15].

**Key Legal Issues.** The cases reveal several recurring legal disputes. The District of Nevada noted "a rapidly growing number" of cases "challenging the federal government's reading of the Immigration and Nationality Act (INA) to authorize mandatory detention of all noncitizens charged with entering the United States without inspection" [Doc 1]. The Idaho cases repeatedly reference the historical arc of U.S. immigration restriction [Doc 4, 6, 9, 10]. The New Jersey court noted "complex statutory and constitutional questions concerning whether Petitioner's custody falls under 8 U.S.C. §§ 1225(b)(2) or 1226(a)" — a critical distinction because the statutory provision determines what procedural protections apply [Doc 20].

**Counter-Evidence.** Not all courts ruled in favor of petitioners. In *Trega v. Bondi*, the District of Maine dismissed the habeas petition, finding that a courthouse arrest did not violate due process and that the court lacked subject matter jurisdiction over remaining claims [Doc 3]. This demonstrates that judicial pushback is not uniform.

**Institutional Implications.** The sheer volume of habeas filings — and the frequency of granted petitions across multiple circuits — could indicate that courts are serving as a significant check on executive branch immigration enforcement authority. The Nevada court's characterization of "rapidly growing" case numbers [Doc 1] may reflect a pattern where aggressive enforcement policies are generating substantial judicial review. However, the documents are weighted toward recent publications and habeas grants (which generate written opinions more frequently than denials), so the retrieval may overrepresent successful challenges.

**Limitations.** The retrieved documents provide only partial text of opinions, making it difficult to fully assess the legal reasoning. The corpus is heavily weighted toward late 2025 and early 2026, and earlier periods of similar judicial activity may be underrepresented.

--- PUBLIC DRAFT ---
Yes, based on the available documents from October 2025 through February 2026, federal courts across the country have been actively challenging the government's immigration detention practices. Courts in at least eight states have been hearing cases from detained immigrants who argue their detention is unlawful.

Many of these courts have sided with the detainees. A federal judge in Texas ordered the government to release a detained Nicaraguan woman [Doc 7]. Courts in Nevada granted emergency orders challenging the lawfulness of detentions [Doc 11, 17]. Federal judges in Florida [Doc 14], Ohio [Doc 12], California [Doc 18], Kentucky [Doc 19], and Texas [Doc 15] all ruled in favor of detained immigrants, ordering their release or requiring the government to hold proper bond hearings.

A judge in Nevada specifically noted that there is "a rapidly growing number" of cases challenging the government's position that it can mandatorily detain all noncitizens charged with entering without inspection [Doc 1]. This suggests the courts are seeing a wave of challenges to current enforcement policies.

However, not every court ruled against the government. A federal judge in Maine dismissed one detainee's case, finding no due process violation in a courthouse arrest and ruling the court lacked jurisdiction over other claims [Doc 3].

The 167 matching documents in the full database — with the highest concentration in December 2025 and January 2026 — suggest this is a widespread and growing phenomenon across the federal court system.

This answer does not cover appeals court or Supreme Court rulings on these issues, nor does it address the government's full legal arguments in defense of its detention practices, as these are only partially reflected in the retrieved documents.

--- SOURCE DOCUMENTS ---
[Doc 1] Quinonez Orosco v. Lyons
  Date: Dec 9, 2025 · Source: judicial_opinion (courtlistener) · Category: lawEnforcement · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10755611/edin-eleazar-quinonez-orosco-v-todd-lyons-et-al/
  Content: 1
2
3
4                     UNITED STATES DISTRICT COURT
5                          DISTRICT OF NEVADA
6                                 * * *

7   EDIN ELEAZAR QUINONEZ OROSCO,     Case No. 2:25-cv-02240-RFB-EJY

8               Petitioners,                   ORDER

9        v.

10
   TODD LYONS, et al.,
11
               Respondents.
12

13
14     I.  INTRODUCTION
15       This case is one of a rapidly growing number before this Court challenging the federal
16  government’s reading of the Immigration and Nationality Act (INA) to authorize mandatory
17  detention of all noncitizens charged with entering the United States without inspection.1 The
18

[Doc 2] Perez Camacho v. Hollinshead
  Date: Nov 18, 2025 · Source: judicial_opinion (courtlistener) · Category: lawEnforcement · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10739159/antonio-perez-camacho-v-mike-hollinshead-sheriff-elmore-county-kenneth/
  Content:                 UNITED STATES DISTRICT COURT

                 FOR THE DISTRICT OF IDAHO


ANTONIO PEREZ CAMACHO,           Case No. 1:25-cv-00593-BLW

        Petitioner,            MEMORANDUM DECISION AND
                               ORDER
   v.

MIKE HOLLINSHEAD, Sheriff,
Elmore County; KENNETH
PORTER, Director of Boise
Immigration and Customs
Enforcement Field Sub-Office;
JASON KNIGHT, Director of the Salt
Lake City U.S. Immigration and
Customs Enforcement Field Office;
KRISTI NOEM, Secretary of the U.S.
Department of Homeland Security;
and PAM BONDI, Attorney General
of the United States, in their official
capacities,

        Respondents.




[Doc 3] TREGA v. BONDI
  Date: Jan 15, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10775743/samara-pereira-trega-v-pamela-bondi-in-her-official-capacity-as-attorney/
  Content:             UNITED STATES DISTRICT COURT
                  DISTRICT OF MAINE

SAMARA PEREIRA TREGA,         )
                         )
     Petitioner,         )
                         )
v.                       )         No. 2:25-cv-00643-JAW
                         )
PAMELA BONDI, in her official   )
capacity as Attorney General     )
of the United States, et al.,    )
                         )
     Respondents.        )

   ORDER ON PETITION FOR WRIT OF HABEAS CORPUS
A noncitizen from Brazil brings a petition for habeas corpus, claiming her
detention pending removal proceedings violates due process.  The court dismisses her
petition because her courthouse arrest does not violate due process and because it
does not have subject matter jurisdiction over her remaining claims.
I.   BACKGROUND
Samara Pereira Trega is a Brazilian citizen who arrived in the United States
without inspection in No

[Doc 4] Esparza Ibarra v. Bondi
  Date: Nov 18, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10739185/edmundo-esparza-ibarra-v-jason-knight-field-office-director-of/
  Content:                  UNITED STATES DISTRICT COURT

                  FOR THE DISTRICT OF IDAHO


EDMUNDO ESPARZA IBARRA,           Case No.  1:25-cv-00597-BLW

         Petitioner,             MEMORANDUM DECISION AND
                                 ORDER
    v.

JASON KNIGHT, Field Office
Director of Enforcement and Removal
Operations, Salt Lake City Field Office,
Immigration and Customs
Enforcement; KENNETH PORTER,
Acting Director of the Boise U.S.
Immigration and Customs Enforcement
Field Sub-Office; KRISTI NOEM,
Secretary, U.S. Department of
Homeland Security; PAMELA BONDI,
U.S. Attorney General,

         Respondents.


                       INTRODUCTION
    Since the United States began restricting immigration into this countr

[Doc 5] Ortega Casarez v. Hollinshead
  Date: Nov 18, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10739166/apolonio-ortega-casarez-v-jarrod-thompson-sheriff-cassia-county-mike/
  Content:                  UNITED STATES DISTRICT COURT

                  FOR THE DISTRICT OF IDAHO


APOLONIO ORTEGA CASAREZ,         Case No. 1:25-cv-00596-BLW

         Petitioner,            MEMORANDUM DECISION AND
                                ORDER
    v.

JARROD THOMPSON, Sheriff,
Cassia County; MIKE
HOLLINSHEAD, Sheriff, Elmore
County; KENNETH PORTER,
Director of Boise U.S. Immigration
and Customs Enforcement Field Sub-
Office; JASON KNIGHT, Director of
the Salt Lake City U.S. Immigration
and Customs Enforcement Field
Office; KRISTI NOEM, Secretary of
the U.S. Department of Homeland
Security; and PAM BONDI, Attorney
General of the United States, in their
official capacities,


[Doc 6] Villafana Rodriguez v. Noem
  Date: Nov 18, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10739196/adela-villafana-rodriguez-v-jason-knight-field-office-director-of/
  Content:                  UNITED STATES DISTRICT COURT

                  FOR THE DISTRICT OF IDAHO


ADELA VILLAFANA RODRIGUEZ,        Case No.  1:25-cv-00600-BLW

         Petitioner,             MEMORANDUM DECISION AND
                                 ORDER
    v.

JASON KNIGHT, Field Office
Director of Enforcement and Removal
Operations, Salt Lake City Field Office,
Immigration and Customs
Enforcement; KENNETH PORTER,
Acting Director of the Boise U.S.
Immigration and Customs Enforcement
Field Sub-Office; KRISTI NOEM,
Secretary, U.S. Department of
Homeland Security; PAMELA BONDI,
U.S. Attorney General,

         Respondents.


                       INTRODUCTION
    Since the United States began restricting immigration into this countr

[Doc 7] Guillen-Mora v. Lyons
  Date: Jan 8, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10797075/digna-carolina-guillen-mora-v-acting-director-todd-m-lyons-miguel/
  Content:                  UNITED STATES DISTRICT COURT
                   WESTERN DISTRICT OF TEXAS
                     SAN ANTONIO DIVISION

DIGNA CAROLINA GUILLEN-MORA,  §
Petitioner                    §
                              §
v.                            §       Case No.  SA-25-CA-01864-XR
                              §
ACTING DIRECTOR TODD M. LYONS,  §
MIGUEL VERGARA, DIRECTOR      §
DAREN K. MARGOLIN,  WARDEN,   §
DILLEY IMMIGRATION PROCESSING  §
CENTER,                       §
Respondents                   §

      ORDER GRANTING PETITION FOR WRIT OF HABEAS CORPUS
    On this date, the Court considered Digna Carolina Guillen-Mora’s Petition for a Writ of
Habeas Corpus (ECF No. 1) and the Federal Respondents’ Abbreviated Response (ECF No. 4).
After careful consideration, the petition is GRANTED. It is ORDERED that:
    1.   Respondents are DIRECTED to RELEASE Petitioner Digna Carolina Guillen-
Mora (A 243 076 070) from custody, under condition

[Doc 8] (HC) Singh Sekhon v. Warden of the Golden State Annex Detention Facility
  Date: Jan 8, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10785571/sukhjot-singh-sekhon-v-warden-of-the-golden-state-annex-detention/
  Content: 1
2
3
4
5
6
7
8                      UNITED STATES DISTRICT COURT
9                 FOR THE EASTERN DISTRICT OF CALIFORNIA
10
11  SUKHJOT SINGH SEKHON,            Case No.  1:25-cv-1692-JDP
12               Petitioner,
13       v.                          ORDER
14  WARDEN OF THE GOLDEN STATE
   ANNEX DETENTION FACILITY, et al.,
15
                Respondents.
16
17
        Sukhjot Singh Sekhon, an asylum applicant who has lived in the United States f

[Doc 9] Elias v. Bondi
  Date: Nov 18, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10739160/ramon-estrada-elias-v-jason-knight-director-of-the-salt-lake-city-us/
  Content:                 UNITED STATES DISTRICT COURT

                 FOR THE DISTRICT OF IDAHO


RAMON ESTRADA ELIAS,             Case No. 1:25-cv-00594-BLW

        Petitioner,            MEMORANDUM DECISION AND
                               ORDER
   v.

JASON KNIGHT, Director of the Salt
Lake City U.S. Immigration and
Customs Enforcement Field Office;
KENNETH PORTER, Director of
Boise Immigration and Customs
Enforcement Field Sub-Office;
KRISTI NOEM, Secretary of the U.S.
Department of Homeland Security;
and PAMELA BONDI, U.S. Attorney
General; STEVE ANDERSON,
Sheriff of Jefferson County,

        Respondents.


                      INTRODUCTION
   Since the United States began restricting immigration into this country in the

[Doc 10] Estrada Elias v. Bondi
  Date: Nov 18, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10739222/ruben-estrada-elias-v-jason-knight-field-office-director-of-enforcement/
  Content:                  UNITED STATES DISTRICT COURT

                  FOR THE DISTRICT OF IDAHO


RUBEN ESTRADA ELIAS,              Case No.  1:25-cv-00604-BLW

         Petitioner,             MEMORANDUM DECISION AND
                                 ORDER
    v.

JASON KNIGHT, Field Office
Director of Enforcement and Removal
Operations, Salt Lake City Field Office,
Immigration and Customs
Enforcement; KENNETH PORTER,
Acting Director of the Boise U.S.
Immigration and Customs Enforcement
Field Sub-Office; KRISTI NOEM,
Secretary, U.S. Department of
Homeland Security; PAMELA BONDI,
U.S. Attorney General; STEVE
ANDERSON, Sheriff, Jefferson
County,

         Respondents.


[Doc 11] Rodas v. Noem
  Date: Dec 7, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10755456/moises-rodas-v-kristi-noem-et-al/
  Content: 1
2
3                     UNITED STATES DISTRICT COURT
4                          DISTRICT OF NEVADA
5                                 * * *

6   MOISES RODAS,

7                Petitioner,
                                         Case No. 2:25-cv-02216-RFB-BNW
8        v.
                                       ORDER GRANTING PRELIMINARY
9                                               INJUNCTION
   KRISTI NOEM, et al.,
10
               Respondents.
11

12       Pending before the Court is Petitioner Moises Rodas’s amended motion for preliminary
13  injunctive relief (ECF No. 9), challenging the lawfulness of his detention at Henderson Detention
14  Center in the custody of the Federal Respondents. For the following reasons, the Court grants the
15  Motion.
16       On Nove

[Doc 12] Singh v. Stevens
  Date: Feb 17, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10801431/samanpreet-singh-v-fredrick-w-stevens-et-al/
  Content: PEARSON, J.        UNITED STATES DISTRICT COURT
                   NORTHERN DISTRICT OF OHIO
                        EASTERN DIVISION


SAMANPREET SINGH,              )
                               )  CASE NO.  3:26-CV-133
                               Petitioner,  )
                               )
                              v.  )  JUDGE BENITA Y. PEARSON
                               )
FREDRICK W. STEVENS, et al.,   )  MEMORANDUM OF OPINION AND
                               )  ORDER
                               Respondents.  )  [Resolving ECF No. 1 and ECF No. 10]


    Pending before the Court is Samanpreet Singh’s Petition for Writ of Habeas Corpus
pursuant to 28 U.S.C. § 2241.  ECF No. 1.  The matter is fully briefed.  Resp. Response Br., ECF
No. 8; Pet. Traverse Br., ECF No. 9.  Being duly advised, having reviewed the parties’ briefs and
the applicable law, the petition for habeas relief under § 2241 (ECF No. 1) is granted.
Petitioner’s Motion for Temporary Restraining Order (ECF No. 10) is denied as moot.
                       I.   BACKGROUND
    A.  Statutory Framework
    Under the Trafficking Victims Protection Re

[Doc 13] (HC) P.S. v. Chestnut
  Date: Dec 29, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10767980/ericka-ps-v-christopher-chestnut-in-his-official-capacity-as-the-warden/
  Content: 1
2
3
4
5
6
7
8                      UNITED STATES DISTRICT COURT
9                     EASTERN DISTRICT OF CALIFORNIA
10
11   ERICKA P.S.,1

12              Petitioner,          No. 1:25-cv-02049-TLN-CKD

13
14        v.                         ORDER
    CHRISTOPHER CHESTNUT, in his
15
    official capacity as the Warden of the
    California City Detention Center; et al.,
16
              Respondents.
17

[Doc 14] Gutierrez Gutierrez v. Miami Field Office Director., Immigration and Custom Enforcement's Enforcement and Removal Operations
  Date: Jan 13, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  AI Assessment: routine (erosion: routine) · confidence: 0.85
  AI Summary: This is a standard habeas corpus petition where a court reviews the legality of immigration detention, a routine judicial check on executive authority. The document shows the court granting relief to the petitioner, demonstrating that judicial oversight mechanisms are functioning normally. The prese
  URL: https://www.courtlistener.com/opinion/10779719/mario-benito-gutierrez-v-miami-field-office-director-et-al/
  Content:              UNITED STATES DISTRICT COURT
              MIDDLE DISTRICT OF FLORIDA
                  FORT MYERS DIVISION

MARIO BENITO GUTIERREZ
GUTIERREZ,

     Petitioner,

v.                                   Case No.2:25-cv-1223-JES-DNF

MIAMI FIELD OFICE DIRECTOR,
et al.,

     Respondents.
                        /

                   OPINION AND ORDER
Before  the  Court  are  Mario  Benito  Gutierrez  Gutierrez’s
petition  for  writ  of  habeas  corpus  (Doc.  1),  the  government’s
response  (Doc.  7),  and  Gutierrez’s  reply.  (Doc.  8).    For  the
reasons below, the Court grants the petition.
                    I.   Background
Gutierrez is a citizen of Nicaragua who entered the United
States on or around March 30, 2021 without inspection.  (Doc. 1
at 12).  He was taken into custody shortly thereafter but released
on bond in June of 2021.  (Id. at 12).  He r

[Doc 15] Vasquez Chinchilla v. De Anda-Ybarra
  Date: Dec 15, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10760704/orlin-yovani-vasquez-chinchilla-v-mary-de-anda-ybarra-acting-field-office/
  Content:           IN THE UNITED STATES DISTRICT COURT
           FOR THE WESTERN DISTRICT OF TEXAS
                    EL PASO DIVISION

ORLIN YOVANI VASQUEZ            §
CHINCHILLA,                     §
Petitioner,                §
                           §        EP-25-CV-00548-DB
v.                              §
                           §
MARY DE ANDA-YBARRA, Acting Field  §
Office Director of Enforcement and  §
Removal Operations, El Paso Field Office,  §
Immigration and Customs Enforcement, et  §
al.,                            §
Respondents.               §
       AMENDED1 MEMORANDUM OPINION AND ORDER

On  this  day,  the  Court  considered  Petitioner  Orlin  Yovani  Vasquez  Chinchilla’s
(“Petitioner”) “Petition for Writ of Habeas Corpus,” ECF No.2 1, filed on November 14, 2025.
After due consideration, this Court asserts its jurisdiction over Petitioner’s claims and hereby
orders Petitioner’s bond hearing be held in accordance

[Doc 16] Amaya-Velis v. Director of the Detroit Field Office for U.S. Immigration and Customs Enforcement
  Date: Jan 27, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10781149/carlos-rene-amaya-velis-v-kevin-raycraft-director-of-the-detroit-field/
  Content:                UNITED STATES DISTRICT COURT
                 NORTHERN DISTRICT OF OHIO
                      EASTERN DIVISION
CARLOS RENE AMAYA-VELIS,        )   Case No. 4:26-cv-73
                               )
    Petitioner,                )
                               )    Judge J. Philip Calabrese
v.                              )
                               )   Magistrate Judge
KEVIN RAYCRAFT, Director of the  )  Jennifer Dowdell Armstrong
Detroit Field Office, U.S.      )
Immigration and Customs         )
Enforcement, et al.,            )
                               )
    Respondents.               )
                               )
                     OPINION AND ORDER
    On  January  14,  2026,  the  Court  dismissed  without  prejudice  the  habeas
petition of Petitioner Carlos Amaya-Velis.  He timely filed a motion under Rule 59(e)
to alter or amend the judgment.  Under Section 9.M of its Civil

[Doc 17] Ramirez-Contreras v. Noem
  Date: Dec 7, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10755455/filogonio-ramirez-contretras-v-kristi-noem-et-al/
  Content: 1
2
3                     UNITED STATES DISTRICT COURT
4                          DISTRICT OF NEVADA
5                                 * * *

6   FILOGONIO RAMIREZ-CONTRETRAS,

7                Petitioner,
                                         Case No. 2:25-cv-02218-RFB-EJY
8        v.
                                       ORDER GRANTING PRELIMINARY
9                                               INJUNCTION
   KRISTI NOEM, et al.,
10
               Respondents.
11

12       Pending  before  the  Court  is  Petitioner  Filogonio  Ramirez-Contretras’s  motion  for
13  preliminary injunctive relief (ECF No. 6), challenging the lawfulness of his detention at Nevada
14  Southern Detention Center (NSDC) in the custody of the Federal Respondents. For the following
15  reasons, the Court grants the Motion.
16       On Octo

[Doc 18] Drammeh v. Warden, Otay Mesa Detention Center
  Date: Jan 5, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10770162/muhamadou-drammeh-v-kristi-noem-secretary-of-the-department-of-homeland/
  Content: 1
2
3
4
5
6
7
8                     UNITED STATES DISTRICT COURT
9                   SOUTHERN DISTRICT OF CALIFORNIA
10
11  MUHAMADOU DRAMMEH,                   Case No.:  25-CV-3412 JLS (JLB)

12                            Petitioner,
                                        ORDER GRANTING FIRST
13  v.                                   AMENDED PETITION FOR WRIT
                                        OF HABEAS CORPUS
14  KRISTI NOEM, Secretary of the

   Department of Homeland Security, et al.,
15                                       (ECF No. 5)
                          Respondents.
16

[Doc 19] Ebu v. Tindall
  Date: Jan 29, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10782144/joseph-ebu-v-jeff-tindall-oldham-county-jailer-samuel-olson-field/
  Content:                   UNITED STATES DISTRICT COURT
                 WESTERN DISTRICT OF KENTUCKY
                       LOUISVILLE DIVISION

JOSEPH EBU,                                               Petitioner,

v.                                       Civil Action No. 3:25-cv-779-RGJ

JEFF TINDALL, Oldham County Jailer;
SAMUEL OLSON, Field Office Director for U.S.
Immigration and Customs Enforcement;
KRISTI NOEM, in her official capacity as Secretary,
U.S. Department of Homeland Security,                   Respondents.

                           *  *  *  *  *

                MEMORANDUM OPINION AND ORDER

    This matter is before the Court on Petitioner Joseph Ebu’s Amended Writ of Habeas
Corpus. [DE 6]. Respondents responded on December 23, 2025. [DE 9]. Petitioner replied on
December 25, 2025. [DE 10]. The Parties agreed to forgo an evidentiary hearing. [DE 7; DE 8].
This matter is ripe for adjudication. For the reasons below, the Court will GRANT Joseph Ebu’s
Petition for a Writ of Habeas Corpus.
                        I.   Background
    Petitioner Joseph Ebu (“Ebu”) is a lawful permanent resident (“LPR”) of the U

[Doc 20] CONTRERAS MALDONADO v. CABEZAS
  Date: Oct 22, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10710173/yanddiry-yaneth-contreras-maldonado-v-alexander-cabezas-et-al/
  Content: NOT FOR PUBLICATION

                 UNITED STATES DISTRICT COURT
                    DISTRICT OF NEW JERSEY



YANDDIRY YANETH CONTRERAS
MALDONADO,

               Plaintiff,            Civil Action No. 25-13004

     v.                                   OPINION

ALEXANDER CABEZAS et al.,               October 23, 2025

              Respondents.
SEMPER, District Judge.
    THIS  MATTER  comes  before  the  Court  is  Petitioner  Yanddiry  Yaneth  Contreras
Maldonado’s (“Petitioner”) Amended Petition for a Writ of Habeas Corpus pursuant to 28 U.S.C.
§ 2241, in which she challenges the lawfulness of her immigration detention. (ECF 18, “Amended
Petition” or “Am. Pet.”) The Amended  Petition raises complex statutory and constitutional
questions concerning whether Petitioner’s custody falls under 8 U.S.C. §§ 1225(b)(2) or 1226(a).
(Id.) Respondents filed a response to the Amended Petition on September 2, 2025. (ECF 26,
“Response”.) Petitioner filed a reply on September 10, 2025. (ECF 29, “Reply”.) The Court held
a hearing on October 9, 2025, and reserved ruling on the ultimate merits of the habeas petit

--- CORPUS STATISTICS ---
Total matching documents across full corpus: 167
(The documents below are the most relevant sample.)

Monthly distribution:
  2018-10: 1
  2020-01: 1
  2020-02: 2
  2020-03: 1
  2020-05: 1
  2020-09: 1
  2020-11: 2
  2021-05: 2
  2021-06: 4
  2021-08: 2
  2021-09: 2
  2021-11: 3
  2022-01: 1
  2022-05: 1
  2022-07: 1
  2022-08: 2
  2022-09: 2
  2022-12: 2
  2023-01: 2
  2023-03: 1
  2023-07: 4
  2023-09: 1
  2024-01: 1
  2024-02: 2
  2024-07: 1
  2024-08: 1
  2025-02: 2
  2025-03: 2
  2025-05: 6
  2025-06: 2
  2025-07: 3
  2025-08: 5
  2025-09: 9
  2025-10: 11
  2025-11: 18
  2025-12: 25
  2026-01: 30
  2026-02: 9
  2026-03: 1

Category distribution:
  civilLiberties: 131
  lawEnforcement: 36

--- REVIEW INSTRUCTIONS ---
Review both drafts against the source documents. Provide structured feedback:

(a) FACTUAL ACCURACY — Does the draft correctly represent the document content?
    List any claims not supported by the provided documents.

(b) CITATION ACCURACY — Are [Doc N] citations used correctly?

(c) CONFIDENCE CALIBRATION — Does the draft overstate certainty?
    Quote specific phrases that need softening.

(d) MISSING COUNTER-ARGUMENTS — Are there plausible alternative explanations?

(e) BALANCE — Does the draft note stated justifications from the documents?

(f) COVERAGE GAPS — Does the answer acknowledge limitations?

(g) CORPUS STATISTICS — Does the answer appropriately use the full-corpus statistics?
    Are claims properly scoped to the retrieved sample vs the full corpus?
```

</details>

### Editorial Feedback

**(a) FACTUAL ACCURACY**

- Both drafts accurately represent the content of the source documents. The claims about the courts granting habeas relief and the geographic breadth of cases are supported by the documents. The mention of specific cases and outcomes aligns with the content of the documents provided.

**(b) CITATION ACCURACY**

- The citations in both drafts are used correctly. Each referenced document corresponds to the claims made about court decisions and legal issues. For example, _Guillen-Mora v. Lyons_ [Doc 7] and _Rodas v. Noem_ [Doc 11] are correctly cited as cases where habeas relief was granted.

**(c) CONFIDENCE CALIBRATION**

- The expert draft uses phrases like "strong evidence" and "suggests a systemic pattern," which are appropriate given the evidence presented. The public draft states "federal courts across the country have been actively challenging," which could be softened to "appear to be actively challenging" to better reflect the sample-based nature of the evidence.

**(d) MISSING COUNTER-ARGUMENTS**

- The drafts could consider the possibility that the spike in cases might be due to increased filings rather than increased judicial scrutiny. Additionally, the drafts could mention that the decisions might not necessarily reflect a change in judicial attitude but could be due to specific case merits.

**(e) BALANCE**

- The drafts note that not all courts ruled in favor of petitioners, as seen in _Trega v. Bondi_ [Doc 3], which adds balance by acknowledging that judicial pushback is not uniform.

**(f) COVERAGE GAPS**

- The public draft correctly notes that it does not cover appeals court or Supreme Court rulings, nor the government's full legal arguments. However, it could further emphasize that the analysis is based on a limited sample of documents from a specific time frame.

**(g) CORPUS STATISTICS**

- The drafts appropriately use the corpus statistics to highlight the volume and timing of the cases. They correctly note the spike in late 2025 and early 2026 and the geographic diversity of the cases. However, they could better clarify that the conclusions are drawn from a sample of documents rather than the entire corpus. The public draft could also mention that the corpus is heavily weighted toward recent publications, which may skew the perception of trends.

---

## 5. Pass 3: Final Revision

> Model: claude-opus-4-6
> Time: 38906ms

### Revision Prompt

<details>
<summary>Click to expand revision prompt</summary>

```
You are revising AI-generated answers to a government document search query
based on structured editorial feedback.

--- USER QUESTION ---
Have the courts been pushing back on immigration due process violations?

--- ORIGINAL EXPERT DRAFT ---
The retrieved documents, spanning October 22, 2025 to February 17, 2026, provide strong evidence that federal district courts across multiple jurisdictions have been actively pushing back on immigration detention practices through habeas corpus proceedings, frequently granting relief to detained noncitizens on due process and statutory grounds.

**Volume and Geographic Breadth of Challenges.** The corpus statistics reveal 167 matching documents, with a dramatic spike in late 2025 and early 2026 (25 documents in December 2025 and 30 in January 2026). The 20 retrieved documents represent cases from at least eight federal districts: Nevada [Doc 1, 11, 17], Idaho [Doc 2, 4, 5, 6, 9, 10], Maine [Doc 3], Western Texas [Doc 7, 15], Eastern California [Doc 8, 13], Middle Florida [Doc 14], Southern California [Doc 18], Northern Ohio [Doc 12, 16], Western Kentucky [Doc 19], and New Jersey [Doc 20]. This geographic breadth suggests a systemic pattern of judicial scrutiny rather than isolated rulings.

**Grants of Habeas Relief.** Multiple courts explicitly granted habeas petitions or preliminary injunctions ordering release or bond hearings. In *Guillen-Mora v. Lyons*, the Western District of Texas ordered the respondents to release the petitioner from custody [Doc 7]. In *Rodas v. Noem* and *Ramirez-Contreras v. Noem*, the District of Nevada granted preliminary injunctions challenging detention lawfulness [Doc 11, 17]. In *Gutierrez Gutierrez v. Miami Field Office Director*, the Middle District of Florida granted the habeas petition [Doc 14]. The system previously assessed this document as "routine," noting it demonstrated "judicial oversight mechanisms are functioning normally" [Doc 14]. In *Singh v. Stevens*, the Northern District of Ohio granted habeas relief under 28 U.S.C. § 2241 [Doc 12]. In *Drammeh v. Warden*, the Southern District of California granted a first amended petition for writ of habeas corpus [Doc 18]. In *Ebu v. Tindall*, the Western District of Kentucky granted a habeas petition for a lawful permanent resident [Doc 19]. In *Vasquez Chinchilla v. De Anda-Ybarra*, the court ordered a bond hearing [Doc 15].

**Key Legal Issues.** The cases reveal several recurring legal disputes. The District of Nevada noted "a rapidly growing number" of cases "challenging the federal government's reading of the Immigration and Nationality Act (INA) to authorize mandatory detention of all noncitizens charged with entering the United States without inspection" [Doc 1]. The Idaho cases repeatedly reference the historical arc of U.S. immigration restriction [Doc 4, 6, 9, 10]. The New Jersey court noted "complex statutory and constitutional questions concerning whether Petitioner's custody falls under 8 U.S.C. §§ 1225(b)(2) or 1226(a)" — a critical distinction because the statutory provision determines what procedural protections apply [Doc 20].

**Counter-Evidence.** Not all courts ruled in favor of petitioners. In *Trega v. Bondi*, the District of Maine dismissed the habeas petition, finding that a courthouse arrest did not violate due process and that the court lacked subject matter jurisdiction over remaining claims [Doc 3]. This demonstrates that judicial pushback is not uniform.

**Institutional Implications.** The sheer volume of habeas filings — and the frequency of granted petitions across multiple circuits — could indicate that courts are serving as a significant check on executive branch immigration enforcement authority. The Nevada court's characterization of "rapidly growing" case numbers [Doc 1] may reflect a pattern where aggressive enforcement policies are generating substantial judicial review. However, the documents are weighted toward recent publications and habeas grants (which generate written opinions more frequently than denials), so the retrieval may overrepresent successful challenges.

**Limitations.** The retrieved documents provide only partial text of opinions, making it difficult to fully assess the legal reasoning. The corpus is heavily weighted toward late 2025 and early 2026, and earlier periods of similar judicial activity may be underrepresented.

--- ORIGINAL PUBLIC DRAFT ---
Yes, based on the available documents from October 2025 through February 2026, federal courts across the country have been actively challenging the government's immigration detention practices. Courts in at least eight states have been hearing cases from detained immigrants who argue their detention is unlawful.

Many of these courts have sided with the detainees. A federal judge in Texas ordered the government to release a detained Nicaraguan woman [Doc 7]. Courts in Nevada granted emergency orders challenging the lawfulness of detentions [Doc 11, 17]. Federal judges in Florida [Doc 14], Ohio [Doc 12], California [Doc 18], Kentucky [Doc 19], and Texas [Doc 15] all ruled in favor of detained immigrants, ordering their release or requiring the government to hold proper bond hearings.

A judge in Nevada specifically noted that there is "a rapidly growing number" of cases challenging the government's position that it can mandatorily detain all noncitizens charged with entering without inspection [Doc 1]. This suggests the courts are seeing a wave of challenges to current enforcement policies.

However, not every court ruled against the government. A federal judge in Maine dismissed one detainee's case, finding no due process violation in a courthouse arrest and ruling the court lacked jurisdiction over other claims [Doc 3].

The 167 matching documents in the full database — with the highest concentration in December 2025 and January 2026 — suggest this is a widespread and growing phenomenon across the federal court system.

This answer does not cover appeals court or Supreme Court rulings on these issues, nor does it address the government's full legal arguments in defense of its detention practices, as these are only partially reflected in the retrieved documents.

--- EDITORIAL FEEDBACK ---
**(a) FACTUAL ACCURACY**

- Both drafts accurately represent the content of the source documents. The claims about the courts granting habeas relief and the geographic breadth of cases are supported by the documents. The mention of specific cases and outcomes aligns with the content of the documents provided.

**(b) CITATION ACCURACY**

- The citations in both drafts are used correctly. Each referenced document corresponds to the claims made about court decisions and legal issues. For example, *Guillen-Mora v. Lyons* [Doc 7] and *Rodas v. Noem* [Doc 11] are correctly cited as cases where habeas relief was granted.

**(c) CONFIDENCE CALIBRATION**

- The expert draft uses phrases like "strong evidence" and "suggests a systemic pattern," which are appropriate given the evidence presented. The public draft states "federal courts across the country have been actively challenging," which could be softened to "appear to be actively challenging" to better reflect the sample-based nature of the evidence.

**(d) MISSING COUNTER-ARGUMENTS**

- The drafts could consider the possibility that the spike in cases might be due to increased filings rather than increased judicial scrutiny. Additionally, the drafts could mention that the decisions might not necessarily reflect a change in judicial attitude but could be due to specific case merits.

**(e) BALANCE**

- The drafts note that not all courts ruled in favor of petitioners, as seen in *Trega v. Bondi* [Doc 3], which adds balance by acknowledging that judicial pushback is not uniform.

**(f) COVERAGE GAPS**

- The public draft correctly notes that it does not cover appeals court or Supreme Court rulings, nor the government's full legal arguments. However, it could further emphasize that the analysis is based on a limited sample of documents from a specific time frame.

**(g) CORPUS STATISTICS**

- The drafts appropriately use the corpus statistics to highlight the volume and timing of the cases. They correctly note the spike in late 2025 and early 2026 and the geographic diversity of the cases. However, they could better clarify that the conclusions are drawn from a sample of documents rather than the entire corpus. The public draft could also mention that the corpus is heavily weighted toward recent publications, which may skew the perception of trends.

--- SOURCE DOCUMENTS (for verification) ---
[Doc 1] Quinonez Orosco v. Lyons
  Date: Dec 9, 2025 · Source: judicial_opinion (courtlistener) · Category: lawEnforcement · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10755611/edin-eleazar-quinonez-orosco-v-todd-lyons-et-al/
  Content: 1
2
3
4                     UNITED STATES DISTRICT COURT
5                          DISTRICT OF NEVADA
6                                 * * *

7   EDIN ELEAZAR QUINONEZ OROSCO,     Case No. 2:25-cv-02240-RFB-EJY

8               Petitioners,                   ORDER

9        v.

10
   TODD LYONS, et al.,
11
               Respondents.
12

13
14     I.  INTRODUCTION
15       This case is one of a rapidly growing number before this Court challenging the federal
16  government’s reading of the Immigration and Nationality Act (INA) to authorize mandatory
17  detention of all noncitizens charged with entering the United States without inspection.1 The
18

[Doc 2] Perez Camacho v. Hollinshead
  Date: Nov 18, 2025 · Source: judicial_opinion (courtlistener) · Category: lawEnforcement · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10739159/antonio-perez-camacho-v-mike-hollinshead-sheriff-elmore-county-kenneth/
  Content:                 UNITED STATES DISTRICT COURT

                 FOR THE DISTRICT OF IDAHO


ANTONIO PEREZ CAMACHO,           Case No. 1:25-cv-00593-BLW

        Petitioner,            MEMORANDUM DECISION AND
                               ORDER
   v.

MIKE HOLLINSHEAD, Sheriff,
Elmore County; KENNETH
PORTER, Director of Boise
Immigration and Customs
Enforcement Field Sub-Office;
JASON KNIGHT, Director of the Salt
Lake City U.S. Immigration and
Customs Enforcement Field Office;
KRISTI NOEM, Secretary of the U.S.
Department of Homeland Security;
and PAM BONDI, Attorney General
of the United States, in their official
capacities,

        Respondents.




[Doc 3] TREGA v. BONDI
  Date: Jan 15, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10775743/samara-pereira-trega-v-pamela-bondi-in-her-official-capacity-as-attorney/
  Content:             UNITED STATES DISTRICT COURT
                  DISTRICT OF MAINE

SAMARA PEREIRA TREGA,         )
                         )
     Petitioner,         )
                         )
v.                       )         No. 2:25-cv-00643-JAW
                         )
PAMELA BONDI, in her official   )
capacity as Attorney General     )
of the United States, et al.,    )
                         )
     Respondents.        )

   ORDER ON PETITION FOR WRIT OF HABEAS CORPUS
A noncitizen from Brazil brings a petition for habeas corpus, claiming her
detention pending removal proceedings violates due process.  The court dismisses her
petition because her courthouse arrest does not violate due process and because it
does not have subject matter jurisdiction over her remaining claims.
I.   BACKGROUND
Samara Pereira Trega is a Brazilian citizen who arrived in the United States
without inspection in No

[Doc 4] Esparza Ibarra v. Bondi
  Date: Nov 18, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10739185/edmundo-esparza-ibarra-v-jason-knight-field-office-director-of/
  Content:                  UNITED STATES DISTRICT COURT

                  FOR THE DISTRICT OF IDAHO


EDMUNDO ESPARZA IBARRA,           Case No.  1:25-cv-00597-BLW

         Petitioner,             MEMORANDUM DECISION AND
                                 ORDER
    v.

JASON KNIGHT, Field Office
Director of Enforcement and Removal
Operations, Salt Lake City Field Office,
Immigration and Customs
Enforcement; KENNETH PORTER,
Acting Director of the Boise U.S.
Immigration and Customs Enforcement
Field Sub-Office; KRISTI NOEM,
Secretary, U.S. Department of
Homeland Security; PAMELA BONDI,
U.S. Attorney General,

         Respondents.


                       INTRODUCTION
    Since the United States began restricting immigration into this countr

[Doc 5] Ortega Casarez v. Hollinshead
  Date: Nov 18, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10739166/apolonio-ortega-casarez-v-jarrod-thompson-sheriff-cassia-county-mike/
  Content:                  UNITED STATES DISTRICT COURT

                  FOR THE DISTRICT OF IDAHO


APOLONIO ORTEGA CASAREZ,         Case No. 1:25-cv-00596-BLW

         Petitioner,            MEMORANDUM DECISION AND
                                ORDER
    v.

JARROD THOMPSON, Sheriff,
Cassia County; MIKE
HOLLINSHEAD, Sheriff, Elmore
County; KENNETH PORTER,
Director of Boise U.S. Immigration
and Customs Enforcement Field Sub-
Office; JASON KNIGHT, Director of
the Salt Lake City U.S. Immigration
and Customs Enforcement Field
Office; KRISTI NOEM, Secretary of
the U.S. Department of Homeland
Security; and PAM BONDI, Attorney
General of the United States, in their
official capacities,


[Doc 6] Villafana Rodriguez v. Noem
  Date: Nov 18, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10739196/adela-villafana-rodriguez-v-jason-knight-field-office-director-of/
  Content:                  UNITED STATES DISTRICT COURT

                  FOR THE DISTRICT OF IDAHO


ADELA VILLAFANA RODRIGUEZ,        Case No.  1:25-cv-00600-BLW

         Petitioner,             MEMORANDUM DECISION AND
                                 ORDER
    v.

JASON KNIGHT, Field Office
Director of Enforcement and Removal
Operations, Salt Lake City Field Office,
Immigration and Customs
Enforcement; KENNETH PORTER,
Acting Director of the Boise U.S.
Immigration and Customs Enforcement
Field Sub-Office; KRISTI NOEM,
Secretary, U.S. Department of
Homeland Security; PAMELA BONDI,
U.S. Attorney General,

         Respondents.


                       INTRODUCTION
    Since the United States began restricting immigration into this countr

[Doc 7] Guillen-Mora v. Lyons
  Date: Jan 8, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10797075/digna-carolina-guillen-mora-v-acting-director-todd-m-lyons-miguel/
  Content:                  UNITED STATES DISTRICT COURT
                   WESTERN DISTRICT OF TEXAS
                     SAN ANTONIO DIVISION

DIGNA CAROLINA GUILLEN-MORA,  §
Petitioner                    §
                              §
v.                            §       Case No.  SA-25-CA-01864-XR
                              §
ACTING DIRECTOR TODD M. LYONS,  §
MIGUEL VERGARA, DIRECTOR      §
DAREN K. MARGOLIN,  WARDEN,   §
DILLEY IMMIGRATION PROCESSING  §
CENTER,                       §
Respondents                   §

      ORDER GRANTING PETITION FOR WRIT OF HABEAS CORPUS
    On this date, the Court considered Digna Carolina Guillen-Mora’s Petition for a Writ of
Habeas Corpus (ECF No. 1) and the Federal Respondents’ Abbreviated Response (ECF No. 4).
After careful consideration, the petition is GRANTED. It is ORDERED that:
    1.   Respondents are DIRECTED to RELEASE Petitioner Digna Carolina Guillen-
Mora (A 243 076 070) from custody, under condition

[Doc 8] (HC) Singh Sekhon v. Warden of the Golden State Annex Detention Facility
  Date: Jan 8, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10785571/sukhjot-singh-sekhon-v-warden-of-the-golden-state-annex-detention/
  Content: 1
2
3
4
5
6
7
8                      UNITED STATES DISTRICT COURT
9                 FOR THE EASTERN DISTRICT OF CALIFORNIA
10
11  SUKHJOT SINGH SEKHON,            Case No.  1:25-cv-1692-JDP
12               Petitioner,
13       v.                          ORDER
14  WARDEN OF THE GOLDEN STATE
   ANNEX DETENTION FACILITY, et al.,
15
                Respondents.
16
17
        Sukhjot Singh Sekhon, an asylum applicant who has lived in the United States f

[Doc 9] Elias v. Bondi
  Date: Nov 18, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10739160/ramon-estrada-elias-v-jason-knight-director-of-the-salt-lake-city-us/
  Content:                 UNITED STATES DISTRICT COURT

                 FOR THE DISTRICT OF IDAHO


RAMON ESTRADA ELIAS,             Case No. 1:25-cv-00594-BLW

        Petitioner,            MEMORANDUM DECISION AND
                               ORDER
   v.

JASON KNIGHT, Director of the Salt
Lake City U.S. Immigration and
Customs Enforcement Field Office;
KENNETH PORTER, Director of
Boise Immigration and Customs
Enforcement Field Sub-Office;
KRISTI NOEM, Secretary of the U.S.
Department of Homeland Security;
and PAMELA BONDI, U.S. Attorney
General; STEVE ANDERSON,
Sheriff of Jefferson County,

        Respondents.


                      INTRODUCTION
   Since the United States began restricting immigration into this country in the

[Doc 10] Estrada Elias v. Bondi
  Date: Nov 18, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10739222/ruben-estrada-elias-v-jason-knight-field-office-director-of-enforcement/
  Content:                  UNITED STATES DISTRICT COURT

                  FOR THE DISTRICT OF IDAHO


RUBEN ESTRADA ELIAS,              Case No.  1:25-cv-00604-BLW

         Petitioner,             MEMORANDUM DECISION AND
                                 ORDER
    v.

JASON KNIGHT, Field Office
Director of Enforcement and Removal
Operations, Salt Lake City Field Office,
Immigration and Customs
Enforcement; KENNETH PORTER,
Acting Director of the Boise U.S.
Immigration and Customs Enforcement
Field Sub-Office; KRISTI NOEM,
Secretary, U.S. Department of
Homeland Security; PAMELA BONDI,
U.S. Attorney General; STEVE
ANDERSON, Sheriff, Jefferson
County,

         Respondents.


[Doc 11] Rodas v. Noem
  Date: Dec 7, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10755456/moises-rodas-v-kristi-noem-et-al/
  Content: 1
2
3                     UNITED STATES DISTRICT COURT
4                          DISTRICT OF NEVADA
5                                 * * *

6   MOISES RODAS,

7                Petitioner,
                                         Case No. 2:25-cv-02216-RFB-BNW
8        v.
                                       ORDER GRANTING PRELIMINARY
9                                               INJUNCTION
   KRISTI NOEM, et al.,
10
               Respondents.
11

12       Pending before the Court is Petitioner Moises Rodas’s amended motion for preliminary
13  injunctive relief (ECF No. 9), challenging the lawfulness of his detention at Henderson Detention
14  Center in the custody of the Federal Respondents. For the following reasons, the Court grants the
15  Motion.
16       On Nove

[Doc 12] Singh v. Stevens
  Date: Feb 17, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10801431/samanpreet-singh-v-fredrick-w-stevens-et-al/
  Content: PEARSON, J.        UNITED STATES DISTRICT COURT
                   NORTHERN DISTRICT OF OHIO
                        EASTERN DIVISION


SAMANPREET SINGH,              )
                               )  CASE NO.  3:26-CV-133
                               Petitioner,  )
                               )
                              v.  )  JUDGE BENITA Y. PEARSON
                               )
FREDRICK W. STEVENS, et al.,   )  MEMORANDUM OF OPINION AND
                               )  ORDER
                               Respondents.  )  [Resolving ECF No. 1 and ECF No. 10]


    Pending before the Court is Samanpreet Singh’s Petition for Writ of Habeas Corpus
pursuant to 28 U.S.C. § 2241.  ECF No. 1.  The matter is fully briefed.  Resp. Response Br., ECF
No. 8; Pet. Traverse Br., ECF No. 9.  Being duly advised, having reviewed the parties’ briefs and
the applicable law, the petition for habeas relief under § 2241 (ECF No. 1) is granted.
Petitioner’s Motion for Temporary Restraining Order (ECF No. 10) is denied as moot.
                       I.   BACKGROUND
    A.  Statutory Framework
    Under the Trafficking Victims Protection Re

[Doc 13] (HC) P.S. v. Chestnut
  Date: Dec 29, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10767980/ericka-ps-v-christopher-chestnut-in-his-official-capacity-as-the-warden/
  Content: 1
2
3
4
5
6
7
8                      UNITED STATES DISTRICT COURT
9                     EASTERN DISTRICT OF CALIFORNIA
10
11   ERICKA P.S.,1

12              Petitioner,          No. 1:25-cv-02049-TLN-CKD

13
14        v.                         ORDER
    CHRISTOPHER CHESTNUT, in his
15
    official capacity as the Warden of the
    California City Detention Center; et al.,
16
              Respondents.
17

[Doc 14] Gutierrez Gutierrez v. Miami Field Office Director., Immigration and Custom Enforcement's Enforcement and Removal Operations
  Date: Jan 13, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  AI Assessment: routine (erosion: routine) · confidence: 0.85
  AI Summary: This is a standard habeas corpus petition where a court reviews the legality of immigration detention, a routine judicial check on executive authority. The document shows the court granting relief to the petitioner, demonstrating that judicial oversight mechanisms are functioning normally. The prese
  URL: https://www.courtlistener.com/opinion/10779719/mario-benito-gutierrez-v-miami-field-office-director-et-al/
  Content:              UNITED STATES DISTRICT COURT
              MIDDLE DISTRICT OF FLORIDA
                  FORT MYERS DIVISION

MARIO BENITO GUTIERREZ
GUTIERREZ,

     Petitioner,

v.                                   Case No.2:25-cv-1223-JES-DNF

MIAMI FIELD OFICE DIRECTOR,
et al.,

     Respondents.
                        /

                   OPINION AND ORDER
Before  the  Court  are  Mario  Benito  Gutierrez  Gutierrez’s
petition  for  writ  of  habeas  corpus  (Doc.  1),  the  government’s
response  (Doc.  7),  and  Gutierrez’s  reply.  (Doc.  8).    For  the
reasons below, the Court grants the petition.
                    I.   Background
Gutierrez is a citizen of Nicaragua who entered the United
States on or around March 30, 2021 without inspection.  (Doc. 1
at 12).  He was taken into custody shortly thereafter but released
on bond in June of 2021.  (Id. at 12).  He r

[Doc 15] Vasquez Chinchilla v. De Anda-Ybarra
  Date: Dec 15, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10760704/orlin-yovani-vasquez-chinchilla-v-mary-de-anda-ybarra-acting-field-office/
  Content:           IN THE UNITED STATES DISTRICT COURT
           FOR THE WESTERN DISTRICT OF TEXAS
                    EL PASO DIVISION

ORLIN YOVANI VASQUEZ            §
CHINCHILLA,                     §
Petitioner,                §
                           §        EP-25-CV-00548-DB
v.                              §
                           §
MARY DE ANDA-YBARRA, Acting Field  §
Office Director of Enforcement and  §
Removal Operations, El Paso Field Office,  §
Immigration and Customs Enforcement, et  §
al.,                            §
Respondents.               §
       AMENDED1 MEMORANDUM OPINION AND ORDER

On  this  day,  the  Court  considered  Petitioner  Orlin  Yovani  Vasquez  Chinchilla’s
(“Petitioner”) “Petition for Writ of Habeas Corpus,” ECF No.2 1, filed on November 14, 2025.
After due consideration, this Court asserts its jurisdiction over Petitioner’s claims and hereby
orders Petitioner’s bond hearing be held in accordance

[Doc 16] Amaya-Velis v. Director of the Detroit Field Office for U.S. Immigration and Customs Enforcement
  Date: Jan 27, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10781149/carlos-rene-amaya-velis-v-kevin-raycraft-director-of-the-detroit-field/
  Content:                UNITED STATES DISTRICT COURT
                 NORTHERN DISTRICT OF OHIO
                      EASTERN DIVISION
CARLOS RENE AMAYA-VELIS,        )   Case No. 4:26-cv-73
                               )
    Petitioner,                )
                               )    Judge J. Philip Calabrese
v.                              )
                               )   Magistrate Judge
KEVIN RAYCRAFT, Director of the  )  Jennifer Dowdell Armstrong
Detroit Field Office, U.S.      )
Immigration and Customs         )
Enforcement, et al.,            )
                               )
    Respondents.               )
                               )
                     OPINION AND ORDER
    On  January  14,  2026,  the  Court  dismissed  without  prejudice  the  habeas
petition of Petitioner Carlos Amaya-Velis.  He timely filed a motion under Rule 59(e)
to alter or amend the judgment.  Under Section 9.M of its Civil

[Doc 17] Ramirez-Contreras v. Noem
  Date: Dec 7, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10755455/filogonio-ramirez-contretras-v-kristi-noem-et-al/
  Content: 1
2
3                     UNITED STATES DISTRICT COURT
4                          DISTRICT OF NEVADA
5                                 * * *

6   FILOGONIO RAMIREZ-CONTRETRAS,

7                Petitioner,
                                         Case No. 2:25-cv-02218-RFB-EJY
8        v.
                                       ORDER GRANTING PRELIMINARY
9                                               INJUNCTION
   KRISTI NOEM, et al.,
10
               Respondents.
11

12       Pending  before  the  Court  is  Petitioner  Filogonio  Ramirez-Contretras’s  motion  for
13  preliminary injunctive relief (ECF No. 6), challenging the lawfulness of his detention at Nevada
14  Southern Detention Center (NSDC) in the custody of the Federal Respondents. For the following
15  reasons, the Court grants the Motion.
16       On Octo

[Doc 18] Drammeh v. Warden, Otay Mesa Detention Center
  Date: Jan 5, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10770162/muhamadou-drammeh-v-kristi-noem-secretary-of-the-department-of-homeland/
  Content: 1
2
3
4
5
6
7
8                     UNITED STATES DISTRICT COURT
9                   SOUTHERN DISTRICT OF CALIFORNIA
10
11  MUHAMADOU DRAMMEH,                   Case No.:  25-CV-3412 JLS (JLB)

12                            Petitioner,
                                        ORDER GRANTING FIRST
13  v.                                   AMENDED PETITION FOR WRIT
                                        OF HABEAS CORPUS
14  KRISTI NOEM, Secretary of the

   Department of Homeland Security, et al.,
15                                       (ECF No. 5)
                          Respondents.
16

[Doc 19] Ebu v. Tindall
  Date: Jan 29, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10782144/joseph-ebu-v-jeff-tindall-oldham-county-jailer-samuel-olson-field/
  Content:                   UNITED STATES DISTRICT COURT
                 WESTERN DISTRICT OF KENTUCKY
                       LOUISVILLE DIVISION

JOSEPH EBU,                                               Petitioner,

v.                                       Civil Action No. 3:25-cv-779-RGJ

JEFF TINDALL, Oldham County Jailer;
SAMUEL OLSON, Field Office Director for U.S.
Immigration and Customs Enforcement;
KRISTI NOEM, in her official capacity as Secretary,
U.S. Department of Homeland Security,                   Respondents.

                           *  *  *  *  *

                MEMORANDUM OPINION AND ORDER

    This matter is before the Court on Petitioner Joseph Ebu’s Amended Writ of Habeas
Corpus. [DE 6]. Respondents responded on December 23, 2025. [DE 9]. Petitioner replied on
December 25, 2025. [DE 10]. The Parties agreed to forgo an evidentiary hearing. [DE 7; DE 8].
This matter is ripe for adjudication. For the reasons below, the Court will GRANT Joseph Ebu’s
Petition for a Writ of Habeas Corpus.
                        I.   Background
    Petitioner Joseph Ebu (“Ebu”) is a lawful permanent resident (“LPR”) of the U

[Doc 20] CONTRERAS MALDONADO v. CABEZAS
  Date: Oct 22, 2025 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10710173/yanddiry-yaneth-contreras-maldonado-v-alexander-cabezas-et-al/
  Content: NOT FOR PUBLICATION

                 UNITED STATES DISTRICT COURT
                    DISTRICT OF NEW JERSEY



YANDDIRY YANETH CONTRERAS
MALDONADO,

               Plaintiff,            Civil Action No. 25-13004

     v.                                   OPINION

ALEXANDER CABEZAS et al.,               October 23, 2025

              Respondents.
SEMPER, District Judge.
    THIS  MATTER  comes  before  the  Court  is  Petitioner  Yanddiry  Yaneth  Contreras
Maldonado’s (“Petitioner”) Amended Petition for a Writ of Habeas Corpus pursuant to 28 U.S.C.
§ 2241, in which she challenges the lawfulness of her immigration detention. (ECF 18, “Amended
Petition” or “Am. Pet.”) The Amended  Petition raises complex statutory and constitutional
questions concerning whether Petitioner’s custody falls under 8 U.S.C. §§ 1225(b)(2) or 1226(a).
(Id.) Respondents filed a response to the Amended Petition on September 2, 2025. (ECF 26,
“Response”.) Petitioner filed a reply on September 10, 2025. (ECF 29, “Reply”.) The Court held
a hearing on October 9, 2025, and reserved ruling on the ultimate merits of the habeas petit

--- CORPUS STATISTICS ---
Total matching documents across full corpus: 167
(The documents below are the most relevant sample.)

Monthly distribution:
  2018-10: 1
  2020-01: 1
  2020-02: 2
  2020-03: 1
  2020-05: 1
  2020-09: 1
  2020-11: 2
  2021-05: 2
  2021-06: 4
  2021-08: 2
  2021-09: 2
  2021-11: 3
  2022-01: 1
  2022-05: 1
  2022-07: 1
  2022-08: 2
  2022-09: 2
  2022-12: 2
  2023-01: 2
  2023-03: 1
  2023-07: 4
  2023-09: 1
  2024-01: 1
  2024-02: 2
  2024-07: 1
  2024-08: 1
  2025-02: 2
  2025-03: 2
  2025-05: 6
  2025-06: 2
  2025-07: 3
  2025-08: 5
  2025-09: 9
  2025-10: 11
  2025-11: 18
  2025-12: 25
  2026-01: 30
  2026-02: 9
  2026-03: 1

Category distribution:
  civilLiberties: 131
  lawEnforcement: 36

--- REVISION INSTRUCTIONS ---
Address each feedback item (a through g):
- Correct any factual errors or unsupported claims.
- Fix incorrect [Doc N] citations.
- Soften overstated language.
- Add missing counter-arguments or alternative explanations.
- Incorporate stated justifications for balance.
- Add coverage gap caveats where needed.
- Ensure corpus-wide statistics are properly distinguished from the retrieved sample.
- Do not fundamentally rewrite — adjust specific claims and phrasing.

--- OUTPUT FORMAT ---
Produce BOTH sections in your response:

=== EXPERT ANSWER ===
(Revised expert answer, 400-800 words.)

=== PUBLIC ANSWER ===
(Revised public answer, 200-500 words.)
```

</details>

### Expert Final

The retrieved documents, spanning October 22, 2025 to February 17, 2026, provide substantial evidence that federal district courts across multiple jurisdictions have been actively scrutinizing immigration detention practices through habeas corpus proceedings, frequently granting relief to detained noncitizens on due process and statutory grounds.

**Volume and Geographic Breadth of Challenges.** The corpus contains 167 matching documents, with a notable increase in late 2025 and early 2026 (25 documents in December 2025 and 30 in January 2026). The 20 retrieved documents represent cases from at least eight federal districts: Nevada [Doc 1, 11, 17], Idaho [Doc 2, 4, 5, 6, 9, 10], Maine [Doc 3], Western Texas [Doc 7, 15], Eastern California [Doc 8, 13], Middle Florida [Doc 14], Southern California [Doc 18], Northern Ohio [Doc 12, 16], Western Kentucky [Doc 19], and New Jersey [Doc 20]. This geographic breadth suggests widespread judicial engagement with these issues, though the spike in cases could reflect increased enforcement activity generating more filings rather than a shift in judicial attitudes per se.

**Grants of Habeas Relief.** Multiple courts explicitly granted habeas petitions or preliminary injunctions ordering release or bond hearings. In _Guillen-Mora v. Lyons_, the Western District of Texas ordered the respondents to release the petitioner from custody [Doc 7]. In _Rodas v. Noem_ and _Ramirez-Contreras v. Noem_, the District of Nevada granted preliminary injunctions challenging detention lawfulness [Doc 11, 17]. In _Gutierrez Gutierrez v. Miami Field Office Director_, the Middle District of Florida granted the habeas petition [Doc 14]. The system's AI previously assessed this document as "routine," noting it demonstrated "judicial oversight mechanisms are functioning normally" [Doc 14] — a characterization worth noting, as it suggests some of these grants may reflect ordinary judicial oversight rather than extraordinary pushback. In _Singh v. Stevens_, the Northern District of Ohio granted habeas relief under 28 U.S.C. § 2241 [Doc 12]. In _Drammeh v. Warden_, the Southern District of California granted a first amended petition for writ of habeas corpus [Doc 18]. In _Ebu v. Tindall_, the Western District of Kentucky granted a habeas petition for a lawful permanent resident [Doc 19]. In _Vasquez Chinchilla v. De Anda-Ybarra_, the court ordered a bond hearing [Doc 15].

**Key Legal Issues.** The cases reveal several recurring legal disputes. The District of Nevada noted "a rapidly growing number" of cases "challenging the federal government's reading of the Immigration and Nationality Act (INA) to authorize mandatory detention of all noncitizens charged with entering the United States without inspection" [Doc 1]. The Idaho cases repeatedly reference the historical arc of U.S. immigration restriction [Doc 4, 6, 9, 10]. The New Jersey court noted "complex statutory and constitutional questions concerning whether Petitioner's custody falls under 8 U.S.C. §§ 1225(b)(2) or 1226(a)" — a critical distinction because the statutory provision determines what procedural protections apply [Doc 20].

**Counter-Evidence and Alternative Explanations.** Not all courts ruled in favor of petitioners. In _Trega v. Bondi_, the District of Maine dismissed the habeas petition, finding that a courthouse arrest did not violate due process and that the court lacked subject matter jurisdiction over remaining claims [Doc 3]. Additionally, the increase in cases may reflect the specific merits of individual detentions rather than a broader change in judicial posture toward enforcement policy. Courts may simply be applying longstanding legal standards to a larger number of detentions.

**Institutional Implications.** The volume of habeas filings — and the frequency of granted petitions across multiple circuits — appears to indicate that courts are serving as a significant check on executive branch immigration enforcement authority. The Nevada court's characterization of "rapidly growing" case numbers [Doc 1] may reflect a pattern where expanded enforcement is generating substantial judicial review. However, the retrieved documents are drawn from a sample of 20 out of 167 matching documents, and the corpus is heavily weighted toward recent publications. Habeas grants also generate written opinions more frequently than denials, so the retrieval may overrepresent successful challenges.

**Limitations.** The retrieved documents provide only partial text of opinions, making it difficult to fully assess the legal reasoning. The corpus spans from 2018 to early 2026, but earlier periods show far fewer matching documents, making direct comparisons of judicial activity over time difficult. This analysis does not cover appellate or Supreme Court rulings, nor does it fully capture the government's legal arguments in defense of its detention practices.

### Public Final

Based on the available documents from October 2025 through February 2026, federal courts across the country appear to be actively scrutinizing the government's immigration detention practices. Courts in at least eight states have been hearing cases from detained immigrants who argue their detention is unlawful.

Many of these courts have sided with the detainees. A federal judge in Texas ordered the government to release a detained Nicaraguan woman [Doc 7]. Courts in Nevada granted emergency orders challenging the lawfulness of detentions [Doc 11, 17]. Federal judges in Florida [Doc 14], Ohio [Doc 12], California [Doc 18], Kentucky [Doc 19], and Texas [Doc 15] all ruled in favor of detained immigrants, ordering their release or requiring the government to hold proper bond hearings.

A judge in Nevada specifically noted that there is "a rapidly growing number" of cases challenging the government's position that it can mandatorily detain all noncitizens charged with entering without inspection [Doc 1]. This suggests courts are seeing a wave of challenges to current enforcement policies.

However, not every court ruled against the government. A federal judge in Maine dismissed one detainee's case, finding no due process violation in a courthouse arrest and ruling the court lacked jurisdiction over other claims [Doc 3]. It is also worth noting that the increase in cases may partly reflect more detentions generating more legal challenges, rather than a fundamental shift in how judges view these issues. In some cases, courts may simply be applying existing legal standards to the specific facts before them.

The full database contains 167 matching documents, with the highest concentration in December 2025 and January 2026. However, this analysis is based on a sample of 20 documents from that larger set, and the corpus is heavily weighted toward recent publications, which may affect the perception of trends. Written court opinions are also more likely to be published when relief is granted, so the sample may overrepresent cases where detainees prevailed.

This answer does not cover appeals court or Supreme Court rulings on these issues, nor does it capture the government's full legal arguments in defense of its detention practices, as these are only partially reflected in the retrieved documents.

---

## 6. Timing

| Phase                             | Time  |
| --------------------------------- | ----- |
| Document retrieval + corpus stats | 0.4s  |
| Pass 1 (Draft)                    | 33.6s |
| Pass 2 (Feedback)                 | 11.7s |
| Pass 3 (Revision)                 | 38.9s |
| Total                             | 84.7s |
