import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateChecker } from '../../src/core/updates.js';
const manifest = { skillId: 'make-product-icons', version: '1.1.0', publishedAt: '2026-09-08T00:00:00.000Z', notes: '新版本', downloadUrl: 'https://example.test/skill.zip', sha256: 'a'.repeat(64), contractVersion: 3, formatVersion: 3 };
test('预发布版本按数字和标识顺序比较，不漏报、不倒退，构建元数据不改变优先级', async () => {
  const ascending = ['0.1.0-alpha', '0.1.0-alpha.1', '0.1.0-alpha.beta', '0.1.0-beta', '0.1.0-beta.2', '0.1.0-beta.11', '0.1.0-dev.1', '0.1.0-dev.2', '0.1.0-dev.10', '0.1.0-rc.1', '0.1.0'];
  const cases = ascending.slice(1).flatMap((next, index) => [[ascending[index], next, 'update_available'], [next, ascending[index], 'up_to_date']]);
  cases.push(['0.1.0-dev.2', '0.1.0-dev.2', 'up_to_date'], ['0.1.0-dev.2+build.1', '0.1.0-dev.2+build.2', 'up_to_date'], ['0.1.0-dev.9007199254740992', '0.1.0-dev.9007199254740993', 'update_available']);
  for (const [currentVersion, version, expected] of cases) {
    const checker = createUpdateChecker({ currentVersion, source: 'https://example.test/release.json', fetcher: async () => ({ ok: true, json: async () => ({ ...manifest, version }) }) });
    assert.equal((await checker.check()).status, expected, `${currentVersion} -> ${version}`);
  }
});
test('预发布更新缓存跨会话保持结果，同版本只提醒一次，后续候选继续提醒', async () => {
  let saved, requests = 0, version = '0.1.0-dev.2'; const events = [];
  const args = { currentVersion: '0.1.0-dev.1', source: 'https://example.test/release.json', cache: { readJson: async () => saved, writeJson: async (_, value) => { saved = structuredClone(value); } }, notify: x => events.push(x), fetcher: async () => { requests++; return { ok: true, json: async () => ({ ...manifest, version }) }; } };
  assert.equal((await createUpdateChecker(args).check()).status, 'update_available');
  const reopened = createUpdateChecker(args);
  assert.equal((await reopened.check()).status, 'update_available'); assert.equal(requests, 1);
  await reopened.check(true); assert.equal(events.length, 1);
  version = '0.1.0-dev.10'; assert.equal((await reopened.check(true)).status, 'update_available');
  assert.deepEqual(events.map(e => e.version), ['0.1.0-dev.2', '0.1.0-dev.10']);
});
test('非法发布版本检查失败，无法识别的当前版本不得报告最新版', async () => {
  for (const version of ['0.1.0-dev.01', '0.1.0-dev..2', '01.1.0', '0.1.0-']) {
    const checker = createUpdateChecker({ currentVersion: '0.1.0', source: 'https://example.test/release.json', fetcher: async () => ({ ok: true, json: async () => ({ ...manifest, version }) }) });
    assert.equal((await checker.check()).status, 'check_failed', version);
  }
  const checker = createUpdateChecker({ currentVersion: 'unknown', source: 'https://example.test/release.json', fetcher: async () => ({ ok: true, json: async () => manifest }) });
  assert.equal((await checker.check()).status, 'unknown');
});
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
