import { assertSchema, object, text } from '../contracts/schema.js';

const day = 86400000;
const numeric = '(?:0|[1-9][0-9]*)';
const identifier = `(?:${numeric}|[0-9]*[A-Za-z-][0-9A-Za-z-]*)`;
const versionPattern = `^(${numeric})\\.(${numeric})\\.(${numeric})(?:-(${identifier}(?:\\.${identifier})*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`;
const versionRegex = new RegExp(versionPattern);
const manifestSchema = object({ skillId: { const: 'make-product-icons' }, version: { type: 'string', pattern: versionPattern }, publishedAt: { type: 'string', format: 'studio-time' }, notes: text,
  downloadUrl: { type: 'string', pattern: '^https://[^\\s]+$' }, sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, contractVersion: { type: 'integer', minimum: 1 }, formatVersion: { type: 'integer', minimum: 1 } });
// SemVer 2.0.0 §11: numeric identifiers compare numerically, build metadata is ignored.
function newer(a, b) {
  const x = versionRegex.exec(a), y = versionRegex.exec(b);
  for (let i = 1; i <= 3; i++) if (x[i] !== y[i]) return BigInt(x[i]) > BigInt(y[i]);
  if (!x[4] || !y[4]) return Boolean(!x[4] && y[4]);
  const left = x[4].split('.'), right = y[4].split('.');
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] === right[i]) continue;
    const aNumeric = /^[0-9]+$/.test(left[i]), bNumeric = /^[0-9]+$/.test(right[i]);
    if (aNumeric && bNumeric) return BigInt(left[i]) > BigInt(right[i]);
    if (aNumeric !== bNumeric) return !aNumeric;
    return left[i] > right[i];
  }
  return left.length > right.length;
}
export function createUpdateChecker({ currentVersion = null, source = null, cache = null, fetcher = globalThis.fetch, clock = Date.now, notify = () => {} } = {}) {
  const knownVersion = typeof currentVersion === 'string' && versionRegex.test(currentVersion);
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
      state = { ...state, status: !knownVersion ? 'unknown' : newer(saved.release.version, currentVersion) ? 'update_available' : 'up_to_date', latestVersion: saved.release.version, checkedAt: new Date(successfulAt).toISOString(), release: saved.release, incompatible: saved.release.formatVersion !== 3 || saved.release.contractVersion !== 3 };
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
        const status = !knownVersion ? 'unknown' : newer(release.version, currentVersion) ? 'update_available' : 'up_to_date';
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
