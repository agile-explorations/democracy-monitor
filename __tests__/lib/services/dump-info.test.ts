import { describe, expect, it } from 'vitest';
import { dumpInfoFromHeaders, formatDumpDate, formatDumpSize } from '@/lib/services/dump-info';

describe('dumpInfoFromHeaders (#641)', () => {
  it('parses Last-Modified and Content-Length from a B2/S3 HEAD', () => {
    const headers = new Headers({
      'last-modified': 'Fri, 01 Aug 2026 16:13:59 GMT',
      'content-length': '6605389149',
    });
    expect(dumpInfoFromHeaders(headers)).toEqual({
      lastModified: '2026-08-01T16:13:59.000Z',
      sizeBytes: 6605389149,
    });
  });

  it('returns nulls when the headers are absent', () => {
    expect(dumpInfoFromHeaders(new Headers())).toEqual({
      lastModified: null,
      sizeBytes: null,
    });
  });

  it('rejects a non-numeric Content-Length rather than emitting NaN', () => {
    const headers = new Headers({ 'content-length': 'chunked' });
    expect(dumpInfoFromHeaders(headers).sizeBytes).toBeNull();
  });

  it('rejects an unparseable Last-Modified rather than emitting Invalid Date', () => {
    const headers = new Headers({ 'last-modified': 'not a date' });
    expect(dumpInfoFromHeaders(headers).lastModified).toBeNull();
  });
});

describe('formatDumpSize (#641)', () => {
  it('renders multi-GB artifacts to one decimal', () => {
    expect(formatDumpSize(6_605_389_149)).toBe('6.6 GB');
  });

  it('renders sub-GB artifacts in whole MB', () => {
    expect(formatDumpSize(850_000_000)).toBe('850 MB');
  });
});

describe('formatDumpDate (#641)', () => {
  it('renders a UTC calendar date, stable regardless of the runner timezone', () => {
    expect(formatDumpDate('2026-08-01T16:13:59.000Z')).toBe('August 1, 2026');
  });
});
