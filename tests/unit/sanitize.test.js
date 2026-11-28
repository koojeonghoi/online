import { describe, it, expect, vi } from 'vitest';
import {
  escapeHtml,
  escapeAttr,
  sanitizeHtml,
  createClickDelegate,
  ALLOWED_DELEGATE_FNS
} from '../../src/utils/sanitize.js';

describe('sanitize utilities (Phase 1 security)', () => {
  it('escapeHtml escapes HTML metacharacters and handles nullish values', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;'
    );
    expect(escapeHtml(`"Bob" & 'Alice'`)).toBe('&quot;Bob&quot; &amp; &#39;Alice&#39;');
  });

  it('escapeAttr escapes attribute characters cleanly', () => {
    expect(escapeAttr('["a","<b>"]')).toBe('[&quot;a&quot;,&quot;&lt;b&gt;&quot;]');
  });

  it('sanitizeHtml strips dangerous tags including style, svg, script, iframe, form, meta, base, link', () => {
    const dirty =
      '<style>body{display:none}</style><svg onload="alert(1)"></svg>' +
      '<script>alert(1)</script><iframe src="https://evil.test"></iframe>' +
      '<form action="javascript:alert(1)"><input></form><base href="https://evil.test">' +
      '<span>safe</span>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toMatch(/<style|<svg|<script|<iframe|<form|<base/i);
    expect(clean).toContain('<span>safe</span>');
  });

  it('sanitizeHtml strips inline event handlers and unsafe URLs while allowing safe data:image', () => {
    const dirty =
      '<a href="javascript:alert(1)" onclick="steal()">link</a>' +
      '<img src="data:image/png;base64,AAAA" onerror="bad()">' +
      '<img src="data:text/html,<script>alert(1)</script>">';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toMatch(/javascript:|onclick|onerror|data:text\/html/i);
    expect(clean).toContain('data:image/png;base64,AAAA');
  });

  it('sanitizeHtml removes non-allowlisted data-ep-onclick-fn gadget attributes', () => {
    const malicious =
      '<span data-ep-onclick-fn="confirmLeaveRoom" data-ep-onclick-args="[]">Click me</span>' +
      '<span data-ep-onclick-fn="kickPlayer" data-ep-onclick-args="[&quot;host&quot;]">Kick</span>';
    const clean = sanitizeHtml(malicious);
    expect(clean).not.toContain('data-ep-onclick-fn');
    expect(clean).not.toContain('data-ep-onclick-args');
    expect(clean).toContain('Click me');
  });

  it('sanitizeHtml preserves allowlisted data-ep-onclick-fn attributes for legitimate UI controls', () => {
    const legit =
      '<button data-ep-onclick-fn="changeDutchStatus" data-ep-onclick-args="[&quot;u1&quot;,true]">확인</button>';
    const clean = sanitizeHtml(legit);
    expect(clean).toContain('data-ep-onclick-fn="changeDutchStatus"');
    expect(clean).toContain('data-ep-onclick-args');
  });

  it('createClickDelegate invokes only allowlisted functions and blocks arbitrary window gadgets', () => {
    const allowedSpy = vi.fn();
    const evilSpy = vi.fn();
    const mockWin = {
      changeDutchStatus: allowedSpy,
      confirmLeaveRoom: evilSpy
    };
    const handler = createClickDelegate(mockWin, ALLOWED_DELEGATE_FNS);

    const legitBtn = document.createElement('button');
    legitBtn.setAttribute('data-ep-onclick-fn', 'changeDutchStatus');
    legitBtn.setAttribute('data-ep-onclick-args', JSON.stringify(['p1', true]));
    document.body.appendChild(legitBtn);

    handler({ target: legitBtn });
    expect(allowedSpy).toHaveBeenCalledTimes(1);
    expect(allowedSpy).toHaveBeenCalledWith('p1', true);

    const attackEl = document.createElement('span');
    attackEl.setAttribute('data-ep-onclick-fn', 'confirmLeaveRoom');
    attackEl.setAttribute('data-ep-onclick-args', '[]');
    document.body.appendChild(attackEl);

    handler({ target: attackEl });
    expect(evilSpy).not.toHaveBeenCalled();

    legitBtn.remove();
    attackEl.remove();
  });

  it('createClickDelegate ignores prototype pollution paths and invalid JSON args', () => {
    const spy = vi.fn();
    const handler = createClickDelegate({ openImageModal: spy }, ALLOWED_DELEGATE_FNS);

    const protoEl = document.createElement('div');
    protoEl.setAttribute('data-ep-onclick-fn', '__proto__.toString');
    document.body.appendChild(protoEl);
    expect(() => handler({ target: protoEl })).not.toThrow();

    const badArgsEl = document.createElement('div');
    badArgsEl.setAttribute('data-ep-onclick-fn', 'openImageModal');
    badArgsEl.setAttribute('data-ep-onclick-args', '{invalid-json');
    document.body.appendChild(badArgsEl);
    handler({ target: badArgsEl });
    expect(spy).not.toHaveBeenCalled();

    protoEl.remove();
    badArgsEl.remove();
  });
});
