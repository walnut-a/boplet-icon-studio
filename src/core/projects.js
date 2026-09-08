import { StudioError } from '../contracts/errors.js';
import { FORMAT_VERSION, validateDocument } from '../contracts/models.js';

const root = projectId => `projects/${projectId}`;

export async function connectLibrary(runtime, args) {
  if (!runtime.storage) throw new StudioError('STORAGE_UNAVAILABLE', '尚未提供已授权的存储适配器。');
  let library;
  try { library = validateDocument('library', await runtime.storage.readJson('library.json')); }
  catch (error) {
    if (error.code !== 'TARGET_NOT_FOUND') throw error;
    if (!args.create) throw error;
    if ((await runtime.storage.list('')).length) throw new StudioError('SCHEMA_UNSUPPORTED', '目录已有未知内容；请选择空目录，不转换或覆盖。');
    library = { ...runtime.header(), libraryId: runtime.id('lib') };
    await runtime.writeDocument('library', 'library.json', library);
  }
  runtime.library = library;
  return { library, storageKind: runtime.storage.kind };
}

export async function readProject(runtime, projectId) {
  const project = await runtime.readDocument('project', `${root(projectId)}/project.json`);
  if (project.projectId !== projectId || project.libraryId !== runtime.library.libraryId) throw new StudioError('VALIDATION_FAILED', '项目身份与存储位置不一致。');
  return project;
}

export async function listProjects(runtime, args) {
  const items = [];
  for (const path of await runtime.storage.list('projects')) {
    const match = /^projects\/(p-[A-Za-z0-9_-]+)\/project\.json$/.exec(path);
    if (!match) continue;
    const project = await readProject(runtime, match[1]);
    if (args.status && project.status !== args.status) continue;
    if (args.search && !`${project.name} ${project.purpose ?? ''}`.toLocaleLowerCase().includes(args.search.toLocaleLowerCase())) continue;
    items.push(project);
  }
  const offset = args.offset ?? 0;
  const limit = args.limit ?? 48;
  return { items: items.slice(offset, offset + limit), total: items.length, offset, limit };
}

export async function createProject(runtime, args) {
  const projectId = runtime.id('p');
  const brief = { ...runtime.header(), projectId, status: 'draft', content: { fields: {}, vocabularyDraft: [] }, confirmation: null, previousConfirmedRevision: null };
  const vocabulary = { ...runtime.header(), projectId, icons: [] };
  const project = { ...runtime.header(), libraryId: runtime.library.libraryId, projectId, name: args.name,
    purpose: args.purpose ?? null, status: 'active', currentBriefRevision: brief.revision, preferredSchemeId: null };
  // Publish project.json last. No multi-file transaction or foreign-project cleanup.
  await runtime.writeDocument('brief', `${root(projectId)}/design-brief.json`, brief);
  await runtime.writeDocument('vocabulary', `${root(projectId)}/vocabulary.json`, vocabulary);
  await runtime.writeDocument('project', `${root(projectId)}/project.json`, project);
  return { project };
}

export async function updateProject(runtime, args) {
  const project = await readProject(runtime, args.projectId);
  const updated = { ...project, ...args.changes, revision: runtime.id('r'), updatedAt: runtime.time() };
  await runtime.writeDocument('project', `${root(args.projectId)}/project.json`, updated);
  return { project: updated };
}

export async function setProjectStatus(runtime, args, status) {
  return updateProject(runtime, { ...args, changes: { status } });
}

export async function getBrief(runtime, args) {
  const project = await readProject(runtime, args.projectId);
  let brief = await runtime.readDocument('brief', `${root(args.projectId)}/design-brief.json`);
  if (brief.revision !== project.currentBriefRevision) brief = await runtime.readDocument('brief', `${root(args.projectId)}/history/brief/${project.currentBriefRevision}.json`);
  if (brief.projectId !== args.projectId || brief.revision !== project.currentBriefRevision) throw new StudioError('VALIDATION_FAILED', '需求文档与项目引用不一致；需读取恢复状态。');
  return { brief };
}

export async function listSchemes(runtime, args) {
  await readProject(runtime, args.projectId);
  const items = [];
  for (const path of await runtime.storage.list(`${root(args.projectId)}/schemes`)) {
    const match = /^projects\/([^/]+)\/schemes\/([^/]+)\/scheme\.json$/.exec(path);
    if (!match) continue;
    const scheme = await runtime.readDocument('scheme', path);
    if (scheme.projectId !== args.projectId || scheme.schemeId !== match[2]) throw new StudioError('VALIDATION_FAILED', '方案身份与位置不一致。');
    items.push(scheme);
  }
  items.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }) || a.createdAt.localeCompare(b.createdAt) || a.schemeId.localeCompare(b.schemeId));
  const offset = args.offset ?? 0;
  const limit = args.limit ?? 48;
  return { items: items.slice(offset, offset + limit), total: items.length, offset, limit };
}

export function header(id, time) {
  return { formatVersion: FORMAT_VERSION, revision: id('r'), createdAt: time(), updatedAt: time() };
}
