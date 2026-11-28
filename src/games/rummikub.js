import { shuffleArray } from '../utils/random.js';

export const RUMMI_COLORS = ['red', 'blue', 'orange', 'black'];

export function createRummiDeck(rng = Math.random) {
  const deck = [];
  let uid = 1;
  for (let c = 0; c < 2; c++) {
    for (const color of RUMMI_COLORS) {
      for (let num = 1; num <= 13; num++) {
        deck.push({ id: uid++, color, num, joker: false });
      }
    }
  }
  deck.push({ id: uid++, color: 'joker', num: 0, joker: true });
  deck.push({ id: uid++, color: 'joker', num: 0, joker: true });
  return shuffleArray(deck, rng);
}

export function evaluateRummiMeld(tiles) {
  if (!tiles || tiles.length < 3) return { valid: false, points: 0, sorted: tiles };
  const jokers = tiles.filter((t) => t.joker);
  const normals = tiles.filter((t) => !t.joker);
  if (normals.length === 0) return { valid: false, points: 0, sorted: tiles };

  if (tiles.length <= 4) {
    const n = normals[0].num;
    const colors = new Set(normals.map((t) => t.color));
    if (normals.every((t) => t.num === n) && colors.size === normals.length) {
      return {
        valid: true,
        points: n * tiles.length,
        sorted: [
          ...normals.sort((a, b) => RUMMI_COLORS.indexOf(a.color) - RUMMI_COLORS.indexOf(b.color)),
          ...jokers
        ]
      };
    }
  }

  const col = normals[0].color;
  if (normals.every((t) => t.color === col)) {
    const sn = [...normals].sort((a, b) => a.num - b.num);
    for (let i = 1; i < sn.length; i++) {
      if (sn[i].num === sn[i - 1].num) return { valid: false, points: 0, sorted: tiles };
    }
    let gaps = 0;
    for (let i = 1; i < sn.length; i++) gaps += sn[i].num - sn[i - 1].num - 1;
    if (gaps <= jokers.length && tiles.length <= 13) {
      const extra = jokers.length - gaps;
      const highAdd = Math.min(extra, 13 - sn[sn.length - 1].num);
      const lowAdd = extra - highAdd;
      const start = sn[0].num - lowAdd;
      if (start >= 1) {
        let pts = 0;
        let ji = 0;
        let ni = 0;
        const arranged = [];
        for (let v = start; v < start + tiles.length; v++) {
          pts += v;
          if (ni < sn.length && sn[ni].num === v) arranged.push(sn[ni++]);
          else arranged.push(jokers[ji++]);
        }
        return { valid: true, points: pts, sorted: arranged };
      }
    }
  }

  return { valid: false, points: 0, sorted: tiles };
}

export function buildRummikubInitState(pIds, minMeld, rng = Math.random) {
  const deck = createRummiDeck(rng);
  const perPlayer = Math.min(14, Math.floor((deck.length - 10) / Math.max(1, pIds.length)));
  const hands = {};
  const melded = {};
  pIds.forEach((pid) => {
    const h = [];
    for (let k = 0; k < perPlayer; k++) h.push(deck.pop());
    h.sort((a, b) => RUMMI_COLORS.indexOf(a.color) - RUMMI_COLORS.indexOf(b.color) || a.num - b.num);
    hands[pid] = h;
    melded[pid] = false;
  });
  return {
    deck,
    board: [],
    hands,
    melded,
    turnOrder: pIds,
    turnIdx: 0,
    turnSeq: 0,
    consecutivePasses: 0,
    minMeld: minMeld || 30,
    winnerId: null,
    loserId: null
  };
}

export function calcRummiHandPenalty(hand) {
  return (hand || []).reduce((sum, t) => sum + (t.joker ? 30 : t.num), 0);
}

export function canActOnRummiTurn(st, myId) {
  if (!st || st.winnerId) return false;
  const order = st.turnOrder || [];
  return order[st.turnIdx || 0] === myId;
}

export function checkRummiLateMeldEnd(roomData, st, order, triggerId) {
  if (st.winnerId) return false;
  if (!order || order.length < 2) return false;
  const unmelded = order.filter((pid) => !(st.melded && st.melded[pid]));
  if (unmelded.length !== 1) return false;
  st.winnerId = triggerId;
  st.loserId = unmelded[0];
  st.endReason = 'lateMeld';
  roomData.roomLastLoserId = unmelded[0];
  roomData.roomLoserPendingChoice = true;
  return true;
}

export function applyRummiDrawPass(roomData, actorId) {
  const st = roomData?.rummikubState;
  if (!st || st.winnerId) return undefined;
  const order = st.turnOrder || [];
  if (order.length === 0 || order[st.turnIdx || 0] !== actorId) return undefined;

  st.deck = st.deck || [];
  st.hands = st.hands || {};
  st.hands[actorId] = st.hands[actorId] || [];

  if (st.deck.length > 0) {
    st.hands[actorId].push(st.deck.pop());
    st.consecutivePasses = 0;
  } else {
    st.consecutivePasses = (st.consecutivePasses || 0) + 1;
    if (st.consecutivePasses >= order.length) {
      let minPen = Infinity;
      let maxPen = -1;
      let winner = order[0];
      let loser = order[0];
      order.forEach((pid) => {
        const pen = calcRummiHandPenalty(st.hands[pid]);
        if (pen < minPen) {
          minPen = pen;
          winner = pid;
        }
        if (pen > maxPen) {
          maxPen = pen;
          loser = pid;
        }
      });
      st.winnerId = winner;
      st.loserId = loser;
      st.endReason = 'deckEmpty';
      roomData.roomLastLoserId = loser;
      roomData.roomLoserPendingChoice = true;
      st.turnSeq = (st.turnSeq || 0) + 1;
      return roomData;
    }
  }

  st.turnIdx = ((st.turnIdx || 0) + 1) % order.length;
  st.turnSeq = (st.turnSeq || 0) + 1;
  return roomData;
}
