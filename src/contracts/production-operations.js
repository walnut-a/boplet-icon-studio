import { array, bool, enumeration, id, nullable, number, object, point, revision, shortText, text } from './schema.js';
import { identity, layerSchema, scopeTarget, vocabularyItemSchema } from './models.js';
import { doc, i, input, p, s, v } from './project-operations.js';
import { applyOperations, compileVariant, locateLayer, readBatch, readPrimitives, readTask, validateGeometry, variantContent } from '../core/production.js';
import { matrixPath, productionGate, projectPath, readMatrix, readScheme, readVocabulary, requireValue, schemePath, touch } from '../core/documents.js';
import { StudioError } from './errors.js';

const layerRef = { $ref: '#/$defs/layer' };
const node = object({ nodeId: id('n'), point, in: nullable(point), out: nullable(point) });
export const geometryOperations = { oneOf: [
  object({ op: { const: 'add_layer' }, layer: layerRef, parentId: id('l') }, ['op', 'layer']),
  object({ op: { const: 'replace_layer' }, layerId: id('l'), layer: layerRef }),
  ...['delete_layer', 'duplicate_layer', 'ungroup', 'detach_instance'].map(op => object({ op: { const: op }, layerId: id('l') })),
  object({ op: { const: 'reorder_layer' }, layerId: id('l'), index: { type: 'integer', minimum: 0 } }),
  object({ op: { const: 'set_visibility' }, layerId: id('l'), visible: bool }),
  object({ op: { const: 'transform_layer' }, layerId: id('l'), transform: array(number, { minItems: 6, maxItems: 6 }) }),
  object({ op: { const: 'move_node' }, layerId: id('l'), nodeId: id('n'), handle: enumeration('point', 'in', 'out'), point }),
  object({ op: { const: 'insert_node' }, layerId: id('l'), index: { type: 'integer', minimum: 0 }, node }),
  object({ op: { const: 'delete_node' }, layerId: id('l'), nodeId: id('n') }),
  object({ op: { const: 'group_layers' }, layerId: id('l'), name: shortText, layerIds: array(id('l'), { minItems: 2, uniqueItems: true }) }),
  object({ op: { const: 'boolean_layers' }, layerId: id('l'), name: shortText, layerIds: array(id('l'), { minItems: 2, uniqueItems: true }), operation: enumeration('union', 'subtract', 'intersect', 'exclude') }),
  object({ op: { const: 'define_primitive' }, primitiveId: id('prim'), name: shortText, layers: array(layerRef, { minItems: 1 }) }),
] };
export const bounds = nullable(object({ left: number, top: number, right: number, bottom: number }));
export const pageFields = { offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 100 } };
const batchTarget = object({ iconId: identity.iconId, variantId: identity.variantId });
const taskData = object({ task: doc('task') });
export const resultItem = object({ iconId: identity.iconId, variantId: identity.variantId, ok: bool, message: nullable(text) });
export async function schemeTargets(r, a) {
  await readScheme(r, a);
  const targets = [];
  for (const path of await r.storage.list(`${schemePath(a)}/matrix`)) {
    const match = /\/(i-[^/]+)\.json$/.exec(path); if (!match || (a.iconId && a.iconId !== match[1])) continue;
    const matrix = await readMatrix(r, { ...a, iconId: match[1] });
    for (const variant of matrix.variants) if (variant.status === 'active' && (!a.variantId || a.variantId === variant.variantId)) targets.push({ projectId: a.projectId, schemeId: a.schemeId, iconId: matrix.iconId, variantId: variant.variantId });
  }
  return targets;
}
export function registerProductionOperations(define) {
  define('create_batch', { description: '按已确认需求与规则登记显式图标变体任务，不执行几何。', input: input({ ...s, targets: array(batchTarget, { minItems: 1, maxItems: 1000 }) }), data: object({ batch: doc('batch') }), mutates: true, persists: true, handler: async (r, a) => {
    const { brief, rules } = await productionGate(r, a);
    const unique = a.targets.map(t => `${t.iconId}/${t.variantId}`); if (new Set(unique).size !== unique.length) throw new StudioError('VALIDATION_FAILED', '批次目标重复。');
    for (const target of a.targets) requireValue((await readMatrix(r, { ...a, ...target })).variants.find(v => v.variantId === target.variantId && v.status === 'active'));
    const batch = { ...r.header(), projectId: a.projectId, schemeId: a.schemeId, batchId: r.id('batch'), briefRevision: brief.revision, ruleRevision: rules.revision, taskIds: [], status: 'planned' };
    for (const target of a.targets) {
      const task = { ...r.header(), projectId: a.projectId, taskId: r.id('task'), batchId: batch.batchId, target: { projectId: a.projectId, schemeId: a.schemeId, ...target }, status: 'planned', briefRevision: brief.revision, ruleRevision: rules.revision,
        progress: { completed: 0, total: 2, source: 'core' }, checkpoint: null, operationIds: [], reason: null };
      await r.writeDocument('task', `${projectPath(a)}/tasks/${task.taskId}.json`, task); batch.taskIds.push(task.taskId);
    }
    await r.writeDocument('batch', `${projectPath(a)}/batches/${batch.batchId}.json`, batch); return { batch };
  } });
  define('get_batch', { description: '读取持久批次与登记版本。', input: object({ ...p, batchId: id('batch') }), data: object({ batch: doc('batch') }), handler: async (r, a) => ({ batch: await readBatch(r, a) }) });
  for (const name of ['start_batch', 'update_batch']) define(name, { description: '启动或暂停/取消批次中的未完成任务；保留已成功任务。', input: input({ ...p, batchId: id('batch'), ...(name === 'update_batch' ? { status: enumeration('paused', 'cancelled', 'running') } : {}) }), data: object({ batch: doc('batch') }), mutates: true, persists: true, handler: async (r, a) => {
    const batch = touch(r, await readBatch(r, a)); const { brief, rules } = await productionGate(r, batch);
    if (brief.revision !== batch.briefRevision || rules.revision !== batch.ruleRevision) throw new StudioError('TASK_UNREGISTERED', '计划不属于当前确认内容，请建立新批次。');
    batch.status = a.status ?? 'running';
    for (const taskId of batch.taskIds) {
      const task = await readTask(r, { ...a, taskId });
      if (task.status === 'succeeded' || task.status === 'cancelled') continue;
      task.status = batch.status; await r.writeDocument('task', `${projectPath(a)}/tasks/${taskId}.json`, touch(r, task));
    }
    await r.writeDocument('batch', `${projectPath(a)}/batches/${batch.batchId}.json`, batch); return { batch };
  } });
  define('get_task', { description: '读取持久任务、检查点和真实产物进度。', input: object({ ...p, taskId: id('task') }), data: taskData, handler: async (r, a) => ({ task: await readTask(r, a) }) });
  define('list_tasks', { description: '枚举项目任务，不把 Agent 报告算作编译完成。', input: object({ ...p, ...pageFields }, ['projectId']), data: object({ tasks: array(doc('task')), total: { type: 'integer' } }), handler: async (r, a) => {
    const tasks = []; for (const path of await r.storage.list(`${projectPath(a)}/tasks`)) { const match = /\/(task-[^/]+)\.json$/.exec(path); if (match) tasks.push(await readTask(r, { ...a, taskId: match[1] })); }
    return { tasks: tasks.slice(a.offset ?? 0, (a.offset ?? 0) + (a.limit ?? 48)), total: tasks.length };
  } });
  for (const name of ['report_task_progress', 'pause_task', 'resume_task', 'cancel_task']) define(name, { description: '更新指定任务执行状态；只有核心编译可以写 succeeded。', input: input({ ...p, taskId: id('task'), ...(name === 'report_task_progress' ? { reason: text, status: enumeration('running', 'waiting_user', 'blocked', 'failed') } : {}) }), data: taskData, mutates: true, persists: true, handler: async (r, a) => {
    const task = touch(r, await readTask(r, a));
    if (['succeeded', 'cancelled'].includes(task.status)) throw new StudioError('VALIDATION_FAILED', '终态任务保持原结果；修改请登记新任务。');
    task.status = a.status ?? ({ pause_task: 'paused', resume_task: 'running', cancel_task: 'cancelled' })[name]; task.reason = a.reason ?? null;
    await r.writeDocument('task', `${projectPath(a)}/tasks/${task.taskId}.json`, task); return { task };
  } });
  define('apply_operations', { description: '按登记任务原子替换一个图标矩阵；严格显式几何、节点、组合及组件操作。', input: { ...input({ ...v, taskId: id('task'), operations: array(geometryOperations, { minItems: 1, maxItems: 1000 }) }), $defs: { layer: layerSchema } }, data: object({ matrix: doc('matrix') }), mutates: true, persists: true, handler: applyOperations });
  define('get_icon', { description: '读取当前持久矩阵与语义，不隐式编译。', input: object(i), data: object({ matrix: doc('matrix'), icon: vocabularyItemSchema }), handler: async (r, a) => ({ matrix: await readMatrix(r, a), icon: requireValue((await readVocabulary(r, a)).icons.find(i => i.iconId === a.iconId)) }) });
  define('get_layer', { description: '读取明确图层、路径节点和控制柄坐标。', input: object({ ...v, layerId: id('l') }), data: { ...object({ layer: layerRef }), $defs: { layer: layerSchema } }, handler: async (r, a) => ({ layer: requireValue(locateLayer(requireValue((await readMatrix(r, a)).variants.find(v => v.variantId === a.variantId)).layers, a.layerId)).layer }) });
  define('preview_icon', { description: '按需绘制当前草稿，按内容哈希缓存，不将预览作为生产 SVG。', input: object(v), data: object({ svg: { type: 'string', maxLength: 8 * 1024 * 1024 }, bounds, contentHash: text, sourceRevision: revision }), handler: async (r, a) => {
    const c = await variantContent(r, a); r.previewCache ??= new Map();
    let preview = r.previewCache.get(c.contentHash);
    if (!preview) { preview = validateGeometry(c.variant, c.rules, c.primitives); r.previewCache.set(c.contentHash, preview); if (r.previewCache.size > 192) r.previewCache.delete(r.previewCache.keys().next().value); }
    return { svg: preview.svg, bounds: preview.bounds, contentHash: c.contentHash, sourceRevision: c.matrix.revision };
  } });
  define('validate_icon', { description: '验证当前变体注册、规则、几何；校验通过不等于审核。', input: object(v), data: object({ valid: { const: true }, bounds, contentHash: text }), handler: async (r, a) => { const c = await variantContent(r, a); return { valid: true, bounds: validateGeometry(c.variant, c.rules, c.primitives).bounds, contentHash: c.contentHash }; } });
  for (const name of ['validate_scheme', 'compile_scheme']) define(name, { description: '逐变体验证/编译；分别报告成功与失败，不覆盖失败对象的旧产物。', input: name === 'compile_scheme' ? input({ ...s, iconId: identity.iconId, variantId: identity.variantId }, ['projectId', 'schemeId']) : object(s), data: object({ items: array(resultItem) }), mutates: name === 'compile_scheme', persists: name === 'compile_scheme', handler: async (r, a, signal) => {
    const items = [];
    for (const target of await schemeTargets(r, a)) {
      await new Promise(resolve => setTimeout(resolve, 0));
      if (signal?.aborted) throw new StudioError('CANCELLED', '操作已取消；已保存对象保留。');
      try { if (name === 'compile_scheme') await compileVariant(r, target); else { const c = await variantContent(r, target); validateGeometry(c.variant, c.rules, c.primitives); }
        items.push({ iconId: target.iconId, variantId: target.variantId, ok: true, message: null });
      } catch (e) { items.push({ iconId: target.iconId, variantId: target.variantId, ok: false, message: e instanceof StudioError ? e.message : '处理失败，未确认完成。' }); }
    }
    return { items };
  } });
  define('list_primitives', { description: '读取当前方案组件身份。', input: object(s), data: object({ primitiveIds: array(id('prim')) }), handler: async (r, a) => ({ primitiveIds: Object.keys(await readPrimitives(r, a)) }) });
  define('get_primitive', { description: '读取明确组件显式几何。', input: object({ ...s, primitiveId: id('prim') }), data: { ...object({ layers: array(layerRef) }), $defs: { layer: layerSchema } }, handler: async (r, a) => ({ layers: requireValue((await readPrimitives(r, a))[a.primitiveId]) }) });
  define('query_icons', { description: '按语义名称、concept、tags 过滤后分页；只读取当前页矩阵，不编译整库。', input: object({ ...s, ...pageFields, search: { type: 'string', maxLength: 200 }, tag: shortText }, ['projectId', 'schemeId']), data: object({ items: array(object({ icon: vocabularyItemSchema, variants: array(object({ variantId: identity.variantId, size: number, style: text, weight: text })) })), total: { type: 'integer' }, tags: array(text) }), handler: async (r, a) => {
    await readScheme(r, a); const vocabulary = (await readVocabulary(r, a)).icons.filter(i => i.status === 'active');
    const existing = new Set((await r.storage.list(`${schemePath(a)}/matrix`)).map(path => /\/(i-[^/]+)\.json$/.exec(path)?.[1]).filter(Boolean));
    const active = vocabulary.filter(i => existing.has(i.iconId));
    const matches = active.filter(i => (!a.tag || i.tags.includes(a.tag)) && (!a.search || `${i.name} ${i.concept} ${i.tags.join(' ')}`.toLocaleLowerCase().includes(a.search.toLocaleLowerCase())));
    const items = []; for (const icon of matches.slice(a.offset ?? 0, (a.offset ?? 0) + (a.limit ?? 48))) {
      const matrix = await r.readDocument('matrix', `${schemePath(a)}/matrix/${icon.iconId}.json`);
      items.push({ icon, variants: matrix.variants.filter(v => v.status === 'active').map(({ variantId, size, style, weight }) => ({ variantId, size, style, weight })) });
    }
    return { items, total: matches.length, tags: [...new Set(active.flatMap(i => i.tags))].sort() };
  } });
}
