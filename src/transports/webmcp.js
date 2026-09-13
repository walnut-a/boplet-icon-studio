/** Native WebMCP only. Business operations remain in the shared operation catalog. */
export async function registerWebMCP(modelContext, capabilities, execute) {
  if (!modelContext?.registerTool) return { available: false, registered: 0, dispose() {} };
  const controller = new AbortController();
  const operations = capabilities.operations.filter(operation => operation.available);
  const byName = new Map(operations.map(operation => [operation.name, operation]));
  const readNames = operations.filter(operation => operation.readOnly).map(operation => operation.name);
  const writeNames = operations.filter(operation => !operation.readOnly).map(operation => operation.name);
  const empty = { type: 'object', properties: {}, required: [], additionalProperties: false };
  const operationInput = names => ({
    type: 'object',
    properties: {
      name: { type: 'string', enum: names },
      input: { type: 'object', additionalProperties: true },
    },
    required: ['name', 'input'],
    additionalProperties: false,
  });
  const invoke = async (name, input, expectedReadOnly, signal) => {
    const operation = byName.get(name);
    if (!operation) throw Error(`Unknown Icon Studio operation: ${name}`);
    if (operation.readOnly !== expectedReadOnly) throw Error(`${name} must use the ${operation.readOnly ? 'read' : 'write'} gateway.`);
    return JSON.stringify(await execute(name, input, signal));
  };
  const definitions = [
    {
      name: 'icon_studio_v3_get_workflow',
      description: 'Read the current Icon Studio workflow stage and next actions.',
      inputSchema: empty,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (_args, { signal } = {}) => JSON.stringify(await execute('get_workflow', {}, signal)),
    },
    {
      name: 'icon_studio_v3_list_operations',
      description: 'List the compact Icon Studio operation catalog without embedding every operation schema.',
      inputSchema: empty,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async () => JSON.stringify(operations.map(({ name, domain, description, readOnly }) => ({ name, domain, description, readOnly }))),
    },
    {
      name: 'icon_studio_v3_get_operation_schema',
      description: 'Read the canonical input schema for one Icon Studio business operation.',
      inputSchema: { type: 'object', properties: { name: { type: 'string', enum: operations.map(operation => operation.name) } }, required: ['name'], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async ({ name }) => {
        const operation = byName.get(name);
        if (!operation) throw Error(`Unknown Icon Studio operation: ${name}`);
        return JSON.stringify({ name, domain: operation.domain, description: operation.description, readOnly: operation.readOnly, inputSchema: operation.inputSchema });
      },
    },
    {
      name: 'icon_studio_v3_read',
      description: 'Execute one read-only Icon Studio operation after consulting its canonical schema.',
      inputSchema: operationInput(readNames),
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async ({ name, input }, { signal } = {}) => invoke(name, input, true, signal),
    },
    {
      name: 'icon_studio_v3_write',
      description: 'Execute one state-changing Icon Studio operation after consulting its canonical schema.',
      inputSchema: operationInput(writeNames),
      annotations: { readOnlyHint: false, untrustedContentHint: true, consequentialHint: true },
      execute: async ({ name, input }, { signal } = {}) => invoke(name, input, false, signal),
    },
  ];
  try {
    for (const definition of definitions) await modelContext.registerTool(definition, { signal: controller.signal });
    return { available: true, registered: definitions.length, dispose() { controller.abort(); } };
  } catch (error) {
    controller.abort();
    return { available: false, registered: 0, reason: error.message, dispose() {} };
  }
}
