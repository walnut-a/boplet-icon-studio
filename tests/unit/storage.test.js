import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from '../../src/storage/memory.js';

test('storage snapshots cannot be mutated through returned values', async () => {
  const storage = new MemoryStorage();
  const original = { name: 'before' };
  await storage.writeJson('projects/p-test/project.json', original);
  original.name = 'outside';
  const read = await storage.readJson('projects/p-test/project.json');
  read.name = 'mutated';
  assert.deepEqual(await storage.readJson('projects/p-test/project.json'), { name: 'before' });
});

test('two clients can overwrite a document, including a stale full snapshot', async () => {
  const storage = new MemoryStorage();
  await storage.writeJson('project.json', { revision: 'A', name: 'A', purpose: 'first' });
  const old = await storage.readJson('project.json');
  await storage.writeJson('project.json', { revision: 'B', name: 'B', purpose: 'second' });
  await storage.writeJson('project.json', { ...old, revision: 'C', name: 'C' });
  assert.deepEqual(await storage.readJson('project.json'), { revision: 'C', name: 'C', purpose: 'first' });
  assert.equal(storage.acquireLock, undefined);
  assert.equal(storage.compareAndSwap, undefined);
});

test('storage rejects ambiguous and escaping paths on every operation', async () => {
  const storage = new MemoryStorage();
  for (const path of ['', '/a', '../a', 'a/../b', 'a//b', 'a\\b', 'C:/a', './a', 'a\u0000b', 'a/%2e%2e/b']) {
    await assert.rejects(storage.writeJson(path, {}), { code: 'VALIDATION_FAILED' }, path);
    await assert.rejects(storage.readJson(path), { code: 'VALIDATION_FAILED' }, path);
  }
  assert.deepEqual(await storage.list(''), []);
});

test('failed writes retain the last valid document and do not invent success', async () => {
  const storage = new MemoryStorage();
  await storage.writeJson('project.json', { name: 'A' });
  storage.failNextWrite();
  await assert.rejects(storage.writeJson('project.json', { name: 'B' }), { code: 'SAVE_FAILED' });
  assert.deepEqual(await storage.readJson('project.json'), { name: 'A' });
  await assert.rejects(storage.readJson('missing.json'), { code: 'TARGET_NOT_FOUND' });
});

test('directory listing is deterministic and does not match a sibling prefix', async () => {
  const storage = new MemoryStorage();
  await storage.writeJson('projects/p-b/project.json', {});
  await storage.writeJson('projects/p-a/project.json', {});
  await storage.writeJson('projects-other/secret.json', {});
  assert.deepEqual(await storage.list('projects'), ['projects/p-a/project.json', 'projects/p-b/project.json']);
});
