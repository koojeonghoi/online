import { describe, it, expect } from 'vitest';
import { isBadUrl, isSafeImageDataUrl, sanitizeHtml } from '../../src/utils/sanitize.js';
import { inlineLocalModules } from '../../scripts/build-standalone.mjs';

describe('ECC code-review security fixes (SVG data URL & image validation)', () => {
  it('blocks data:image/svg+xml in isBadUrl and sanitizeHtml while allowing raster PNG/JPEG/WEBP/GIF', () => {
    expect(isBadUrl('data:image/svg+xml,<svg onload=alert(1)>')).toBe(true);
    expect(isBadUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(true);
    expect(isBadUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isBadUrl('data:image/jpeg;base64,AAAA')).toBe(false);

    const cleaned = sanitizeHtml('<a href="data:image/svg+xml,<svg onload=alert(1)>">click</a>');
    expect(cleaned).not.toContain('data:image/svg+xml');
  });

  it('isSafeImageDataUrl accepts only base64 raster data URLs and rejects external/script/svg URLs', () => {
    expect(isSafeImageDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isSafeImageDataUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
    expect(isSafeImageDataUrl('data:image/webp;base64,UklGRg==')).toBe(true);
    expect(isSafeImageDataUrl('data:image/gif;base64,R0lGODlh')).toBe(true);

    expect(isSafeImageDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isSafeImageDataUrl('https://evil.test/tracker.png')).toBe(false);
    expect(isSafeImageDataUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageDataUrl('')).toBe(false);
    expect(isSafeImageDataUrl(null)).toBe(false);
  });
});

describe('ECC build-fix bundler hardening (scripts/build-standalone.mjs)', () => {
  it('preserves literal $&, $\', $`, and $$ tokens in bundled modules without replace() corruption', () => {
    const files = new Map([
      ['src/a.js', "export const pattern = '$& $\\' $` $$';\n"]
    ]);
    const tpl = `<!DOCTYPE html><script type="module">\n    import { pattern } from './src/a.js';\n    console.log(pattern);\n</script>`;
    const built = inlineLocalModules(tpl, (p) => files.get(p));
    expect(built).toContain("const pattern = '$& $\\' $` $$';");
  });

  it('fails fast with a clear build error on circular dependencies', () => {
    const files = new Map([
      ['src/a.js', "import { b } from './b.js';\nexport const a = () => b();\n"],
      ['src/b.js', "import { a } from './a.js';\nexport const b = () => a();\n"]
    ]);
    const tpl = `<script type="module">\n    import { a } from './src/a.js';\n</script>`;
    expect(() => inlineLocalModules(tpl, (p) => files.get(p))).toThrow(/circular/i);
  });

  it('fails fast with a clear build error when an imported symbol is not exported', () => {
    const files = new Map([
      ['src/a.js', 'export function realFn() { return 1; }\n']
    ]);
    const tpl = `<script type="module">\n    import { missingFn } from './src/a.js';\n</script>`;
    expect(() => inlineLocalModules(tpl, (p) => files.get(p))).toThrow(/missingFn/);
  });

  it('fails fast with a clear build error on top-level symbol collision across bundled modules', () => {
    const files = new Map([
      ['src/a.js', 'const helper = 1;\nexport function fa() { return helper; }\n'],
      ['src/b.js', 'const helper = 2;\nexport function fb() { return helper; }\n']
    ]);
    const tpl = `<script type="module">\n    import { fa } from './src/a.js';\n    import { fb } from './src/b.js';\n</script>`;
    expect(() => inlineLocalModules(tpl, (p) => files.get(p))).toThrow(/collision|helper/i);
  });
});
