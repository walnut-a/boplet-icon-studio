import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateChecker } from '../../src/core/updates.js';
const manifest = { skillId: 'make-product-icons', version: '1.1.0', publishedAt: '2026-09-08T00:00:00.000Z', notes: '新版本', downloadUrl: 'https://example.test/skill.zip', sha256: 'a'.repeat(64), contractVersion: 3, formatVersion: 3 };
test('固定发布源、24小时缓存、去重提醒、未知版本及离线不假报最新', async () => {
  let now = 0, requests = 0; const events = [];
  const checker = createUpdateChecker({ currentVersion: '1.0.0', source: 'https://example.test/release.json', clock: () => now,
    fetcher: async url => { assert.equal(url, 'https://example.test/release.json'); requests++; return { ok: true, json: async () => manifest }; }, notify: x => events.push(x) });
  assert.equal((await checker.check()).status, 'update_available');
  await checker.check(); assert.equal(requests, 1);
  await checker.check(true); assert.equal(events.length, 1);
  now += 86400001; await checker.check(); assert.equal(requests, 3);
  const unknown = createUpdateChecker({ source: 'https://example.test/release.json', fetcher: async () => ({ ok: true, json: async () => manifest }) });
  assert.equal((await unknown.check()).status, 'unknown');
  const offline = createUpdateChecker({ currentVersion: '1.0.0', source: 'https://example.test/release.json', fetcher: async () => { throw Error('offline'); } });
  assert.equal((await offline.check()).status, 'check_failed');
  assert.equal((await createUpdateChecker().check()).status, 'unknown');
});
test('隔离配置缓存跨会话复用，失效清单不能假报更新', async () => {
  let saved, requests = 0; const config = { readJson: async () => saved, writeJson: async (_, value) => { saved = structuredClone(value); } };
  const args = { currentVersion: '1.0.0', source: 'https://example.test/release.json', cache: config, fetcher: async () => { requests++; return { ok: true, json: async () => manifest }; } };
  await createUpdateChecker(args).check();
  assert.equal((await createUpdateChecker(args).check()).status, 'update_available');
  assert.equal(requests, 1);
  const invalid = createUpdateChecker({ ...args, cache: null, fetcher: async () => ({ ok: true, json: async () => ({ ...manifest, downloadUrl: 'https://untrusted.test/install' }) }) });
  assert.equal((await invalid.check()).status, 'check_failed');
});
