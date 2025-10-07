#!/usr/bin/env python3
"""Aggregate failing UI tests and emit a concise markdown + JSON summary.

Intended to run inside CI after test artifacts are produced.

It will look for any results.csv under tests/output/** and combine them.
Outputs:
  stdout: markdown summary
  artifacts:
    tests/output/failures.json  (structured data)
    tests/output/failures.md    (markdown report)
Exit code:
  0 if no failures
  1 if at least one fail

Usage:
  python scripts/parse-test-failures.py
"""
from __future__ import annotations
import csv
import json
import os
from dataclasses import dataclass, asdict
from glob import glob
from typing import List, Dict

RESULT_GLOB = "tests/output/**/results.csv"
OUT_DIR = "tests/output"
FAIL_JSON = os.path.join(OUT_DIR, "failures.json")
FAIL_MD = os.path.join(OUT_DIR, "failures.md")
STATS_JSON = os.path.join(OUT_DIR, "summary-stats.json")

@dataclass
class Failure:
    id: str
    feature: str
    title: str
    details: str
    screenshot: str | None

def find_results() -> List[str]:
    return [p for p in glob(RESULT_GLOB, recursive=True) if os.path.isfile(p)]

def parse_results(paths: List[str]):
    failures: Dict[str, List[Failure]] = {}
    # stats per feature: { feature: {pass: int, fail: int, skipped: int, blocked: int, total: int} }
    stats: Dict[str, Dict[str, int]] = {}
    for p in paths:
        with open(p, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                feature = row.get('feature') or 'Unknown'
                status = (row.get('status') or '').strip().lower()
                if feature not in stats:
                    stats[feature] = {k: 0 for k in ('pass','fail','skipped','blocked','total')}
                if status not in ('pass','fail','skipped','blocked'):
                    # treat unknown as blocked for visibility
                    status = 'blocked'
                stats[feature][status] += 1
                stats[feature]['total'] += 1
                if status == 'fail':
                    failures.setdefault(feature, []).append(
                        Failure(
                            id=row.get('id') or 'UNKNOWN',
                            feature=feature,
                            title=row.get('title') or '',
                            details=row.get('details') or '',
                            screenshot=row.get('screenshot') or None,
                        )
                    )
    return failures, stats

def write_outputs(failures: Dict[str, List[Failure]], stats: Dict[str, Dict[str, int]]):
    os.makedirs(OUT_DIR, exist_ok=True)
    flat = [asdict(f) for fl in failures.values() for f in fl]
    with open(FAIL_JSON, 'w', encoding='utf-8') as jf:
        json.dump({"total_failures": len(flat), "by_feature": {k: [asdict(f) for f in v] for k, v in failures.items()}}, jf, indent=2)

    # Overall stats summary JSON
    overall = {k: sum(stats[f][k] for f in stats) for k in ('pass','fail','skipped','blocked','total')}
    with open(STATS_JSON, 'w', encoding='utf-8') as sf:
        json.dump({"overall": overall, "features": stats}, sf, indent=2)

    # Markdown
    lines: List[str] = []
    lines.append(f"# UI Test Failure Report\n")
    total = len(flat)
    # Stats table
    if stats:
        lines.append("\n## Summary by Feature\n")
        lines.append("Feature | Pass | Fail | Skipped | Blocked | Total | Pass%")
        lines.append("------- | ---- | ---- | ------- | ------- | ----- | -----")
        for feature, s in sorted(stats.items()):
            total_feat = s['total'] or 1
            pass_pct = f"{(s['pass'] / total_feat)*100:.1f}%"
            lines.append(f"{feature} | {s['pass']} | {s['fail']} | {s['skipped']} | {s['blocked']} | {s['total']} | {pass_pct}")

    if total == 0:
        lines.append("\nAll tests passed.\n")
    else:
        lines.append(f"\nTotal failures: **{total}**\n")
        for feature, flist in failures.items():
            lines.append(f"\n### {feature} Failures ({len(flist)})\n")
            for f in flist:
                shot = f.screenshot or ''
                shot_note = f" Screenshot: {shot}" if shot else ''
                details = (f.details or '').replace('\n', ' ')
                if len(details) > 160:
                    details = details[:157] + '...'
                lines.append(f"- **{f.id}** {f.title} – {details}{shot_note}")
    with open(FAIL_MD, 'w', encoding='utf-8') as mf:
        mf.write('\n'.join(lines) + '\n')
    # Echo markdown to stdout
    print('\n'.join(lines))


def main():
    paths = find_results()
    failures, stats = parse_results(paths)
    write_outputs(failures, stats)
    total = sum(len(v) for v in failures.values())
    # Non-zero exit if there are failures (allows workflow conditional steps)
    if total > 0:
        exit(1)

if __name__ == '__main__':
    main()
