import { StudioError } from '../contracts/errors.js';
import { layerSchema, validateDocument } from '../contracts/models.js';
import { assertSchema, array, object } from '../contracts/schema.js';
import { hash, matrixPath, productionGate, projectPath, readMatrix, readOptional, readScheme, requireValue, schemePath, touch } from './documents.js';
import { renderGeometry } from './geometry.js';

export async function readTask(r, a) {
  const task = await r.readDocument('task', `${projectPath(a)}/tasks/${a.taskId}.json`);
  if (task.projectId !== a.projectId || task.taskId !== a.taskId) throw new StudioError('VALIDATION_FAILED', '任务身份不符。');
  return task;
}
export async function readBatch(r, a) {
  const batch = await r.readDocument('batch', `${projectPath(a)}/batches/${a.batchId}.json`);
  if (batch.projectId !== a.projectId || batch.batchId !== a.batchId) throw new StudioError('VALIDATION_FAILED', '批次身份不符。');
  return batch;
}
export async function readPrimitives(r, a) {
  await readScheme(r, a);
  const primitives = {};
  for (const path of await r.storage.list(`${schemePath(a)}/primitives`)) {
    if (!/\/prim-[^/]+\.json$/.test(path)) continue;
    const primitive = await r.storage.readJson(path);
    if (primitive.projectId !== a.projectId || primitive.schemeId !== a.schemeId) throw new StudioError('VALIDATION_FAILED', '组件身份不符。');
    assertSchema({ ...object({ layers: array({ $ref: '#/$defs/layer' }, { minItems: 1 }) }), $defs: { layer: layerSchema } }, { layers: primitive.layers });
    primitives[primitive.primitiveId] = primitive.layers;
  }
  return primitives;
}
export async function variantContent(r, a, matrix = null, primitiveOverride = null) {
  const { rules } = await productionGate(r, a);
  matrix ??= await readMatrix(r, a);
  const variant = requireValue(matrix.variants.find(v => v.variantId === a.variantId && v.status === 'active'));
  const primitives = primitiveOverride ?? await readPrimitives(r, a);
  const contentHash = await hash({ variant: { size: variant.size, style: variant.style, weight: variant.weight, layers: variant.layers }, primitives, rules: rules.content });
  return { matrix, variant, rules, primitives, contentHash };
}
export function validateGeometry(variant, rules, primitives) {
  const result = renderGeometry(variant, { ...rules.content, primitives });
  const padding = rules.content.padding * variant.size / rules.content.gridSize;
  const b = result.bounds;
  if (!b || b.left < padding - 1e-6 || b.top < padding - 1e-6 || b.right > variant.size - padding + 1e-6 || b.bottom > variant.size - padding + 1e-6) throw new StudioError('VALIDATION_FAILED', '图标为空或墨迹超出安全边界。');
  return result;
}
export function locateLayer(layers, layerId) {
  for (let index = 0; index < layers.length; index++) {
    if (layers[index].layerId === layerId) return { layer: layers[index], parent: layers, index };
    if (layers[index].children) { const found = locateLayer(layers[index].children, layerId); if (found) return found; }
  }
  return null;
}
const find = (layers, id) => requireValue(locateLayer(layers, id), '图层不存在。');
const multiply = ([a,b,c,d,tx,ty], [e,f,g,h,x,y]) => [a*e+c*f,b*e+d*f,a*g+c*h,b*g+d*h,a*x+c*y+tx,b*x+d*y+ty];
function newIds(r, layer) {
  const result = structuredClone(layer); result.layerId = r.id('l');
  result.nodes?.forEach(n => { n.nodeId = r.id('n'); });
  if (result.children) result.children = result.children.map(l => newIds(r, l));
  return result;
}
export function editLayers(r, layers, operations) {
  for (const op of operations) {
    if (op.op === 'add_layer') { (op.parentId ? requireValue(find(layers, op.parentId).layer.children, '父图层不是组。') : layers).push(op.layer); continue; }
    if (['group_layers', 'boolean_layers'].includes(op.op)) {
      const selected = op.layerIds.map(id => find(layers, id));
      if (new Set(op.layerIds).size !== op.layerIds.length || selected.some(l => l.parent !== selected[0].parent)) throw new StudioError('VALIDATION_FAILED', '组合要求不同的同级图层。');
      const parent = selected[0].parent; const index = Math.min(...selected.map(l => l.index));
      const children = parent.filter(l => op.layerIds.includes(l.layerId));
      for (const l of selected.sort((a, b) => b.index - a.index)) parent.splice(l.index, 1);
      parent.splice(index, 0, { layerId: op.layerId, name: op.name, visible: true, type: op.op === 'group_layers' ? 'group' : 'boolean', children, ...(op.op === 'boolean_layers' ? { operation: op.operation } : {}) }); continue;
    }
    const { layer, parent, index } = find(layers, op.layerId);
    if (op.op === 'delete_layer') parent.splice(index, 1);
    else if (op.op === 'replace_layer') { if (op.layer.layerId !== layer.layerId) throw new StudioError('VALIDATION_FAILED', '替换不能改变图层身份。'); parent[index] = op.layer; }
    else if (op.op === 'duplicate_layer') parent.splice(index + 1, 0, newIds(r, layer));
    else if (op.op === 'ungroup') { if (layer.type !== 'group') throw new StudioError('VALIDATION_FAILED', '只能拆开组。'); for (const child of layer.children) { child.visible = layer.visible && child.visible; if (layer.transform) child.transform = multiply(layer.transform,child.transform ?? [1,0,0,1,0,0]); } parent.splice(index, 1, ...layer.children); }
    else if (op.op === 'reorder_layer') { parent.splice(index, 1); parent.splice(Math.min(op.index, parent.length), 0, layer); }
    else if (op.op === 'set_visibility') layer.visible = op.visible;
    else if (op.op === 'transform_layer') layer.transform = op.transform;
    else if (['move_node', 'insert_node', 'delete_node'].includes(op.op)) {
      if (layer.type !== 'path') throw new StudioError('VALIDATION_FAILED', '节点操作仅用于显式路径。');
      if (op.op === 'insert_node') layer.nodes.splice(Math.min(op.index, layer.nodes.length), 0, op.node);
      else { const node = requireValue(layer.nodes.find(n => n.nodeId === op.nodeId));
        if (op.op === 'delete_node') layer.nodes.splice(layer.nodes.indexOf(node), 1);
        else { if (op.handle === 'point') { const delta = op.point.map((x, i) => x - node.point[i]); for (const k of ['in', 'out']) if (node[k]) node[k] = node[k].map((x, i) => x + delta[i]); } node[op.handle] = op.point; }
      }
    } else throw new StudioError('VALIDATION_FAILED', '未知图层操作。');
  }
}
export async function saveMatrix(r, a, matrix) {
  validateDocument('matrix', matrix);
  const old = await readMatrix(r, a);
  const base = `${projectPath(a)}/history/${a.schemeId}/${a.iconId}`;
  await r.storage.writeJson(`${base}/${old.revision}.json`, old);
  await r.storage.writeJson(`${base}/${matrix.revision}.json`, matrix);
  await r.writeDocument('matrix', matrixPath(a), matrix);
}
export async function applyOperations(r, a) {
  const task = await readTask(r, a);
  const { brief, rules } = await productionGate(r, a);
  if (Object.keys(task.target).some(k => task.target[k] !== a[k]) || !['running', 'succeeded'].includes(task.status)) throw new StudioError('TASK_UNREGISTERED', '任务未运行或目标不符。');
  if (task.briefRevision !== brief.revision || task.ruleRevision !== rules.revision) throw new StudioError('TASK_UNREGISTERED', '当前需求/规则需要重新登记生产任务。');
  const matrix = touch(r, await readMatrix(r, a));
  const variant = requireValue(matrix.variants.find(v => v.variantId === a.variantId && v.status === 'active'));
  const primitives = await readPrimitives(r, a);
  const primitiveWrites = [];
  for (const op of a.operations) {
    if (op.op === 'define_primitive') { primitives[op.primitiveId] = op.layers; primitiveWrites.push(op); }
    else if (op.op === 'detach_instance') {
      const { layer, parent, index } = find(variant.layers, op.layerId);
      if (layer.type !== 'instance') throw new StudioError('VALIDATION_FAILED', '此图层不是实例。');
      const expand = (items, ancestors = []) => items.map(item => {
        const copy = newIds(r, item);
        if (copy.type === 'instance') {
          if (ancestors.includes(copy.primitiveId) || ancestors.length > 32) throw new StudioError('VALIDATION_FAILED', '组件引用循环。');
          return { layerId: copy.layerId, name: copy.name, visible: copy.visible, type: 'group', transform: copy.transform, children: expand(requireValue(primitives[copy.primitiveId]), [...ancestors, copy.primitiveId]) };
        }
        if (copy.children) copy.children = expand(copy.children, ancestors);
        return copy;
      });
      parent[index] = { layerId: layer.layerId, name: layer.name, visible: layer.visible, type: 'group', transform: layer.transform, children: expand(requireValue(primitives[layer.primitiveId]), [layer.primitiveId]) };
    } else editLayers(r, variant.layers, [op]);
  }
  validateDocument('matrix', matrix);
  validateGeometry(variant, rules, primitives);
  for (const op of primitiveWrites) renderGeometry({ size: variant.size, layers: op.layers }, { ...rules.content, primitives });
  for (const op of primitiveWrites) await r.storage.writeJson(`${schemePath(a)}/primitives/${op.primitiveId}.json`, { ...r.header(), projectId: a.projectId, schemeId: a.schemeId, primitiveId: op.primitiveId, name: op.name, layers: op.layers });
  variant.productionStatus = 'draft'; variant.sourceRevision = a.sourceRevision ?? null; variant.reviewStatus = variant.reviewStatus === 'accepted' ? 'stale' : variant.reviewStatus;
  await saveMatrix(r, a, matrix);
  task.status = 'running'; task.checkpoint = r.id('checkpoint'); task.progress = { completed: 1, total: 2, source: 'core' };
  await r.writeDocument('task', `${projectPath(a)}/tasks/${task.taskId}.json`, touch(r, task));
  return { matrix };
}
export async function compileVariant(r, a) {
  const content = await variantContent(r, a); const { matrix, variant, rules, primitives, contentHash } = content;
  const { brief } = await productionGate(r, a);
  const tasks = [];
  for (const path of await r.storage.list(`${projectPath(a)}/tasks`)) {
    if (!/\/task-[^/]+\.json$/.test(path)) continue;
    const task = await r.readDocument('task', path);
    if (Object.keys(task.target).every(k => task.target[k] === a[k]) && ['running', 'succeeded'].includes(task.status) && task.ruleRevision === rules.revision && task.briefRevision === brief.revision) tasks.push(task);
  }
  if (!tasks.length) throw new StudioError('TASK_UNREGISTERED', '没有可编译的已登记任务。');
  const result = validateGeometry(variant, rules, primitives);
  const built = { svg: result.svg, contentHash, sourceRevision: matrix.revision, ruleRevision: rules.revision, svgHash: await hash(result.svg), compiledAt: r.time() };
  // Immutable production record first, latest pointer last. Old production remains on failure.
  await r.storage.writeJson(`${schemePath(a)}/builds/${a.iconId}/${a.variantId}/${matrix.revision}.json`, built);
  await r.storage.writeJson(`${schemePath(a)}/builds/${a.iconId}/${a.variantId}/latest.json`, built);
  variant.productionStatus = 'compiled'; variant.compiledRevision = matrix.revision;
  await r.writeDocument('matrix', matrixPath(a), matrix);
  for (const task of tasks) { task.status = 'succeeded'; task.progress = { completed: 2, total: 2, source: 'core' }; await r.writeDocument('task', `${projectPath(a)}/tasks/${task.taskId}.json`, touch(r, task)); }
  for (const batchId of new Set(tasks.map(t => t.batchId))) {
    const batch = await readBatch(r, { ...a, batchId });
    const members = await Promise.all(batch.taskIds.map(taskId => readTask(r, { ...a, taskId })));
    if (members.every(t => t.status === 'succeeded')) { batch.status = 'succeeded'; await r.writeDocument('batch', `${projectPath(a)}/batches/${batchId}.json`, touch(r, batch)); }
  }
  return { variantId: a.variantId, sourceRevision: matrix.revision, contentHash, svg: result.svg };
}
