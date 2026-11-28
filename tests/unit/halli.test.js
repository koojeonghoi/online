import { describe, it, expect } from 'vitest';
import {
  hgFiveFruit,
  hgFlip,
  hgRing,
  hgResolveWindow,
  hgStep,
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
    // Debounce repeated wrong tap within 600ms
    expect(hgRing(room, 'human', 1500)).toBe(false);
  });

  it('covers hgStep window timeout, empty-deck skip, second-player ring resolution, missed-5 flip, and game finish', () => {
    // 1) Second player rings during active hgWin -> resolves immediately with 'slow' loser
    const room1 = {
      hgPhase: 'play',
      hgRoundKey: 'r4',
      players: { p1: {}, p2: {}, p3: {} },
      hgTurnOrder: ['p1', 'p2', 'p3'],
      hgTurnIdx: 1,
      hgTurnStart: 1000,
      hgFlipSeq: 1,
      hgTop: { p1: 5 },
      hgTable: 3,
      hgScore: { p1: 0, p2: 0, p3: 0 },
      hgWin: null
    };
    expect(hgRing(room1, 'p1', 1100)).toBe(true);
    expect(hgRing(room1, 'p1', 1150)).toBe(false); // winner cannot ring again
    expect(hgRing(room1, 'p2', 1200)).toBe(true);
    expect(room1.hgWin).toBeTruthy(); // still waiting for p3
    expect(hgRing(room1, 'p3', 1300)).toBe(true); // all others rang -> resolves immediately!
    expect(room1.hgWin).toBeNull();
    expect(room1.hgEvent.type).toBe('drink');
    expect(room1.hgEvent.reason).toBe('slow');
    expect(room1.hgEvent.who).toEqual(['p3']);
    expect(room1.hgTurnStart).toBe(1300);
    // Grace period after ring resolution ignores late tap
    expect(hgRing(room1, 'p2', 1400)).toBe(false);

    // 2) hgStep expires hgWin timeout -> resolves missed players
    const room2 = {
      hgPhase: 'play',
      players: { p1: {}, p2: {} },
      hgTurnOrder: ['p1', 'p2'],
      hgTurnIdx: 0,
      hgTurnStart: 1000,
      hgDecks: { p1: [11], p2: [12] },
      hgWin: { who: 'p1', fruit: 0, n: 2, startAt: 1000, endAt: 4000 }
    };
    expect(hgStep(room2, 3000)).toBe(false);
    expect(hgStep(room2, 4000)).toBe(true);
    expect(room2.hgWin).toBeNull();
    expect(room2.hgEvent.reason).toBe('miss');

    // 3) hgFlip covers missed 5 fruits and skips empty deck
    const room3 = {
      hgPhase: 'play',
      players: { p1: {}, p2: {} },
      hgTurnOrder: ['p1', 'p2'],
      hgTurnIdx: 0,
      hgTurnStart: 1000,
      hgDecks: { p1: [12], p2: [] },
      hgTop: { p1: 5 },
      hgScore: { p1: 0, p2: 0 }
    };
    expect(hgFlip(room3, 'p1', 2000)).toBe(true);
    expect(room3.hgEvent.type).toBe('miss');
    expect(room3.hgGraceUntil).toBeGreaterThan(2000);

    // 4) hgStep skips player with empty deck, then finishes game when all decks empty after delay
    const room4 = {
      hgPhase: 'play',
      players: { p1: {}, p2: {} },
      hgTurnOrder: ['p1', 'p2'],
      hgTurnIdx: 0,
      hgDecks: { p1: [], p2: [11] },
      hgScore: { p1: 2, p2: 2 },
      hgLastFlipAt: 1000
    };
    expect(hgStep(room4, 2000)).toBe(true);
    expect(room4.hgTurnIdx).toBe(1);

    room4.hgDecks.p2 = [];
    expect(hgStep(room4, 2000)).toBe(false); // within HG_END_DELAY_MS
    expect(hgStep(room4, 6000, () => 0)).toBe(true); // finishes game (allTie branch)
    expect(room4.hgPhase).toBe('done');
    expect(room4.hgAllTie).toBe(true);
    expect(room4.roomLoserPendingChoice).toBe(true);

    // 5) Guard branches: non-play phase, wrong turn, empty deck flip advance, solo win, non-tie finish
    expect(hgFlip({ hgPhase: 'done' }, 'p1', 100)).toBe(false);
    expect(hgFlip({ hgPhase: 'play', hgTurnOrder: ['p1', 'p2'], hgTurnIdx: 0 }, 'p2', 100)).toBe(false);
    const emptyFlipRoom = {
      hgPhase: 'play',
      players: { p1: {}, p2: {} },
      hgTurnOrder: ['p1', 'p2'],
      hgTurnIdx: 0,
      hgDecks: { p1: [], p2: [11] }
    };
    expect(hgFlip(emptyFlipRoom, 'p1', 200)).toBe(true);
    expect(emptyFlipRoom.hgTurnIdx).toBe(1);

    expect(hgResolveWindow({ hgWin: null }, 100)).toBe(false);
    expect(hgRing({ hgPhase: 'done', players: { p1: {} } }, 'p1', 100)).toBe(false);
    expect(hgRing({ hgPhase: 'play', players: {} }, 'p1', 100)).toBe(false);
    expect(hgStep({ hgPhase: 'done' }, 100)).toBe(false);

    // Solo player win resolves immediately
    const soloRoom = {
      hgPhase: 'play',
      players: { solo: {} },
      hgTop: { solo: 5 },
      hgTable: 1,
      hgTurnStart: 100
    };
    expect(hgRing(soloRoom, 'solo', 200)).toBe(true);
    expect(soloRoom.hgWin).toBeNull();
    expect(soloRoom.hgTurnStart).toBe(200);

    // Non-tie finish picks unique lowest scorer
    const nonTieRoom = {
      hgPhase: 'play',
      players: { p1: {}, p2: {} },
      hgTurnOrder: ['p1', 'p2'],
      hgTurnIdx: 0,
      hgDecks: { p1: [], p2: [] },
      hgScore: { p1: 5, p2: 1 },
      hgLastFlipAt: 0
    };
    expect(hgStep(nonTieRoom, 5000, () => 0)).toBe(true);
    expect(nonTieRoom.hgAllTie).toBe(false);
    expect(nonTieRoom.hgLoserIds).toEqual(['p2']);
  });
});
