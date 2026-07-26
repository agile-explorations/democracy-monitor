import { useState } from 'react';
import { Chevron } from '@/components/ui/Chevron';
import type { PromptExample } from '@/lib/ai/prompts/prompt-examples';
import { getPromptExamples } from '@/lib/ai/prompts/prompt-examples';
import { DataTable } from './ContentHelpers';

function PromptPanel({ prompt }: { prompt: PromptExample }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-dm-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-dm-card/50 transition-colors"
      >
        <div>
          <span className="text-sm font-medium text-dm-text-primary">{prompt.label}</span>
          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-dm-border/50 text-dm-muted">
            {prompt.model}
          </span>
        </div>
        <span className="text-dm-muted">
          <Chevron open={open} />
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-dm-border">
          <p className="text-xs text-dm-text-secondary mt-3">{prompt.description}</p>

          <div>
            <h4 className="text-[11px] font-semibold text-dm-muted uppercase tracking-wide mb-1">
              System prompt
            </h4>
            <pre className="text-xs text-dm-text-secondary bg-dm-bg border border-dm-border rounded p-3 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
              {prompt.systemPrompt}
            </pre>
          </div>

          <div>
            <h4 className="text-[11px] font-semibold text-dm-muted uppercase tracking-wide mb-1">
              {prompt.id.startsWith('pass')
                ? 'Example prompt (Civil Service category)'
                : 'Prompt instructions'}
            </h4>
            <pre className="text-xs text-dm-text-secondary bg-dm-bg border border-dm-border rounded p-3 whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">
              {prompt.userPrompt}
            </pre>
          </div>

          {prompt.variables.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-dm-muted uppercase tracking-wide mb-1">
                Template variables
              </h4>
              <DataTable
                headers={['Variable', 'Description', 'Example value']}
                rows={prompt.variables.map((v) => [v.variable, v.description, v.example])}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PromptTransparency() {
  const examples = getPromptExamples();
  const detection = examples.filter((e) => e.id.startsWith('pass'));
  const narrative = examples.filter((e) => e.id.startsWith('narrative'));

  return (
    <div className="space-y-4">
      {/* Fairness callout */}
      <div className="border-l-3 border-dm-accent/40 bg-dm-accent/5 rounded-r-lg px-4 py-3 space-y-2">
        <p className="text-xs text-dm-text-secondary leading-relaxed">
          <strong className="text-dm-text-primary">Built-in fairness controls:</strong> Every
          concern raised by the system requires counter-arguments ranked by plausibility — the most
          likely benign explanation comes first. A separate AI provider (GPT-4o) independently
          reviews each narrative for overstatement, missing balance, and unsupported claims before
          publication. The editorial review criteria are shown in the Narrative Editorial Review
          prompt below.
        </p>
        <p className="text-xs text-dm-text-secondary leading-relaxed">
          Using different AI providers for each pass (OpenAI for screening and editorial review,
          Anthropic for detailed assessment and drafting) ensures epistemic independence — neither
          provider can reinforce the other&apos;s biases.
        </p>
      </div>

      {/* Detection pipeline */}
      <div>
        <h3 className="text-xs font-semibold text-dm-muted uppercase tracking-wide mb-2">
          Detection Pipeline
        </h3>
        <div className="space-y-2">
          {detection.map((p) => (
            <PromptPanel key={p.id} prompt={p} />
          ))}
        </div>
      </div>

      {/* Narrative pipeline */}
      <div>
        <h3 className="text-xs font-semibold text-dm-muted uppercase tracking-wide mb-2">
          Narrative Pipeline (3-pass)
        </h3>
        <div className="space-y-2">
          {narrative.map((p) => (
            <PromptPanel key={p.id} prompt={p} />
          ))}
        </div>
      </div>

      <p className="text-xs text-dm-muted">
        These are the production prompts. Template variables shown above are replaced with actual
        data at runtime. The prompt source code is available in the{' '}
        <a
          href="https://github.com/agile-explorations/democracy-monitor"
          className="text-dm-accent hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          open-source repository
        </a>
        .
      </p>
    </div>
  );
}
