import test from 'node:test';
import assert from 'node:assert/strict';
import { registerWebMCP } from '../../src/transports/webmcp.js';

const capabilities = {
  operations: [
    { name: 'get_project', domain: 'project', description: 'read project', available: true, readOnly: true, inputSchema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'], additionalProperties: false } },
    { name: 'update_project', domain: 'project', description: 'write project', available: true, readOnly: false, inputSchema: { type: 'object', properties: { requestId: { type: 'string' } }, required: ['requestId'], additionalProperties: false } },
  ],
};

test('WebMCP registers a compact stable gateway instead of every business operation', async () => {
  const registered = [];
  const modelContext = { registerTool: async definition => { registered.push(definition); } };
  const calls = [];
  const result = await registerWebMCP(modelContext, capabilities, async (name, input) => { calls.push({ name, input }); return { ok: true, name }; });

  assert.equal(result.available, true);
  assert.equal(result.registered, 5);
  assert.deepEqual(registered.map(tool => tool.name), [
    'icon_studio_v3_get_workflow',
    'icon_studio_v3_list_operations',
    'icon_studio_v3_get_operation_schema',
    'icon_studio_v3_read',
    'icon_studio_v3_write',
  ]);
  assert.ok(JSON.stringify(registered.map(({ execute, ...definition }) => definition)).length < 12000);
  assert.equal(registered.some(tool => tool.name === 'icon_studio_v3_get_project'), false);

  const schema = JSON.parse(await registered[2].execute({ name: 'get_project' }));
  assert.equal(schema.name, 'get_project');
  assert.equal(schema.inputSchema.properties.projectId.type, 'string');

  assert.deepEqual(JSON.parse(await registered[3].execute({ name: 'get_project', input: { projectId: 'p-test' } })), { ok: true, name: 'get_project' });
  assert.deepEqual(JSON.parse(await registered[4].execute({ name: 'update_project', input: { requestId: 'req' } })), { ok: true, name: 'update_project' });
  assert.deepEqual(calls.map(call => call.name), ['get_project', 'update_project']);
  await assert.rejects(registered[3].execute({ name: 'update_project', input: {} }), /write gateway/);
  await assert.rejects(registered[4].execute({ name: 'get_project', input: {} }), /read gateway/);
});
