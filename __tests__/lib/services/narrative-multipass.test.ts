import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getProvider } from '@/lib/ai/provider';
import { parseDraftResponse, generateMultiPassNarrative } from '@/lib/services/narrative-multipass';
import { makeLayerData } from '../../fixtures/narrative-layer-data';

vi.mock('@/lib/ai/provider', () => ({
  getProvider: vi.fn(),
}));

describe('parseDraftResponse', () => {
  it('splits expert and public sections by headers', () => {
    const response =
      '=== EXPERT NARRATIVE ===\nExpert content here.\n\n' +
      '=== PUBLIC NARRATIVE ===\nPublic content here.';
    const result = parseDraftResponse(response);
    expect(result.expert).toBe('Expert content here.');
    expect(result.public).toBe('Public content here.');
  });

  it('falls back to full content when headers missing', () => {
    const response = 'Some content without headers.';
    const result = parseDraftResponse(response);
    expect(result.expert).toBe('Some content without headers.');
    expect(result.public).toBe('Some content without headers.');
  });

  it('handles multi-line content in each section', () => {
    const response =
      '=== EXPERT NARRATIVE ===\nLine 1\nLine 2\nLine 3\n\n' +
      '=== PUBLIC NARRATIVE ===\nPublic line 1\nPublic line 2';
    const result = parseDraftResponse(response);
    expect(result.expert).toContain('Line 1');
    expect(result.expert).toContain('Line 3');
    expect(result.public).toContain('Public line 1');
  });
});

describe('generateMultiPassNarrative', () => {
  const mockClaude = {
    name: 'anthropic',
    isAvailable: vi.fn(),
    complete: vi.fn(),
  };
  const mockOpenai = {
    name: 'openai',
    isAvailable: vi.fn(),
    complete: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    (getProvider as ReturnType<typeof vi.fn>).mockImplementation((name: string) =>
      name === 'anthropic' ? mockClaude : mockOpenai,
    );
  });

  it('throws when Anthropic is unavailable', async () => {
    mockClaude.isAvailable.mockReturnValue(false);
    mockOpenai.isAvailable.mockReturnValue(true);
    await expect(generateMultiPassNarrative(makeLayerData())).rejects.toThrow(
      'Anthropic API key not configured',
    );
  });

  it('throws when OpenAI is unavailable', async () => {
    mockClaude.isAvailable.mockReturnValue(true);
    mockOpenai.isAvailable.mockReturnValue(false);
    await expect(generateMultiPassNarrative(makeLayerData())).rejects.toThrow(
      'OpenAI API key not configured',
    );
  });

  it('makes 3 API calls in sequence: draft, feedback, revision', async () => {
    mockClaude.isAvailable.mockReturnValue(true);
    mockOpenai.isAvailable.mockReturnValue(true);

    const draftResponse =
      '=== EXPERT NARRATIVE ===\nExpert draft.\n\n' + '=== PUBLIC NARRATIVE ===\nPublic draft.';
    const feedbackResponse = 'Feedback notes here.';
    const finalResponse =
      '=== EXPERT NARRATIVE ===\nExpert final.\n\n' + '=== PUBLIC NARRATIVE ===\nPublic final.';

    mockClaude.complete
      .mockResolvedValueOnce({
        content: draftResponse,
        model: 'claude-opus-4-6',
        tokensUsed: { input: 100, output: 200 },
        latencyMs: 500,
      })
      .mockResolvedValueOnce({
        content: finalResponse,
        model: 'claude-opus-4-6',
        tokensUsed: { input: 150, output: 250 },
        latencyMs: 600,
      });

    mockOpenai.complete.mockResolvedValueOnce({
      content: feedbackResponse,
      model: 'gpt-4o',
      tokensUsed: { input: 200, output: 100 },
      latencyMs: 400,
    });

    const result = await generateMultiPassNarrative(makeLayerData());

    expect(result.expertDraft).toBe('Expert draft.');
    expect(result.publicDraft).toBe('Public draft.');
    expect(result.feedback).toBe('Feedback notes here.');
    expect(result.expert).toBe('Expert final.');
    expect(result.public).toBe('Public final.');
    expect(result.draftModel).toBe('claude-opus-4-6');
    expect(result.feedbackModel).toBe('gpt-4o');
    expect(result.finalModel).toBe('claude-opus-4-6');

    expect(mockClaude.complete).toHaveBeenCalledTimes(2);
    expect(mockOpenai.complete).toHaveBeenCalledTimes(1);
  });

  it('includes pass info when draft fails', async () => {
    mockClaude.isAvailable.mockReturnValue(true);
    mockOpenai.isAvailable.mockReturnValue(true);
    mockClaude.complete.mockRejectedValue(new Error('API rate limited'));

    try {
      await generateMultiPassNarrative(makeLayerData());
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as { passInfo: { pass: number } }).passInfo.pass).toBe(1);
    }
  });

  it('includes pass info when feedback fails', async () => {
    mockClaude.isAvailable.mockReturnValue(true);
    mockOpenai.isAvailable.mockReturnValue(true);

    mockClaude.complete.mockResolvedValueOnce({
      content: '=== EXPERT NARRATIVE ===\nDraft\n\n=== PUBLIC NARRATIVE ===\nDraft',
      model: 'claude-opus-4-6',
      tokensUsed: { input: 100, output: 200 },
      latencyMs: 500,
    });
    mockOpenai.complete.mockRejectedValue(new Error('Feedback error'));

    try {
      await generateMultiPassNarrative(makeLayerData());
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as { passInfo: { pass: number } }).passInfo.pass).toBe(2);
    }
  });
});
