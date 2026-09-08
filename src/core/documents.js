import { StudioError } from '../contracts/errors.js';
import { getBrief, readProject } from './projects.js';

export const projectPath = a => `projects/${a.projectId}`;
export const schemePath = a => `${projectPath(a)}/schemes/${a.schemeId}`;
export const matrixPath = a => `${schemePath(a)}/matrix/${a.iconId}.json`;
export const touch = (r, doc) => ({ ...doc, revision: r.id('r'), updatedAt: r.time() });
export const requireValue = (value, message = '目标不存在。') => { if (!value) throw new StudioError('TARGET_NOT_FOUND', message); return value; };
export async function hash(value) {
  const content = typeof value === 'string' ? value : JSON.stringify(value);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return `sha256-${Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')}`;
}
export async function readScheme(r, a) {
  await readProject(r, a.projectId);
  const scheme = await r.readDocument('scheme', `${schemePath(a)}/scheme.json`);
  if (scheme.projectId !== a.projectId || scheme.schemeId !== a.schemeId) throw new StudioError('VALIDATION_FAILED', '方案身份与位置不符。');
  return scheme;
}
export async function readVocabulary(r, a) {
  await readProject(r, a.projectId);
  const vocabulary = await r.readDocument('vocabulary', `${projectPath(a)}/vocabulary.json`);
  if (vocabulary.projectId !== a.projectId) throw new StudioError('VALIDATION_FAILED', '语义项目身份不符。');
  return vocabulary;
}
export async function readMatrix(r, a) {
  await readScheme(r, a);
  requireValue((await readVocabulary(r, a)).icons.find(i => i.iconId === a.iconId));
  const matrix = await r.readDocument('matrix', matrixPath(a));
  if (['projectId', 'schemeId', 'iconId'].some(k => matrix[k] !== a[k])) throw new StudioError('VALIDATION_FAILED', '矩阵身份与位置不符。');
  return matrix;
}
export async function readRules(r, a) {
  await readScheme(r, a);
  const rules = await r.readDocument('rules', `${schemePath(a)}/rules.json`);
  if (rules.projectId !== a.projectId || rules.schemeId !== a.schemeId) throw new StudioError('VALIDATION_FAILED', '规则身份与位置不符。');
  return rules;
}
export async function confirmedBrief(r, a) {
  const { brief } = await getBrief(r, a);
  if (brief.status !== 'confirmed') throw new StudioError('BRIEF_UNCONFIRMED', '请先确认当前项目需求。');
  return brief;
}
export async function productionGate(r, a) {
  const brief = await confirmedBrief(r, a);
  const scheme = await readScheme(r, a);
  const rules = await readRules(r, a);
  if (scheme.status === 'archived' || (await readProject(r, a.projectId)).status === 'archived') throw new StudioError('VALIDATION_FAILED', '归档目标需要先恢复。');
  if (a.iconId && !(await readVocabulary(r,a)).icons.some(icon=>icon.iconId===a.iconId&&icon.status==='active')) throw new StudioError('VALIDATION_FAILED','图标已退役或不存在，需要先恢复。');
  if (rules.status !== 'ready' || scheme.ruleRevision !== rules.revision) throw new StudioError('VALIDATION_FAILED', 'Agent 需先保存当前方案规则，无需用户再次确认。');
  return { brief, scheme, rules };
}
export async function readOptional(r, path, fallback) {
  try { return await r.storage.readJson(path); } catch (e) { if (e.code === 'TARGET_NOT_FOUND') return structuredClone(fallback); throw e; }
}
