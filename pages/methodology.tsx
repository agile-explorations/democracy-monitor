import Head from 'next/head';
import Link from 'next/link';

export default function Methodology() {
  return (
    <>
      <Head>
        <title>Methodology — Executive Power Drift Dashboard</title>
        <meta name="description" content="How the Executive Power Drift Dashboard assesses institutional health." />
      </Head>
      <main className="min-h-screen bg-slate-50 py-6 px-4 md:px-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-900">Methodology</h1>
            <Link href="/" className="text-sm text-blue-600 hover:underline">Back to Dashboard</Link>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6 text-sm text-slate-700">
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Overview</h2>
              <p>The Executive Power Drift Dashboard monitors 9 categories of institutional health using a multi-layered assessment approach that combines keyword analysis, source authority weighting, AI-powered analysis, and cross-referencing between administration intent and institutional status.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Assessment Layers</h2>
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-slate-800">Layer 1: Keyword Analysis</h3>
                  <p>Each category has curated keyword dictionaries organized by severity: Capture (most serious), Drift (concerning), and Warning (minor). Documents are searched for these keywords and matched items are counted and deduplicated.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Layer 2: Source Authority Weighting</h3>
                  <p>Not all sources carry equal weight. Findings from GAO decisions, court orders, and Inspector General reports are treated as authoritative. Keyword matches from these high-authority sources can trigger elevated assessments.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Layer 3: AI-Enhanced Analysis</h3>
                  <p>When AI providers are configured (OpenAI and/or Anthropic), the dashboard can perform enhanced analysis including data coverage scoring, evidence balance (concerning vs. reassuring), and counter-evidence generation.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Layer 4: Multi-Agent Debate</h3>
                  <p>For Drift and Capture assessments, the system can run a structured debate between AI providers. A prosecutor argues the concerning interpretation, a defense counsel provides alternative explanations, and an arbitrator renders a verdict. This helps ensure balanced assessment.</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Status Levels</h2>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <span className="inline-block w-3 h-3 mt-1 rounded-full bg-green-500"></span>
                  <div><strong>Stable:</strong> No warning signs detected. Institutions functioning normally based on available evidence.</div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="inline-block w-3 h-3 mt-1 rounded-full bg-yellow-500"></span>
                  <div><strong>Warning:</strong> Minor concerns detected. May be routine government activity or early indicators worth monitoring.</div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="inline-block w-3 h-3 mt-1 rounded-full bg-orange-500"></span>
                  <div><strong>Drift:</strong> Multiple concerning patterns. Institutional norms may be eroding in this area.</div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="inline-block w-3 h-3 mt-1 rounded-full bg-red-500"></span>
                  <div><strong>Capture:</strong> Serious violations confirmed, especially by authoritative sources (GAO, courts, IGs).</div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Administration Intent (Section 1)</h2>
              <p>The dashboard tracks administration rhetoric and actions using a governance framework that classifies behavior along a spectrum from Liberal Democracy to Personalist Rule. It uses dual-track scoring of rhetoric vs. actions and flags when these diverge.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Cross-Reference System</h2>
              <p>The dashboard cross-references administration intent with institutional health to produce contextual interpretations. For example, &ldquo;competitive authoritarian&rdquo; intent combined with institutional &ldquo;drift&rdquo; produces a different interpretation than &ldquo;liberal democracy&rdquo; intent with the same drift.</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Limitations</h2>
              <ul className="list-disc list-inside space-y-1">
                <li>Keyword analysis can produce false positives from routine government language</li>
                <li>Source availability depends on government websites remaining accessible</li>
                <li>AI analysis quality depends on the models used and their training data</li>
                <li>The dashboard monitors publicly available information only</li>
                <li>Assessments are automated indicators, not definitive judgments</li>
              </ul>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
