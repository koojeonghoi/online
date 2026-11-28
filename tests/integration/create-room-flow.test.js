import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { describe, it, expect, vi } from 'vitest';
import { onDomReady, bindLoginControls } from '../../src/core/login-controller.js';

const htmlPath = path.resolve(process.cwd(), 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function setupLoginDom() {
  document.body.innerHTML = `
    <div id="login-screen" class="screen active">
      <input type="text" id="nickname-input" placeholder="닉네임을 입력하세요">
      <div id="join-mode-box">
        <input type="text" id="room-code-input" placeholder="방 코드 4자리 입력">
        <button id="btn-join-room">방 참여하기</button>
        <span class="switch-link" id="link-to-create">새로운 방을 직접 만들어야 하나요? (방장용)</span>
      </div>
      <div id="create-mode-box" style="display: none;">
        <button id="btn-create-room">새로운 방 만들기</button>
        <span class="switch-link" id="link-to-join">기존에 만들어진 방에 들어갈래요</span>
      </div>
    </div>
    <div id="lobby-screen" class="screen">
      <span id="display-room-code">----</span>
      <button id="btn-start-game" style="display:none;">시작</button>
      <div id="wait-message" style="display:none;">대기</div>
    </div>
  `;
}

describe('host create-room UI flow and boot resilience (local mocks only)', () => {
  it('runs onDomReady immediately when document.readyState is already complete', () => {
    const fn = vi.fn();
    onDomReady(fn, { readyState: 'complete', addEventListener: vi.fn() });
    expect(fn).toHaveBeenCalledTimes(1);

    const addEventListener = vi.fn();
    const fn2 = vi.fn();
    onDomReady(fn2, { readyState: 'loading', addEventListener });
    expect(fn2).not.toHaveBeenCalled();
    expect(addEventListener).toHaveBeenCalledWith('DOMContentLoaded', fn2, { once: true });
  });

  it('switches to host mode, shows loading state, creates room, and enters lobby on click', async () => {
    setupLoginDom();
    let resolveCreate;
    const createRoom = vi.fn(
      () => new Promise((resolve) => { resolveCreate = resolve; })
    );
    const onRoomEntered = vi.fn();
    const alertFn = vi.fn();

    bindLoginControls({
      doc: document,
      createRoom,
      joinRoom: vi.fn(),
      onRoomEntered,
      alertFn
    });

    // Switch from join mode to create mode
    document.getElementById('link-to-create').click();
    expect(document.getElementById('join-mode-box').style.display).toBe('none');
    expect(document.getElementById('create-mode-box').style.display).toBe('block');

    // Empty nickname alerts cleanly
    const btn = document.getElementById('btn-create-room');
    btn.click();
    expect(alertFn).toHaveBeenCalledWith('닉네임을 입력해주세요!');
    expect(createRoom).not.toHaveBeenCalled();

    // Valid nickname triggers loading state and disables button until done
    document.getElementById('nickname-input').value = '호스트유저';
    btn.click();
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('생성 중');

    resolveCreate('4821');
    await Promise.resolve();
    await Promise.resolve();

    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('새로운 방 만들기');
    expect(onRoomEntered).toHaveBeenCalledWith({
      roomCode: '4821',
      nickname: '호스트유저',
      isHost: true
    });

    // Switch back to join mode and verify join button validation & success flow
    document.getElementById('link-to-join').click();
    expect(document.getElementById('create-mode-box').style.display).toBe('none');
    expect(document.getElementById('join-mode-box').style.display).toBe('block');

    const joinBtn = document.getElementById('btn-join-room');
    document.getElementById('room-code-input').value = '';
    joinBtn.click();
    expect(alertFn).toHaveBeenCalledWith('입력 값을 확인해주세요!');

    const joinRoomMock = vi.fn(async () => ({ joined: true, isHost: false }));
    setupLoginDom();
    const onRoomEntered2 = vi.fn();
    bindLoginControls({
      doc: document,
      createRoom: vi.fn(),
      joinRoom: joinRoomMock,
      onRoomEntered: onRoomEntered2,
      alertFn
    });
    document.getElementById('nickname-input').value = '게스트';
    document.getElementById('room-code-input').value = '4821';
    document.getElementById('btn-join-room').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(onRoomEntered2).toHaveBeenCalledWith({
      roomCode: '4821',
      nickname: '게스트',
      isHost: false
    });
  });

  it('index.html uses login-controller and includes a classic file:// CORS notice guard', () => {
    expect(html).toMatch(/from\s+['"]\.\/src\/core\/login-controller\.js['"]/);
    expect(html).toContain('window.__partyAppBooted = true');
    expect(html).toContain('file-protocol-warning');

    // Execute the classic file:// fallback guard script in VM to verify it warns users on file://
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    const fileGuard = scripts.find(
      (m) => !/type\s*=\s*["']module["']/i.test(m[1]) && m[2].includes('__partyAppBooted')
    );
    expect(fileGuard).toBeTruthy();

    setupLoginDom();
    const alerts = [];
    let scheduledCb = null;
    const mockWin = {
      __partyAppBooted: false,
      location: { protocol: 'file:' },
      alert: (msg) => alerts.push(msg),
      setTimeout: (cb) => { scheduledCb = cb; }
    };
    vm.runInNewContext(fileGuard[2], { window: mockWin, document, setTimeout: mockWin.setTimeout });
    expect(typeof scheduledCb).toBe('function');
    scheduledCb();

    const banner = document.getElementById('file-protocol-warning');
    expect(banner).toBeTruthy();
    document.getElementById('link-to-create').click();
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });
});
