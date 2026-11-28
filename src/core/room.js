export class RoomSubscriptionManager {
  constructor() {
    this._unsubscribe = null;
  }

  replace(nextUnsubscribe) {
    this.clear();
    this._unsubscribe = typeof nextUnsubscribe === 'function' ? nextUnsubscribe : null;
  }

  clear() {
    if (typeof this._unsubscribe === 'function') {
      try {
        this._unsubscribe();
      } catch {
        // Ignore teardown errors from closed connections
      }
    }
    this._unsubscribe = null;
  }

  isActive() {
    return typeof this._unsubscribe === 'function';
  }
}

export function generateFourDigitCode(rng = Math.random) {
  return String(1000 + Math.floor(rng() * 9000));
}

export async function createUniqueRoomCode({
  generateCode = generateFourDigitCode,
  runRoomTransaction,
  payload,
  maxAttempts = 12
}) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = String(generateCode());
    const result = await runRoomTransaction(candidate, (existing) => {
      if (existing != null) return undefined;
      return payload;
    });
    if (result && result.committed) {
      return candidate;
    }
  }
  throw new Error('사용 가능한 방 코드를 찾지 못했습니다. 잠시 후 다시 시도해주세요.');
}

let createRoomInFlight = false;
let joinRoomInFlight = false;

export async function createRoomSafely({
  nickname,
  myId,
  generateCode = generateFourDigitCode,
  runRoomTransaction,
  maxAttempts = 12,
  onError
}) {
  if (createRoomInFlight) return null;
  createRoomInFlight = true;
  try {
    const payload = {
      status: 'waiting',
      hostId: myId,
      selectedGame: 'liar',
      players: { [myId]: { nickname, isHost: true } }
    };
    return await createUniqueRoomCode({
      generateCode,
      runRoomTransaction,
      payload,
      maxAttempts
    });
  } catch (err) {
    if (typeof onError === 'function') onError(err);
    return null;
  } finally {
    createRoomInFlight = false;
  }
}

export async function joinRoomSafely({
  roomCode,
  nickname,
  myId,
  getRoom,
  writePlayer,
  onError
}) {
  if (joinRoomInFlight) return { joined: false, reason: 'busy' };
  joinRoomInFlight = true;
  try {
    const snap = await getRoom(roomCode);
    if (!snap || !snap.exists) {
      return { joined: false, reason: 'not_found' };
    }
    const roomVal = snap.val || {};
    const isHost = roomVal.hostId === myId;
    await writePlayer(roomCode, myId, { nickname, isHost });
    return { joined: true, isHost };
  } catch (err) {
    if (typeof onError === 'function') onError(err);
    return { joined: false, reason: 'error', error: err };
  } finally {
    joinRoomInFlight = false;
  }
}
