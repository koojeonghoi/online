export const HG_WRONG_PENALTY = 3;
export const HG_END_DELAY_MS = 4000;
export const HG_WINDOW_MS = 3000;
export const HG_RING_GRACE_MS = 1500;
export const HG_COVER_GRACE_MS = 700;

export function hgFiveFruit(tops) {
  const sum = [0, 0, 0, 0];
  Object.values(tops || {}).forEach((c) => {
    if (c) sum[Math.floor(c / 10)] += c % 10;
  });
  return sum.findIndex((v) => v === 5);
}

export function hgDeckLen(room, id) {
  return ((room.hgDecks || {})[id] || []).length;
}

export function hgAdvanceTurn(room, at) {
  const order = room.hgTurnOrder || [];
  const players = room.players || {};
  const n = order.length;
  let idx = room.hgTurnIdx || 0;
  for (let i = 1; i <= n; i++) {
    const cand = (idx + i) % n;
    if (players[order[cand]] && hgDeckLen(room, order[cand]) > 0) {
      idx = cand;
      break;
    }
  }
  room.hgTurnIdx = idx;
  room.hgTurnStart = at;
}

export function hgMarkMissed(room, at) {
  const fruit = hgFiveFruit(room.hgTop);
  if (fruit < 0) return false;
  room.hgEventSeq = (room.hgEventSeq || 0) + 1;
  room.hgEvent = { type: 'miss', fruit, at, seq: room.hgEventSeq };
  return true;
}

export function hgFlip(room, who, at) {
  if (room.hgPhase !== 'play') return false;
  const order = room.hgTurnOrder || [];
  if (order[room.hgTurnIdx || 0] !== who) return false;
  if (room.hgWin) return false;
  const deck = (room.hgDecks || {})[who] || [];
  if (deck.length === 0) {
    hgAdvanceTurn(room, at);
    return true;
  }
  if (hgMarkMissed(room, at)) room.hgGraceUntil = at + HG_COVER_GRACE_MS;
  room.hgDecks = room.hgDecks || {};
  room.hgDecks[who] = deck.slice(1);
  room.hgTop = room.hgTop || {};
  room.hgTop[who] = deck[0];
  room.hgTable = (room.hgTable || 0) + 1;
  room.hgFlipSeq = (room.hgFlipSeq || 0) + 1;
  room.hgLastFlipAt = at;
  hgAdvanceTurn(room, at);
  return true;
}

export function hgResolveWindow(room, at) {
  const win = room.hgWin;
  if (!win) return false;
  const players = room.players || {};
  const others = Object.keys(players).filter((id) => id !== win.who);
  const pressed = Object.values(room.hgRingOrder || []).filter(
    (id) => players[id] && id !== win.who
  );
  const missed = others.filter((id) => !pressed.includes(id));
  let losers = [];
  let reason = '';
  if (others.length > 0) {
    if (missed.length > 0) {
      losers = missed;
      reason = 'miss';
    } else {
      losers = [pressed[pressed.length - 1]];
      reason = 'slow';
    }
  }
  room.hgWin = null;
  room.hgRingOrder = null;
  room.hgGraceUntil = at + HG_RING_GRACE_MS;
  // 종 정리 종료 시 hgTurnStart를 엄격히 증가시켜 취소된 봇 뒤집기 타이머가 즉시 재예약되게 함
  room.hgTurnStart = Math.max((room.hgTurnStart || 0) + 1, at);
  if (losers.length > 0) {
    room.hgEventSeq = (room.hgEventSeq || 0) + 1;
    room.hgEvent = {
      type: 'drink',
      who: losers,
      reason,
      fruit: win.fruit,
      winner: win.who,
      n: win.n,
      at,
      seq: room.hgEventSeq
    };
  }
  return true;
}

export function hgRing(room, who, at) {
  if (room.hgPhase !== 'play' || !(room.players || {})[who]) return false;
  room.hgScore = room.hgScore || {};
  if (room.hgWin) {
    const pressed = Object.values(room.hgRingOrder || []);
    if (who === room.hgWin.who || pressed.includes(who)) return false;
    pressed.push(who);
    room.hgRingOrder = pressed;
    const others = Object.keys(room.players || {}).filter((id) => id !== room.hgWin.who);
    if (others.every((id) => pressed.includes(id))) hgResolveWindow(room, at);
    return true;
  }
  const fruit = hgFiveFruit(room.hgTop);
  if (fruit >= 0) {
    const gain = room.hgTable || 0;
    room.hgScore[who] = (room.hgScore[who] || 0) + gain;
    room.hgTable = 0;
    room.hgTop = null;
    room.hgEventSeq = (room.hgEventSeq || 0) + 1;
    room.hgEvent = { type: 'win', who, n: gain, fruit, at, seq: room.hgEventSeq };
    room.hgWin = { who, fruit, n: gain, startAt: at, endAt: at + HG_WINDOW_MS };
    room.hgRingOrder = null;
    if (Object.keys(room.players || {}).every((id) => id === who)) hgResolveWindow(room, at);
    return true;
  }
  if (at < (room.hgGraceUntil || 0)) return false;
  const ev = room.hgEvent;
  if (ev && ev.type === 'wrong' && ev.who === who && at - ev.at < 600) return false;
  room.hgScore[who] = (room.hgScore[who] || 0) - HG_WRONG_PENALTY;
  room.hgEventSeq = (room.hgEventSeq || 0) + 1;
  room.hgEvent = { type: 'wrong', who, at, seq: room.hgEventSeq };
  return true;
}

export function hgFinish(room, at, rng = Math.random) {
  hgMarkMissed(room, at);
  const ids = Object.keys(room.players || {});
  const score = room.hgScore || {};
  const min = Math.min(...ids.map((id) => score[id] || 0));
  let losers = ids.filter((id) => (score[id] || 0) === min);
  const allTie = losers.length === ids.length;
  if (allTie) losers = [ids[Math.floor(rng() * ids.length)]];
  room.hgPhase = 'done';
  room.hgLoserIds = losers;
  room.hgAllTie = allTie;
  room.hgResultKey = at;
  room.roomLastLoserId = losers[Math.floor(rng() * losers.length)];
  room.roomLoserPendingChoice = true;
}

export function hgStep(room, at, rng = Math.random) {
  if (room.hgPhase !== 'play') return false;
  if (room.hgWin && at >= room.hgWin.endAt) {
    hgResolveWindow(room, at);
    return true;
  }
  const order = room.hgTurnOrder || [];
  const players = room.players || {};
  if (!order.some((id) => players[id] && hgDeckLen(room, id) > 0)) {
    if (at - (room.hgLastFlipAt || 0) > HG_END_DELAY_MS) {
      hgFinish(room, at, rng);
      return true;
    }
    return false;
  }
  const cur = order[room.hgTurnIdx || 0];
  if (!players[cur] || hgDeckLen(room, cur) === 0) {
    hgAdvanceTurn(room, at);
    return true;
  }
  return false;
}

export function getHalliBotFlipKey(data) {
  return `${data.hgRoundKey}_flip_${data.hgFlipSeq || 0}_${data.hgTurnStart || 0}`;
}
