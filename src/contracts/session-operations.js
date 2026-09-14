import { array, bool, enumeration, id, nullable, number, object, requestId, shortText, text } from './schema.js';
import { identity } from './models.js';
import { i, input, p, s, v } from './project-operations.js';
import { locateLayer } from '../core/production.js';
import { hash, projectPath, readMatrix, readOptional, readScheme, requireValue } from '../core/documents.js';
import { listProjects, readProject, primaryScheme } from '../core/projects.js';
import { StudioError } from './errors.js';

export const selectionSchema = object({ ...Object.fromEntries(Object.entries(v).map(([k, schema]) => [k, nullable(schema)])), layerId: nullable(id('l')), nodeId: nullable(id('n')), handle: nullable(enumeration('point', 'in', 'out')) });
export const viewOptionsSchema = object({ grid: bool, nodes: bool, zoom: { type: 'number', minimum: 0.25, maximum: 8 }, search: { type: 'string', maxLength: 200 }, tag: nullable(shortText), offset: { type: 'integer', minimum: 0 } });
export const primarySchemeSchema = nullable(object({ schemeId: identity.schemeId, name: shortText, confirmedAt: text }));
export const viewSchema = object({ contextId: id('ctx'), view: enumeration('library', 'project', 'icons', 'structure', 'scenes'), projectId: nullable(identity.projectId), selection: selectionSchema, options: viewOptionsSchema, uiStatus: enumeration('unattached', 'attached'), primaryScheme: primarySchemeSchema });
export async function viewContext(r) {
  return { ...r.view, primaryScheme: r.library && r.view.projectId ? await primaryScheme(r, await readProject(r, r.view.projectId)) : null };
}
const permissionSchema = object({ permissionRequestId: id('perm'), kind: enumeration('storage', 'source'), status: enumeration('waiting_user', 'granted', 'denied', 'unavailable'), message: text });
const eventSchema = object({ cursor: { type: 'integer' }, type: text, operationId: nullable(id('op')), name: nullable(text), target: { type: 'object' }, time: text, status: nullable(text) });
const sourceSchema = object({ sourceId: id('source'), projectId: identity.projectId, reference: text, summary: text, contentHash: text, evidence: enumeration('host_attestation', 'authorized_read'), createdAt: text });
const updateSchema = object({ status: enumeration('checking', 'up_to_date', 'update_available', 'unknown', 'check_failed'), currentVersion: nullable(text), versionSource: text, latestVersion: nullable(text), checkedAt: nullable(text), release: nullable(object({ skillId: text, version: text, publishedAt: text, notes: text, downloadUrl: text, sha256: text, contractVersion: { type: 'integer' }, formatVersion: { type: 'integer' } })), incompatible: bool, message: nullable(text), cacheExpired: bool });
export function registerSessionOperations(define) {
  define('navigate', { description: '切换本会话的项目、方案、图标详情；清除隐藏几何选区。', input: input({ view: viewSchema.properties.view, ...v }, ['view']), data: viewSchema, mutates: true, handler: async (r, a) => {
    const required = { library: [], project: ['projectId'], icons: ['projectId', 'schemeId'], structure: Object.keys(v), scenes: Object.keys(i) }[a.view];
    if (required.some(k => !a[k]) || Object.keys(v).some(k => a[k] && !required.includes(k))) throw new StudioError('VALIDATION_FAILED', '页面与目标层级不符。');
    if (a.projectId) await readProject(r, a.projectId);
    if (a.schemeId) await readScheme(r, a);
    if (a.iconId) { const matrix = await readMatrix(r, a); if (a.variantId) requireValue(matrix.variants.find(v => v.variantId === a.variantId)); }
    r.resetView(a.projectId ?? null); r.view.view = a.view;
    for (const k of required) r.view.selection[k] = a[k];
    return viewContext(r);
  } });
  define('set_view_options', { description: '设置网格、节点、缩放和查询，不修改图标。', input: input({ options: object(viewOptionsSchema.properties, [], { minProperties: 1 }) }), data: object({ options: viewOptionsSchema }), mutates: true, handler: async (r, a) => { Object.assign(r.viewOptions, a.options); return { options: r.viewOptions }; } });
  define('select_geometry', { description: '仅在当前结构详情选择图层/节点/控制柄，不从隐藏缓存推断。', input: input({ expectedContextId: id('ctx'), layerId: nullable(id('l')), nodeId: nullable(id('n')), handle: nullable(enumeration('point', 'in', 'out')) }, ['expectedContextId', 'layerId']), data: viewSchema, mutates: true, handler: async (r, a) => {
    if (r.view.view !== 'structure' || r.view.contextId !== a.expectedContextId) throw new StudioError('CONTEXT_CHANGED', '当前不是对应的结构视图。');
    if (a.layerId) {
      const matrix = await readMatrix(r, r.view.selection); const variant = requireValue(matrix.variants.find(v => v.variantId === r.view.selection.variantId)); const layer = requireValue(locateLayer(variant.layers, a.layerId)).layer;
      if (a.nodeId) { const node = requireValue(layer.nodes?.find(n => n.nodeId === a.nodeId)); if (a.handle && node[a.handle] === null) throw new StudioError('TARGET_NOT_FOUND', '控制柄不存在。'); }
      else if (a.handle) throw new StudioError('VALIDATION_FAILED', '必须指定控制柄所属节点。');
    } else if (a.nodeId || a.handle) throw new StudioError('VALIDATION_FAILED', '节点需要所属图层。');
    Object.assign(r.view.selection, { layerId: a.layerId, nodeId: a.nodeId ?? null, handle: a.handle ?? null }); r.view.contextId = r.id('ctx'); return viewContext(r);
  } });
  for (const [name, kind] of [['request_storage_access', 'storage'], ['request_source_access', 'source']]) define(name, { description: '请求宿主授权目录；工具不能自行授予 OS 权限。', input: input({}), data: object({ permission: permissionSchema }), mutates: true, requiresStorage: false, handler: async r => {
    const permission = { permissionRequestId: r.id('perm'), kind, status: kind === 'storage' && r.storage ? 'granted' : kind === 'source' && r.sources ? 'granted' : 'waiting_user', message: kind === 'storage' ? '请选择或由宿主明确授权数据目录。' : '请单独授权只读资料目录。' };
    r.permissions.set(permission.permissionRequestId, permission); return { permission };
  } });
  define('get_permission_request', { description: '读取权限请求状态，不把发起请求算授权完成。', input: object({ permissionRequestId: id('perm') }), data: object({ permission: permissionSchema }), requiresStorage: false, handler: async (r, a) => ({ permission: requireValue(r.permissions.get(a.permissionRequestId)) }) });
  define('scan_projects', { description: '仅扫描当前已授权库，不转换旧数据。', input: object({}), data: object({ projects: array({ $ref: 'urn:icon-studio:v3:project' }) }), handler: async r => ({ projects: (await listProjects(r, { limit: 100 })).items }) });
  define('record_source', { description: '保存宿主已读取的来源摘要，不把文本路径当授权。', input: input({ ...p, reference: text, summary: text, contentHash: { type: 'string', pattern: '^sha256-[a-f0-9]{64}$' } }), data: object({ source: sourceSchema }), mutates: true, persists: true, handler: async (r, a) => {
    await readProject(r, a.projectId); const source = { sourceId: r.id('source'), projectId: a.projectId, reference: a.reference, summary: a.summary, contentHash: a.contentHash, evidence: 'host_attestation', createdAt: r.time() };
    await r.storage.writeJson(`${projectPath(a, r)}/sources/${source.sourceId}.json`, source); return { source };
  } });
  define('list_sources', { description: '列项目已登记来源及宿主单独授权的可读资料。', input: object(p), data: object({ sources: array(sourceSchema), authorizedFiles: array(text) }), handler: async (r, a) => {
    await readProject(r, a.projectId); const sources = []; for (const path of await r.storage.list(`${projectPath(a, r)}/sources`)) sources.push(await r.storage.readJson(path));
    return { sources, authorizedFiles: r.sources ? (await r.sources.list('')).filter(allowedSource).slice(0, 100) : [] };
  } });
  define('read_source', { description: '限已单独授权的只读资料目录和非敏感文档；长度有界，不执行源码。', input: object({ relativePath: text, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 20000 } }, ['relativePath']), data: object({ content: { type: 'string', maxLength: 20000 }, total: { type: 'integer' }, contentHash: text }), handler: async (r, a) => {
    if (!r.sources) throw new StudioError('PERMISSION_REQUIRED', '资料目录需要单独授权。'); if (!allowedSource(a.relativePath)) throw new StudioError('PERMISSION_DENIED', '此资料不在允许的非敏感文档范围。');
    const content = await r.sources.readText(a.relativePath); return { content: content.slice(a.offset ?? 0, (a.offset ?? 0) + (a.limit ?? 10000)), total: content.length, contentHash: await hash(content) };
  } });
  define('get_operation', { description: '读取本会话可追踪操作的真实最终回执。', input: object({ operationId: id('op') }), data: object({ result: { type: 'object' } }), requiresStorage: false, handler: async (r, a) => ({ result: requireValue(r.operationResults.get(a.operationId)) }) });
  for (const name of ['list_events', 'wait_for_events']) define(name, { description: '补读本会话有界事件；过期游标需要重新读取快照。', input: object({ afterCursor: { type: 'integer', minimum: 0 }, timeoutMs: { type: 'integer', minimum: 0, maximum: 30000 } }, []), data: object({ events: array(eventSchema), cursor: { type: 'integer' }, snapshotRequired: bool }), requiresStorage: false, handler: async (r, a) => {
    if (name === 'wait_for_events' && !r.events.some(e => e.cursor > (a.afterCursor ?? 0))) await new Promise(resolve => { const timer = setTimeout(done, a.timeoutMs ?? 1000); function done() { clearTimeout(timer); r.listeners.delete(done); resolve(); } r.listeners.add(done); });
    return { events: r.events.filter(e => e.cursor > (a.afterCursor ?? 0)), cursor: r.eventSequence, snapshotRequired: (a.afterCursor ?? 0) < (r.events[0]?.cursor ?? 1) - 1 };
  } });
  define('cancel_operation', { description: '取消本会话仍在运行的指定操作，不撤销已保存文件。', input: input({ operationId: id('op') }), data: object({ cancelled: bool }), mutates: true, requiresStorage: false, handler: async (r, a) => { const control = r.operationControls.get(a.operationId); if (!control) { requireValue(r.operationResults.get(a.operationId)); return { cancelled: false }; } control.abort(); return { cancelled: true }; } });
  define('get_recovery', { description: '读取当前磁盘任务与会话状态，用于重开续跑，不重放已成功任务。', input: object(p), data: object({ tasks: array({ $ref: 'urn:icon-studio:v3:task' }), readAt: text }), handler: async (r, a) => { await readProject(r, a.projectId); const tasks = []; for (const path of await r.storage.list(`${projectPath(a, r)}/tasks`)) { const task = await r.readDocument('task', path); if (task.status !== 'succeeded') tasks.push(task); } return { tasks, readAt: r.time() }; } });
  define('check_skill_updates', { description: '检查包内固定官方源，不接受自定义更新地址、不覆盖安装。', input: object({ force: bool }, []), data: updateSchema, requiresSkill: false, requiresStorage: false, handler: (r, a) => r.updates.check(a.force) });
  define('get_skill_update_status', { description: '读取更新缓存；未知安装版本、未配置源和检查失败均不宣称最新版。', data: updateSchema, requiresSkill: false, requiresStorage: false, handler: r => r.updates.get() });
}
function allowedSource(path) {
  return !path.split('/').some(p => /^(?:\.|node_modules$|dist$|build$|vendor$|coverage$)/.test(p)) && !/(?:secret|credential|token|password|private.?key)/i.test(path) && /\.(?:md|txt|json|css|ts|tsx|js|jsx|svg)$/i.test(path);
}
