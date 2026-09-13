import { array, bool, enumeration, id, nullable, object, requestId, revision, shortText, text } from './schema.js';
import { CONTRACT_VERSION, documentSchemas, identity } from './models.js';
import { resultSchema } from './results.js';
import { connectLibrary, createProject, getBrief, listProjects, listSchemes, readProject, setProjectStatus, updateProject, primaryScheme } from '../core/projects.js';
import { registerProjectOperations } from './project-operations.js';
import { registerProductionOperations } from './production-operations.js';
import { registerMaintenanceOperations } from './maintenance-operations.js';
import { registerSessionOperations, selectionSchema, viewSchema, viewContext, primarySchemeSchema } from './session-operations.js';
import { registerHandoffOperations } from './handoff-operations.js';
import { StudioError } from './errors.js';
export { viewSchema } from './session-operations.js';

// This is the sole capability inventory, including explicitly unimplemented work.
// Planned tools have no executable schema and are never registered with a transport.
const domains = [
  ['discovery', 'A0', 'get_capabilities get_workflow'],
  ['session', 'A1', 'get_session get_view_context get_selection revoke_session acknowledge_skill'],
  ['navigation', 'A2', 'navigate set_view_options select_geometry'],
  ['storage', 'A1', 'get_storage request_storage_access get_permission_request disconnect_storage scan_projects connect_library'],
  ['project', 'A2', 'list_projects get_project create_project update_project open_project archive_project restore_project'],
  ['brief', 'A2', 'get_brief update_brief validate_brief prepare_confirmation confirm_brief'],
  ['source', 'A3', 'list_sources request_source_access read_source record_source'],
  ['vocabulary', 'A2', 'list_vocabulary register_icons update_icon_metadata retire_icon restore_icon'],
  ['scheme', 'A2', 'list_schemes get_scheme create_scheme update_scheme archive_scheme restore_scheme set_primary_scheme'],
  ['rules', 'A3', 'get_design_rules set_design_rules get_impact'],
  ['variant', 'A3', 'list_variants register_variants retire_variant restore_variant'],
  ['batch', 'A3', 'create_batch get_batch update_batch start_batch'],
  ['task', 'A3', 'list_tasks get_task report_task_progress pause_task resume_task cancel_task'],
  ['icon', 'A3', 'query_icons get_icon get_layer preview_icon'],
  ['geometry', 'A1', 'list_primitives get_primitive apply_operations'],
  ['compile', 'A1', 'validate_icon validate_scheme compile_scheme'],
  ['scene', 'A3', 'get_scene_presets get_usage_bindings set_usage_bindings get_context_preview'],
  ['review', 'A3', 'record_feedback list_feedback resolve_feedback record_review get_review_status'],
  ['history', 'A3', 'list_history get_revision compare_revisions undo redo restore_revision'],
  ['delivery', 'A3', 'prepare_export get_export read_artifact get_agent_handoff'],
  ['operation', 'A1', 'get_operation list_events wait_for_events cancel_operation get_recovery'],
  ['updates', 'A4', 'check_skill_updates get_skill_update_status'],
];
const catalog = Object.fromEntries(domains.flatMap(([domain, phase, names]) => names.split(' ').map(name => [name, {
  name, domain, phase, description: `${domain}: ${name}`, inputSchema: null, dataSchema: null, outputSchema: null, handler: null,
}])));
const doc = name => ({ $ref: documentSchemas[name].$id });
const empty = object({});
const write = { requestId, sourceRevision: revision };
const page = { offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 100 } };
const project = { projectId: identity.projectId };
const pageOf = item => object({ items: array(item), total: { type: 'integer', minimum: 0 }, offset: page.offset, limit: page.limit });
const projectData = object({ project: doc('project') });
const skillSchema = object({ status: enumeration('not_loaded', 'loaded'), version: nullable(shortText), evidence: nullable(text) });
const storageSchema = object({ connected: bool, kind: nullable(enumeration('memory', 'node', 'browser')), libraryId: nullable(identity.libraryId), location: nullable({ type: 'string' }) });

