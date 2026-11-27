import { coachRequest } from './coach.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readSnapshot, sync } from './sync.mjs';

const port = Number(process.env.PORT || 4173);
const assets = {
  '/': ['index.html', 'text/html'],
  '/styles.css': ['styles.css', 'text/css'],
  '/app.mjs': ['app.mjs', 'text/javascript'],
  '/analysis.mjs': ['analysis.mjs', 'text/javascript'],
};
const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
let lastSync = 0;
let currentSync;

function forDisplay({ catalog, ...snapshot }) {
  return { ...snapshot, catalog: catalog ? { version: catalog.version, locale: catalog.locale } : null };
}

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://ddragon.leagueoflegends.com https://cdn.metatft.com https://cmsassets.rgpub.io");
  if (!hosts.has(request.headers.host)) return json(response, 403, { error: 'Chỉ phục vụ trên localhost.' });
  const path = (request.url || '/').split('?')[0];
  try {
    if (request.method === 'POST' && ['/mcp','/api/study','/api/board'].includes(path)) {
      try {
        let body = '';
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 16384) return json(response,413,{error:'Yêu cầu quá dài.'});
        }
        return json(response,200,await coachRequest(path,request.method,JSON.parse(body),readSnapshot));
      } catch (e) { return json(response,400,{error:e.message}); }
    }
    if (request.method === 'GET' && path === '/api/snapshot') {
      return json(response, 200, forDisplay(await readSnapshot()));
    }
    if (request.method === 'POST' && path === '/api/sync') {
      if (request.headers.origin !== `http://${request.headers.host}`) {
        return json(response, 403, { error: 'Mở dashboard trên localhost để cập nhật.' });
      }
      if (!currentSync && Date.now() - lastSync < 120_000) {
        return json(response, 429, { error: 'Đã tải trong 2 phút vừa qua. Thử lại sau.' });
      }
      if (!currentSync) {
        lastSync = Date.now();
        currentSync = sync().finally(() => { currentSync = null; });
      }
      return json(response, 200, forDisplay(await currentSync));
    }
    const asset = assets[path];
    if (request.method !== 'GET' || !asset || !Object.hasOwn(assets, path)) {
      return json(response, 404, { error: 'Không tìm thấy trang.' });
    }
    const [name, mime] = asset;
    const content = await readFile(new URL(`./public/${name}`, import.meta.url));
    response.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` });
    response.end(content);
  } catch (error) {
    console.error(error);
    json(response, 500, { error: 'Không đọc được dữ liệu. Xem log ở cửa sổ chạy ứng dụng.' });
  }
});
server.listen(port, '127.0.0.1', () => console.log(`TFT Meta Lab · http://127.0.0.1:${port}`));
