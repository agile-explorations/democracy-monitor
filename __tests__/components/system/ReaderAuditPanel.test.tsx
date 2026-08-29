import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { READER_INVITE_HREF, ReaderAuditPanel } from '@/components/system/ReaderAuditPanel';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('ReaderAuditPanel (#816)', () => {
  it('invites readers while the first audit is waiting for them', () => {
    const { container } = render(<ReaderAuditPanel />);
    expect(container.textContent).toContain('waiting for its readers');
    const invite = [...container.querySelectorAll('a')].find(
      (a) => a.getAttribute('href') === READER_INVITE_HREF,
    );
    expect(invite).toBeTruthy();
    expect(READER_INVITE_HREF).toContain('/feedback?type=question&prefill=');
  });
});
