import type { AIProvider } from '@/lib/types';

/** Pick the preferred AI provider (Anthropic first, then first available). */
export function selectProvider(providers: AIProvider[]): AIProvider | null {
  return providers.find((p) => p.name === 'anthropic') || providers[0] || null;
}

/**
 * Extract a JSON object from an LLM response that may contain markdown
 * code fences and surrounding prose. Returns null if no JSON found.
 */
export function extractJsonFromLlm<T = Record<string, unknown>>(text: string): T | null {
  // Strip code fences if present
  let source = text;
  const openFence = text.match(/`{3,}\w*[ \t]*\n?/);
  if (openFence && openFence.index !== undefined) {
    const start = openFence.index + openFence[0].length;
    const closeIdx = text.indexOf('```', start);
    if (closeIdx !== -1) {
      source = text.slice(start, closeIdx);
    }
  }

  const jsonMatch = source.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    return null;
  }
}
