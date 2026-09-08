import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContracts } from '../../scripts/build.js';
import { ajv } from '../../src/contracts/schema.js';
import Ajv from 'ajv';

test('build produces a deterministic, resolvable contract bundle, never user data', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'icon-studio-contract-test-'));
  try {
    await buildContracts(temp);
    const first = await readFile(join(temp, 'contracts.json'), 'utf8');
    const bundle = JSON.parse(first);
    assert.equal(bundle.stage, 'foundation');
    assert.equal(bundle.productionReady, false);
    assert.equal(bundle.contractVersion, 3);
    assert.ok(bundle.documents.matrix);
    const consumer = new Ajv({ strict: true });
    consumer.addFormat('studio-time', ajv.formats['studio-time']);
    for (const schema of Object.values(bundle.documents)) consumer.addSchema(schema);
    for (const operation of bundle.operations.filter(x => x.available)) {
      assert.ok(consumer.compile(operation.inputSchema));
      assert.ok(consumer.compile(operation.outputSchema));
    }
    await buildContracts(temp);
    assert.equal(await readFile(join(temp, 'contracts.json'), 'utf8'), first);
    assert.deepEqual((await readdir(temp)).sort(), ['contracts.json']);
    assert.ok(!first.includes('/Users/'));
    assert.ok(!first.includes('hetao-app'));
  } finally { await rm(temp, { recursive: true, force: true }); }
});
