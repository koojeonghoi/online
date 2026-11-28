import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const htmlPath = path.resolve(process.cwd(), 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

describe('Phase 3 index.html game logic and cleanup integration', () => {
  it('imports baseball, rummikub, bingo, and random modules', () => {
    expect(html).toMatch(/from\s+['"]\.\/src\/games\/baseball\.js['"]/);
    expect(html).toMatch(/from\s+['"]\.\/src\/games\/rummikub\.js['"]/);
    expect(html).toMatch(/from\s+['"]\.\/src\/games\/bingo\.js['"]/);
    expect(html).toMatch(/from\s+['"]\.\/src\/utils\/random\.js['"]/);
  });

  it('uses drawRoundKey instead of targetShapeIndex for draw bot deduplication key', () => {
    expect(html).toContain('${currentRoomCode}_${data.drawRoundKey}_${botId}');
    expect(html).not.toContain('${currentRoomCode}_${data.targetShapeIndex}_${botId}');
  });

  it('uses runTransaction inside callBingoNumber', () => {
    const match = html.match(/window\.callBingoNumber\s*=\s*function[\s\S]*?\n    \};/);
    expect(match).toBeTruthy();
    expect(match[0]).toContain('runTransaction(');
    expect(match[0]).toContain('applyBingoCall(');
  });

  it('guards rummiPlaceSelected and rummiUndoTurn with canActOnRummiTurn', () => {
    const placeMatch = html.match(/window\.rummiPlaceSelected\s*=\s*function[\s\S]*?\n    \};/);
    const undoMatch = html.match(/window\.rummiUndoTurn\s*=\s*function[\s\S]*?\n    \};/);
    expect(placeMatch?.[0]).toContain('canActOnRummiTurn(');
    expect(undoMatch?.[0]).toContain('canActOnRummiTurn(');
  });

  it('removes biased Math.random() - 0.5 sorts and deprecated .substr() calls', () => {
    expect(html).not.toMatch(/\.sort\s*\(\s*\(\)\s*=>\s*Math\.random\(\)\s*-\s*0\.5\s*\)/);
    expect(html).not.toMatch(/\.substr\s*\(/);
  });
});
