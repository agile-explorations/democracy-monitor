#!/usr/bin/env python3
"""infoAvailability v2 allowlist derivation — validate candidate patterns
against the 187-doc labeled sample (#832). Title-only matching: the sample's
`snippet` is FR header boilerplate, and the runtime filter's abstract can only
ADD recall, so title-only validation is the conservative floor."""
import json, re, sys

SAMPLE = '/Users/michaelkelly/Projects/democracy-monitor/docs/internal/CONTAMINATION_SAMPLE_INFOAVAILABILITY.json'

ALLOW = [
    r'freedom of information|FOIA',
    r'national environmental policy act|\bNEPA\b|environmental (impact )?analysis',
    r'members of the (news )?media|news media',
    r'\bregistry\b',
    r'data system\b',
    r'transparency',
    r'disclosure',
    r'public participation',
    r'reporting requirement',
    r'records release|determination on records',
    r'public dissemination',
    r'withhold(ing)? .{0,40}(information|records)',
    r'public records|access to (public )?(records|information)|records access',
    r'open government',
    r'declassif',
    r'information collection.{0,80}discontinu|discontinu.{0,80}information collection',
    r'privacy act',
]

EXCLUDE = [
    r'advisory committee',
    r'information collection (activities|request)(?!.{0,120}discontinu)',
    r'proposed collection; comment request(?!.{0,120}discontinu)',
    r'self-regulatory organization',
    r'airworthiness directive',
    r'^(?!.*(?:exemption|implementation)).*system of records',
    r'\bmeeting\b',
    r'matching program',
    r'fair credit reporting act',
    r'charitable contribution',
    r'submi(ssion|tted) (for|to) omb(?!.{0,160}discontinu)',
    r'technical correction',
    r'prospective payment system',
    r'price index adjustment',
    r'notice of availability',
    r'intent to prepare',
]

allow = [re.compile(p, re.I | re.S) for p in ALLOW]
exclude = [re.compile(p, re.I | re.S) for p in EXCLUDE]

def decide(title):
    if not any(p.search(title) for p in allow):
        return False, 'no-allow-match'
    if any(p.search(title) for p in exclude):
        return False, 'excluded'
    return True, 'allow-match'

rows = json.load(open(SAMPLE))
stats = {}
false_drops, false_keeps = [], []
for r in rows:
    kept, reason = decide(r['title'])
    truth_on = r['label'] == 'on'
    key = r['stratum']
    s = stats.setdefault(key, {'tp': 0, 'fp': 0, 'tn': 0, 'fn': 0})
    if kept and truth_on: s['tp'] += 1
    elif kept and not truth_on: s['fp'] += 1; false_keeps.append((key, reason, r['title'][:95]))
    elif not kept and truth_on: s['fn'] += 1; false_drops.append((key, reason, r['title'][:95]))
    else: s['tn'] += 1

print(f'{"stratum":<12} {"TP":>3} {"FP":>3} {"TN":>3} {"FN":>3}')
tot = {'tp': 0, 'fp': 0, 'tn': 0, 'fn': 0}
for k, s in sorted(stats.items()):
    print(f'{k:<12} {s["tp"]:>3} {s["fp"]:>3} {s["tn"]:>3} {s["fn"]:>3}')
    for m in tot: tot[m] += s[m]
print(f'{"TOTAL":<12} {tot["tp"]:>3} {tot["fp"]:>3} {tot["tn"]:>3} {tot["fn"]:>3}')
n = sum(tot.values())
print(f'\naccuracy {(tot["tp"]+tot["tn"])/n:.1%}  |  FALSE DROPS (fatal): {tot["fn"]}  |  false keeps: {tot["fp"]}')

if false_drops:
    print('\n=== FALSE DROPS (ON-labeled docs the filter would drop) ===')
    for k, reason, t in false_drops: print(f'  [{k}/{reason}] {t}')
if false_keeps:
    print('\n=== false keeps (OFF-labeled docs the filter would keep) ===')
    for k, reason, t in false_keeps: print(f'  [{k}] {t}')
