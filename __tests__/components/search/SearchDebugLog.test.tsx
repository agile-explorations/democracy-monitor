import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SearchDebugCapture } from '@/components/search/SearchDebugLog';
import { SearchDebugLog } from '@/components/search/SearchDebugLog';

const capture: SearchDebugCapture = {
  question: 'test question',
  requestedAt: '2026-08-14T00:00:00Z',
  docsPayload: { documents: [] },
  synthesisPrompt: 'PROMPT',
  answer: { expert: 'e', public: 'p' },
  quoteVerification: null,
  relatedQuestions: [],
};

describe('SearchDebugLog', () => {
  it('renders nothing without a capture', () => {
    const { container } = render(<SearchDebugLog capture={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the banner and downloads the capture as JSON', async () => {
    let downloaded: Blob | null = null;
    Object.assign(URL, {
      createObjectURL: (b: Blob) => {
        downloaded = b;
        return 'blob:test';
      },
      revokeObjectURL: () => {},
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<SearchDebugLog capture={capture} />);
    expect(screen.getByText(/Debug capture active/)).toBeTruthy();
    fireEvent.click(screen.getByText('Download search log'));

    expect(downloaded).not.toBeNull();
    expect(downloaded!.type).toBe('application/json');
    const body = JSON.parse(await new Response(downloaded!).text());
    expect(body.question).toBe('test question');
    expect(body.synthesisPrompt).toBe('PROMPT');
    click.mockRestore();
  });
});
