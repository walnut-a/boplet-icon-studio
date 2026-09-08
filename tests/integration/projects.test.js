import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudio } from '../../src/core/studio.js';
import { MemoryStorage } from '../../src/storage/memory.js';

const skill = { status: 'loaded', version: '0.1.0-dev.1', evidence: 'test_host' };
const connect = async studio => studio.execute('connect_library', { requestId: 'connect', create: true });

test('create, read, update and reopen a zero-scheme project without changing view', async () => {
  const storage = new MemoryStorage();
  const studio = createStudio({ storage, skill });
  assert.equal((await connect(studio)).ok, true);
  const before = (await studio.execute('get_view_context', {})).data;
  const created = await studio.execute('create_project', { requestId: 'create-1', name: '研究工具' });
  assert.equal(created.ok, true);
  assert.equal(created.persistence, 'persisted');
  const projectId = created.data.project.projectId;
  const schemes = await studio.execute('list_schemes', { projectId });
  assert.deepEqual(schemes.data.items, []);
  assert.deepEqual((await studio.execute('get_view_context', {})).data, before);
  const brief = await studio.execute('get_brief', { projectId });
  assert.equal(brief.data.brief.status, 'draft');
  const reopened = createStudio({ storage, skill });
  assert.equal((await connect(reopened)).ok, true);
  assert.equal((await reopened.execute('get_project', { projectId })).data.project.name, '研究工具');
  assert.equal((await reopened.execute('list_projects', {})).data.items.length, 1);
});

test('unloaded Skill and disconnected storage cannot create business data', async () => {
  const storage = new MemoryStorage();
  const unloaded = createStudio({ storage });
  assert.equal((await unloaded.execute('create_project', { requestId: 'x', name: 'draft' })).error.code, 'CAPABILITY_UNAVAILABLE');
  const loaded = createStudio({ storage, skill });
  assert.equal((await loaded.execute('create_project', { requestId: 'x', name: 'draft' })).error.code, 'PERMISSION_REQUIRED');
  assert.deepEqual(await storage.list(''), []);
});

test('two sessions save the same explicit project: old source revision is informational', async () => {
  const storage = new MemoryStorage();
  const a = createStudio({ storage, skill });
  const b = createStudio({ storage, skill });
  await connect(a); await connect(b);
  const initial = await a.execute('create_project', { requestId: 'create', name: 'A' });
  const projectId = initial.data.project.projectId;
  const sourceRevision = initial.revision;
  await a.execute('update_project', { requestId: 'update-a', projectId, sourceRevision, changes: { name: 'B' } });
  const last = await b.execute('update_project', { requestId: 'update-b', projectId, sourceRevision, changes: { name: 'C' } });
  assert.equal(last.ok, true);
  assert.equal((await a.execute('get_project', { projectId })).data.project.name, 'C');
});

test('retry in one session reuses receipt; changed payload and expired request do not re-execute', async () => {
  let now = 1_000;
  const storage = new MemoryStorage();
  const studio = createStudio({ storage, skill, clock: () => now, receiptTtlMs: 100 });
  await connect(studio);
  const args = { requestId: 'create', name: 'A' };
  const first = await studio.execute('create_project', args);
  assert.deepEqual(await studio.execute('create_project', args), first);
  const reused = await studio.execute('create_project', { ...args, name: 'B' });
  assert.equal(reused.error.code, 'VALIDATION_FAILED');
  now += 101;
  assert.equal((await studio.execute('create_project', args)).error.code, 'RECEIPT_EXPIRED');
  assert.equal((await studio.execute('list_projects', {})).data.items.length, 1);
});

test('source revision cannot change the write target and illegal nested fields do not write', async () => {
  const storage = new MemoryStorage();
  const studio = createStudio({ storage, skill });
  await connect(studio);
  const first = await studio.execute('create_project', { requestId: 'one', name: 'Same' });
  const second = await studio.execute('create_project', { requestId: 'two', name: 'Same' });
  assert.notEqual(first.data.project.projectId, second.data.project.projectId);
  const rejected = await studio.execute('update_project', { requestId: 'bad', projectId: first.data.project.projectId, changes: { name: 'bad', schemeId: 's-secret' } });
  assert.equal(rejected.error.code, 'VALIDATION_FAILED');
  assert.equal((await studio.execute('get_project', { projectId: first.data.project.projectId })).data.project.name, 'Same');
});

