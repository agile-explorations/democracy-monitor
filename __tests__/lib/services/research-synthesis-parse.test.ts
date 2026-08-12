import { describe, expect, it } from 'vitest';
import { parseDraftResponse, parseFinalResponse } from '@/lib/services/research-synthesis-service';

describe('parseDraftResponse related questions', () => {
  const build = (questions: string[]) =>
    [
      '=== EXPERT ANSWER ===',
      'Expert text.',
      '=== PUBLIC ANSWER ===',
      'Public text.',
      '=== RELATED QUESTIONS ===',
      ...questions,
    ].join('\n');

  it('parses plain questions', () => {
    const parsed = parseDraftResponse(build(['What happened?', 'Why did it happen?']));
    expect(parsed.relatedQuestions).toEqual(['What happened?', 'Why did it happen?']);
  });

  it('strips markdown emphasis wrapping a question (#712 v1.9.16)', () => {
    const parsed = parseDraftResponse(
      build(['**What hearings examined the 287(g) program?**', '*Why?*', '__How?__']),
    );
    expect(parsed.relatedQuestions).toEqual([
      'What hearings examined the 287(g) program?',
      'Why?',
      'How?',
    ]);
  });

  it('strips list markers and caps at three questions', () => {
    const parsed = parseDraftResponse(build(['1. First?', '- Second?', '• Third?', '2. Fourth?']));
    expect(parsed.relatedQuestions).toEqual(['First?', 'Second?', 'Third?']);
  });

  it('splits expert and public sections', () => {
    const parsed = parseDraftResponse(build(['Q?']));
    expect(parsed.expert).toBe('Expert text.');
    expect(parsed.public).toBe('Public text.');
  });

  it('falls back to the whole response when headers are missing', () => {
    const parsed = parseDraftResponse('Just an answer with no headers.');
    expect(parsed.expert).toBe('Just an answer with no headers.');
    expect(parsed.public).toBe('Just an answer with no headers.');
    expect(parsed.relatedQuestions).toEqual([]);
  });

  it('excludes the questions section from the fallback answer text', () => {
    const parsed = parseDraftResponse('Answer only.\n=== RELATED QUESTIONS ===\nWhat next?');
    expect(parsed.expert).toBe('Answer only.');
    expect(parsed.relatedQuestions).toEqual(['What next?']);
  });
});

describe('parseFinalResponse', () => {
  it('splits expert and public sections', () => {
    const parsed = parseFinalResponse(
      '=== EXPERT ANSWER ===\nRevised expert.\n=== PUBLIC ANSWER ===\nRevised public.',
    );
    expect(parsed.expert).toBe('Revised expert.');
    expect(parsed.public).toBe('Revised public.');
  });

  it('falls back to the whole response when headers are missing', () => {
    const parsed = parseFinalResponse('No headers here.');
    expect(parsed).toEqual({ expert: 'No headers here.', public: 'No headers here.' });
  });
});
