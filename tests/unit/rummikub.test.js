import { describe, it, expect } from 'vitest';
import {
  evaluateRummiMeld,
  buildRummikubInitState,
  checkRummiLateMeldEnd,
  applyRummiDrawPass,
  canActOnRummiTurn,
  calcRummiHandPenalty
} from '../../src/games/rummikub.js';

describe('rummikub game logic (Phase 3)', () => {
  it('validates sets, runs, jokers, and rejects invalid melds', () => {
    const setRes = evaluateRummiMeld([
      { id: 1, color: 'red', num: 10, joker: false },
      { id: 2, color: 'blue', num: 10, joker: false },
      { id: 3, color: 'black', num: 10, joker: false }
    ]);
    expect(setRes.valid).toBe(true);
    expect(setRes.points).toBe(30);

    const runWithJoker = evaluateRummiMeld([
      { id: 1, color: 'red', num: 10, joker: false },
      { id: 2, color: 'joker', num: 0, joker: true },
      { id: 3, color: 'red', num: 12, joker: false }
    ]);
    expect(runWithJoker.valid).toBe(true);
    expect(runWithJoker.points).toBe(33);

    const invalidDupColor = evaluateRummiMeld([
      { id: 1, color: 'red', num: 7, joker: false },
      { id: 2, color: 'red', num: 7, joker: false },
      { id: 3, color: 'blue', num: 7, joker: false }
    ]);
    expect(invalidDupColor.valid).toBe(false);

    expect(evaluateRummiMeld([{ id: 1, color: 'joker', num: 0, joker: true }]).valid).toBe(false);
  });

  it('immediately ends the game via lateMeld as soon as only 1 unmelded player remains (including turn 0)', () => {
    const roomData = {};
    const st = {
      melded: { p1: true, p2: false },
      turnSeq: 0,
      winnerId: null,
      loserId: null
    };
    const ended = checkRummiLateMeldEnd(roomData, st, ['p1', 'p2'], 'p1');
    expect(ended).toBe(true);
    expect(st.winnerId).toBe('p1');
    expect(st.loserId).toBe('p2');
    expect(st.endReason).toBe('lateMeld');
    expect(roomData.roomLastLoserId).toBe('p2');
    expect(roomData.roomLoserPendingChoice).toBe(true);
  });

  it('ends game via lateMeld once every player has had at least one full turn and only 1 remains unmelded', () => {
    const roomData = {};
    const st = {
      melded: { p1: true, p2: true, p3: false },
      turnSeq: 3,
      winnerId: null,
      loserId: null
    };
    const ended = checkRummiLateMeldEnd(roomData, st, ['p1', 'p2', 'p3'], 'p2');
    expect(ended).toBe(true);
    expect(st.winnerId).toBe('p2');
    expect(st.loserId).toBe('p3');
    expect(st.endReason).toBe('lateMeld');
    expect(roomData.roomLastLoserId).toBe('p3');
    expect(roomData.roomLoserPendingChoice).toBe(true);
  });

  it('prevents infinite pass loop when deck is empty and ends game by hand penalty', () => {
    const roomData = {
      rummikubState: {
        deck: [],
        turnOrder: ['p1', 'p2'],
        turnIdx: 0,
        turnSeq: 5,
        consecutivePasses: 0,
        hands: {
          p1: [{ id: 1, color: 'red', num: 3, joker: false }], // 3 pts (winner)
          p2: [{ id: 2, color: 'joker', num: 0, joker: true }] // 30 pts (loser)
        },
        winnerId: null,
        loserId: null
      }
    };

    // p1 passes on empty deck -> consecutivePasses becomes 1
    expect(applyRummiDrawPass(roomData, 'p1')).toBe(roomData);
    expect(roomData.rummikubState.consecutivePasses).toBe(1);
    expect(roomData.rummikubState.winnerId).toBeNull();

    // p2 passes on empty deck -> consecutivePasses reaches 2 (all players) -> game ends!
    expect(applyRummiDrawPass(roomData, 'p2')).toBe(roomData);
    expect(roomData.rummikubState.winnerId).toBe('p1');
    expect(roomData.rummikubState.loserId).toBe('p2');
    expect(roomData.rummikubState.endReason).toBe('deckEmpty');
    expect(roomData.roomLastLoserId).toBe('p2');
    expect(roomData.roomLoserPendingChoice).toBe(true);
  });

  it('draws tile and resets consecutivePasses when deck still has cards', () => {
    const roomData = {
      rummikubState: {
        deck: [{ id: 99, color: 'blue', num: 5, joker: false }],
        turnOrder: ['p1', 'p2'],
        turnIdx: 0,
        turnSeq: 0,
        consecutivePasses: 1,
        hands: { p1: [], p2: [] },
        winnerId: null,
        loserId: null
      }
    };
    const res = applyRummiDrawPass(roomData, 'p1');
    expect(res).toBe(roomData);
    expect(roomData.rummikubState.hands.p1).toHaveLength(1);
    expect(roomData.rummikubState.consecutivePasses).toBe(0);
    expect(roomData.rummikubState.turnIdx).toBe(1);
  });

  it('guards actions by active turn and unfinished game state', () => {
    const st = buildRummikubInitState(['p1', 'p2'], 30);
    expect(canActOnRummiTurn(st, 'p1')).toBe(true);
    expect(canActOnRummiTurn(st, 'p2')).toBe(false);
    st.winnerId = 'p1';
    expect(canActOnRummiTurn(st, 'p1')).toBe(false);
    expect(calcRummiHandPenalty([{ joker: true }, { num: 5, joker: false }])).toBe(35);

    // Additional edge branches: duplicate num in run, non-turn pass abort, finished game check
    expect(
      evaluateRummiMeld([
        { id: 1, color: 'blue', num: 4, joker: false },
        { id: 2, color: 'blue', num: 4, joker: false },
        { id: 3, color: 'blue', num: 5, joker: false }
      ]).valid
    ).toBe(false);
    expect(applyRummiDrawPass({ rummikubState: { winnerId: 'p1', turnOrder: ['p1'] } }, 'p1')).toBeUndefined();
    expect(applyRummiDrawPass({ rummikubState: { winnerId: null, turnOrder: ['p1', 'p2'], turnIdx: 0 } }, 'p2')).toBeUndefined();
    expect(checkRummiLateMeldEnd({}, { winnerId: 'p1' }, ['p1', 'p2'], 'p1')).toBe(false);
    expect(checkRummiLateMeldEnd({}, { winnerId: null, turnSeq: 5, melded: { p1: true, p2: true } }, ['p1', 'p2'], 'p1')).toBe(false);
  });
});
