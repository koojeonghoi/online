import { describe, it, expect } from 'vitest';
import { inlineLocalModules } from '../../scripts/build-standalone.mjs';

describe('standalone inline bundler (file:// support)', () => {
  it('inlines local ./src/ ES modules in dependency order and keeps HTTPS CDN imports', () => {
    const files = new Map([
      [
        'src/utils/random.js',
        `export function shuffleArray(a) { return [...a]; }\nexport function generateShortId(p) { return p + '1'; }\n`
      ],
      [
        'src/games/baseball.js',
        `import { shuffleArray } from '../utils/random.js';\nexport function buildBaseballInitState(p) { return shuffleArray(p); }\n`
      ],
      [
        'src/utils/sanitize.js',
        `export function escapeHtml(v) { return String(v); }\nexport function escapeAttr(v) { return escapeHtml(v); }\n`
      ]
    ]);

    const templateHtml = `<!DOCTYPE html><html><body><script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
    import { escapeHtml, escapeAttr as __epEscapeAttr } from './src/utils/sanitize.js';
    import { buildBaseballInitState } from './src/games/baseball.js';
    console.log(initializeApp, __epEscapeAttr('a'), buildBaseballInitState([1]));
</script></body></html>`;

    const built = inlineLocalModules(templateHtml, (relPath) => files.get(relPath));

    expect(built).toContain('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js');
    expect(built).not.toMatch(/from\s+['"]\.\/src\//);
    expect(built).not.toMatch(/from\s+['"]\.\.\//);
    expect(built).toContain('function shuffleArray(a)');
    expect(built).toContain('function buildBaseballInitState(p)');
    expect(built).toContain('const __epEscapeAttr = escapeAttr;');
    // Dependency order: random.js must appear before baseball.js
    expect(built.indexOf('function shuffleArray')).toBeLessThan(
      built.indexOf('function buildBaseballInitState')
    );
  });
});
