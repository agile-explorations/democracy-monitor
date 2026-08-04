import { describe, expect, it } from 'vitest';
import {
  buildFeedbackNotificationHtml,
  buildSubmitterResponseHtml,
} from '@/lib/services/feedback-notify';

describe('buildFeedbackNotificationHtml', () => {
  const base = { id: 5, type: 'question', category: null as string | null, message: 'Is X true?' };

  it('includes the id, type, and the approve/reject CLI commands', () => {
    const html = buildFeedbackNotificationHtml(base);
    expect(html).toContain('#5');
    expect(html).toContain('question');
    expect(html).toContain('pnpm feedback:moderate --approve 5');
    expect(html).toContain('pnpm feedback:moderate --reject 5');
  });

  it('escapes HTML in the user message (no injection into the email)', () => {
    const html = buildFeedbackNotificationHtml({
      ...base,
      message: '<script>alert(1)</script> & <b>bold</b>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('truncates a long message', () => {
    const html = buildFeedbackNotificationHtml({ ...base, message: 'y'.repeat(600) });
    expect(html).toContain('…');
  });
});

describe('buildSubmitterResponseHtml', () => {
  it('includes both the original message and the reply', () => {
    const html = buildSubmitterResponseHtml('the original question', 'the answer');
    expect(html).toContain('the original question');
    expect(html).toContain('the answer');
  });

  it('escapes HTML in both the original and the reply', () => {
    const html = buildSubmitterResponseHtml('<i>orig</i>', '<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<i>orig</i>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;i&gt;orig&lt;/i&gt;');
  });
});
