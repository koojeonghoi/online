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
});
