import { describe, it, expect, vi } from 'vitest';
import { createRoomSafely } from '../../src/core/room.js';

describe('host create-room button bug reproducers (local mocks only)', () => {
  it('times out a hanging runRoomTransaction instead of permanently locking subsequent clicks', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();

    // First click: transaction hangs forever (simulates stalled RTDB socket)
    const hangingTx = vi.fn(() => new Promise(() => {}));
    const firstAttempt = createRoomSafely({
      nickname: '방장',
      myId: 'host_1',
      generateCode: () => '2345',
      runRoomTransaction: hangingTx,
      timeoutMs: 50,
      maxAttempts: 1,
      onError
    });

    await vi.advanceTimersByTimeAsync(100);
    const firstResult = await firstAttempt;
    expect(firstResult).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);

    // Second click must NOT be permanently blocked by createRoomInFlight
    const workingTx = vi.fn(async (_code, updater) => {
      const next = updater(null);
      return { committed: next !== undefined };
    });
    const secondResult = await createRoomSafely({
      nickname: '방장',
      myId: 'host_1',
      generateCode: () => '6789',
      runRoomTransaction: workingTx,
      timeoutMs: 50,
      maxAttempts: 1,
      onError
    });

    expect(secondResult).toBe('6789');
    expect(workingTx).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('falls back to collision-checked get+set when runRoomTransaction rejects', async () => {
    const rooms = new Map([['1111', { status: 'playing' }]]);
    const codes = ['1111', '2222'];
    let idx = 0;

    const failingTx = vi.fn(async () => {
      throw new Error('transaction unavailable');
    });
    const checkRoomExists = vi.fn(async (code) => rooms.has(code));
    const writeRoom = vi.fn(async (code, payload) => {
      rooms.set(code, payload);
    });
    const onError = vi.fn();

    const createdCode = await createRoomSafely({
      nickname: '방장',
      myId: 'host_2',
      generateCode: () => codes[idx++],
      runRoomTransaction: failingTx,
      checkRoomExists,
      writeRoom,
      timeoutMs: 100,
      maxAttempts: 4,
      onError
    });

    expect(createdCode).toBe('2222');
    expect(rooms.get('1111')).toEqual({ status: 'playing' });
    expect(rooms.get('2222')?.hostId).toBe('host_2');
    expect(onError).not.toHaveBeenCalled();
  });
});
