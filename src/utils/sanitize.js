export const ALLOWED_DELEGATE_FNS = Object.freeze(
  new Set([
    'openImageModal',
    'changeDutchStatus',
    'rummiAppendToGroup',
    'rummiToggleTile',
    'bbPickZone',
    'bbPickOpt'
  ])
);

const BAD_TAG_RE = /^(script|iframe|object|embed|style|math|form|base|meta|link|foreignobject|animate|animatetransform|animatemotion|set|feimage|use)$/i;
const BAD_TAG_BLOCK_RE = /<\s*(script|iframe|object|embed|style|math|form|foreignobject|animate|animatetransform|animatemotion|set)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const BAD_TAG_SINGLE_RE = /<\s*\/?\s*(script|iframe|object|embed|style|math|form|base|meta|link|foreignobject|animate|animatetransform|animatemotion|set|feimage|use)\b[^>]*\/?>/gi;
const URL_ATTRS = Object.freeze({
  href: 1,
  src: 1,
  'xlink:href': 1,
  action: 1,
  formaction: 1,
  poster: 1,
  data: 1
});

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(value) {
  return escapeHtml(value);
}

export function isBadUrl(val) {
  const norm = String(val == null ? '' : val)
    .replace(/[\u0000-\u0020]+/g, '')
    .toLowerCase();
  if (norm.startsWith('javascript:') || norm.startsWith('vbscript:')) return true;
  if (norm.startsWith('data:') && !norm.startsWith('data:image/')) return true;
  return false;
}

function normalizeDelegateFnName(raw) {
  if (!raw) return '';
  return String(raw).trim().replace(/^window\./, '');
}

function stripDangerousWithRegex(input, allowDelegateAttrs, allowedFns) {
  let out = String(input == null ? '' : input)
    .replace(BAD_TAG_BLOCK_RE, '')
    .replace(BAD_TAG_SINGLE_RE, '')
    .replace(/\s+(?:on[a-z]+|srcdoc)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(
      /\s+(href|src|xlink:href|action|formaction|poster|data)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      (m, _attr, dq, sq, uq) => {
        const val = dq != null ? dq : sq != null ? sq : uq;
        return isBadUrl(val) ? '' : m;
      }
    );

  if (!allowDelegateAttrs) {
    out = out.replace(
      /\s+data-ep-onclick-(?:fn|args)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
      ''
    );
  } else {
    out = out.replace(
      /\s+data-ep-onclick-fn\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      (m, dq, sq, uq) => {
        const fnName = normalizeDelegateFnName(dq != null ? dq : sq != null ? sq : uq);
        return allowedFns.has(fnName) ? m : '';
      }
    );
  }
  return out;
}

function cleanElementTree(root, allowDelegateAttrs, allowedFns) {
  const nodes = Array.from(root.childNodes || []);
  for (const node of nodes) {
    if (!node || node.nodeType !== 1) continue;
    const tag = String(node.tagName || '').toLowerCase();
    if (BAD_TAG_RE.test(tag)) {
      if (node.parentNode) node.parentNode.removeChild(node);
      continue;
    }

    const rawFn = node.getAttribute('data-ep-onclick-fn');
    const normalizedFn = normalizeDelegateFnName(rawFn);
    const delegateAllowed = allowDelegateAttrs && allowedFns.has(normalizedFn);
    if (!delegateAllowed) {
      node.removeAttribute('data-ep-onclick-fn');
      node.removeAttribute('data-ep-onclick-args');
    }

    const attrs = Array.from(node.attributes || []);
    for (const attr of attrs) {
      const name = String(attr.name || '').toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc') {
        node.removeAttribute(attr.name);
      } else if (Object.prototype.hasOwnProperty.call(URL_ATTRS, name) && isBadUrl(attr.value)) {
        node.removeAttribute(attr.name);
      }
    }

    if (tag === 'template' && node.content) {
      cleanElementTree(node.content, allowDelegateAttrs, allowedFns);
    }
    cleanElementTree(node, allowDelegateAttrs, allowedFns);
  }
}

export function sanitizeHtml(html, options = {}) {
  if (html == null) return '';
  const allowDelegateAttrs = options.allowDelegateAttrs !== false;
  const allowedFns = options.allowedFns || ALLOWED_DELEGATE_FNS;
  const preCleaned = stripDangerousWithRegex(html, allowDelegateAttrs, allowedFns);

  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(preCleaned, 'text/html');
      if (doc && doc.body) {
        cleanElementTree(doc.body, allowDelegateAttrs, allowedFns);
        return doc.body.innerHTML;
      }
    } catch {
      // Fall back to regex-cleaned output
    }
  }
  return preCleaned;
}

function isBlockedKey(key) {
  return !key || key === '__proto__' || key === 'constructor' || key === 'prototype';
}

export function createClickDelegate(rootWindow, allowedFns = ALLOWED_DELEGATE_FNS) {
  return function handleDelegatedClick(event) {
    let base = event && event.target;
    if (base && base.nodeType === 3) base = base.parentElement;
    const el = base && typeof base.closest === 'function' ? base.closest('[data-ep-onclick-fn]') : null;
    if (!el) return;

    const fnName = normalizeDelegateFnName(el.getAttribute('data-ep-onclick-fn'));
    if (!fnName || isBlockedKey(fnName) || fnName.includes('.') || !allowedFns.has(fnName)) {
      return;
    }

    const ctx = rootWindow || (typeof window !== 'undefined' ? window : globalThis);
    if (!ctx || !Object.prototype.hasOwnProperty.call(ctx, fnName)) return;
    const fn = ctx[fnName];
    if (typeof fn !== 'function') return;

    let args = [];
    const rawArgs = el.getAttribute('data-ep-onclick-args');
    if (rawArgs) {
      try {
        const parsed = JSON.parse(rawArgs);
        if (!Array.isArray(parsed)) return;
        args = parsed;
      } catch {
        return;
      }
    }
    fn.apply(ctx, args);
  };
}

export function initClickDelegate(doc = document, win = window, allowedFns = ALLOWED_DELEGATE_FNS) {
  if (!doc || typeof doc.addEventListener !== 'function' || doc.__epOnclickBound) return;
  doc.__epOnclickBound = true;
  doc.addEventListener('click', createClickDelegate(win, allowedFns));
}
