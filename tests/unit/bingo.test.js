import { describe, it, expect } from 'vitest';
import { applyBingoCall } from '../../src/games/bingo.js';

describe('bingo atomic transaction updater (Phase 3)', () => {
  it('marks number called and advances turn atomically for the active player', () => {
    const room = {
      status: 'playing',
      selectedGame: 'bingo',
      players: { p1: {}, p2: {} },
      bingoTurnOrder: ['p1', 'p2'],
      bingoTurnIdx: 0,
      bingoCalled: {}
    };

    const updated = applyBingoCall(room, 12, 'p1');
    expect(updated).toBe(room);
    expect(updated.bingoCalled[12]).toBe(true);
    expect(updated.bingoTurnIdx).toBe(1);
  });

  it('aborts transaction (returns undefined) when already called or not caller turn', () => {
    const room = {
      status: 'playing',
      selectedGame: 'bingo',
      players: { p1: {}, p2: {} },
      bingoTurnOrder: ['p1', 'p2'],
      bingoTurnIdx: 0,
      bingoCalled: { 7: true }
    };

    expect(applyBingoCall(room, 7, 'p1')).toBeUndefined();
    expect(applyBingoCall(room, 9, 'p2')).toBeUndefined();
    expect(applyBingoCall({ ...room, status: 'waiting' }, 9, 'p1')).toBeUndefined();
  });
});
