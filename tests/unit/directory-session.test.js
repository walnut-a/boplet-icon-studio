import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectorySession } from '../../src/storage/directory-session.js';

test('恢复不弹授权，取消换目录保留原连接，断开只遗忘引用', async () => {
  const handle = { kind: 'directory', name: 'original', queryPermission: async () => 'prompt', requestPermission: async () => 'granted' };
  let saved = handle;
  const memory = { load: async () => saved, save: async h => { saved = h; }, clear: async () => { saved = null; } };
  const session = new DirectorySession({ memory });
  assert.equal((await session.restore()).status, 'pending');
  assert.equal(session.storage, null);
  assert.equal((await session.authorize()).status, 'granted');
  const storage = session.storage;
  assert.equal((await session.choose(async () => { throw new DOMException('', 'AbortError'); })).status, 'cancelled');
  assert.equal(session.storage, storage);
  assert.equal(saved, handle);
  await session.disconnect();
  assert.equal(saved, null);
  assert.equal(session.storage, null);
});

test('记住目录失败不伪装成功，也不撤销已选择的有效目录', async () => {
  const handle = { kind: 'directory', name: 'selected', queryPermission: async () => 'granted' };
  const session = new DirectorySession({ memory: { save: async () => { throw Error('quota'); } } });
  const result = await session.choose(async () => handle);
  assert.equal(result.status, 'granted');
  assert.equal(result.remembered, false);
  assert.equal(session.storage.identity, 'selected');
});
