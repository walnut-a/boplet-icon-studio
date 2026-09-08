import assert from 'node:assert/strict';
import { createStudio } from '../../src/core/studio.js';
import { MemoryStorage } from '../../src/storage/memory.js';
export const skill = { status: 'loaded', version: '0.1.0-dev.1', evidence: 'isolated-test' };
export async function call(studio, name, args = {}) {
  let result = await studio.execute(name, { ...args });
  while(result.status==='accepted'){await new Promise(resolve=>setTimeout(resolve,25));result=(await studio.execute('get_operation',{operationId:result.operationId})).data.result;}
  assert.equal(result.ok, true, `${name}: ${JSON.stringify(result)}`);
  return result.data;
}
export const req = () => crypto.randomUUID();
export async function setup(storage = new MemoryStorage(), transport = null) {
  const studio = transport ?? createStudio({ storage, skill });
  await call(studio, 'connect_library', { requestId: req(), create: true });
  const { project } = await call(studio, 'create_project', { requestId: req(), name: '合成笔记系统' });
  const p = { projectId: project.projectId };
  const fields = Object.fromEntries(['purpose', 'goals', 'audience', 'usage', 'scope', 'constraints'].map(key => [key, { value: `合成${key}`, provenance: { kind: 'user', reference: null, awaitingConfirmation: false } }]));
  await call(studio, 'update_brief', { ...p, requestId: req(), content: { fields, vocabularyDraft: [] } });
  const { confirmation } = await call(studio, 'prepare_confirmation', p);
  await call(studio, 'confirm_brief', { ...p, requestId: req(), confirmationId: confirmation.confirmationId, evidenceReference: '测试用户确认' });
  const { scheme } = await call(studio, 'create_scheme', { ...p, requestId: req(), name: '基础方案' });
  const s = { ...p, schemeId: scheme.schemeId };
  await call(studio, 'propose_design_rules', { ...s, requestId: req(), content: { gridSize: 16, padding: 1, strokeWidth: 1.25, cornerRadius: 1, lineCap: 'round', lineJoin: 'round', opticalNotes: [] } });
  const { confirmation: ruleConfirmation } = await call(studio, 'prepare_confirmation', s);
  await call(studio, 'confirm_design_rules', { ...s, requestId: req(), confirmationId: ruleConfirmation.confirmationId, evidenceReference: '测试规则确认' });
  const { icons } = await call(studio, 'register_icons', { ...p, requestId: req(), icons: [{ name: '收件箱', concept: '集中接收的条目', tags: ['inbox', '接收'], usages: [] }] });
  const i = { ...s, iconId: icons[0].iconId };
  const { variants } = await call(studio, 'register_variants', { ...i, requestId: req(), variants: [{ size: 16, style: 'filled', weight: 'regular' }] });
  const target = { ...i, variantId: variants[0].variantId };
  return { studio, storage, p, s, i, target };
}

export const rectangle = { layerId: 'l-shell', name: '外壳', type: 'rect', visible: true, drawing: 'fill', strokeWidth: 0, x: 2, y: 2, width: 12, height: 12, radius: 2 };
export async function produce(storage, transport) {
  const context = await setup(storage, transport); const { studio, s, target } = context;
  const { batch } = await call(studio, 'create_batch', { ...s, requestId: req(), targets: [{ iconId: target.iconId, variantId: target.variantId }] });
  await call(studio, 'start_batch', { projectId: s.projectId, batchId: batch.batchId, requestId: req() });
  await call(studio, 'apply_operations', { ...target, taskId: batch.taskIds[0], requestId: req(), operations: [{ op: 'add_layer', layer: rectangle }] });
  return { ...context, batch };
}
