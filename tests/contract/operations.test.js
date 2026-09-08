import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createStudio } from '../../src/core/studio.js';
import { MemoryStorage } from '../../src/storage/memory.js';
import { operationCatalog } from '../../src/contracts/operations.js';
import { validateResult } from '../../src/contracts/results.js';

test('22 个能力域的 95 个操作均有严格可执行合同', async () => {
  const prd = await readFile(new URL('../../docs/产品图标工坊-项目化架构与双端产品方案.md', import.meta.url), 'utf8');
  const table = prd.split('### 11.2 工具覆盖目录')[1].split('### 11.3')[0];
  const required = [...table.matchAll(/`([a-z]+_[a-z_]+)`/g)].map(x => x[1]);
  for (const name of required) assert.ok(operationCatalog[name], `missing ${name}`);
  assert.equal(new Set(Object.values(operationCatalog).map(x => x.domain)).size, 22);
  assert.ok(operationCatalog.revoke_session);
  const studio = createStudio({ storage: new MemoryStorage() });
  const capabilities = await studio.execute('get_capabilities', {});
  assert.equal(capabilities.ok, true);
  assert.ok(capabilities.data.documents.project);
  for (const capability of capabilities.data.operations) {
    assert.equal(capability.available, true, capability.name);
    if (capability.available) {
      assert.ok(capability.inputSchema);
      assert.ok(capability.outputSchema);
    } else {
      assert.equal(capability.reason, 'NOT_IMPLEMENTED');
      assert.ok(capability.phase);
    }
  }
  assert.equal(capabilities.data.operations.length,95);
  for (const capability of capabilities.data.operations) {
    const invalid = await studio.execute(capability.name,{unexpectedField:true});
    assert.equal(invalid.error.code,'VALIDATION_FAILED',capability.name);
  }
  const unavailable = await studio.execute('unknown_operation', {});
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.error.code, 'CAPABILITY_UNAVAILABLE');
  assert.equal(unavailable.persistence, 'not_applicable');
});

test('failures use a validated, JSON-safe result and redact unexpected exceptions', async () => {
  const studio = createStudio({ storage: new MemoryStorage(), skill: { status: 'loaded', version: '0.1.0-dev.1', evidence: 'test_host' } });
  for (const [operation, args] of [['not_a_tool', {}], ['create_project', { name: 'No request ID' }], ['get_project', { projectId: 's-wrong' }]]) {
    const result = await studio.execute(operation, args);
    assert.equal(result.ok, false);
    assert.equal(validateResult(result), result);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  }
});

test('legacy aliases and compare-and-swap fields are not accepted', async () => {
  const studio = createStudio({ storage: new MemoryStorage() });
  const result = await studio.execute('get_project', { projectKey: 'a-inset-core' });
  assert.equal(result.error.code, 'VALIDATION_FAILED');
  const update = operationCatalog.update_project.inputSchema;
  assert.equal(update.additionalProperties, false);
  assert.equal(update.properties.expectedRevision, undefined);
  assert.ok(update.properties.sourceRevision);
});

test('result schemas reject false success and error-shaped completed results', () => {
  assert.throws(() => validateResult({ ok: true, status: 'failed' }), { code: 'VALIDATION_FAILED' });
});

test('accepted and waiting_user are distinct from completed and persisted', () => {
  const common = { operationId: 'op-test', target: {}, revision: null, eventCursor: null, warnings: [], nextActions: [] };
  const accepted = { ...common, ok: true, status: 'accepted', persistence: 'pending' };
  assert.equal(validateResult(accepted), accepted);
  const waiting = { ...common, ok: true, status: 'waiting_user', persistence: 'not_applicable', permissionRequestId: 'perm-test' };
  assert.equal(validateResult(waiting), waiting);
  assert.throws(() => validateResult({ ...accepted, persistence: 'persisted' }), { code: 'VALIDATION_FAILED' });
});

test('unexpected storage exceptions do not leak local paths, secrets or claim success', async () => {
  const storage = { kind: 'memory', async readJson() { throw new Error('/Users/private/file token=secret'); } };
  const studio = createStudio({ storage, skill: { status: 'loaded', version: '0.1.0-dev.1', evidence: 'test_host' } });
  const result = await studio.execute('connect_library', { requestId: 'read', create: false });
  assert.equal(result.ok, false);
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.ok(!JSON.stringify(result).includes('/Users/'));
});
