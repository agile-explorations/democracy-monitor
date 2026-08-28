/**
 * Model-upgrade eval (#718 follow-on): Sonnet 4.6 (current) vs Sonnet 5 on
 * research synthesis. Primary metric: deterministic quote-verification miss
 * rate per draw (misquotes + mis-citations caught by quote-verification.ts).
 *
 * Design: doc ids + chips come from the PROD docsOnly API (cached, free);
 * prompts are built locally from the local DB, so every arm sees byte-identical
 * context per question. Model calls go direct to the Anthropic SDK (the eval
 * needs per-arm thinking/temperature control the provider doesn't expose).
 *
 * Usage:
 *   npx tsx scripts/eval-synthesis-model.ts --canary          # 1 draw/arm on FW4
 *   npx tsx scripts/eval-synthesis-model.ts --draws 5         # full fleet
 *   Flags: --arms A,B,C  --draws N  --max-dollars N  --max-calls N  --out FILE
 *
 * Spend protocol (#563/#564): hard caps on calls and dollars; exits 3 on cap
 * trip; per-call usage logged to the JSONL ledger for reconciliation.
 */
import fs from 'fs';
// Direct SDK use is deliberate here: the eval arms need per-model thinking/
// temperature control the provider abstraction doesn't expose, and adding it
// for a measurement harness would bloat the ship-path interface.
// nosemgrep: no-direct-ai-sdk
import Anthropic from '@anthropic-ai/sdk';
import { verifyAnswerQuotes } from '@/lib/services/quote-verification';
import { buildSinglePassPrompt } from '@/lib/services/research-prompts';
import { fetchResearchDocsByIds } from '@/lib/services/search-service';
import { enrichDocsForSynthesis } from '@/lib/services/synthesis-context-enrichment';
import { machineAuthHeaders } from './loadtest/client';

const SYSTEM =
  'You are a research analyst answering questions about U.S. government actions. ' +
  'Your answers are grounded exclusively in the provided government documents. ' +
  'Apply the self-verification checklist before finalizing your answer.';

const QUESTIONS: Array<{ key: string; q: string; params?: Record<string, string> }> = [
  {
    key: 'FW1',
    q: 'Which members of Congress have spoken on the floor about Schedule F or reclassifying federal employees, and what concerns did they raise?',
    params: { tier: 'discussion' },
  },
  {
    key: 'FW2',
    q: 'What OPM and OMB actions have been taken regarding federal workforce restructuring since January 2025?',
    params: { dateFrom: '2025-01-20' },
  },
  {
    key: 'FW3',
    q: 'What government documents reference both federal workforce reduction and inspector general oversight?',
  },
  {
    key: 'FW4',
    q: 'How did congressional responses to the 2020 Schedule F executive order compare to responses to the 2025 reinstatement?',
  },
  {
    key: 'IM1',
    q: 'What congressional floor speeches have addressed the expansion of 287(g) agreements between ICE and local law enforcement since 2025?',
    params: { tier: 'discussion', dateFrom: '2025-01-20' },
  },
  {
    key: 'IM2',
    q: 'How did detention-related rulemaking under the Biden administration compare to both Trump administrations?',
  },
  {
    key: 'IM3',
    q: 'What government documents reference both immigration enforcement and due process protections?',
  },
  {
    key: 'IM4',
    q: 'How have congressional responses to immigration enforcement actions differed between the first and second Trump administrations?',
  },
  {
    key: 'DEM1',
    q: 'What firings or removals of inspectors general have occurred across federal agencies, and what congressional responses have there been?',
  },
  {
    key: 'DEM2',
    q: "What court opinions and executive branch documents address the President's power to remove independent agency officials?",
  },
  {
    key: 'DEM3',
    q: 'How has the use of executive orders and presidential memoranda to modify federal agency independence compared across administrations since 2017?',
  },
  {
    key: 'DEM4',
    q: 'How have DOJ press releases about civil rights enforcement differed across administrations?',
  },
];

/** Per-arm request config + intro-window pricing ($/MTok) for the ledger. */
const ARMS: Record<
  string,
  {
    model: string;
    temperature?: number;
    thinking?: { type: 'disabled' };
    maxTokens: number;
    priceIn: number;
    priceOut: number;
  }