// Viewing existing files and explicit export are usable without a design Agent.
// This allowlist does not authorize source creation, edits, compilation or confirmation.
const viewerOperations = new Set('connect_library disconnect_storage list_projects get_project open_project get_brief list_schemes get_scheme list_variants query_icons get_icon get_layer preview_icon get_context_preview get_design_rules get_usage_bindings get_scene_presets navigate set_view_options select_geometry prepare_export get_export read_artifact get_agent_handoff get_operation'.split(' '));
function define(name, { description, input = empty, data, handler, mutates = false, requiresStorage = true, requiresSkill = !viewerOperations.has(name), persists = false }) {
  catalog[name] = { ...catalog[name], description, inputSchema: { $id: `urn:icon-studio:v${CONTRACT_VERSION}:input:${name}`, ...input },
    dataSchema: data, outputSchema: { $id: `urn:icon-studio:v${CONTRACT_VERSION}:output:${name}`, ...(data.$defs ? { $defs: data.$defs } : {}), ...resultSchema(data) },
    handler, mutates, requiresStorage, requiresSkill, persists };
}

define('get_capabilities', {
  description: '读取完整能力目录，区分已实现操作与尚未实现的工作包；不代表浏览器已连接。', requiresSkill: false, requiresStorage: false,
  data: object({ contractVersion: { const: CONTRACT_VERSION }, documents: object(Object.fromEntries(Object.keys(documentSchemas).map(name => [name, { type: 'object' }]))), operations: array(object({
    name: text, domain: text, phase: text, description: text, available: bool, reason: nullable(text),
    inputSchema: nullable({ type: 'object' }), outputSchema: nullable({ type: 'object' }),
    readOnly: nullable(bool), requiresSkill: nullable(bool), requiresStorage: nullable(bool),
  })), skill: skillSchema, storage: storageSchema }),
  handler: async runtime => ({ contractVersion: CONTRACT_VERSION, documents: documentSchemas, operations: describeOperations(), skill: runtime.skill, storage: runtime.storageStatus() }),
});
define('get_workflow', {
  description: '读取当前实际起始状态和下一步，不将下载或静态页面访问当成 Skill 已加载。', requiresSkill: false, requiresStorage: false,
  data: object({ stage: enumeration('skill_required', 'html_required', 'storage_required', 'project_ready', 'brief_required', 'design_ready'), nextActions: array(text), scope: { const: 'full_skill' } }),
  handler: async runtime => {
    let stage = runtime.skill.status !== 'loaded' ? 'skill_required' : runtime.requireUI && !runtime.attached ? 'html_required' : !runtime.library ? 'storage_required' : 'project_ready';
    if (stage === 'project_ready' && runtime.view.projectId) stage = (await getBrief(runtime, { projectId: runtime.view.projectId })).brief.status === 'confirmed' ? 'design_ready' : 'brief_required';
    return { stage, nextActions: { skill_required: ['acknowledge_skill'], html_required: ['get_view_context'], storage_required: ['connect_library'], project_ready: ['list_projects', 'create_project'], brief_required: ['get_brief', 'update_brief', 'validate_brief', 'prepare_confirmation'], design_ready: ['list_schemes', 'get_design_rules', 'list_tasks', 'get_recovery'] }[stage], scope: 'full_skill' };
  },
});
define('get_session', {
  description: '读取当前核心会话和实际传输；浏览器是否已接入另看上下文状态。', requiresSkill: false, requiresStorage: false,
  data: object({ sessionId: id('session'), transport: enumeration('headless', 'local_http', 'browser_worker'), skill: skillSchema, revoked: bool }),
  handler: async runtime => ({ sessionId: runtime.sessionId, transport: runtime.transport, skill: runtime.skill, revoked: runtime.revoked }),
});
define('acknowledge_skill', {
  description: '宿主实际加载完整 Skill 并取得用户 HTML 许可后转述证据；属于宿主声明，不是安装检测或身份认证。网页按钮不得自行调用。',
  input: object({ requestId, version: shortText, fullSkillLoaded: { const: true }, htmlConsent: { const: true }, evidence: shortText }),
  data: object({ skill: skillSchema }), requiresSkill: false, requiresStorage: false, mutates: true,
  handler: async (runtime, args) => {
    if (!runtime.attached) throw new StudioError('PERMISSION_REQUIRED', '请先打开 HTML 容器。');
    runtime.skill = { status: 'loaded', version: args.version, evidence: `host_attestation: ${args.evidence}` };
    return { skill: runtime.skill };
  },
});
define('get_view_context', { description: '读取真实导航、显示设置、网页连接及项目主方案；无需另查主线。', data: viewSchema, requiresSkill: false, requiresStorage: false, handler: viewContext });
define('get_selection', { description: '读取显式选区；无网页或未选对象时返回 null，不自动选第一个图层。',
  data: object({ contextId: id('ctx'), selection: selectionSchema, uiStatus: enumeration('unattached', 'attached') }), requiresSkill: false, requiresStorage: false,
  handler: async runtime => ({ contextId: runtime.view.contextId, selection: runtime.view.selection, uiStatus: runtime.view.uiStatus }) });
