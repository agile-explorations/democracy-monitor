import { describe, it, expect } from 'vitest';
import { extractWhBody } from '@/lib/cron/backfill-content';

describe('extractWhBody', () => {
  it('extracts content from .page-content div', () => {
    const html = `
      <html><body>
        <nav>Navigation</nav>
        <div class="page-content">
          <h1>Presidential Statement</h1>
          <p>The President signed an executive order today regarding national security measures.</p>
        </div>
        <footer>Footer</footer>
      </body></html>
    `;
    const result = extractWhBody(html);
    expect(result).toContain('Presidential Statement');
    expect(result).toContain('executive order');
    expect(result).not.toContain('Navigation');
    expect(result).not.toContain('Footer');
  });

  it('extracts content from .entry-content div', () => {
    const html = `
      <html><body>
        <header>Header</header>
        <div class="entry-content">
          <p>Today the administration announced new infrastructure investments across the country.</p>
        </div>
      </body></html>
    `;
    const result = extractWhBody(html);
    expect(result).toContain('infrastructure investments');
  });

  it('extracts content from article tag', () => {
    const html = `
      <html><body>
        <nav>Nav</nav>
        <article>
          <h2>White House Briefing</h2>
          <p>The press secretary addressed questions about the new policy directive.</p>
        </article>
      </body></html>
    `;
    const result = extractWhBody(html);
    expect(result).toContain('White House Briefing');
    expect(result).toContain('policy directive');
  });

  it('extracts content from main tag as fallback', () => {
    const html = `
      <html><body>
        <nav>Nav</nav>
        <main>
          <p>The Vice President met with foreign dignitaries to discuss trade agreements and cooperation.</p>
        </main>
      </body></html>
    `;
    const result = extractWhBody(html);
    expect(result).toContain('trade agreements');
  });

  it('falls back to full HTML stripping when no selector matches', () => {
    const html = `
      <html><body>
        <div class="content-wrapper">
          <p>Some paragraph content that is long enough to be meaningful for extraction.</p>
        </div>
      </body></html>
    `;
    const result = extractWhBody(html);
    expect(result).toContain('paragraph content');
  });

  it('extracts content from .page-content with nested divs (Trump archive)', () => {
    const html = `
      <html><body>
        <nav>Navigation</nav>
        <div class="page-content">
          <div class="page-content__wrap">
            <div class="page-content__content editor">
              <aside class="editor__module"><div class="share">Share</div></aside>
              <h2>Statement from the President</h2>
              <p>The President today announced new actions to protect American workers and strengthen the economy.</p>
              <p>These measures will take effect immediately and apply to all federal agencies.</p>
            </div>
          </div>
        </div>
        <footer>Footer</footer>
      </body></html>
    `;
    const result = extractWhBody(html);
    expect(result).toContain('protect American workers');
    expect(result).toContain('federal agencies');
    expect(result).not.toContain('Navigation');
    expect(result).not.toContain('Footer');
  });

  it('returns null for very short extracted text', () => {
    const html = '<html><body><p>Hi</p></body></html>';
    const result = extractWhBody(html);
    expect(result).toBeNull();
  });

  it('truncates content exceeding MAX_CONTENT_LENGTH', () => {
    const longContent = 'A'.repeat(10_000);
    const html = `<article>${longContent}</article>`;
    const result = extractWhBody(html);
    expect(result).not.toBeNull();
    // Should be truncated (8000 chars + ellipsis)
    expect(result!.length).toBeLessThanOrEqual(8_001);
    expect(result!.endsWith('\u2026')).toBe(true);
  });

  it('strips HTML tags from extracted content', () => {
    const html = `
      <article>
        <h1>Title</h1>
        <p>This is <strong>bold</strong> and <em>italic</em> content for testing purposes with enough text.</p>
      </article>
    `;
    const result = extractWhBody(html);
    expect(result).not.toContain('<strong>');
    expect(result).not.toContain('<em>');
    expect(result).toContain('bold');
    expect(result).toContain('italic');
  });

  it('handles null bytes in content', () => {
    const html = `<article><p>Content with \0 null bytes that needs to be cleaned up for database storage.</p></article>`;
    const result = extractWhBody(html);
    expect(result).not.toContain('\0');
  });
});