> = {
  A: { model: 'claude-sonnet-4-6', temperature: 0.2, maxTokens: 4096, priceIn: 3, priceOut: 15 },
  B: {
    model: 'claude-sonnet-5',
    thinking: { type: 'disabled' },
    maxTokens: 8192,
    priceIn: 2,
    priceOut: 10,
  },
  C: { model: 'claude-sonnet-5', maxTokens: 12288, priceIn: 2, priceOut: 10 },
};

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function fetchProdContext(question: (typeof QUESTIONS)[number]) {
  const qs = new URLSearchParams({
    q: question.q,
    mode: 'research',
    docsOnly: 'true',
    ...question.params,
  });
  const res = await fetch(`https://democracymonitor.us/api/search?${qs}`, {
    headers: machineAuthHeaders(),
  });
  if (!res.ok) throw new Error(`docsOnly ${question.key}: HTTP ${res.status}`);
  const data = (await res.json()) as {
    documents: Array<{ id: number }>;
    alsoSearched?: string[];
  };
  return { ids: data.documents.map((d) => d.id), chips: data.alsoSearched ?? [] };
}

async function buildPrompt(ids: number[], chips: string[], q: string) {
  const docs = await fetchResearchDocsByIds(ids);
  await enrichDocsForSynthesis(docs, q);
  const aliases = chips.map((phrase) => ({ phrase, matches: 0 }));
  return {
    docs,
    prompt: buildSinglePassPrompt(
      q,
      docs,
      null,
      aliases as Parameters<typeof buildSinglePassPrompt>[3],
    ),
  };
}

/* eslint-disable max-lines-per-function */
async function main() {
  const armKeys = (argValue('--arms') ?? 'A,B,C').split(',');
  const canary = process.argv.includes('--canary');
  const draws = canary ? 1 : parseInt(argValue('--draws') ?? '5', 10);
  const maxDollars = parseFloat(argValue('--max-dollars') ?? '52');
  const maxCalls = parseInt(argValue('--max-calls') ?? '540', 10);
  const out = argValue('--out') ?? 'eval-synthesis-results.jsonl';
  const questions = canary ? QUESTIONS.filter((x) => x.key === 'FW4') : QUESTIONS;

  const client = new Anthropic();
  let calls = 0;
  let dollars = 0;

  for (const question of questions) {
    const { ids, chips } = await fetchProdContext(question);
    const { docs, prompt } = await buildPrompt(ids, chips, question.q);
    const citationMap = docs.map((d, i) => ({ citationIndex: i + 1, id: d.id }));

    for (let draw = 0; draw < draws; draw++) {
      for (const armKey of armKeys) {
        const arm = ARMS[armKey]!;
        if (calls >= maxCalls || dollars >= maxDollars) {
          console.error(`CAP TRIP: calls=${calls} dollars=$${dollars.toFixed(2)} — stopping`);
          process.exit(3);
        }
        const started = Date.now();
        const stream = client.messages.stream({
          model: arm.model,
          max_tokens: arm.maxTokens,
          system: SYSTEM,
          ...(arm.temperature != null ? { temperature: arm.temperature } : {}),
          ...(arm.thinking ? { thinking: arm.thinking } : {}),
          messages: [{ role: 'user', content: prompt }],
        });
        const final = await stream.finalMessage();
        const answer = final.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('');
        const verification = await verifyAnswerQuotes(answer, citationMap, chips);
        calls += 1;
        const cost =
          (final.usage.input_tokens * arm.priceIn + final.usage.output_tokens * arm.priceOut) /
          1_000_000;
        dollars += cost;
        const record = {
          key: question.key,
          arm: armKey,
          model: arm.model,
          draw,
          stopReason: final.stop_reason,
          inputTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
          cost: Number(cost.toFixed(4)),
          latencyMs: Date.now() - started,
          totalQuotes: verification?.totalQuotes ?? null,
          unverified: verification?.unverified.length ?? null,
          // Corrections are model misses the verifier repaired (#720) — count
          // them so ledgers stay comparable with pre-correction baselines:
          // raw model miss rate = (unverified + corrected) / totalQuotes.
          corrected: verification?.corrections?.length ?? 0,
          rawMisses:
            (verification?.unverified.length ?? 0) + (verification?.corrections?.length ?? 0),
          misCitations: verification?.unverified.filter((u) => u.foundIn != null).length ?? null,
          corrections: verification?.corrections ?? null,
          misses: verification?.unverified ?? null,
          answer,
        };
        fs.appendFileSync(out, `${JSON.stringify(record)}\n`);
        console.log(
          `${question.key} arm=${armKey} draw=${draw}: quotes=${record.totalQuotes} ` +
            `rawMisses=${record.rawMisses} (corrected=${record.corrected}, ` +
            `unverified=${record.unverified}) misCited=${record.misCitations} ` +
            `stop=${record.stopReason} in=${record.inputTokens} out=${record.outputTokens} ` +
            `$${cost.toFixed(3)} (cum $${dollars.toFixed(2)}, ${calls} calls)`,
        );
      }
    }
  }
  console.log(`DONE: ${calls} calls, $${dollars.toFixed(2)} — ledger: ${out}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('EVAL FAILED:', e);
  process.exit(1);
});
