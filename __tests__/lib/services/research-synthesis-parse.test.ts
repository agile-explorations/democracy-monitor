import { describe, expect, it } from 'vitest';
import { parseDraftResponse } from '@/lib/services/research-synthesis-service';

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
});
