# Research Synthesis Example

> Generated: 2026-03-10T06:18:02.327Z

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
- **Date range**: Nov 18, 2025 to Feb 17, 2026
- **Average cosine similarity**: 0.543
- **Retrieval time**: 1947ms

### Document List

| #   | Title                                                                            | Date         | Source        | Category       | Similarity |
| --- | -------------------------------------------------------------------------------- | ------------ | ------------- | -------------- | ---------- |
| 1   | Quinonez Orosco v. Lyons                                                         | Dec 9, 2025  | courtlistener | lawEnforcement | 0.599      |
| 2   | TREGA v. BONDI                                                                   | Jan 15, 2026 | courtlistener | civilLiberties | 0.551      |
| 3   | Perez Camacho v. Hollinshead                                                     | Nov 18, 2025 | courtlistener | lawEnforcement | 0.568      |
| 4   | Esparza Ibarra v. Bondi                                                          | Nov 18, 2025 | courtlistener | civilLiberties | 0.559      |
| 5   | Ortega Casarez v. Hollinshead                                                    | Nov 18, 2025 | courtlistener | civilLiberties | 0.559      |
| 6   | Guillen-Mora v. Lyons                                                            | Jan 8, 2026  | courtlistener | civilLiberties | 0.544      |
| 7   | (HC) Singh Sekhon v. Warden of the Golden State Annex Detention Facility         | Jan 8, 2026  | courtlistener | civilLiberties | 0.543      |
| 8   | Villafana Rodriguez v. Noem                                                      | Nov 18, 2025 | courtlistener | civilLiberties | 0.557      |
| 9   | Elias v. Bondi                                                                   | Nov 18, 2025 | courtlistener | civilLiberties | 0.552      |
| 10  | Estrada Elias v. Bondi                                                           | Nov 18, 2025 | courtlistener | civilLiberties | 0.551      |
| 11  | Rodas v. Noem                                                                    | Dec 7, 2025  | courtlistener | civilLiberties | 0.544      |
| 12  | Singh v. Stevens                                                                 | Feb 17, 2026 | courtlistener | civilLiberties | 0.522      |
| 13  | (HC) P.S. v. Chestnut                                                            | Dec 29, 2025 | courtlistener | civilLiberties | 0.532      |
| 14  | Gutierrez Gutierrez v. Miami Field Office Director., Immigration and Custom Enfo | Jan 13, 2026 | courtlistener | civilLiberties | 0.528      |
| 15  | Amaya-Velis v. Director of the Detroit Field Office for U.S. Immigration and Cus | Jan 27, 2026 | courtlistener | civilLiberties | 0.522      |
| 16  | Vasquez Chinchilla v. De Anda-Ybarra                                             | Dec 15, 2025 | courtlistener | civilLiberties | 0.534      |
| 17  | Ramirez-Contreras v. Noem                                                        | Dec 7, 2025  | courtlistener | civilLiberties | 0.533      |
| 18  | Ebu v. Tindall                                                                   | Jan 29, 2026 | courtlistener | civilLiberties | 0.516      |
| 19  | Drammeh v. Warden, Otay Mesa Detention Center                                    | Jan 5, 2026  | courtlistener | civilLiberties | 0.522      |
| 20  | (HC) P.C. v. Wofford                                                             | Jan 5, 2026  | courtlistener | civilLiberties | 0.521      |

### Vector Search Query

Embedded the question via OpenAI text-embedding-3-small, then ran pgvector cosine similarity
search against 165K+ document embeddings. Top 100 candidates deduplicated by URL,
re-ranked with 70% similarity + 30% recency boost (4-year linear decay), top 20 returned.
Excludes GDELT and WhiteHouse sources.

---

## 3. Pass 1: Draft

> Model: claude-opus-4-6
> Time: 35305ms

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

--- USER QUESTION ---
Have the courts been pushing back on immigration due process violations?

--- DOCUMENT COVERAGE ---
Date range: Nov 18, 2025 to Feb 17, 2026
Documents retrieved: 20

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

[Doc 2] TREGA v. BONDI
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

[Doc 3] Perez Camacho v. Hollinshead
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


[Doc 6] Guillen-Mora v. Lyons
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

[Doc 7] (HC) Singh Sekhon v. Warden of the Golden State Annex Detention Facility
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

[Doc 8] Villafana Rodriguez v. Noem
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

[Doc 15] Amaya-Velis v. Director of the Detroit Field Office for U.S. Immigration and Customs Enforcement
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

[Doc 16] Vasquez Chinchilla v. De Anda-Ybarra
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

[Doc 18] Ebu v. Tindall
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

[Doc 19] Drammeh v. Warden, Otay Mesa Detention Center
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

