import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { NodeStorage, defaultLibraryPath } from '../storage/node.js';
import { startServer } from './server.js';
import { hash } from '../core/documents.js';

export const defaultConfigPath = () => process.platform === 'win32'
  ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Icon Studio')
  : join(homedir(), 'Library', 'Application Support', 'Icon Studio');
const optional = async (storage, path) => { try { return await storage.readJson(path); } catch (e) { if (e.code === 'TARGET_NOT_FOUND') return null; throw e; } };

/** Host utility, not a business CLI. No old-project detection, migration or foreign process cleanup. */
export async function launch({ root, configDirectory = defaultConfigPath(), appDirectory, buildId = null, skill, sources, updateSource = null } = {}) {
  const config = await NodeStorage.open(configDirectory, { create: true });
  const preference = await optional(config, 'preferences.json');
  const directory = resolve(root ?? preference?.root ?? defaultLibraryPath());
  // This is called only after the host has presented and obtained the user's directory choice.
  const storage = await NodeStorage.open(directory, { create: true });
  const key = (await hash({ directory, sources: sources?.identity ?? null, version: skill?.version ?? null, buildId, appDirectory: appDirectory ? resolve(appDirectory) : null })).slice(7);
  const recordPath = `instances/${key}.json`;
  const existing = await optional(config, recordPath);
  if (existing?.root === directory && /^http:\/\/127\.0\.0\.1:\d+$/.test(existing.url)) {
    try {
      const health = await fetch(`${existing.url}/health`, { signal: AbortSignal.timeout(1500), redirect: 'error' }).then(r => r.json());
      if (health.product === 'icon-studio' && health.version === skill?.version && health.buildId === buildId) {
        const response = await fetch(`${existing.url}/operation`, { method: 'POST', signal: AbortSignal.timeout(1500), headers: { Authorization: `Bearer ${existing.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'get_session', input: {} }) });
        const session = await response.json();
        if (session.ok && !session.data.revoked && session.data.sessionId === existing.sessionId) return { ...existing, reused: true, close: async () => {} };
      }
    } catch { /* A stale record is not permission to stop another listener. */ }
  }
  const server = await startServer({ storage, sources, skill, appDirectory, buildId, updateSource, updateCache: config });
  const invoke = async (name, input) => fetch(`${server.url}/operation`, { method: 'POST', headers: { Authorization: `Bearer ${server.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, input }) }).then(r => r.json());
  try {
    const connected = await invoke('connect_library', { create: true, requestId: crypto.randomUUID() });
    if (!connected.ok) throw Error(connected.error.message);
    const session = await invoke('get_session', {});
    const record = { root: directory, url: server.url, token: server.token, sessionId: session.data.sessionId, pid: process.pid, version: skill?.version ?? null, buildId };
    await config.writeJson(recordPath, record); await config.writeJson('preferences.json', { root: directory });
    let closed = false;
    return { ...record, reused: false, close: async () => { if (!closed) { closed = true; await server.close(); } } };
  } catch (e) { await server.close(); throw e; }
}
