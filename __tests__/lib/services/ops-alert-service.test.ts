import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEmail } from '@/lib/services/email-service';
import { buildOpsAlertHtml, sendOpsAlert } from '@/lib/services/ops-alert-service';

vi.mock('@/lib/services/email-service', () => ({
  sendEmail: vi.fn(),
}));

const mockSendEmail = vi.mocked(sendEmail);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPS_ALERT_EMAIL = 'owner@example.com';
});

afterEach(() => {
  delete process.env.OPS_ALERT_EMAIL;
});

describe('buildOpsAlertHtml', () => {
  it('renders every detail in its own block', () => {
    const html = buildOpsAlertHtml('Snapshot errors', ['first error', 'second error']);
    expect(html).toContain('Snapshot errors');
    expect(html).toContain('first error');
    expect(html).toContain('second error');
  });

  it('escapes HTML in error details', () => {
    const html = buildOpsAlertHtml('t', ['fetch failed: <html> & "quoted"']);
    expect(html).toContain('&lt;html&gt; &amp; &quot;quoted&quot;');
    expect(html).not.toContain('<html>');
  });
});

describe('sendOpsAlert', () => {
  it('reports success when the transport accepts the alert', async () => {
    mockSendEmail.mockResolvedValue(true);
    await expect(sendOpsAlert('subject', ['detail line'])).resolves.toBe(true);
  });

  it('reports failure without sending when OPS_ALERT_EMAIL is unset', async () => {
    delete process.env.OPS_ALERT_EMAIL;
    await expect(sendOpsAlert('subject', ['detail'])).resolves.toBe(false);
  });

  it('never throws when the email service fails', async () => {
    mockSendEmail.mockRejectedValue(new Error('resend down'));
    await expect(sendOpsAlert('subject', ['detail'])).resolves.toBe(false);
  });
});