[Doc 20] (HC) P.C. v. Wofford
  Date: Jan 5, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10770220/eapc-v-minga-wofford-et-al/
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
11   E.A.P.C.,                       Case No.  1:25-cv-01546-JLT-CDB (HC)
12                Petitioner,        FINDINGS AND RECOMMENDATIONS TO
                                    GRANT IN PART PETITIONER’S PETITION
13        v.                         FOR WRIT OF HABEAS CORPUS

14   MINGA WOFFORD, et al.,          (Doc. 1)

15                Respondents.       14-DAY OBJECTION PERIOD
16
17       Petitioner E.A.P.C.1 (“Petitioner”), a federal detainee proceeding by counsel, initiated this
18  action by filing a petition for writ of habeas corpus pursuant to 28 U.S.C. § 2241.  For the reasons
19  set forth herein, t

--- OUTPUT FORMAT ---
Produce ALL THREE sections in your response:

=== EXPERT ANSWER ===
(400-800 words. Technical analysis for researchers. Reference specific documents by
title and [Doc N] citation. Include date qualifications. Note limitations of the
documentary record. Present counter-arguments.)

=== PUBLIC ANSWER ===
(200-500 words. Plain language for journalists and citizens. No jargon. Every factual
claim still cites [Doc N]. Include a sentence about what the answer does NOT cover.
Present alternative explanations.)

=== RELATED QUESTIONS ===
(Exactly 3 follow-up questions the user might want to explore based on this topic.)
```

</details>

### Draft System Prompt

> You are a research analyst answering questions about U.S. government actions. Your answers are grounded exclusively in the provided government documents.

### Expert Draft

The documentary record from November 18, 2025 through February 17, 2026 reveals a substantial and geographically widespread pattern of federal district courts granting habeas corpus petitions and preliminary injunctions challenging the detention of noncitizens, indicating significant judicial pushback on immigration detention practices during this period.

**Volume and Geographic Scope:** The documents show cases filed across at least eight federal districts—Idaho, Nevada, California (Eastern and Southern Districts), Texas (Western District, both El Paso and San Antonio Divisions), Ohio (Northern District), Kentucky (Western District), Maine, and Florida (Middle District). Multiple courts in Idaho alone handled clusters of simultaneous cases [Doc 3, 4, 5, 8, 9, 10]. The District of Nevada described these as "a rapidly growing number" of challenges before the court [Doc 1]. This geographic breadth suggests a systemic rather than localized issue.

**Favorable Outcomes for Petitioners:** The majority of documented cases resulted in outcomes favorable to detained noncitizens. Courts granted habeas petitions or preliminary injunctions in numerous instances:

- In _Rodas v. Noem_ and _Ramirez-Contreras v. Noem_, the District of Nevada granted preliminary injunctions challenging detention lawfulness [Doc 11, 17].
- In _Guillen-Mora v. Lyons_, the Western District of Texas ordered the petitioner's release from custody [Doc 6].
- In _Drammeh v. Warden_, the Southern District of California granted an amended habeas petition [Doc 19].
- In _Gutierrez Gutierrez v. Miami Field Office Director_, the Middle District of Florida granted the habeas petition [Doc 14].
- In _Ebu v. Tindall_, the Western District of Kentucky granted the habeas petition for a lawful permanent resident [Doc 18].
- In _Singh v. Stevens_, the Northern District of Ohio granted the habeas petition [Doc 12].
- In _Singh Sekhon v. Warden_, the Eastern District of California issued an order concerning an asylum applicant [Doc 7].
- In _Vasquez Chinchilla v. De Anda-Ybarra_, the Western District of Texas ordered a bond hearing [Doc 16].
- The Eastern District of California recommended granting in part a habeas petition in _P.C. v. Wofford_ [Doc 20].

**Core Legal Issues:** The cases center on the government's interpretation of the Immigration and Nationality Act (INA) as authorizing mandatory detention of noncitizens charged with entering without inspection [Doc 1]. Petitioners challenged both the statutory basis for detention and its constitutional implications under the Due Process Clause. In _Trega v. Bondi_, however, the court dismissed the petition, finding that a courthouse arrest did not violate due process and that it lacked subject matter jurisdiction over remaining claims [Doc 2]. This represents a notable counterexample to the broader trend.

**The Government's Position:** The named respondents consistently include senior officials—DHS Secretary Kristi Noem, Attorney General Pamela Bondi, ICE Acting Director Todd Lyons, and various field office directors [Doc 3, 4, 5, 6, 8, 9, 10, 11, 17, 18, 19]. The government filed responses in these cases (e.g., "Abbreviated Response" in _Guillen-Mora_ [Doc 6]), defending the detention authority under the INA, though the documents do not contain the full text of these government briefs.

**Limitations:** These documents represent district court opinions only and do not capture appellate-level developments. The truncated nature of many documents means the full legal reasoning is not always visible. Additionally, this sample may not be representative of all immigration habeas litigation during this period—cases where courts denied petitions may be underrepresented in the retrieval. The _Trega_ dismissal [Doc 2] and the _Amaya-Velis_ procedural history (initial dismissal followed by a Rule 59(e) motion) [Doc 15] indicate that not every challenge succeeded.

### Public Draft

Yes, based on the available documents from November 2025 through February 2026, federal courts across the country have been actively pushing back on immigration detention practices, frequently ruling in favor of detained noncitizens.

Courts in at least eight states—including Nevada, Texas, California, Ohio, Kentucky, Florida, Idaho, and Maine—heard challenges from detained individuals who argued their imprisonment violated their legal rights. In most of these documented cases, judges sided with the detainees.

For example, a Texas court ordered the release of a detained woman from an immigration processing center [Doc 6]. Courts in Nevada granted emergency orders halting the detention of individuals held at detention centers [Doc 11, 17]. A Florida court granted a habeas petition for a Nicaraguan citizen [Doc 14]. An Ohio court freed a petitioner challenging detention under trafficking victim protections [Doc 12]. A Kentucky court granted relief to a lawful permanent resident [Doc 18]. A California court granted a habeas petition for a detainee held in San Diego [Doc 19].

A Nevada judge described these cases as "a rapidly growing number" before the court, suggesting the issue is widespread and escalating [Doc 1]. The cases typically challenge the federal government's reading of immigration law to justify mandatory detention of people who entered the country without inspection [Doc 1].

However, not every court ruled against the government. In Maine, a judge dismissed a Brazilian woman's habeas petition, finding her courthouse arrest did not violate due process [Doc 2]. This shows that while the trend leans toward judicial pushback, outcomes vary.

The detained individuals named senior government officials as respondents, including DHS Secretary Kristi Noem and Attorney General Pamela Bondi [Doc 3, 4, 5, 6, 11, 17, 18, 19].

**What this answer does not cover:** These documents are all from trial-level federal courts and do not reveal how appeals courts or the Supreme Court have responded. The documents also do not include the full text of the government's legal arguments defending these detentions.

### Related Questions (from Draft)

1. Have any federal appeals courts upheld or overturned these district court rulings granting habeas relief to immigration detainees?
2. What specific statutory provisions of the Immigration and Nationality Act is the government relying on to justify mandatory detention without bond hearings?
3. Has the volume of immigration habeas corpus petitions increased compared to prior years, and how are courts managing the caseload?

---

## 4. Pass 2: Feedback

> Model: gpt-4o-2024-08-06
> Time: 7953ms

### Feedback Prompt

<details>
<summary>Click to expand feedback prompt</summary>

```
You are an editorial reviewer for a government document search system.
Review the following AI-generated answers against the source documents.

