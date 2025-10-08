# Assessment Methodology

## Overview

The Executive Power Drift Dashboard uses an automated, transparent system to assess the health of democratic institutions across 8 categories. This document explains how status levels are determined.

## Key Improvements Over Simple Keyword Matching

### 1. **Legal/Institutional Focus**
Instead of generic terms like "removal" or "termination," we focus on:
- **Explicit legal violations** - "violated impoundment control act", "illegal withholding"
- **Formal findings** - GAO decisions, court rulings, IG reports
- **Statutory references** - Anti-Deficiency Act, Impoundment Control Act, Hatch Act

### 2. **Source Weighting**
Not all documents are equal:
- **High Authority Sources** (weighted more heavily):
  - GAO legal decisions
  - Court orders and rulings
  - Inspector General reports
  - Documents containing "violated", "illegal", "unlawful"

- **Standard Sources**:
  - Federal Register notices
  - General RSS feeds

### 3. **Pattern Detection**
The system looks for temporal/pattern language:
- "unprecedented"
- "systematic"
- "pattern of"
- "multiple"
- "repeated"

When these terms appear with drift-level keywords, they can **escalate** the status to Capture level.

### 4. **Context-Aware Analysis**
Rather than simple word counts, the system:
- Analyzes each item individually
- Looks for combinations of concerning terms
- Detects when authoritative sources make findings
- Distinguishes between allegations and proven violations

## Status Levels Explained

### 🟢 Stable
- Normal government operations
- Checks and balances functioning
- Courts and oversight active
- No concerning patterns detected

### 🟡 Warning
- Isolated incidents or complaints filed
- Investigation opened but not concluded
- Normal political friction
- Elevated activity but within historical norms

Examples:
- Hatch Act complaint filed
- Preliminary court ruling
- Funding delay for administrative reasons

### 🟠 Drift
- **Multiple** concerning indicators
- Structural changes that weaken protections
- Pattern of resistance to oversight
- Major system failures (e.g., Oversight.gov down)

Examples:
- Multiple IG vacancies or "acting" appointments
- Repeated delays in court compliance
- Pattern of impoundment actions
- Weakened civil service protections

### 🔴 Capture
- **Explicit legal violations** found by authoritative sources
- Systematic override of statutory constraints
- Court findings of contempt or defiance
- Mass institutional changes

Examples:
- GAO finds "violated Impoundment Control Act"
- Court holds agency in contempt
- Schedule F implementation
- Multiple IGs fired without cause

## Category-Specific Logic

### Civil Service Neutrality
**Focus**: Legal protections for career civil servants

**Capture Indicators**:
- Schedule F implementation
- Mass terminations of career staff
- Political loyalty requirements
- Violations of merit system protections

**Why**: Protects non-partisan expertise and prevents politicization

### Fiscal Independence
**Focus**: Congressional power of the purse

**Capture Indicators**:
- GAO decisions finding illegal impoundment
- Anti-Deficiency Act violations
- Unconstitutional refusal to spend

**Why**: Prevents executive from overriding Congressional appropriations

### Oversight Integrity
**Focus**: Inspector General independence

**Capture Indicators**:
- Multiple IG removals
- Systematic obstruction
- Defunding of oversight functions
- **Special Rule**: Oversight.gov shutdown = automatic Drift

**Why**: IGs are the "eyes and ears" of Congress on executive branch

### Judicial Compliance
**Focus**: Adherence to court orders

**Capture Indicators**:
- Contempt findings
- Refusal to comply with orders
- Willful violations

**Why**: Rule of law requires executive compliance with judiciary

### Military & Domestic Policing
**Focus**: Posse Comitatus and Insurrection Act

**Capture Indicators**:
- Insurrection Act invoked domestically
- Military law enforcement
- Martial law declared

**Why**: Military must not be used for domestic law enforcement

### Rulemaking Autonomy
**Focus**: Independent agency authority

**Capture Indicators**:
- Executive orders overriding statutory authority
- APA violations
- Independent agencies forced under White House review

**Why**: Independent agencies must be free from political control

## Transparency Features

Every assessment includes:
1. **Exact keywords matched**
2. **Number of data sources analyzed**
3. **Total items reviewed**
4. **Timestamp of assessment**
5. **Reasoning explanation**

Users can click "View Assessment Details" to see the full methodology for any category.

## Limitations & Caveats

### What This System Does Well:
✅ Detects explicit legal violations
✅ Identifies authoritative findings (GAO, courts)
✅ Tracks major system failures
✅ Spots pattern language

### What This System Cannot Do:
❌ Understand complex legal nuance
❌ Detect subtle procedural manipulation
❌ Evaluate political motivations
❌ Predict future events
❌ Compare to historical baselines (yet)

### Known False Positive Risks:
- Normal government reorganizations might trigger warnings
- Routine litigation might be flagged
- High volume of executive orders might seem concerning even if lawful

### Known False Negative Risks:
- Subtle degradation may go undetected
- Actions not documented in Federal Register
- Informal pressure campaigns
- Slow-motion institutional capture

## Future Enhancements

Planned improvements:
1. **Historical comparison** - Compare current activity to past administrations
2. **Cross-category correlation** - Detect when multiple categories deteriorate simultaneously
3. **Temporal trending** - Track changes over time, not just point-in-time
4. **Weighted scoring** - Numerical scores in addition to categorical status
5. **Machine learning** - NLP for better context understanding

## Data Sources

All assessments are based on:
- Federal Register API (official government records)
- GAO RSS feeds (legal decisions)
- Inspector General RSS feeds (oversight reports)
- Supreme Court RSS (court orders)
- Department of Defense RSS (military activities)

## Methodology Transparency

The full assessment algorithm is **open source** and available in:
```
/pages/api/assess-status.ts
```

Anyone can review, critique, or fork the methodology.

---

**Last Updated**: October 2025
**Version**: 1.0
