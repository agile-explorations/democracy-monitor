import Link from 'next/link';

export function MethodologyFooter() {
  return (
    <footer className="mt-12 pt-8 border-t border-dm-border">
      <div className="text-xs text-dm-text-secondary leading-relaxed max-w-2xl">
        <p>
          Democracy Monitor uses transparent, auditable keyword analysis of government documents
          published in the Federal Register, White House briefings, and GDELT news coverage. Every
          assessment traces to specific documents and specific keywords.
        </p>
        <div className="flex items-center gap-4 mt-4">
          <Link href="/methodology" className="text-dm-accent hover:underline">
            Full methodology
          </Link>
          <a
            href="https://github.com/agile-explorations/democracy-monitor"
            className="text-dm-accent hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Source code (GitHub)
          </a>
        </div>
      </div>
    </footer>
  );
}