--- USER QUESTION ---
Have the courts been pushing back on immigration due process violations?

--- EXPERT DRAFT ---
The documentary record from November 18, 2025 through February 17, 2026 reveals a substantial and geographically widespread pattern of federal district courts granting habeas corpus petitions and preliminary injunctions challenging the detention of noncitizens, indicating significant judicial pushback on immigration detention practices during this period.

**Volume and Geographic Scope:** The documents show cases filed across at least eight federal districts—Idaho, Nevada, California (Eastern and Southern Districts), Texas (Western District, both El Paso and San Antonio Divisions), Ohio (Northern District), Kentucky (Western District), Maine, and Florida (Middle District). Multiple courts in Idaho alone handled clusters of simultaneous cases [Doc 3, 4, 5, 8, 9, 10]. The District of Nevada described these as "a rapidly growing number" of challenges before the court [Doc 1]. This geographic breadth suggests a systemic rather than localized issue.

**Favorable Outcomes for Petitioners:** The majority of documented cases resulted in outcomes favorable to detained noncitizens. Courts granted habeas petitions or preliminary injunctions in numerous instances:

- In *Rodas v. Noem* and *Ramirez-Contreras v. Noem*, the District of Nevada granted preliminary injunctions challenging detention lawfulness [Doc 11, 17].
- In *Guillen-Mora v. Lyons*, the Western District of Texas ordered the petitioner's release from custody [Doc 6].
- In *Drammeh v. Warden*, the Southern District of California granted an amended habeas petition [Doc 19].
- In *Gutierrez Gutierrez v. Miami Field Office Director*, the Middle District of Florida granted the habeas petition [Doc 14].
- In *Ebu v. Tindall*, the Western District of Kentucky granted the habeas petition for a lawful permanent resident [Doc 18].
- In *Singh v. Stevens*, the Northern District of Ohio granted the habeas petition [Doc 12].
- In *Singh Sekhon v. Warden*, the Eastern District of California issued an order concerning an asylum applicant [Doc 7].
- In *Vasquez Chinchilla v. De Anda-Ybarra*, the Western District of Texas ordered a bond hearing [Doc 16].
- The Eastern District of California recommended granting in part a habeas petition in *P.C. v. Wofford* [Doc 20].

