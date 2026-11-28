import { describe, it, expect, vi } from 'vitest';
import { playTierSound } from '../../src/utils/audio.js';

describe('audio helper (Phase 2 AudioContext.resume)', () => {
  it('calls resume() when AudioContext is suspended before starting oscillator', () => {
    const start = vi.fn();
    const stop = vi.fn();
    const connect = vi.fn();
    const resume = vi.fn(() => Promise.resolve());
    const fakeCtx = {
      state: 'suspended',
      currentTime: 1.0,
      destination: {},
      resume,
      createOscillator: vi.fn(() => ({
        frequency: { value: 0 },
        type: 'sine',
        connect,
        start,
        stop
      })),
      createGain: vi.fn(() => ({
        gain: { value: 0 },
        connect
      }))
    };

    const state = { muted: false, audioCtx: fakeCtx };
    playTierSound(state, 'perfect');

    expect(resume).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledWith(1.15);
  });

  it('does nothing when muted', () => {
    const resume = vi.fn();
    const createOscillator = vi.fn();
    const state = { muted: true, audioCtx: { state: 'suspended', resume, createOscillator } };
    playTierSound(state, 'good');
    expect(resume).not.toHaveBeenCalled();
    expect(createOscillator).not.toHaveBeenCalled();
  });

  it('creates AudioContext lazily from provided constructor when absent', () => {
    const osc = { frequency: { value: 0 }, type: 'sine', connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    const gain = { gain: { value: 0 }, connect: vi.fn() };
    const FakeAC = vi.fn(function () {
      this.state = 'running';
      this.currentTime = 2.0;
      this.destination = {};
      this.resume = vi.fn();
      this.createOscillator = () => osc;
      this.createGain = () => gain;
    });

    const state = { muted: false, audioCtx: null };
    playTierSound(state, 'miss', FakeAC);

    expect(FakeAC).toHaveBeenCalledTimes(1);
    expect(osc.frequency.value).toBe(180);
    expect(osc.type).toBe('sawtooth');
    expect(osc.start).toHaveBeenCalledTimes(1);
  });
});
