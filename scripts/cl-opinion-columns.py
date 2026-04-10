#!/usr/bin/env python3
"""Extract lean columns from CourtListener opinions CSV.

Reads the full opinions CSV (with ESCAPE '\\' format) and outputs only the
columns needed for text search and document storage:
  id, cluster_id, type, plain_text, download_url

Usage: bunzip2 --stdout opinions.csv.bz2 | python3 cl-opinion-columns.py | psql ...

Handles multiline quoted fields and backslash escaping correctly.
"""
import csv
import sys

csv.field_size_limit(2**30)

KEEP_COLUMNS = ["id", "cluster_id", "type", "plain_text", "download_url"]

reader = csv.reader(sys.stdin, escapechar="\\")
writer = csv.writer(sys.stdout, escapechar="\\", quoting=csv.QUOTE_ALL)

header = next(reader)
indices = []
for col in KEEP_COLUMNS:
    try:
        indices.append(header.index(col))
    except ValueError:
        print(f"[cl-opinion-columns] ERROR: column '{col}' not found in header", file=sys.stderr)
        sys.exit(1)

writer.writerow(KEEP_COLUMNS)

written = 0
skipped = 0
for row in reader:
    try:
        writer.writerow([row[i] for i in indices])
        written += 1
    except IndexError:
        skipped += 1

    if written % 1_000_000 == 0:
        print(
            f"[cl-opinion-columns] {written / 1_000_000:.0f}M written",
            file=sys.stderr,
        )

print(
    f"[cl-opinion-columns] Done: {written} written, {skipped} skipped",
    file=sys.stderr,
)