**Core Legal Issues:** The cases center on the government's interpretation of the Immigration and Nationality Act (INA) as authorizing mandatory detention of noncitizens charged with entering without inspection [Doc 1]. Petitioners challenged both the statutory basis for detention and its constitutional implications under the Due Process Clause. In *Trega v. Bondi*, however, the court dismissed the petition, finding that a courthouse arrest did not violate due process and that it lacked subject matter jurisdiction over remaining claims [Doc 2]. This represents a notable counterexample to the broader trend.

**The Government's Position:** The named respondents consistently include senior officials—DHS Secretary Kristi Noem, Attorney General Pamela Bondi, ICE Acting Director Todd Lyons, and various field office directors [Doc 3, 4, 5, 6, 8, 9, 10, 11, 17, 18, 19]. The government filed responses in these cases (e.g., "Abbreviated Response" in *Guillen-Mora* [Doc 6]), defending the detention authority under the INA, though the documents do not contain the full text of these government briefs.

**Limitations:** These documents represent district court opinions only and do not capture appellate-level developments. The truncated nature of many documents means the full legal reasoning is not always visible. Additionally, this sample may not be representative of all immigration habeas litigation during this period—cases where courts denied petitions may be underrepresented in the retrieval. The *Trega* dismissal [Doc 2] and the *Amaya-Velis* procedural history (initial dismissal followed by a Rule 59(e) motion) [Doc 15] indicate that not every challenge succeeded.

--- PUBLIC DRAFT ---
Yes, based on the available documents from November 2025 through February 2026, federal courts across the country have been actively pushing back on immigration detention practices, frequently ruling in favor of detained noncitizens.

Courts in at least eight states—including Nevada, Texas, California, Ohio, Kentucky, Florida, Idaho, and Maine—heard challenges from detained individuals who argued their imprisonment violated their legal rights. In most of these documented cases, judges sided with the detainees.

For example, a Texas court ordered the release of a detained woman from an immigration processing center [Doc 6]. Courts in Nevada granted emergency orders halting the detention of individuals held at detention centers [Doc 11, 17]. A Florida court granted a habeas petition for a Nicaraguan citizen [Doc 14]. An Ohio court freed a petitioner challenging detention under trafficking victim protections [Doc 12]. A Kentucky court granted relief to a lawful permanent resident [Doc 18]. A California court granted a habeas petition for a detainee held in San Diego [Doc 19].

A Nevada judge described these cases as "a rapidly growing number" before the court, suggesting the issue is widespread and escalating [Doc 1]. The cases typically challenge the federal government's reading of immigration law to justify mandatory detention of people who entered the country without inspection [Doc 1].

However, not every court ruled against the government. In Maine, a judge dismissed a Brazilian woman's habeas petition, finding her courthouse arrest did not violate due process [Doc 2]. This shows that while the trend leans toward judicial pushback, outcomes vary.

The detained individuals named senior government officials as respondents, including DHS Secretary Kristi Noem and Attorney General Pamela Bondi [Doc 3, 4, 5, 6, 11, 17, 18, 19].

**What this answer does not cover:** These documents are all from trial-level federal courts and do not reveal how appeals courts or the Supreme Court have responded. The documents also do not include the full text of the government's legal arguments defending these detentions.

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

[Doc 2] TREGA v. BONDI
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

[Doc 3] Perez Camacho v. Hollinshead
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


[Doc 6] Guillen-Mora v. Lyons
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

[Doc 7] (HC) Singh Sekhon v. Warden of the Golden State Annex Detention Facility
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

[Doc 8] Villafana Rodriguez v. Noem
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

[Doc 15] Amaya-Velis v. Director of the Detroit Field Office for U.S. Immigration and Customs Enforcement
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

[Doc 16] Vasquez Chinchilla v. De Anda-Ybarra
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

[Doc 18] Ebu v. Tindall
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

[Doc 19] Drammeh v. Warden, Otay Mesa Detention Center
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

[Doc 20] (HC) P.C. v. Wofford
  Date: Jan 5, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10770220/eapc-v-minga-wofford-et-al/
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
11   E.A.P.C.,                       Case No.  1:25-cv-01546-JLT-CDB (HC)
12                Petitioner,        FINDINGS AND RECOMMENDATIONS TO
                                    GRANT IN PART PETITIONER’S PETITION
13        v.                         FOR WRIT OF HABEAS CORPUS

14   MINGA WOFFORD, et al.,          (Doc. 1)

