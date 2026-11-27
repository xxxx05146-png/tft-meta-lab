import { collect } from './sources.mjs';
import { browserAssets, seed } from './hosted-assets.mjs';

const refreshInterval = 120_000;
const cacheLifetime = 7 * 24 * 60 * 60;
const responseHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' https://ddragon.leagueoflegends.com",
};

function json(data, status = 200) {
  return Response.json(data, { status, headers: responseHeaders });
}

function displaySnapshot({ catalog, ...snapshot }) {
  return { ...snapshot, catalog: catalog ? { version: catalog.version, locale: catalog.locale } : null };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'GET' && Object.hasOwn(browserAssets, path)) {
      const [content, mime] = browserAssets[path];
      return new Response(content, { headers: { ...responseHeaders, 'Content-Type': mime } });
    }

    const readOnly = request.method === 'GET' && path === '/api/snapshot';
    const update = request.method === 'POST' && path === '/api/sync';
    if (!readOnly && !update) return json({ error: 'Không tìm thấy trang.' }, 404);
    if (update && request.headers.get('Origin') !== url.origin) {
      return json({ error: 'Mở dashboard để cập nhật dữ liệu.' }, 403);
    }

    const cache = globalThis.caches?.default;
    const key = new Request(new URL('/.meta-cache/snapshot-v1', url));
    const cooldownKey = new Request(new URL('/.meta-cache/refresh-v1', url));
    try {
      const cachedResponse = await cache?.match(key);
      const cached = cachedResponse ? await cachedResponse.json() : seed;
      if (readOnly || await cache?.match(cooldownKey)) return json(displaySnapshot(cached));

      await cache?.put(cooldownKey, new Response('refreshing', {
        headers: { 'Cache-Control': `max-age=${refreshInterval / 1000}` },
      }));
      const snapshot = await collect(cached, { dragonVersion: env?.TFT_DDRAGON_VERSION });
      await cache?.put(key, Response.json(snapshot, {
        headers: { 'Cache-Control': `max-age=${cacheLifetime}` },
      }));
      return json(displaySnapshot(snapshot));
    } catch (error) {
      console.error('Snapshot request failed:', error.message);
      return json({ error: 'Cập nhật chưa thành công. Thử lại sau.' }, 502);
    }
  },
};
