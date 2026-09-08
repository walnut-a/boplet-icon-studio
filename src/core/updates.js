import { assertSchema, object, text } from '../contracts/schema.js';

const day = 86400000;
const manifestSchema = object({ skillId: { const: 'make-product-icons' }, version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+(?:-[a-zA-Z0-9.-]+)?$' }, publishedAt: { type: 'string', format: 'studio-time' }, notes: text,
  downloadUrl: { type: 'string', pattern: '^https://[^\\s]+$' }, sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, contractVersion: { type: 'integer', minimum: 1 }, formatVersion: { type: 'integer', minimum: 1 } });
function newer(a, b) { const x = a.split('-')[0].split('.').map(Number), y = b.split('-')[0].split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return !a.includes('-') && b.includes('-'); }
export function createUpdateChecker({ currentVersion = null, source = null, cache = null, fetcher = globalThis.fetch, clock = Date.now, notify = () => {} } = {}) {
  let pending = null, successfulAt = null, attemptedAt = null;
  const notified = new Set();
  let state = { status: 'unknown', currentVersion, versionSource: currentVersion ? 'skill_session' : 'unknown', latestVersion: null, checkedAt: null, release: null, incompatible: false, message: source ? null : '未配置官方发布源。' };
  const get = () => ({ ...structuredClone(state), cacheExpired: successfulAt === null || clock() - successfulAt >= day });
  const loaded = (async () => {
    if (!cache || !source) return;
    try {
      const saved = await cache.readJson('skill-update.json');
      if (saved.source !== source || saved.currentVersion !== currentVersion || !Number.isFinite(saved.successfulAt) || saved.successfulAt > clock()) return;
      assertSchema(manifestSchema, saved.release);
      if (new URL(saved.release.downloadUrl).origin !== new URL(source).origin) return;
      successfulAt = saved.successfulAt;
      state = { ...state, status: !currentVersion ? 'unknown' : newer(saved.release.version, currentVersion) ? 'update_available' : 'up_to_date', latestVersion: saved.release.version, checkedAt: new Date(successfulAt).toISOString(), release: saved.release, incompatible: saved.release.formatVersion !== 3 || saved.release.contractVersion !== 3 };
      if (saved.notifiedVersion) notified.add(saved.notifiedVersion);
    } catch { /* Invalid cache is ignored; it is never a project document. */ }
  })();
  async function check(force = false) {
    await loaded;
    if (pending) return pending;
    if (!force && successfulAt !== null && clock() - successfulAt < day) return get();
    if (!source) return get();
    state.status = 'checking'; attemptedAt = clock();
    pending = (async () => {
      try {
        const url = new URL(source); if (url.protocol !== 'https:') throw Error();
        const response = await fetcher(url.href, { signal: AbortSignal.timeout(5000), redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!response.ok) throw Error(); const release = assertSchema(manifestSchema, await response.json());
        if (new URL(release.downloadUrl).origin !== url.origin) throw Error();
        const status = !currentVersion ? 'unknown' : newer(release.version, currentVersion) ? 'update_available' : 'up_to_date';
        state = { ...state, status, latestVersion: release.version, checkedAt: new Date(clock()).toISOString(), release, incompatible: release.formatVersion !== 3 || release.contractVersion !== 3, message: release.formatVersion !== 3 ? '旧项目不转换，需重新创建。' : null };
        successfulAt = clock();
        if (status === 'update_available' && !notified.has(release.version)) { notified.add(release.version); notify({ type: 'skill_update', version: release.version }); }
        if (cache) await cache.writeJson('skill-update.json', { source, currentVersion, successfulAt, release, notifiedVersion: notified.has(release.version) ? release.version : null }).catch(() => {});
      } catch { state = { ...state, status: 'check_failed', checkedAt: new Date(clock()).toISOString(), message: '更新检查失败，不影响本地工作。' }; }
      return get();
    })();
    try { return await pending; } finally { pending = null; }
  }
  function trigger() { if (source && get().cacheExpired && (attemptedAt === null || clock() - attemptedAt >= day)) void check(); }
  return { get, check, trigger };
}