15                Respondents.       14-DAY OBJECTION PERIOD
16
17       Petitioner E.A.P.C.1 (“Petitioner”), a federal detainee proceeding by counsel, initiated this
18  action by filing a petition for writ of habeas corpus pursuant to 28 U.S.C. § 2241.  For the reasons
19  set forth herein, t

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
```

</details>

### Feedback System Prompt

> You are an independent editorial reviewer. Your role is epistemic auditing — checking factual accuracy, citation correctness, confidence calibration, and balance.

### Editorial Feedback

(a) FACTUAL ACCURACY — The expert draft accurately represents the content of the source documents. It correctly identifies the pattern of federal district courts granting habeas corpus petitions and preliminary injunctions in favor of detained noncitizens. The public draft also aligns with the source documents, summarizing the judicial pushback on immigration detention practices.

(b) CITATION ACCURACY — The citations in both drafts are used correctly. Each referenced document supports the claims made about court decisions and the geographic scope of the cases. For example, [Doc 6] supports the claim about the Texas court ordering the release of a detained woman, and [Doc 11, 17] support the Nevada court's actions.

(c) CONFIDENCE CALIBRATION — The expert draft maintains an appropriate level of certainty, using phrases like "indicating significant judicial pushback" and "suggests a systemic rather than localized issue." The public draft also appropriately uses phrases like "frequently ruling in favor" and "suggesting the issue is widespread."

(d) MISSING COUNTER-ARGUMENTS — The drafts could consider alternative explanations for the judicial pushback, such as changes in legal interpretations or increased advocacy efforts by legal aid organizations. Additionally, the drafts could explore whether these cases are part of a broader trend or a temporary response to specific circumstances.

(e) BALANCE — Both drafts note the government's position, mentioning the named respondents and their defense of detention authority under the INA. The expert draft includes a counterexample with the dismissal in _Trega v. Bondi_ [Doc 2], which adds balance by showing not all challenges succeeded.

(f) COVERAGE GAPS — The expert draft acknowledges limitations, such as the focus on district court opinions and the potential underrepresentation of cases where courts denied petitions. The public draft also notes that the documents do not reveal appellate-level responses or the full text of government arguments. Both drafts could further emphasize the potential for selection bias in the document sample.

---

## 5. Pass 3: Final Revision

> Model: claude-opus-4-6
> Time: 40033ms

### Revision Prompt

<details>
<summary>Click to expand revision prompt</summary>

```
You are revising AI-generated answers to a government document search query
based on structured editorial feedback.

--- USER QUESTION ---
Have the courts been pushing back on immigration due process violations?

--- ORIGINAL EXPERT DRAFT ---
The documentary record from November 18, 2025 through February 17, 2026 reveals a substantial and geographically widespread pattern of federal district courts granting habeas corpus petitions and preliminary injunctions challenging the detention of noncitizens, indicating significant judicial pushback on immigration detention practices during this period.

**Volume and Geographic Scope:** The documents show cases filed across at least eight federal districts—Idaho, Nevada, California (Eastern and Southern Districts), Texas (Western District, both El Paso and San Antonio Divisions), Ohio (Northern District), Kentucky (Western District), Maine, and Florida (Middle District). Multiple courts in Idaho alone handled clusters of simultaneous cases [Doc 3, 4, 5, 8, 9, 10]. The District of Nevada described these as "a rapidly growing number" of challenges before the court [Doc 1]. This geographic breadth suggests a systemic rather than localized issue.

**Favorable Outcomes for Petitioners:** The majority of documented cases resulted in outcomes favorable to detained noncitizens. Courts granted habeas petitions or preliminary injunctions in numerous instances:

- In *Rodas v. Noem* and *Ramirez-Contreras v. Noem*, the District of Nevada granted preliminary injunctions challenging detention lawfulness [Doc 11, 17].
- In *Guillen-Mora v. Lyons*, the Western District of Texas ordered the petitioner's release from custody [Doc 6].
- In *Drammeh v. Warden*, the Southern District of California granted an amended habeas petition [Doc 19].
- In *Gutierrez Gutierrez v. Miami Field Office Director*, the Middle District of Florida granted the habeas petition [Doc 14].
- In *Ebu v. Tindall*, the Western District of Kentucky granted the habeas petition for a lawful permanent resident [Doc 18].
- In *Singh v. Stevens*, the Northern District of Ohio granted the habeas petition [Doc 12].
- In *Singh Sekhon v. Warden*, the Eastern District of California issued an order concerning an asylum applicant [Doc 7].
- In *Vasquez Chinchilla v. De Anda-Ybarra*, the Western District of Texas ordered a bond hearing [Doc 16].
- The Eastern District of California recommended granting in part a habeas petition in *P.C. v. Wofford* [Doc 20].

