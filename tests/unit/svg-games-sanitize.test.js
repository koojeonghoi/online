import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../../src/utils/sanitize.js';

describe('SVG rendering preservation for Ladder and Yutnori with XSS safety', () => {
  it('preserves Ladder game SVG lines, paths, and text labels', () => {
    const ladderSvg =
      '<svg width="100%" height="260" viewBox="0 0 180 260" preserveAspectRatio="none">' +
      '<line x1="30" y1="16" x2="30" y2="230" stroke="#3A3A42" stroke-width="3" />' +
      '<path d="M 30 16 L 30 30 L 90 30" fill="none" style="stroke:var(--primary-color); stroke-width:4;" />' +
      '<text x="30" y="252" font-size="16" text-anchor="middle">❓</text>' +
      '</svg>';

    const clean = sanitizeHtml(ladderSvg);
    expect(clean).toContain('<svg');
    expect(clean).toContain('<line');
    expect(clean).toContain('<path');
    expect(clean).toContain('<text');
  });

  it('preserves Yutnori board SVG grid and diagonal shortcut lines', () => {
    const yutBoard =
      '<svg class="yut-lines" viewBox="0 0 100 100">' +
      '<path d="M92 92 L92 8 L8 8 L8 92 L92 92" fill="none" stroke="#3A3A42" stroke-width="1.6"/>' +
      '<path d="M92 8 L8 92" fill="none" stroke="#3A3A42" stroke-width="1.6"/>' +
      '<path d="M8 8 L92 92" fill="none" stroke="#3A3A42" stroke-width="1.6"/>' +
      '</svg>' +
      '<div class="yut-node big" style="left:92%;top:92%;">🏁</div>';

    const clean = sanitizeHtml(yutBoard);
    expect(clean).toContain('<svg');
    expect(clean).toContain('class="yut-lines"');
    expect(clean).toContain('M92 92 L92 8 L8 8 L8 92 L92 92');
    expect(clean).toContain('M92 8 L8 92');
    expect(clean).toContain('M8 8 L92 92');
  });

  it('still neutralizes XSS payloads embedded inside SVG tags', () => {
    const evilSvg =
      '<svg onload="alert(1)"><script>alert(2)</script>' +
      '<foreignObject><div>evil</div></foreignObject>' +
      '<animate onbegin="alert(3)" attributeName="x" />' +
      '<a xlink:href="javascript:alert(4)"><text>bad</text></a></svg>';

    const clean = sanitizeHtml(evilSvg);
    expect(clean).not.toMatch(/onload|onbegin|javascript:|<script|<foreignobject|<animate/i);
  });
});
