import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeStorage } from '../../src/storage/node.js';

test('磁盘完整写入、重开和旧副本后保存生效', async t => {
  const root = await mkdtemp(join(tmpdir(), 'icon-storage-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = await NodeStorage.open(root);
  await store.writeJson('projects/p-one/project.json', { value: 1 });
  const stale = await store.readJson('projects/p-one/project.json');
  await store.writeJson('projects/p-one/project.json', { value: 2 });
  await (await NodeStorage.open(root)).writeJson('projects/p-one/project.json', stale);
  assert.deepEqual(await store.readJson('projects/p-one/project.json'), { value: 1 });
  assert.deepEqual(await store.list('projects'), ['projects/p-one/project.json']);
});

test('越界和符号链接拒绝，不损坏已保存文件', async t => {
  const root = await mkdtemp(join(tmpdir(), 'icon-storage-'));
  const outside = await mkdtemp(join(tmpdir(), 'icon-outside-'));
  t.after(() => Promise.all([root, outside].map(p => rm(p, { recursive: true, force: true }))));
  const store = await NodeStorage.open(root);
  await symlink(outside, join(root, 'escape'));
  for (const path of ['../x', '/tmp/x', 'escape/x.json']) {
    await assert.rejects(store.writeJson(path, {}));
    await assert.rejects(store.readJson(path));
  }
  await store.writeJson('x.json', { good: true });
  await assert.rejects(store.writeJson('x.json', { value: Infinity }));
  assert.deepEqual(JSON.parse(await readFile(join(root, 'x.json'), 'utf8')), { good: true });
  assert.deepEqual(await store.list(''), ['x.json']);
});
