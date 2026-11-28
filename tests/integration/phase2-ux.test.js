import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { describe, it, expect } from 'vitest';

const htmlPath = path.resolve(process.cwd(), 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

describe('Phase 2 UX and browser compatibility fixes', () => {
  it('uses valid Google Fonts CSS2 @ syntax for Noto Sans KR weights', () => {
    expect(html).toContain('family=Noto+Sans+KR:wght@400;700');
    expect(html).not.toContain('family=Noto+Sans+KR:wght=400;700');
  });

  it('replaces corrupted rpZEAWYtiB6bJ16NuLbGCc6CZ6jJdKfb63 function name with requestDrinkNotifyPermission', () => {
    expect(html).not.toContain('rpZEAWYtiB6bJ16NuLbGCc6CZ6jJdKfb63');
    expect(html).toContain('onclick="window.requestDrinkNotifyPermission()"');
    expect(html).toContain('window.requestDrinkNotifyPermission = function');
  });

  it('selectstart guard allows text selection inside editable inputs while blocking non-editable elements', () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    const guardScript = scripts.find((m) => m[2].includes("addEventListener('selectstart'"));
    expect(guardScript).toBeTruthy();

    const listeners = {};
    const mockDoc = {
      addEventListener(type, fn) {
        listeners[type] = fn;
      }
    };
    vm.runInNewContext(guardScript[2], { document: mockDoc });
    expect(typeof listeners.selectstart).toBe('function');

    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const plainDiv = document.createElement('div');

    const fire = (target) => {
      let prevented = false;
      listeners.selectstart({ target, preventDefault() { prevented = true; } });
      return prevented;
    };

    expect(fire(input)).toBe(false);
    expect(fire(textarea)).toBe(false);
    expect(fire(editable)).toBe(false);
    expect(fire(plainDiv)).toBe(true);
  });

  it('imports playTierSound from src/utils/audio.js in index.html', () => {
    expect(html).toMatch(/from\s+['"]\.\/src\/utils\/audio\.js['"]/);
  });
});
