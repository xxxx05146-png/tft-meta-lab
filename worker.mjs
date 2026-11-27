import { collect } from './sources.mjs';
import { browserAssets, seed } from './hosted-assets.mjs';

const refreshInterval = 120_000;
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

    try {
      const db = env.DB;
      const stored = await db.prepare('SELECT payload FROM meta_snapshot WHERE id = 1').first();
      const cached = stored?.payload ? JSON.parse(stored.payload) : seed;
      if (readOnly) return json(displaySnapshot(cached));

      const now = Date.now();
      const refreshAfter = now + refreshInterval;
      const lock = await db.prepare(`
        INSERT INTO meta_snapshot (id, refresh_after) VALUES (1, ?)
        ON CONFLICT (id) DO UPDATE SET refresh_after = excluded.refresh_after
        WHERE meta_snapshot.refresh_after <= ?
      `).bind(refreshAfter, now).run();
      if (!lock.meta.changes) return json(displaySnapshot(cached));

      const snapshot = await collect(cached, { dragonVersion: env.TFT_DDRAGON_VERSION });
      await db.prepare('UPDATE meta_snapshot SET payload = ? WHERE id = 1 AND refresh_after = ?')
        .bind(JSON.stringify(snapshot), refreshAfter).run();
      return json(displaySnapshot(snapshot));
    } catch (error) {
      console.error('Snapshot request failed:', error.message);
      if (readOnly) return json(displaySnapshot(seed));
      return json({ error: 'Cập nhật chưa thành công. Thử lại sau.' }, 502);
    }
  },
};
