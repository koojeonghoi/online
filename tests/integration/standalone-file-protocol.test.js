import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { JSDOM } from 'jsdom';
import { describe, it, expect } from 'vitest';

const root = process.cwd();
const htmlPath = path.join(root, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

describe('standalone index.html file:// direct-open compatibility (local mocks only)', () => {
  it('contains zero relative ES module imports so browsers never block it on file://', () => {
    const modMatch = html.match(/<script\s+type="module">([\s\S]*?)<\/script>/i);
    expect(modMatch).toBeTruthy();
    const modCode = modMatch[1];

    // No local relative imports (./ or ../) that trigger CORS errors on file://
    expect(modCode).not.toMatch(/import\s+[\s\S]*?from\s+['"]\.\.?\//);

    // Must still be valid ES module syntax
    const tmpFile = path.join(root, '.tmp-standalone-syntax.mjs');
    fs.writeFileSync(tmpFile, modCode, 'utf8');
    try {
      execFileSync(process.execPath, ['--check', tmpFile], { stdio: 'pipe' });
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('boots cleanly on file:// URL with mocked Firebase and creates a room when host clicks btn-create-room', async () => {
    const modCode = html.match(/<script\s+type="module">([\s\S]*?)<\/script>/i)[1];
    expect(modCode).not.toMatch(/import\s+[\s\S]*?from\s+['"]\.\.?\//);

    // Replace only CDN Firebase imports with pure in-memory local mocks (never touches real DB)
    const mockedMod = modCode
      .replace(
        /import\s+\{\s*initializeApp\s*\}\s+from\s+["']https:\/\/www\.gstatic\.com\/firebasejs\/[^"']+["'];/,
        'const initializeApp = () => ({});'
      )
      .replace(
        /import\s+\{[^}]+\}\s+from\s+["']https:\/\/www\.gstatic\.com\/firebasejs\/[^"']+["'];/,
        `const getDatabase = () => ({});
         const ref = (_db, p) => ({ path: p });
         const __store = new Map();
         const set = async (r, v) => { __store.set(r.path, v); };
         const get = async (r) => ({ exists: () => __store.has(r.path), val: () => __store.get(r.path) ?? null });
         const update = async () => {};
         const remove = async (r) => { __store.delete(r.path); };
         const onValue = (r, cb) => {
           if (r.path === '.info/connected') cb({ val: () => true });
           else if (r.path === '.info/serverTimeOffset') cb({ val: () => 0 });
           else if (__store.has(r.path)) cb({ val: () => __store.get(r.path) });
           return () => {};
         };
         const onChildAdded = () => () => {};
         const runTransaction = async (r, updater) => {
           const cur = __store.has(r.path) ? __store.get(r.path) : null;
           const next = updater(cur);
           if (next === undefined) return { committed: false };
           __store.set(r.path, next);
           return { committed: true, snapshot: { val: () => next } };
         };
         const goOffline = () => {};
         const goOnline = () => {};`
      );

    const dom = new JSDOM(html, { url: 'file:///C:/Users/USER/Downloads/online-main/index.html' });
    const prevGlobals = {
      window: globalThis.window,
      document: globalThis.document,
      localStorage: globalThis.localStorage,
      DOMParser: globalThis.DOMParser,
      history: globalThis.history,
      alert: globalThis.alert,
      confirm: globalThis.confirm,
      CSS: globalThis.CSS
    };

    dom.window.HTMLCanvasElement.prototype.getContext = () => ({
      clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
      fillRect() {}, arc() {}, fill() {}, save() {}, restore() {}, translate() {},
      rotate() {}, scale() {}, fillText() {}, measureText: () => ({ width: 0 }),
      setTransform() {}, drawImage() {}, closePath() {}, strokeRect() {}
    });
    dom.window.matchMedia = () => ({ matches: false });

    const createdIntervals = [];
    const origSetInterval = globalThis.setInterval;
    globalThis.setInterval = (...args) => {
      const id = origSetInterval(...args);
      createdIntervals.push(id);
      return id;
    };

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    // On file:// opaque origins, accessing localStorage throws SecurityError; simulate that cleanly
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('localStorage is not available for opaque origins', 'SecurityError'); }
    });
    globalThis.DOMParser = dom.window.DOMParser;
    globalThis.history = dom.window.history;
    globalThis.alert = () => {};
    globalThis.confirm = () => true;
    globalThis.CSS = { escape: (s) => s };

    const tmpMod = path.join(root, `.tmp-file-boot-${Date.now()}.mjs`);
    fs.writeFileSync(tmpMod, mockedMod, 'utf8');
    try {
      await import('file:///' + tmpMod.replace(/\\/g, '/'));
      expect(dom.window.__partyAppBooted).toBe(true);

      // Click "새로운 방을 직접 만들어야 하나요? (방장용)"
      dom.window.document.getElementById('link-to-create').click();
      expect(dom.window.document.getElementById('create-mode-box').style.display).toBe('block');

      // Enter nickname and click "새로운 방 만들기"
      dom.window.document.getElementById('nickname-input').value = '테스트방장';
      dom.window.document.getElementById('btn-create-room').click();

      await new Promise((r) => setTimeout(r, 30));

      expect(dom.window.document.getElementById('lobby-screen').classList.contains('active')).toBe(true);
      expect(dom.window.document.getElementById('display-room-code').innerText).toMatch(/^\d{4}$/);
    } finally {
      createdIntervals.forEach((id) => clearInterval(id));
      globalThis.setInterval = origSetInterval;
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        writable: true,
        value: prevGlobals.localStorage
      });
      globalThis.window = prevGlobals.window;
      globalThis.document = prevGlobals.document;
      globalThis.DOMParser = prevGlobals.DOMParser;
      globalThis.history = prevGlobals.history;
      globalThis.alert = prevGlobals.alert;
      globalThis.confirm = prevGlobals.confirm;
      globalThis.CSS = prevGlobals.CSS;
      fs.unlinkSync(tmpMod);
    }
  });
});
