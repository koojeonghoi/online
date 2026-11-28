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

export function withTimeout(promise, timeoutMs, message) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message || '서버 응답 시간이 초과되었습니다. 네트워크를 확인 후 다시 시도해주세요.'));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

export async function createUniqueRoomCode({
  generateCode = generateFourDigitCode,
  runRoomTransaction,
  checkRoomExists,
  writeRoom,
  payload,
  maxAttempts = 12,
  timeoutMs = 8000
}) {
  let useFallback = typeof runRoomTransaction !== 'function';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = String(generateCode());

    if (!useFallback) {
      try {
        const result = await withTimeout(
          runRoomTransaction(candidate, (existing) => {
            if (existing != null) return undefined;
            return payload;
          }),
          timeoutMs,
          '방 생성 요청 시간이 초과되었습니다. 네트워크를 확인 후 다시 시도해주세요.'
        );
        if (result && result.committed) {
          return candidate;
        }
        continue;
      } catch (err) {
        if (typeof checkRoomExists === 'function' && typeof writeRoom === 'function') {
          useFallback = true;
        } else {
          throw err;
        }
      }
    }

    if (useFallback && typeof checkRoomExists === 'function' && typeof writeRoom === 'function') {
      const exists = await withTimeout(
        checkRoomExists(candidate),
        timeoutMs,
        '방 코드 확인 시간이 초과되었습니다. 네트워크를 확인 후 다시 시도해주세요.'
      );
      if (!exists) {
        await withTimeout(
          writeRoom(candidate, payload),
          timeoutMs,
          '방 저장 시간이 초과되었습니다. 네트워크를 확인 후 다시 시도해주세요.'
        );
        return candidate;
      }
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
  checkRoomExists,
  writeRoom,
  maxAttempts = 12,
  timeoutMs = 8000,
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
      checkRoomExists,
      writeRoom,
      payload,
      maxAttempts,
      timeoutMs
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
  timeoutMs = 8000,
  onError
}) {
  if (joinRoomInFlight) return { joined: false, reason: 'busy' };
  joinRoomInFlight = true;
  try {
    const snap = await withTimeout(
      getRoom(roomCode),
      timeoutMs,
      '방 정보를 불러오는 시간이 초과되었습니다. 네트워크를 확인해주세요.'
    );
    if (!snap || !snap.exists) {
      return { joined: false, reason: 'not_found' };
    }
    const roomVal = snap.val || {};
    const isHost = roomVal.hostId === myId;
    await withTimeout(
      writePlayer(roomCode, myId, { nickname, isHost }),
      timeoutMs,
      '방 참여 요청 시간이 초과되었습니다. 네트워크를 확인해주세요.'
    );
    return { joined: true, isHost };
  } catch (err) {
    if (typeof onError === 'function') onError(err);
    return { joined: false, reason: 'error', error: err };
  } finally {
    joinRoomInFlight = false;
  }
}
