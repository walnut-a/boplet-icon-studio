import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createStudio } from '../core/studio.js';
import { CONTRACT_VERSION, FORMAT_VERSION, SCHEMA_REVISION } from '../contracts/models.js';

const media = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
export async function startServer({ storage, sources, skill, appDirectory, buildId = null, updateSource = null, updateCache = null, port = 0, requireUI = false } = {}) {
  const sessions = new Map();
  const makeSession = () => {
    const token = crypto.randomUUID() + crypto.randomUUID();
    const studio = createStudio({ storage, sources, skill, updateSource, updateCache, requireUI, transport: 'local_http' }); sessions.set(token, studio); return { token, studio };
  };
  const initial = makeSession();
  const server = createServer(async (request, response) => {
    const send = (status, body, type = 'application/json') => { response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'" }); response.end(typeof body === 'string' ? body : JSON.stringify(body)); };
    const host = `127.0.0.1:${server.address().port}`;
    if (request.headers.host !== host || (request.headers.origin && request.headers.origin !== `http://${host}`) || request.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'Origin/Host rejected' });
    const url = new URL(request.url, `http://${host}`);
    try {
      if (request.method === 'GET' && url.pathname === '/health') return send(200, { product: 'icon-studio', version: skill?.version ?? null, buildId,
        contractVersion: CONTRACT_VERSION, formatVersion: FORMAT_VERSION, schemaRevision: SCHEMA_REVISION, ready: true });
      if (request.method === 'POST' && url.pathname === '/bootstrap') {
        if (request.headers.origin !== `http://${host}`) return send(403, { error: 'Same-origin page required' });
        // Only the bound local container receives this session. Tokens never enter URLs.
        const chosen = url.searchParams.get('session');
        let session = initial;
        if (chosen) { const found = [...sessions].find(([, s]) => s.sessionId === chosen); if (!found) return send(404, { error: 'Session not found' }); session = { token: found[0], studio: found[1] }; }
        session.studio.attachUI();
        return send(200, { token: session.token, version: skill?.version ?? null, buildId, contractVersion: CONTRACT_VERSION, formatVersion: FORMAT_VERSION, schemaRevision: SCHEMA_REVISION });
      }
      if (request.method === 'POST' && ['/operation', '/sessions'].includes(url.pathname)) {
        const token = request.headers.authorization?.replace(/^Bearer /, ''); const studio = sessions.get(token);
        if (!studio) return send(401, { error: 'Session credentials required' });
        if (!request.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'JSON required' });
        let size = 0, chunks = [];
        for await (const chunk of request) { size += chunk.length; if (size > 2 * 1024 * 1024) { send(413, { error: 'Request too large' }); return; } chunks.push(chunk); }
        let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: 'Invalid JSON' }); }
        if (url.pathname === '/sessions') {
          if (studio.revoked) return send(403, { error: 'Session revoked' });
          if (sessions.size >= 100) return send(429, { error: 'Session limit reached' });
          const created = makeSession(); const info = await created.studio.execute('get_session', {});
          return send(200, { token: created.token, sessionId: info.data.sessionId });
        }
        if (typeof body.name !== 'string' || !body.input || Object.keys(body).some(k => !['name', 'input'].includes(k))) return send(400, { error: 'Operation envelope required' });
        return send(200, await studio.execute(body.name, body.input));
      }
      if (request.method === 'GET' && appDirectory && ['/', '/index.html', '/app.js', '/style.css'].includes(url.pathname)) {
        const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        return send(200, await readFile(join(appDirectory, file), 'utf8'), media[file.slice(file.lastIndexOf('.'))]);
      }
      send(404, { error: 'Not found' });
    } catch { if (!response.headersSent) send(500, { error: 'Request failed; no success confirmed' }); }
  });
  server.requestTimeout = 35000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, token: initial.token,
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
