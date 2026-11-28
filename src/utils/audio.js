export function playTierSound(funState, tier, AudioContextCtor) {
  if (!funState || funState.muted) return;
  try {
    const AC =
      AudioContextCtor ||
      (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
    if (!funState.audioCtx) {
      if (!AC) return;
      funState.audioCtx = new AC();
    }
    const ctx = funState.audioCtx;
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      const resumed = ctx.resume();
      if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = tier === 'perfect' ? 880 : tier === 'good' ? 660 : 180;
    osc.type = tier === 'miss' ? 'sawtooth' : 'sine';
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // Ignore Web Audio failures in unsupported or locked environments
  }
}
