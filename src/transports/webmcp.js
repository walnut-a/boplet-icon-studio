/** Native WebMCP only. No API shim: unsupported hosts retain the local HTTP route. */
export async function registerWebMCP(modelContext, capabilities, execute) {
  if (!modelContext?.registerTool) return { available: false, registered: 0, dispose() {} };
  const controller = new AbortController(); let registered = 0;
  try {
    for (const operation of capabilities.operations.filter(o => o.available)) {
      // Resolve cross-document refs for browser/host schema consumers.
      const schema = structuredClone(operation.inputSchema);
      const expand = value => {
        if (!value || typeof value !== 'object') return;
        if (value.$ref?.startsWith('urn:icon-studio:')) {
          const [uri, pointer = ''] = value.$ref.split('#'); const document = Object.values(capabilities.documents).find(d => d.$id === uri);
          if (document) { const target = pointer ? pointer.slice(1).split('/').reduce((x, k) => x[k], document) : document; delete value.$ref; Object.assign(value, structuredClone(target)); delete value.$id; }
        }
        Object.values(value).forEach(expand);
      };
      expand(schema); delete schema.$id;
      await modelContext.registerTool({ name: `icon_studio_v3_${operation.name}`, description: operation.description, inputSchema: schema,
        annotations: { readOnlyHint: operation.readOnly, untrustedContentHint: true, consequentialHint: ['restore_revision', 'undo', 'redo'].includes(operation.name) },
        execute: async (args, { signal } = {}) => JSON.stringify(await execute(operation.name, args, signal)) }, { signal: controller.signal }); registered++;
    }
    return { available: true, registered, dispose() { controller.abort(); } };
  } catch { controller.abort(); return { available: false, registered: 0, dispose() {} }; }
}