**Core Legal Issues:** The cases center on the government's interpretation of the Immigration and Nationality Act (INA) as authorizing mandatory detention of noncitizens charged with entering without inspection [Doc 1]. Petitioners challenged both the statutory basis for detention and its constitutional implications under the Due Process Clause. In *Trega v. Bondi*, however, the court dismissed the petition, finding that a courthouse arrest did not violate due process and that it lacked subject matter jurisdiction over remaining claims [Doc 2]. This represents a notable counterexample to the broader trend.

**The Government's Position:** The named respondents consistently include senior officials—DHS Secretary Kristi Noem, Attorney General Pamela Bondi, ICE Acting Director Todd Lyons, and various field office directors [Doc 3, 4, 5, 6, 8, 9, 10, 11, 17, 18, 19]. The government filed responses in these cases (e.g., "Abbreviated Response" in *Guillen-Mora* [Doc 6]), defending the detention authority under the INA, though the documents do not contain the full text of these government briefs.

**Limitations:** These documents represent district court opinions only and do not capture appellate-level developments. The truncated nature of many documents means the full legal reasoning is not always visible. Additionally, this sample may not be representative of all immigration habeas litigation during this period—cases where courts denied petitions may be underrepresented in the retrieval. The *Trega* dismissal [Doc 2] and the *Amaya-Velis* procedural history (initial dismissal followed by a Rule 59(e) motion) [Doc 15] indicate that not every challenge succeeded.

--- ORIGINAL PUBLIC DRAFT ---
Yes, based on the available documents from November 2025 through February 2026, federal courts across the country have been actively pushing back on immigration detention practices, frequently ruling in favor of detained noncitizens.

Courts in at least eight states—including Nevada, Texas, California, Ohio, Kentucky, Florida, Idaho, and Maine—heard challenges from detained individuals who argued their imprisonment violated their legal rights. In most of these documented cases, judges sided with the detainees.

For example, a Texas court ordered the release of a detained woman from an immigration processing center [Doc 6]. Courts in Nevada granted emergency orders halting the detention of individuals held at detention centers [Doc 11, 17]. A Florida court granted a habeas petition for a Nicaraguan citizen [Doc 14]. An Ohio court freed a petitioner challenging detention under trafficking victim protections [Doc 12]. A Kentucky court granted relief to a lawful permanent resident [Doc 18]. A California court granted a habeas petition for a detainee held in San Diego [Doc 19].

A Nevada judge described these cases as "a rapidly growing number" before the court, suggesting the issue is widespread and escalating [Doc 1]. The cases typically challenge the federal government's reading of immigration law to justify mandatory detention of people who entered the country without inspection [Doc 1].

However, not every court ruled against the government. In Maine, a judge dismissed a Brazilian woman's habeas petition, finding her courthouse arrest did not violate due process [Doc 2]. This shows that while the trend leans toward judicial pushback, outcomes vary.

The detained individuals named senior government officials as respondents, including DHS Secretary Kristi Noem and Attorney General Pamela Bondi [Doc 3, 4, 5, 6, 11, 17, 18, 19].

**What this answer does not cover:** These documents are all from trial-level federal courts and do not reveal how appeals courts or the Supreme Court have responded. The documents also do not include the full text of the government's legal arguments defending these detentions.

--- EDITORIAL FEEDBACK ---
(a) FACTUAL ACCURACY — The expert draft accurately represents the content of the source documents. It correctly identifies the pattern of federal district courts granting habeas corpus petitions and preliminary injunctions in favor of detained noncitizens. The public draft also aligns with the source documents, summarizing the judicial pushback on immigration detention practices.

(b) CITATION ACCURACY — The citations in both drafts are used correctly. Each referenced document supports the claims made about court decisions and the geographic scope of the cases. For example, [Doc 6] supports the claim about the Texas court ordering the release of a detained woman, and [Doc 11, 17] support the Nevada court's actions.

(c) CONFIDENCE CALIBRATION — The expert draft maintains an appropriate level of certainty, using phrases like "indicating significant judicial pushback" and "suggests a systemic rather than localized issue." The public draft also appropriately uses phrases like "frequently ruling in favor" and "suggesting the issue is widespread."

(d) MISSING COUNTER-ARGUMENTS — The drafts could consider alternative explanations for the judicial pushback, such as changes in legal interpretations or increased advocacy efforts by legal aid organizations. Additionally, the drafts could explore whether these cases are part of a broader trend or a temporary response to specific circumstances.

(e) BALANCE — Both drafts note the government's position, mentioning the named respondents and their defense of detention authority under the INA. The expert draft includes a counterexample with the dismissal in *Trega v. Bondi* [Doc 2], which adds balance by showing not all challenges succeeded.

