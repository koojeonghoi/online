import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { describe, it, expect, vi } from 'vitest';

const swSource = fs.readFileSync(path.resolve(process.cwd(), 'sw.js'), 'utf8');

function createSwHarness({ fetchImpl, initialCache = {}, oldCacheKeys = [] } = {}) {
  const listeners = {};
  const cacheMap = new Map(Object.entries(initialCache));
  const deletedCaches = [];
  const addedAssets = [];
  const putCalls = [];

  const mockCache = {
    add: vi.fn(async (asset) => {
      if (asset === './fail-me') throw new Error('network error');
      addedAssets.push(asset);
      cacheMap.set(asset, { ok: true, url: asset });
    }),
    addAll: vi.fn(async (assets) => {
      for (const a of assets) {
        addedAssets.push(a);
        cacheMap.set(a, { ok: true, url: a });
      }
    }),
    put: vi.fn(async (req, res) => {
      putCalls.push({ url: req.url, res });
      cacheMap.set(req.url, res);
    })
  };

  const mockSelf = {
    location: { origin: 'https://party.example', href: 'https://party.example/sw.js' },
    skipWaiting: vi.fn(() => Promise.resolve()),
    clients: {
      claim: vi.fn(() => Promise.resolve()),
      matchAll: vi.fn(async () => [{ focus: vi.fn(() => Promise.resolve('focused')) }]),
      openWindow: vi.fn(() => Promise.resolve())
    },
    caches: {
      open: vi.fn(async () => mockCache),
      keys: vi.fn(async () => [...oldCacheKeys, 'party-games-shell-v3']),
      delete: vi.fn(async (k) => { deletedCaches.push(k); return true; }),
      match: vi.fn(async (req) => {
        const key = typeof req === 'string' ? req : req.url;
        return cacheMap.get(key) || null;
      })
    },
    fetch: fetchImpl || vi.fn(async () => ({ ok: true, clone() { return { ok: true, cloned: true }; } })),
    addEventListener(type, fn) {
      listeners[type] = fn;
    }
  };

  vm.runInNewContext(swSource, { self: mockSelf, URL, Promise, fetch: mockSelf.fetch });
  return { listeners, mockSelf, mockCache, deletedCaches, addedAssets, putCalls };
}

describe('Service Worker sw.js (Phase 4)', () => {
  it('installs resiliently even if one precache asset fails and activates by cleaning old caches', async () => {
    const h = createSwHarness({ oldCacheKeys: ['party-games-shell-v1', 'party-games-shell-v2', 'other-cache'] });
    // Force first cache.add call to fail to verify install does not abort completely
    h.mockCache.add.mockRejectedValueOnce(new Error('transient offline asset'));

    const waitPromises = [];
    h.listeners.install({ waitUntil: (p) => waitPromises.push(p) });
    await Promise.all(waitPromises);
    expect(h.mockSelf.skipWaiting).toHaveBeenCalledTimes(1);

    const activatePromises = [];
    h.listeners.activate({ waitUntil: (p) => activatePromises.push(p) });
    await Promise.all(activatePromises);
    expect(h.deletedCaches).toContain('party-games-shell-v1');
    expect(h.deletedCaches).toContain('party-games-shell-v2');
    expect(h.deletedCaches).not.toContain('other-cache');
    expect(h.mockSelf.clients.claim).toHaveBeenCalledTimes(1);
  });

  it('does NOT cache requests with query parameters (prevents ?_r= cache bloat)', async () => {
    const h = createSwHarness();
    let responsePromise;
    const waitPromises = [];
    h.listeners.fetch({
      request: { method: 'GET', url: 'https://party.example/index.html?_r=1700000000', mode: 'navigate' },
      respondWith: (p) => { responsePromise = p; },
      waitUntil: (p) => waitPromises.push(p)
    });

    await responsePromise;
    await Promise.all(waitPromises);
    expect(h.putCalls).toHaveLength(0);
  });

  it('caches clean same-origin GET responses and falls back to ./index.html when offline', async () => {
    const h = createSwHarness();
    let responsePromise;
    const waitPromises = [];
    h.listeners.fetch({
      request: { method: 'GET', url: 'https://party.example/src/utils/sanitize.js', mode: 'cors' },
      respondWith: (p) => { responsePromise = p; },
      waitUntil: (p) => waitPromises.push(p)
    });
    await responsePromise;
    await Promise.all(waitPromises);
    expect(h.putCalls).toHaveLength(1);

    const offlineHarness = createSwHarness({
      fetchImpl: vi.fn(() => Promise.reject(new Error('offline'))),
      initialCache: { './index.html': { ok: true, fallback: true } }
    });
    let fallbackPromise;
    offlineHarness.listeners.fetch({
      request: { method: 'GET', url: 'https://party.example/unknown-route', mode: 'navigate' },
      respondWith: (p) => { fallbackPromise = p; }
    });
    const res = await fallbackPromise;
    expect(res).toEqual({ ok: true, fallback: true });
  });

  it('closes notification and focuses existing client on notificationclick', async () => {
    const h = createSwHarness();
    const close = vi.fn();
    const waitPromises = [];
    h.listeners.notificationclick({
      notification: { close },
      waitUntil: (p) => waitPromises.push(p)
    });
    await Promise.all(waitPromises);
    expect(close).toHaveBeenCalledTimes(1);
    expect(h.mockSelf.clients.matchAll).toHaveBeenCalledTimes(1);
  });
});