test('write failures are distinguishable from persisted results', async () => {
  const storage = new MemoryStorage();
  const studio = createStudio({ storage, skill });
  await connect(studio);
  const created = await studio.execute('create_project', { requestId: 'one', name: 'A' });
  storage.failNextWrite();
  const result = await studio.execute('update_project', { requestId: 'fail', projectId: created.data.project.projectId, changes: { name: 'B' } });
  assert.equal(result.ok, false);
  assert.equal(result.persistence, 'failed');
  assert.equal(result.error.code, 'SAVE_FAILED');
  assert.equal((await studio.execute('get_project', { projectId: created.data.project.projectId })).data.project.name, 'A');
});

test('same request in a different JSON key order is the same retry', async () => {
  const studio = createStudio({ storage: new MemoryStorage(), skill });
  await connect(studio);
  const first = await studio.execute('create_project', { requestId: 'same', name: 'A', purpose: 'purpose' });
  assert.deepEqual(await studio.execute('create_project', { purpose: 'purpose', name: 'A', requestId: 'same' }), first);
});

test('simultaneous duplicate requests in one session execute once', async () => {
  const studio = createStudio({ storage: new MemoryStorage(), skill });
  await connect(studio);
  const args = { requestId: 'one', name: 'A' };
  const [a, b] = await Promise.all([studio.execute('create_project', args), studio.execute('create_project', args)]);
  assert.deepEqual(a, b);
  assert.equal((await studio.execute('list_projects', {})).data.items.length, 1);
});

test('failed receipts cannot be changed by mutating a returned response', async () => {
  const storage = new MemoryStorage();
  const studio = createStudio({ storage, skill });
  await connect(studio);
  storage.failNextWrite();
  const args = { requestId: 'one', name: 'A' };
  const first = await studio.execute('create_project', args);
  first.error.message = 'fake success';
  const retry = await studio.execute('create_project', args);
  assert.notEqual(retry.error.message, 'fake success');
  assert.equal(retry.error.code, 'SAVE_FAILED');
});

test('archive keeps files, restore works, and opening another project clears context', async () => {
  const storage = new MemoryStorage();
  const studio = createStudio({ storage, skill });
  await connect(studio);
  const { data: { project } } = await studio.execute('create_project', { requestId: 'one', name: 'A' });
  const initialContext = (await studio.execute('get_view_context', {})).data.contextId;
  const open = await studio.execute('open_project', { requestId: 'open', projectId: project.projectId });
  assert.equal(open.data.projectId, project.projectId);
  assert.notEqual(open.data.contextId, initialContext);
  assert.ok(Object.values(open.data.selection).every(x => x === null));
  const paths = await storage.list('');
  assert.equal((await studio.execute('archive_project', { requestId: 'archive', projectId: project.projectId })).data.project.status, 'archived');
  assert.deepEqual(await storage.list(''), paths);
  assert.equal((await studio.execute('restore_project', { requestId: 'restore', projectId: project.projectId })).data.project.status, 'active');
  assert.equal((await studio.execute('list_projects', { status: 'archived' })).data.total, 0);
});

test('permission and schema errors leave existing unknown files untouched', async () => {
  const storage = new MemoryStorage();
  await storage.writeJson('existing.json', { real: 'leave alone' });
  const studio = createStudio({ storage, skill });
  assert.equal((await connect(studio)).error.code, 'SCHEMA_UNSUPPORTED');
  assert.deepEqual(await storage.list(''), ['existing.json']);
  assert.deepEqual(await storage.readJson('existing.json'), { real: 'leave alone' });
});

test('storage disconnect and session revoke are isolated to the calling session', async () => {
  const storage = new MemoryStorage();
  const a = createStudio({ storage, skill });
  const b = createStudio({ storage, skill });
  await connect(a); await connect(b);
  await a.execute('disconnect_storage', { requestId: 'disconnect' });
  assert.equal((await a.execute('list_projects', {})).error.code, 'PERMISSION_REQUIRED');
  assert.equal((await b.execute('create_project', { requestId: 'one', name: 'A' })).ok, true);
  await a.execute('revoke_session', { requestId: 'revoke' });
  assert.equal((await a.execute('connect_library', { requestId: 'connect-again', create: false })).error.code, 'PERMISSION_DENIED');
  assert.equal((await b.execute('list_projects', {})).data.total, 1);
});
