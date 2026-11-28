export function onDomReady(callback, doc = document) {
  if (typeof callback !== 'function' || !doc) return;
  if (doc.readyState && doc.readyState !== 'loading') {
    callback();
    return;
  }
  doc.addEventListener('DOMContentLoaded', callback, { once: true });
}

export function bindLoginControls({
  doc = document,
  createRoom,
  joinRoom,
  onRoomEntered,
  alertFn = (msg) => alert(msg)
}) {
  const joinBox = doc.getElementById('join-mode-box');
  const createBox = doc.getElementById('create-mode-box');
  const linkToCreate = doc.getElementById('link-to-create');
  const linkToJoin = doc.getElementById('link-to-join');
  const nicknameInput = doc.getElementById('nickname-input');
  const roomCodeInput = doc.getElementById('room-code-input');
  const createBtn = doc.getElementById('btn-create-room');
  const joinBtn = doc.getElementById('btn-join-room');

  if (linkToCreate && joinBox && createBox) {
    linkToCreate.addEventListener('click', () => {
      joinBox.style.display = 'none';
      createBox.style.display = 'block';
    });
  }

  if (linkToJoin && joinBox && createBox) {
    linkToJoin.addEventListener('click', () => {
      createBox.style.display = 'none';
      joinBox.style.display = 'block';
    });
  }

  if (createBtn && nicknameInput) {
    createBtn.addEventListener('click', async () => {
      if (createBtn.disabled) return;
      const nickname = nicknameInput.value.trim();
      if (!nickname) {
        alertFn('닉네임을 입력해주세요!');
        return;
      }
      const prevText = createBtn.textContent;
      createBtn.disabled = true;
      createBtn.textContent = '방 생성 중...';
      try {
        const roomCode = await createRoom(nickname);
        if (roomCode && typeof onRoomEntered === 'function') {
          onRoomEntered({ roomCode, nickname, isHost: true });
        }
      } finally {
        createBtn.disabled = false;
        createBtn.textContent = prevText;
      }
    });
  }

  if (joinBtn && nicknameInput && roomCodeInput) {
    joinBtn.addEventListener('click', async () => {
      if (joinBtn.disabled) return;
      const nickname = nicknameInput.value.trim();
      const roomCode = roomCodeInput.value.trim();
      if (!nickname || !roomCode) {
        alertFn('입력 값을 확인해주세요!');
        return;
      }
      const prevText = joinBtn.textContent;
      joinBtn.disabled = true;
      joinBtn.textContent = '참여 중...';
      try {
        const result = await joinRoom(roomCode, nickname);
        if (result && result.joined && typeof onRoomEntered === 'function') {
          onRoomEntered({ roomCode, nickname, isHost: !!result.isHost });
        }
      } finally {
        joinBtn.disabled = false;
        joinBtn.textContent = prevText;
      }
    });
  }
}