(f) COVERAGE GAPS — The expert draft acknowledges limitations, such as the focus on district court opinions and the potential underrepresentation of cases where courts denied petitions. The public draft also notes that the documents do not reveal appellate-level responses or the full text of government arguments. Both drafts could further emphasize the potential for selection bias in the document sample.

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

[Doc 2] TREGA v. BONDI
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

[Doc 3] Perez Camacho v. Hollinshead
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


[Doc 6] Guillen-Mora v. Lyons
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

[Doc 7] (HC) Singh Sekhon v. Warden of the Golden State Annex Detention Facility
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

[Doc 8] Villafana Rodriguez v. Noem
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

[Doc 15] Amaya-Velis v. Director of the Detroit Field Office for U.S. Immigration and Customs Enforcement
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

[Doc 16] Vasquez Chinchilla v. De Anda-Ybarra
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

[Doc 18] Ebu v. Tindall
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

[Doc 19] Drammeh v. Warden, Otay Mesa Detention Center
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

[Doc 20] (HC) P.C. v. Wofford
  Date: Jan 5, 2026 · Source: judicial_opinion (courtlistener) · Category: civilLiberties · Score: 0.0
  URL: https://www.courtlistener.com/opinion/10770220/eapc-v-minga-wofford-et-al/
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
11   E.A.P.C.,                       Case No.  1:25-cv-01546-JLT-CDB (HC)
12                Petitioner,        FINDINGS AND RECOMMENDATIONS TO
                                    GRANT IN PART PETITIONER’S PETITION
13        v.                         FOR WRIT OF HABEAS CORPUS

14   MINGA WOFFORD, et al.,          (Doc. 1)

15                Respondents.       14-DAY OBJECTION PERIOD
16
17       Petitioner E.A.P.C.1 (“Petitioner”), a federal detainee proceeding by counsel, initiated this
18  action by filing a petition for writ of habeas corpus pursuant to 28 U.S.C. § 2241.  For the reasons
19  set forth herein, t

--- REVISION INSTRUCTIONS ---
Address each feedback item (a through f):
- Correct any factual errors or unsupported claims.
- Fix incorrect [Doc N] citations.
- Soften overstated language.
- Add missing counter-arguments or alternative explanations.
- Incorporate stated justifications for balance.
- Add coverage gap caveats where needed.
- Do not fundamentally rewrite — adjust specific claims and phrasing.

--- OUTPUT FORMAT ---
Produce BOTH sections in your response:

=== EXPERT ANSWER ===
(Revised expert answer, 400-800 words.)

