import Link from 'next/link';
import { SEOHead } from '@/components/shared/SEOHead';
import { DATA_DICTIONARY } from '@/lib/data/data-dictionary';
import type { DictionaryArtifact } from '@/lib/data/data-dictionary';

/**
 * Data dictionary (#591): field-level documentation for the CSV exports and
 * the key dump tables. Rendered entirely from lib/data/data-dictionary.ts;
 * sync with the flatteners and schema is enforced by a guard test, so this
 * page cannot describe columns that do not exist.
 */

function ArtifactSection({ artifact }: { artifact: DictionaryArtifact }) {
  return (
    <section id={artifact.key} className="scroll-mt-4">
      <h2 className="text-lg font-semibold text-dm-text-primary mb-1">{artifact.title}</h2>
      <p className="text-sm text-dm-text-secondary mb-3">{artifact.description}</p>
      <div className="overflow-x-auto rounded-lg border border-dm-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-dm-card text-left">
              <th className="px-3 py-2 font-semibold text-dm-text-primary whitespace-nowrap">
                Field
              </th>
              <th className="px-3 py-2 font-semibold text-dm-text-primary whitespace-nowrap">
                Type
              </th>
              <th className="px-3 py-2 font-semibold text-dm-text-primary">Description</th>
            </tr>
          </thead>
          <tbody>
            {artifact.entries.map((e) => (
              <tr
                key={e.name}
                id={`${artifact.key}-${e.name}`}
                className="border-t border-dm-border align-top scroll-mt-4"
              >
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-dm-text-primary">
                  {e.name}
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap text-dm-muted">{e.type}</td>
                <td className="px-3 py-2 text-xs leading-relaxed text-dm-text-secondary">
                  {e.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function DataDictionaryPage() {
  return (
    <>
      <SEOHead
        title="Data Dictionary"
        description="Field-level documentation for Democracy Monitor's CSV exports and database dump — every column's meaning, derivation, and caveats."
        canonicalPath="/data/dictionary"
      />

      <Link href="/data" className="text-xs text-dm-accent hover:underline">
        &larr; Back to Data
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-2">Data Dictionary</h1>
      <p className="text-sm text-dm-text-secondary mb-2 max-w-3xl">
        Every field in the downloadable datasets: what it means, how it is derived, and what to
        watch out for. A machine-readable version is at{' '}
        <a href="/api/export/dictionary" className="text-dm-accent hover:underline">
          /api/export/dictionary
        </a>
        . This page is generated from the same registry the pipeline is tested against — a guard
        test fails the build if it drifts from the actual schema.
      </p>
      <nav className="text-xs text-dm-muted mb-6 flex flex-wrap gap-x-3 gap-y-1">
        {DATA_DICTIONARY.map((a) => (
          <a key={a.key} href={`#${a.key}`} className="text-dm-accent hover:underline">
            {a.title}
          </a>
        ))}
      </nav>

      <div className="max-w-5xl space-y-8">
        {DATA_DICTIONARY.map((a) => (
          <ArtifactSection key={a.key} artifact={a} />
        ))}
      </div>
    </>
  );
}
