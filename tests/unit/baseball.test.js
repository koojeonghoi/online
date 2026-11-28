import { describe, it, expect } from 'vitest';
import {
  buildBaseballInitState,
  getBaseballRoles,
  resolveBaseballPitch
} from '../../src/games/baseball.js';

describe('baseball game logic (Phase 3)', () => {
  it('builds balanced teams and resolves batter/pitcher roles', () => {
    const st = buildBaseballInitState(['p1', 'p2', 'p3', 'p4'], 3, () => 0.1);
    expect(st.teamA.length).toBe(2);
    expect(st.teamB.length).toBe(2);
    const roles = getBaseballRoles(st);
    expect(st.teamA).toContain(roles.batterId);
    expect(st.teamB).toContain(roles.pitcherId);
  });

  it('does NOT assign teamA as loser when final inning ends in a DRAW', () => {
    const roomData = { roomLastLoserId: null, roomLoserPendingChoice: false };
    const st = {
      maxInnings: 3,
      teamA: ['a1'],
      teamB: ['b1'],
      batterIdxA: 0,
      batterIdxB: 0,
      pitcherIdxA: 0,
      pitcherIdxB: 0,
      inning: 3,
      half: 'bottom',
      scoresA: [1, 0, 0],
      scoresB: [0, 1, 0],
      balls: 0,
      strikes: 2,
      outs: 2,
      bases: [false, false, false],
      pending: {
        pitcher: { zone: 4, option: 'fast' },
        batter: { zone: 4, option: 'take' }
      },
      seq: 0,
      logs: []
    };

    // rng >= 0.35 -> strike -> 3rd strike -> 3rd out -> game over with 1:1 DRAW
    resolveBaseballPitch(roomData, st, () => 0.9);

    expect(st.winnerTeam).toBe('DRAW');
    expect(st.loserId).toBeNull();
    expect(roomData.roomLastLoserId).toBeNull();
    expect(roomData.roomLoserPendingChoice).toBe(false);
  });

  it('assigns losing team player as loser when Team A wins', () => {
    const roomData = {};
    const st = {
      maxInnings: 3,
      teamA: ['a1'],
      teamB: ['b1'],
      inning: 3,
      half: 'bottom',
      scoresA: [2, 0, 0],
      scoresB: [0, 1, 0],
      balls: 0,
      strikes: 2,
      outs: 2,
      bases: [false, false, false],
      pending: {
        pitcher: { zone: 4, option: 'fast' },
        batter: { zone: 4, option: 'take' }
      },
      seq: 0,
      logs: []
    };

    resolveBaseballPitch(roomData, st, () => 0.9);
    expect(st.winnerTeam).toBe('A');
    expect(st.loserId).toBe('b1');
    expect(roomData.roomLastLoserId).toBe('b1');
    expect(roomData.roomLoserPendingChoice).toBe(true);
  });

  it('ends immediately after top of final inning when Team B already leads', () => {
    const roomData = {};
    const st = {
      maxInnings: 3,
      teamA: ['a1'],
      teamB: ['b1'],
      inning: 3,
      half: 'top',
      scoresA: [1, 0, 0],
      scoresB: [2, 0],
      balls: 0,
      strikes: 2,
      outs: 2,
      bases: [false, false, false],
      pending: {
        pitcher: { zone: 4, option: 'fast' },
        batter: { zone: 4, option: 'take' }
      },
      seq: 0,
      logs: []
    };

    resolveBaseballPitch(roomData, st, () => 0.9);
    expect(st.winnerTeam).toBe('B');
    expect(st.loserId).toBe('a1');
    expect(roomData.roomLastLoserId).toBe('a1');
    expect(roomData.roomLoserPendingChoice).toBe(true);
  });

  it('triggers walk-off win immediately when Team B takes the lead in bottom of final inning', () => {
    const roomData = {};
    const st = {
      maxInnings: 3,
      teamA: ['a1'],
      teamB: ['b1'],
      inning: 3,
      half: 'bottom',
      scoresA: [1, 0, 0],
      scoresB: [1, 0, 0],
      balls: 0,
      strikes: 0,
      outs: 0,
      bases: [false, false, false],
      pending: {
        pitcher: { zone: 4, option: 'fast' },
        batter: { zone: 4, option: 'power' }
      },
      seq: 0,
      logs: []
    };

    // dist === 0, power, rng = 0.1 < 0.45 -> home run -> Team B 2 : 1 Team A -> walk-off!
    resolveBaseballPitch(roomData, st, () => 0.1);
    expect(st.winnerTeam).toBe('B');
    expect(st.loserId).toBe('a1');
    expect(roomData.roomLastLoserId).toBe('a1');
    expect(roomData.roomLoserPendingChoice).toBe(true);
    expect(st.lastPlay).toMatch(/끝내기/);
  });

  it('handles ball-four walk with bases loaded scoring a run', () => {
    const roomData = {};
    const st = {
      maxInnings: 3,
      teamA: ['a1'],
      teamB: ['b1'],
      inning: 1,
      half: 'top',
      scoresA: [0],
      scoresB: [],
      balls: 3,
      strikes: 0,
      outs: 0,
      bases: [true, true, true],
      pending: {
        pitcher: { zone: 0, option: 'ball' },
        batter: { zone: 4, option: 'take' }
      },
      seq: 0,
      logs: []
    };

    resolveBaseballPitch(roomData, st, () => 0.5);
    expect(st.scoresA[0]).toBe(1);
    expect(st.bases).toEqual([true, true, true]);
    expect(st.balls).toBe(0);
  });

  it('covers inning transitions, hits with runners on base, fouls, outs, and swing-and-miss paths', () => {
    const mkState = (overrides = {}) => ({
      maxInnings: 3,
      teamA: ['a1', 'a2'],
      teamB: ['b1', 'b2'],
      batterIdxA: 0,
      batterIdxB: 0,
      pitcherIdxA: 0,
      pitcherIdxB: 0,
      inning: 1,
      half: 'top',
      scoresA: [0],
      scoresB: [],
      balls: 0,
      strikes: 0,
      outs: 0,
      bases: [false, false, false],
      pending: { pitcher: { zone: 4, option: 'fast' }, batter: { zone: 4, option: 'contact' } },
      seq: 0,
      logs: [],
      ...overrides
    });

    // dist 0, contact: HR (<0.2), 2B (<0.55), 1B (>=0.55) with runners on 1st & 2nd
    const stHr = mkState({ bases: [true, true, false] });
    resolveBaseballPitch({}, stHr, () => 0.1);
    expect(stHr.scoresA[0]).toBe(3);

    const st2B = mkState({ bases: [true, false, true] });
    resolveBaseballPitch({}, st2B, () => 0.4);
    expect(st2B.scoresA[0]).toBe(1);
    expect(st2B.bases).toEqual([false, true, true]);

    const st1B = mkState();
    resolveBaseballPitch({}, st1B, () => 0.8);
    expect(st1B.bases[0]).toBe(true);

    // dist 0, power: 2B (0.5) & 3B (0.9)
    const stPow2 = mkState({ pending: { pitcher: { zone: 4, option: 'fast' }, batter: { zone: 4, option: 'power' } } });
    resolveBaseballPitch({}, stPow2, () => 0.5);
    expect(stPow2.bases[1]).toBe(true);

    const stPow3 = mkState({ pending: { pitcher: { zone: 4, option: 'fast' }, batter: { zone: 4, option: 'power' } } });
    resolveBaseballPitch({}, stPow3, () => 0.9);
    expect(stPow3.bases[2]).toBe(true);

    // isBall && dist > 0 -> strike and strikeout
    const stBallMiss = mkState({
      strikes: 2,
      outs: 2,
      pending: { pitcher: { zone: 0, option: 'ball' }, batter: { zone: 4, option: 'contact' } }
    });
    resolveBaseballPitch({}, stBallMiss, () => 0.5);
    expect(stBallMiss.half).toBe('bottom');
    expect(stBallMiss.outs).toBe(0);

    // dist === 1: contact hit (<0.5), foul (<0.78), groundout (>=0.78)
    const stD1Hit = mkState({ pending: { pitcher: { zone: 4, option: 'fast' }, batter: { zone: 5, option: 'contact' } } });
    resolveBaseballPitch({}, stD1Hit, () => 0.2);
    expect(stD1Hit.bases[0]).toBe(true);

    const stD1Foul = mkState({ pending: { pitcher: { zone: 4, option: 'fast' }, batter: { zone: 5, option: 'power' } } });
    resolveBaseballPitch({}, stD1Foul, () => 0.6);
    expect(stD1Foul.strikes).toBe(1);

    const stD1Out = mkState({
      half: 'bottom',
      outs: 2,
      scoresB: [0],
      pending: { pitcher: { zone: 4, option: 'fast' }, batter: { zone: 5, option: 'power' } }
    });
    resolveBaseballPitch({}, stD1Out, () => 0.9);
    expect(stD1Out.inning).toBe(2);
    expect(stD1Out.half).toBe('top');

    // dist >= 2: flyout (<0.35), swing-and-miss strike (>=0.35), and 3rd strikeout
    const stD2Fly = mkState({ pending: { pitcher: { zone: 0, option: 'fast' }, batter: { zone: 8, option: 'power' } } });
    resolveBaseballPitch({}, stD2Fly, () => 0.1);
    expect(stD2Fly.outs).toBe(1);

    const stD2Miss = mkState({ pending: { pitcher: { zone: 0, option: 'fast' }, batter: { zone: 8, option: 'power' } } });
    resolveBaseballPitch({}, stD2Miss, () => 0.8);
    expect(stD2Miss.strikes).toBe(1);

    const stD2K = mkState({ strikes: 2, pending: { pitcher: { zone: 0, option: 'fast' }, batter: { zone: 8, option: 'power' } } });
    resolveBaseballPitch({}, stD2K, () => 0.8);
    expect(stD2K.outs).toBe(1);

    // take -> ball count increment & strike count increment
    const stTakeBall = mkState({ pending: { pitcher: { zone: 4, option: 'ball' }, batter: { zone: 4, option: 'take' } } });
    resolveBaseballPitch({}, stTakeBall, () => 0.9);
    expect(stTakeBall.balls).toBe(1);

    const stTakeStrike = mkState({ pending: { pitcher: { zone: 4, option: 'fast' }, batter: { zone: 4, option: 'take' } } });
    resolveBaseballPitch({}, stTakeStrike, () => 0.9);
    expect(stTakeStrike.strikes).toBe(1);
  });
});
