import { describe, expect, it } from 'vitest';
import {
  backupObjectKey,
  downloadPublicUrl,
  parseB2Region,
  readB2Config,
  readB2DownloadConfig,
} from '@/lib/services/b2-backup';

describe('parseB2Region', () => {
  it.each([
    ['https://s3.us-west-004.backblazeb2.com', 'us-west-004'],
    ['https://s3.us-east-005.backblazeb2.com', 'us-east-005'],
    ['https://s3.eu-central-003.backblazeb2.com', 'eu-central-003'],
  ])('extracts the region from %s', (endpoint, region) => {
    expect(parseB2Region(endpoint)).toBe(region);
  });

  it('rejects a non-B2 endpoint host', () => {
    expect(() => parseB2Region('https://example.com')).toThrow(/Unrecognized B2 endpoint/);
  });
});

describe('backupObjectKey', () => {
  it('builds a dated key with the default basename', () => {
    expect(backupObjectKey(new Date('2026-07-30T05:00:00Z'))).toBe(
      'db-backups/database-2026-07-30.pgdump',
    );
  });

  it('honors a custom basename (the PII companion dump)', () => {
    expect(backupObjectKey(new Date('2026-07-30T05:00:00Z'), 'pii-tables')).toBe(
      'db-backups/pii-tables-2026-07-30.pgdump',
    );
  });

  it('honors a custom prefix', () => {
    expect(backupObjectKey(new Date('2026-01-05T00:00:00Z'), 'database', 'weekly')).toBe(
      'weekly/database-2026-01-05.pgdump',
    );
  });
});

describe('readB2Config', () => {
  const full = {
    B2_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com',
    B2_BUCKET: 'dm-backups',
    B2_KEY_ID: 'kid',
    B2_APP_KEY: 'secret',
  };

  it('returns a config with derived region when all vars are present', () => {
    expect(readB2Config(full)).toEqual({
      endpoint: full.B2_ENDPOINT,
      region: 'us-west-004',
      bucket: 'dm-backups',
      keyId: 'kid',
      appKey: 'secret',
    });
  });

  it.each(['B2_ENDPOINT', 'B2_BUCKET', 'B2_KEY_ID', 'B2_APP_KEY'])(
    'returns null (optional, not an error) when %s is missing',
    (missing) => {
      const env = { ...full, [missing]: undefined };
      expect(readB2Config(env)).toBeNull();
    },
  );
});

describe('readB2DownloadConfig (#636)', () => {
  const full = {
    B2_ENDPOINT: 'https://s3.us-east-005.backblazeb2.com',
    B2_DOWNLOAD_BUCKET: 'dm-public-downloads',
    B2_DOWNLOAD_KEY_ID: 'dkid',
    B2_DOWNLOAD_APP_KEY: 'dsecret',
  };

  it('reads the download bucket vars + shared endpoint/region', () => {
    expect(readB2DownloadConfig(full)).toEqual({
      endpoint: full.B2_ENDPOINT,
      region: 'us-east-005',
      bucket: 'dm-public-downloads',
      keyId: 'dkid',
      appKey: 'dsecret',
    });
  });

  it.each(['B2_ENDPOINT', 'B2_DOWNLOAD_BUCKET', 'B2_DOWNLOAD_KEY_ID', 'B2_DOWNLOAD_APP_KEY'])(
    'returns null (falls back to local file) when %s is missing',
    (missing) => {
      expect(readB2DownloadConfig({ ...full, [missing]: undefined })).toBeNull();
    },
  );
});

describe('downloadPublicUrl', () => {
  it('builds the public S3-style URL', () => {
    const config = {
      endpoint: 'https://s3.us-east-005.backblazeb2.com',
      region: 'us-east-005',
      bucket: 'dm-public-downloads',
      keyId: 'k',
      appKey: 's',
    };
    expect(downloadPublicUrl(config, 'database.pgdump')).toBe(
      'https://dm-public-downloads.s3.us-east-005.backblazeb2.com/database.pgdump',
    );
  });
});