=== PUBLIC ANSWER ===
(Revised public answer, 200-500 words.)
```

</details>

### Revision System Prompt

> You are a research analyst revising answers based on editorial feedback. Address each feedback item while maintaining the grounded, citation-based approach.

### Expert Final

The documentary record from November 18, 2025 through February 17, 2026 reveals a substantial and geographically widespread pattern of federal district courts granting habeas corpus petitions and preliminary injunctions challenging the detention of noncitizens, indicating significant judicial pushback on immigration detention practices during this period.

**Volume and Geographic Scope:** The documents show cases filed across at least eight federal districts—Idaho, Nevada, California (Eastern and Southern Districts), Texas (Western District, both El Paso and San Antonio Divisions), Ohio (Northern District), Kentucky (Western District), Maine, and Florida (Middle District). Multiple courts in Idaho alone handled clusters of simultaneous cases [Doc 3, 4, 5, 8, 9, 10]. The District of Nevada described these as "a rapidly growing number" of challenges before the court [Doc 1]. This geographic breadth suggests a systemic rather than localized issue, though it is worth noting that other factors—such as coordinated legal advocacy efforts by immigration attorneys or legal aid organizations, shifts in government enforcement priorities, or changes in legal interpretations—may also help explain the clustering of these cases across multiple jurisdictions.

**Favorable Outcomes for Petitioners:** The majority of documented cases resulted in outcomes favorable to detained noncitizens. Courts granted habeas petitions or preliminary injunctions in numerous instances:

- In _Rodas v. Noem_ and _Ramirez-Contreras v. Noem_, the District of Nevada granted preliminary injunctions challenging detention lawfulness [Doc 11, 17].
- In _Guillen-Mora v. Lyons_, the Western District of Texas ordered the petitioner's release from custody [Doc 6].
- In _Drammeh v. Warden_, the Southern District of California granted an amended habeas petition [Doc 19].
- In _Gutierrez Gutierrez v. Miami Field Office Director_, the Middle District of Florida granted the habeas petition for a Nicaraguan citizen [Doc 14].
- In _Ebu v. Tindall_, the Western District of Kentucky granted the habeas petition for a lawful permanent resident [Doc 18].
- In _Singh v. Stevens_, the Northern District of Ohio granted the habeas petition [Doc 12].
- In _Singh Sekhon v. Warden_, the Eastern District of California issued an order concerning an asylum applicant [Doc 7].
- In _Vasquez Chinchilla v. De Anda-Ybarra_, the Western District of Texas ordered a bond hearing [Doc 16].
- The Eastern District of California recommended granting in part a habeas petition in _P.C. v. Wofford_ [Doc 20].

**Core Legal Issues:** The cases center on the government's interpretation of the Immigration and Nationality Act (INA) as authorizing mandatory detention of all noncitizens charged with entering the United States without inspection [Doc 1]. Petitioners challenged both the statutory basis for detention and its constitutional implications under the Due Process Clause. In _Trega v. Bondi_, however, the court dismissed the petition, finding that a courthouse arrest did not violate due process and that it lacked subject matter jurisdiction over remaining claims [Doc 2]. This represents a notable counterexample to the broader trend.

**The Government's Position:** The named respondents consistently include senior officials—DHS Secretary Kristi Noem, Attorney General Pamela Bondi, ICE Acting Director Todd Lyons, and various field office directors [Doc 3, 4, 5, 6, 8, 9, 10, 11, 17, 18, 19]. The government filed responses in these cases (e.g., "Abbreviated Response" in _Guillen-Mora_ [Doc 6]), defending the detention authority under the INA, though the documents do not contain the full text of these government briefs, making it impossible to fully assess the strength of the government's legal arguments from this record alone.

**Limitations and Caveats:** These documents represent district court opinions only and do not capture appellate-level developments, which could significantly alter or reverse these outcomes. The sample may not be representative of all immigration habeas litigation during this period—cases where courts denied petitions or where petitioners did not file challenges may be underrepresented in this document retrieval, introducing potential selection bias. The _Trega_ dismissal [Doc 2] and the _Amaya-Velis_ procedural history (initial dismissal followed by a Rule 59(e) motion) [Doc 15] confirm that not every challenge succeeded. Additionally, it remains unclear from these documents alone whether this wave of litigation reflects a temporary response to specific enforcement actions or a more durable shift in judicial oversight of immigration detention. The role of increased legal representation or coordinated litigation strategies in producing these outcomes also cannot be assessed from this record.

### Public Final

Yes, based on the available documents from November 2025 through February 2026, federal courts across the country have been actively pushing back on immigration detention practices, frequently ruling in favor of detained noncitizens.

Courts in at least eight states—including Nevada, Texas, California, Ohio, Kentucky, Florida, Idaho, and Maine—heard challenges from detained individuals who argued their imprisonment violated their legal rights. In most of these documented cases, judges sided with the detainees.

For example, a Texas court ordered the release of a detained woman from an immigration processing center [Doc 6]. Courts in Nevada granted emergency orders halting the detention of individuals held at detention centers [Doc 11, 17]. A Florida court granted a habeas petition for a Nicaraguan citizen [Doc 14]. An Ohio court freed a petitioner challenging detention under trafficking victim protections [Doc 12]. A Kentucky court granted relief to a lawful permanent resident [Doc 18]. A California court granted a habeas petition for a detainee held in San Diego [Doc 19].

A Nevada judge described these cases as "a rapidly growing number" before the court, suggesting the issue is widespread [Doc 1]. The cases typically challenge the federal government's reading of immigration law to justify mandatory detention of people who entered the country without inspection [Doc 1].

However, not every court ruled against the government. In Maine, a judge dismissed a Brazilian woman's habeas petition, finding her courthouse arrest did not violate due process [Doc 2]. In Ohio, another case was initially dismissed before the petitioner filed a motion to reconsider [Doc 15]. These examples show that while the trend in this sample leans toward judicial pushback, outcomes vary.

The detained individuals named senior government officials as respondents, including DHS Secretary Kristi Noem and Attorney General Pamela Bondi [Doc 3, 4, 5, 6, 11, 17, 18, 19].

**Important context this answer does not cover:** These documents are all from trial-level federal courts and do not reveal how appeals courts or the Supreme Court have responded—appellate rulings could significantly change the picture. The documents also do not include the full text of the government's legal arguments defending these detentions. Additionally, this sample of cases may not be fully representative: cases where courts sided with the government may be underrepresented in this collection. It is also unclear whether this pattern reflects a temporary judicial response to specific enforcement actions or a longer-term trend, and whether coordinated legal advocacy played a role in the volume and success of these challenges.

---

## 6. Timing

| Phase              | Time  |
| ------------------ | ----- |
| Document retrieval | 1.9s  |
| Pass 1 (Draft)     | 35.3s |
| Pass 2 (Feedback)  | 8.0s  |
| Pass 3 (Revision)  | 40.0s |
| Total              | 85.3s |