define('get_storage', { description: '读取本会话已连接的目录适配器，不读取任意路径。', data: storageSchema, requiresSkill: false, requiresStorage: false, handler: async runtime => runtime.storageStatus() });
define('connect_library', { description: '连接宿主已授权并注入的 Storage；仅当明确 create 且目录为空时建立新版 Library，不授予系统权限。',
  input: object({ ...write, create: bool }, ['requestId', 'create']),
  data: object({ library: doc('library'), storageKind: enumeration('memory', 'node', 'browser') }), mutates: true, requiresStorage: false, persists: true, handler: connectLibrary });
define('disconnect_storage', { description: '断开当前会话存储和选区，不删除数据，也不终止其他会话。',
  input: object({ requestId }), data: storageSchema, mutates: true, requiresStorage: false,
  handler: async runtime => { runtime.library = null; runtime.resetView(); return runtime.storageStatus(); } });
define('revoke_session', { description: '撤销当前会话继续执行的权限；不关闭其他会话。',
  input: object({ requestId }), data: object({ revoked: { const: true } }), mutates: true, requiresStorage: false, requiresSkill: false,
  handler: async runtime => { runtime.revoked = true; runtime.library = null; runtime.resetView(); return { revoked: true }; } });
define('list_projects', { description: '读取授权库中项目摘要；默认 48 项、最多 100 项，不编译图标。',
  input: object({ ...page, search: shortText, status: enumeration('active', 'archived') }, []), data: pageOf(doc('project')), handler: listProjects });
define('get_project', { description: '读取项目及主方案 ID、当前名称、确认时间，不混同方案几何。', input: object(project), data: object({ project: doc('project'), primaryScheme: primarySchemeSchema }),
  handler: async (runtime, args) => { const project = await readProject(runtime, args.projectId); return { project, primaryScheme: await primaryScheme(runtime, project) }; } });
define('create_project', { description: '建立草稿项目和空语义清单，不确认需求、不生成方案、不抢占当前页面。',
  input: object({ ...write, name: shortText, purpose: nullable(text) }, ['requestId', 'name']), data: projectData, mutates: true, persists: true, handler: createProject });
define('update_project', { description: '更新显式项目的名称和目的摘要；sourceRevision 仅记录来源，不拦截旧副本。',
  input: object({ ...write, ...project, changes: object({ name: shortText, purpose: nullable(text) }, [], { minProperties: 1 }) }, ['requestId', 'projectId', 'changes']),
  data: projectData, mutates: true, persists: true, handler: updateProject });
for (const [name, status] of [['archive_project', 'archived'], ['restore_project', 'active']]) {
  define(name, { description: `${status === 'archived' ? '归档' : '恢复'}明确项目；保留文件与历史，不永久删除。`,
    input: object({ ...write, ...project }, ['requestId', 'projectId']), data: projectData, mutates: true, persists: true,
    handler: (runtime, args) => setProjectStatus(runtime, args, status) });
}
define('open_project', { description: '读取并切换本会话到明确项目，清除之前的选区，不改变偏好方案。',
  input: object({ requestId, ...project }), data: viewSchema, mutates: true,
  handler: async (runtime, args) => { await readProject(runtime, args.projectId); runtime.resetView(args.projectId); return viewContext(runtime); } });
define('get_brief', { description: '读取项目当前需求草稿或确认稿；初始项目允许缺项。', input: object(project), data: object({ brief: doc('brief') }), handler: getBrief });
define('list_schemes', { description: '按名称自然升序读取当前项目方案（先排序后分页）；零方案返回空列表。',
  input: object({ ...project, ...page }, ['projectId']), data: pageOf(doc('scheme')), handler: listSchemes });

registerProjectOperations(define);
registerProductionOperations(define);
registerMaintenanceOperations(define);
registerSessionOperations(define);
registerHandoffOperations(define);
export const operationCatalog = Object.freeze(catalog);
export function describeOperations() {
  return Object.values(operationCatalog).map(def => ({ name: def.name, domain: def.domain, phase: def.phase, description: def.description,
    available: Boolean(def.handler), reason: def.handler ? null : 'NOT_IMPLEMENTED', inputSchema: def.inputSchema, outputSchema: def.outputSchema,
    readOnly: def.handler ? !def.mutates : null, requiresSkill: def.requiresSkill ?? null, requiresStorage: def.requiresStorage ?? null }));
}
