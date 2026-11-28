import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { describe, it, expect } from 'vitest';

import { inlineLocalModules } from '../../scripts/build-standalone.mjs';

const root = process.cwd();
const templateHtml = fs.readFileSync(path.join(root, 'src', 'index.template.html'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

describe('Phase 4 PWA and overall integrity', () => {
  it('keeps standalone index.html in sync with src/index.template.html + src modules and precaches app shell in sw.js', () => {
    const expected = inlineLocalModules(templateHtml, (relPath) =>
      fs.readFileSync(path.join(root, relPath), 'utf8')
    );
    expect(html).toBe(expected);
    expect(sw).toContain("'./index.html'");
    expect(sw).toContain("'./manifest.json'");
    expect(sw).toContain("`${CACHE_PREFIX}v4`");
  });

  it('manifest.json includes valid metadata and both any and maskable icon purposes', () => {
    expect(manifest.start_url).toBe('./index.html');
    expect(manifest.icons.some((i) => i.purpose === 'any')).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('index.html inline ES module passes node --check syntax validation', () => {
    const modMatch = html.match(/<script\s+type="module">([\s\S]*?)<\/script>/i);
    expect(modMatch).toBeTruthy();
    const tmpFile = path.join(root, '.tmp-syntax-check.mjs');
    fs.writeFileSync(tmpFile, modMatch[1], 'utf8');
    try {
      execFileSync(process.execPath, ['--check', tmpFile], { stdio: 'pipe' });
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
