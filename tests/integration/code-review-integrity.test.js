import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const root = process.cwd();
const templateHtml = fs.readFileSync(path.join(root, 'src', 'index.template.html'), 'utf8');

describe('ECC code-review template integrity checks', () => {
  it('escapes nickHtml and user-typed sketch guesses in pour, halli, yut, thief, and sketch games', () => {
    // All 5 frame renderers must use escapeHtml-backed nickHtml for innerHTML interpolations
    expect(templateHtml).toContain("const nickHtml = (id) => escapeHtml(nick(id));");
    expect(templateHtml).toContain("list.slice(-8).map(escapeHtml).join(' · ')");
    expect(templateHtml).toContain('escapeHtml(d.sketchCategory)');
    expect(templateHtml).toContain('escapeHtml(shownWord)');
  });

  it('validates draw image URLs with isSafeImageDataUrl in openImageModal and draw thumbnails', () => {
    expect(templateHtml).toMatch(/if\s*\(\s*!isSafeImageDataUrl\s*\(\s*imgData\s*\)\s*\)\s*return/);
    expect(templateHtml).toContain('isSafeImageDataUrl(s.img)');
  });

  it('binds login controls BEFORE invoking onDomReady so auto-restore click never misses its listener', () => {
    const bindIdx = templateHtml.indexOf('bindLoginControls({');
    const domReadyIdx = templateHtml.indexOf('onDomReady(() => {');
    expect(bindIdx).toBeGreaterThan(0);
    expect(domReadyIdx).toBeGreaterThan(0);
    expect(bindIdx).toBeLessThan(domReadyIdx);
  });
});
