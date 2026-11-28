import { describe, it, expect, vi } from 'vitest';
import {
  RoomSubscriptionManager,
  createUniqueRoomCode,
  createRoomSafely,
  joinRoomSafely
} from '../../src/core/room.js';

describe('RoomSubscriptionManager', () => {
  it('unsubscribes previous listener before attaching a new one', () => {
    const manager = new RoomSubscriptionManager();
    const unsub1 = vi.fn();
    const unsub2 = vi.fn();

    manager.replace(unsub1);
    expect(unsub1).not.toHaveBeenCalled();

    manager.replace(unsub2);
    expect(unsub1).toHaveBeenCalledTimes(1);
    expect(unsub2).not.toHaveBeenCalled();

    manager.clear();
    expect(unsub2).toHaveBeenCalledTimes(1);
    // Idempotent clear
    manager.clear();
    expect(unsub2).toHaveBeenCalledTimes(1);
  });
});

describe('createUniqueRoomCode', () => {
  it('skips existing rooms without overwriting and claims first free 4-digit code', async () => {
    const existingRooms = new Map([
      ['1234', { status: 'playing', hostId: 'other' }],
      ['5678', { status: 'waiting', hostId: 'another' }]
    ]);
    const candidates = ['1234', '5678', '9012'];
    let idx = 0;

    const runRoomTransaction = vi.fn(async (code, updater) => {
      const current = existingRooms.has(code) ? existingRooms.get(code) : null;
      const next = updater(current);
      if (next === undefined) return { committed: false };
      existingRooms.set(code, next);
      return { committed: true, value: next };
    });

    const payload = { status: 'waiting', hostId: 'me', selectedGame: 'liar', players: { me: { nickname: '호스트', isHost: true } } };
    const code = await createUniqueRoomCode({
      generateCode: () => candidates[idx++],
      runRoomTransaction,
      payload,
      maxAttempts: 5
    });

    expect(code).toBe('9012');
    expect(existingRooms.get('1234')).toEqual({ status: 'playing', hostId: 'other' });
    expect(existingRooms.get('5678')).toEqual({ status: 'waiting', hostId: 'another' });
    expect(existingRooms.get('9012')).toEqual(payload);
    expect(runRoomTransaction).toHaveBeenCalledTimes(3);
  });

  it('throws when no free room code is found within maxAttempts', async () => {
    const runRoomTransaction = vi.fn(async () => ({ committed: false }));
    await expect(
      createUniqueRoomCode({
        generateCode: () => '1111',
        runRoomTransaction,
        payload: { status: 'waiting' },
        maxAttempts: 3
      })
    ).rejects.toThrow(/방 코드/);
  });
});

describe('createRoomSafely and joinRoomSafely', () => {
  it('prevents duplicate concurrent createRoomSafely calls and releases lock after failure', async () => {
    let resolveTx;
    const txPromise = new Promise((resolve) => { resolveTx = resolve; });
    const runRoomTransaction = vi.fn(() => txPromise);
    const onError = vi.fn();

    const p1 = createRoomSafely({
      nickname: '테스터',
      myId: 'player_1',
      generateCode: () => '4321',
      runRoomTransaction,
      onError
    });
    const p2 = createRoomSafely({
      nickname: '테스터',
      myId: 'player_1',
      generateCode: () => '9999',
      runRoomTransaction,
      onError
    });

    expect(await p2).toBeNull();
    resolveTx({ committed: true });
    expect(await p1).toBe('4321');
    expect(runRoomTransaction).toHaveBeenCalledTimes(1);

    // After failure, lock must be released
    const failingTx = vi.fn(async () => { throw new Error('network down'); });
    const res = await createRoomSafely({
      nickname: '테스터',
      myId: 'player_1',
      generateCode: () => '4322',
      runRoomTransaction: failingTx,
      onError
    });
    expect(res).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('joinRoomSafely verifies room exists, preserves host status, and handles errors', async () => {
    const getRoom = vi.fn(async () => ({ exists: true, val: { hostId: 'p_host' } }));
    const writePlayer = vi.fn(async () => {});
    const onError = vi.fn();

    const joined = await joinRoomSafely({
      roomCode: '4321',
      nickname: '방장',
      myId: 'p_host',
      getRoom,
      writePlayer,
      onError
    });
    expect(joined).toEqual({ joined: true, isHost: true });
    expect(writePlayer).toHaveBeenCalledWith('4321', 'p_host', { nickname: '방장', isHost: true });

    const missing = await joinRoomSafely({
      roomCode: '0000',
      nickname: '유저',
      myId: 'p_2',
      getRoom: async () => ({ exists: false, val: null }),
      writePlayer,
      onError
    });
    expect(missing).toEqual({ joined: false, reason: 'not_found' });
  });
});
