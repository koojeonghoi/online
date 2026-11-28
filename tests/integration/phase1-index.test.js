import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const htmlPath = path.resolve(process.cwd(), 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

describe('Phase 1 index.html security and room lifecycle integration', () => {
  it('imports sanitize and room core ES modules', () => {
    expect(html).toMatch(/from\s+['"]\.\/src\/utils\/sanitize\.js['"]/);
    expect(html).toMatch(/from\s+['"]\.\/src\/core\/room\.js['"]/);
  });

  it('escapes nickname interpolations inside innerHTML templates', () => {
    const unescapedNicknameSinks = html
      .split(/\r?\n/)
      .filter((line) => /\.innerHTML\s*[\+]?=/.test(line))
      .filter((line) => /\$\{[^}]*(nickname|loserNick|startNick|wNick|lNick)\b/.test(line))
      .filter((line) => !/escapeHtml\s*\(/.test(line));
    expect(unescapedNicknameSinks).toEqual([]);
  });

  it('manages room onValue unsubscribe via RoomSubscriptionManager', () => {
    expect(html).toMatch(/roomSubManager\.replace\s*\(\s*onValue\s*\(/);
  });

  it('creates rooms via collision-checked createRoomSafely', () => {
    expect(html).toMatch(/createRoomSafely\s*\(/);
  });
});
