import { describe, it, expect } from 'vitest';
import { shuffleArray, generateShortId } from '../../src/utils/random.js';

describe('random utilities (Phase 3)', () => {
  it('shuffleArray performs non-mutating Fisher-Yates shuffle', () => {
    const src = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray(src, () => 0);
    expect(src).toEqual([1, 2, 3, 4, 5]);
    expect(shuffled).not.toBe(src);
    expect([...shuffled].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(shuffled).toEqual([2, 3, 4, 5, 1]);
  });

  it('generateShortId creates prefixed alphanumeric IDs without deprecated substr', () => {
    const id = generateShortId('bot_', () => 0.123456789);
    expect(id).toMatch(/^bot_[a-z0-9]{1,9}$/);
  });
});
