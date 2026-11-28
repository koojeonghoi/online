import { describe, it, expect } from 'vitest';
import {
  hgFiveFruit,
  hgFlip,
  hgRing,
  hgResolveWindow,
  getHalliBotFlipKey
} from '../../src/games/halli.js';

describe('Halli Galli bell + bot turn recovery (bug reproducer)', () => {
  it('advances bot flip key after bell window resolves so bot flips next card instead of deadlocking', () => {
    const room = {
      hgPhase: 'play',
      hgRoundKey: 'r1',
      players: {
        human: { nickname: '방장', isBot: false },
        bot_1: { nickname: '🤖 봇1', isBot: true }
      },
      hgDecks: {
        human: [11, 22],
        bot_1: [12, 23]
      },
      hgTop: {
        human: 3, // fruit 0, count 3
        bot_1: 2  // fruit 0, count 2 -> total 5!
      },
      hgTable: 2,
      hgScore: { human: 0, bot_1: 0 },
      hgTurnOrder: ['human', 'bot_1'],
      hgTurnIdx: 1, // bot_1's turn
      hgTurnStart: 1000,
      hgFlipSeq: 2,
      hgEventSeq: 0,
      hgWin: null,
      hgRingOrder: null
    };

    expect(hgFiveFruit(room.hgTop)).toBe(0);

    // Step 1: Bot schedules flip with initial key before human rings bell
    const botHandled = new Set();
    const initialKey = getHalliBotFlipKey(room);
    botHandled.add(initialKey);

    // Step 2: Human rings the bell on 5 fruits -> hgWin becomes active
    expect(hgRing(room, 'human', 1200)).toBe(true);
    expect(room.hgWin).toBeTruthy();

    // Step 3: Bot's previously scheduled flip fires during hgWin -> rejected
    expect(hgFlip(room, 'bot_1', 1500)).toBe(false);

    // Step 4: Bell window resolves (even if bot also rings or timer expires)
    expect(hgResolveWindow(room, 2500)).toBe(true);
    expect(room.hgWin).toBeNull();

    // Step 5: Bot MUST get a fresh key so hgScheduleBots re-schedules the flip!
    const nextKey = getHalliBotFlipKey(room);
    expect(nextKey).not.toBe(initialKey);
    expect(botHandled.has(nextKey)).toBe(false);

    // Step 6: Re-scheduled bot flip succeeds and advances turn back to human
    expect(hgFlip(room, 'bot_1', 3500)).toBe(true);
    expect(room.hgFlipSeq).toBe(3);
    expect(room.hgTurnIdx).toBe(0);
  });

  it('advances hgTurnStart even if hgResolveWindow runs within the exact same millisecond', () => {
    const room = {
      hgPhase: 'play',
      hgRoundKey: 'r2',
      players: { human: {}, bot_1: { isBot: true } },
      hgTurnOrder: ['human', 'bot_1'],
      hgTurnIdx: 1,
      hgTurnStart: 5000,
      hgFlipSeq: 4,
      hgWin: { who: 'human', fruit: 0, n: 2, startAt: 5000, endAt: 7200 },
      hgRingOrder: ['bot_1']
    };
    const keyBefore = getHalliBotFlipKey(room);
    hgResolveWindow(room, 5000);
    const keyAfter = getHalliBotFlipKey(room);
    expect(keyAfter).not.toBe(keyBefore);
  });

  it('does not reset hgTurnStart on a wrong bell so active bot timers are not duplicated', () => {
    const room = {
      hgPhase: 'play',
      hgRoundKey: 'r3',
      players: { human: {}, bot_1: { isBot: true } },
      hgTop: { human: 1, bot_1: 2 }, // total 3, not 5
      hgScore: { human: 0, bot_1: 0 },
      hgTurnOrder: ['human', 'bot_1'],
      hgTurnIdx: 1,
      hgTurnStart: 1000,
      hgFlipSeq: 2,
      hgEventSeq: 0,
      hgWin: null
    };
    const keyBefore = getHalliBotFlipKey(room);
    expect(hgRing(room, 'human', 1300)).toBe(true);
    expect(room.hgEvent.type).toBe('wrong');
    expect(getHalliBotFlipKey(room)).toBe(keyBefore);
  });
});
