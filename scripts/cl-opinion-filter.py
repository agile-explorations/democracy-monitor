#!/usr/bin/env python3
"""Filter CourtListener opinions CSV by cluster_id.

Usage: bunzip2 --stdout opinions.csv.bz2 | python3 cl-opinion-filter.py cluster_ids.txt | psql ...

Handles multiline quoted fields (opinion text with embedded newlines) correctly
via Python's csv module, which readline-based parsers cannot do.
"""
import csv
import sys

if len(sys.argv) < 2:
    print("Usage: python3 cl-opinion-filter.py <cluster_ids_file>", file=sys.stderr)
    sys.exit(1)

with open(sys.argv[1]) as f:
    cluster_ids = set(line.strip() for line in f if line.strip())

print(f"[cl-opinion-filter] Loaded {len(cluster_ids)} cluster IDs", file=sys.stderr)

# Increase CSV field size limit for large opinion text
csv.field_size_limit(sys.maxsize)

reader = csv.reader(sys.stdin)
writer = csv.writer(sys.stdout)

header = next(reader)
writer.writerow(header)
idx = header.index("cluster_id")

count = 0
scanned = 0
for row in reader:
    scanned += 1
    if scanned % 1_000_000 == 0:
        print(
            f"[cl-opinion-filter] {scanned / 1_000_000:.0f}M scanned, {count} matched",
            file=sys.stderr,
        )
    if row[idx] in cluster_ids:
        writer.writerow(row)
        count += 1

print(f"[cl-opinion-filter] Done: {scanned} scanned, {count} matched", file=sys.stderr)
