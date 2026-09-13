import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../../src/runtime/server.js';
import { MemoryStorage } from '../../src/storage/memory.js';
const skill = { status: 'loaded', version: '0.1.0-dev.1', evidence: 'test' };
test('薄服务校验凭据、Origin 和 Host，两个独立会话共享目录而非选区', async t => {
  const server = await startServer({ storage: new MemoryStorage(), skill }); t.after(server.close);
  const health = await fetch(`${server.url}/health`).then(response => response.json());
  assert.equal(health.contractVersion, 3); assert.equal(health.formatVersion, 3); assert.equal(health.schemaRevision, 2);
  const request = (path, body, headers = {}) => fetch(`${server.url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await request('/operation', { name: 'get_capabilities', input: {} })).status, 401);
  assert.equal((await request('/operation', {}, { Authorization: `Bearer ${server.token}`, Origin: 'https://evil.test' })).status, 403);
  const headers = { Authorization: `Bearer ${server.token}` };
  let result = await (await request('/operation', { name: 'connect_library', input: { requestId: 'connect', create: true } }, headers)).json(); assert.equal(result.ok, true);
  result = await (await request('/operation', { name: 'create_project', input: { requestId: 'create', name: '测试' } }, headers)).json(); assert.equal(result.ok, true);
  const session = await (await request('/sessions', {}, headers)).json();
  result = await (await request('/operation', { name: 'connect_library', input: { requestId: 'connect', create: false } }, { Authorization: `Bearer ${session.token}` })).json(); assert.equal(result.ok, true);
  result = await (await request('/operation', { name: 'list_projects', input: {} }, { Authorization: `Bearer ${session.token}` })).json(); assert.equal(result.data.total, 1);
});
