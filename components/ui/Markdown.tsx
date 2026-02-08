interface MarkdownProps {
  content: string;
  className?: string;
}

function markdownToHtml(md: string): string {
  let html = md;

  // Sanitize script tags as safety net
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<script/gi, '&lt;script');

  // Escape remaining HTML (except what we generate below)
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Headings (## and ###)
  html = html.replace(/^### (.+)$/gm, '<h5 class="font-semibold text-slate-800 mt-2 mb-1">$1</h5>');
  html = html.replace(/^## (.+)$/gm, '<h4 class="font-semibold text-slate-900 mt-2 mb-1">$1</h4>');

  // Bold (**text**)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic (*text*) — single asterisk, not double
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  // Unordered list items (- item or * item at start of line)
  // Collect consecutive list items into <ul> blocks
  html = html.replace(/(^[\t ]*[-*] .+(?:\n[\t ]*[-*] .+)*)/gm, (block) => {
    const items = block
      .split('\n')
      .map((line) => line.replace(/^[\t ]*[-*] /, '').trim())
      .filter(Boolean)
      .map((item) => `<li>${item}</li>`)
      .join('');
    return `<ul class="list-disc list-inside space-y-0.5 my-1">${items}</ul>`;
  });

  // Paragraph breaks (double newline)
  html = html.replace(/\n\n+/g, '</p><p class="mt-1.5">');

  // Single newlines → <br>
  html = html.replace(/\n/g, '<br />');

  // Wrap in paragraph
  html = `<p class="mt-0">${html}</p>`;

  // Clean up empty paragraphs
  html = html.replace(/<p class="[^"]*"><\/p>/g, '');

  return html;
}

export function Markdown({ content, className = '' }: MarkdownProps) {
  const html = markdownToHtml(content);
  return (
    <div
      className={`text-xs text-slate-700 ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
