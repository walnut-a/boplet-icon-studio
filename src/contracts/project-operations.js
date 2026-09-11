import { array, bool, dimensions, enumeration, id, nullable, object, requestId, revision, shortText, text } from './schema.js';
import { briefContentSchema, confirmationSummary, documentSchemas, identity, ruleContentSchema, vocabularyItemSchema } from './models.js';
import { getBrief, readProject } from '../core/projects.js';
import { confirmedBrief, hash, matrixPath, productionGate, projectPath, readMatrix, readOptional, readRules, readScheme, readVocabulary, requireValue, schemePath, touch } from '../core/documents.js';
import { StudioError } from './errors.js';

export const doc = name => ({ $ref: documentSchemas[name].$id });
export const p = { projectId: identity.projectId };
export const s = { ...p, schemeId: identity.schemeId };
export const i = { ...s, iconId: identity.iconId };
export const v = { ...i, variantId: identity.variantId };
export const write = { requestId, sourceRevision: revision, expectedContextId: id('ctx') };
export const input = (fields, required = Object.keys(fields)) => object({ ...write, ...fields }, ['requestId', ...required]);
export const variantsData = object({ variants: array({ $ref: `${documentSchemas.matrix.$id}#/properties/variants/items` }) });
const fields = Object.keys(briefContentSchema.properties.fields.properties);
const confirmationPreview = object({ confirmationId: id('cf'), revision, contentHash: text, summary: confirmationSummary });
const semanticInput = object(Object.fromEntries(Object.entries(vocabularyItemSchema.properties).filter(([k]) => !['iconId', 'status'].includes(k))));
const readBrief = (r, a) => getBrief(r, a).then(x => x.brief);

export function registerProjectOperations(define) {
  define('update_brief', { description: '完整保存需求草稿；字段带来源，不隐式确认。', input: input({ ...p, content: briefContentSchema }), data: object({ brief: doc('brief') }), mutates: true, persists: true,
    handler: async (r, a) => {
      const old = (await getBrief(r, a)).brief;
      const brief = { ...touch(r, old), content: a.content, status: 'draft', confirmation: null, previousConfirmedRevision: old.status === 'confirmed' ? old.revision : old.previousConfirmedRevision };
      await r.writeDocument('brief', `${projectPath(a)}/history/brief/${old.revision}.json`, old);
      await r.writeDocument('brief', `${projectPath(a)}/history/brief/${brief.revision}.json`, brief);
      await r.writeDocument('brief', `${projectPath(a)}/design-brief.json`, brief);
      const project = touch(r, await readProject(r, a.projectId)); project.currentBriefRevision = brief.revision;
      await r.writeDocument('project', `${projectPath(a)}/project.json`, project);
      return { brief };
    } });
  define('validate_brief', { description: '检查需求缺项；不代替用户确认。', input: object(p), data: object({ valid: bool, missing: array(text) }), handler: async (r, a) => {
    const { brief } = await getBrief(r, a); const missing = fields.filter(k => !brief.content.fields[k]?.value.trim()); return { valid: !missing.length, missing };
  } });
  define('prepare_confirmation', { description: '为项目需求生成精确内容摘要，供用户确认；不用于内部绘制规则。', input: object(p), data: object({ confirmation: confirmationPreview }), handler: async (r, a) => {
    const document = await readBrief(r, a);
    if (fields.some(k => !document.content.fields[k]?.value.trim())) throw new StudioError('VALIDATION_FAILED', '需求仍有缺项。');
    const confirmation = { confirmationId: r.id('cf'), revision: document.revision, contentHash: await hash(document.content), summary: fields.map(k => `${k}: ${document.content.fields[k].value}`).join('\n') };
    r.confirmations ??= new Map(); r.confirmations.set(confirmation.confirmationId, { ...a, ...confirmation }); return { confirmation };
  } });
  define('confirm_brief', {
    description: '用户确认准备好的确切需求；宿主转述记为 host_attestation，不伪装签名。', input: input({ ...p, confirmationId: id('cf'), evidenceReference: text }), data: object({ brief: doc('brief') }), mutates: true, persists: true,
    handler: async (r, a) => {
      const document = await readBrief(r, a); const prepared = requireValue(r.confirmations?.get(a.confirmationId), '确认摘要不存在；请重新准备。');
      if (prepared.projectId !== a.projectId || prepared.schemeId !== a.schemeId || prepared.revision !== document.revision || prepared.contentHash !== await hash(document.content)) throw new StudioError('VALIDATION_FAILED', '内容已改变，不能沿用之前的确认。');
      const { confirmationId, revision: confirmedRevision, contentHash, summary } = prepared;
      document.status = 'confirmed'; document.confirmation = { confirmationId, revision: confirmedRevision, contentHash, summary, confirmedAt: r.time(), evidenceKind: 'host_attestation', evidenceReference: a.evidenceReference };
      await r.writeDocument('brief', `${projectPath(a)}/design-brief.json`, document);
      return { brief: document };
    } });
  define('get_scheme', { description: '读取明确方案。', input: object(s), data: object({ scheme: doc('scheme') }), handler: async (r, a) => ({ scheme: await readScheme(r, a) }) });
  define('create_scheme', { description: '从已确认项目建立空方案或独立复制；不切换视图。', input: input({ ...p, name: shortText, description: nullable(text), sourceSchemeId: identity.schemeId }, ['projectId', 'name']), data: object({ scheme: doc('scheme') }), mutates: true, persists: true,
    handler: async (r, a) => {
      await confirmedBrief(r, a);
      const scheme = { ...r.header(), projectId: a.projectId, schemeId: r.id('s'), name: a.name, description: a.description ?? null, status: 'draft', ruleRevision: null, sourceSchemeId: a.sourceSchemeId ?? null };
      if (a.sourceSchemeId) {
        const source = { ...a, schemeId: a.sourceSchemeId }; await readScheme(r, source);
        for (const path of await r.storage.list(schemePath(source))) {
          const suffix = path.slice(schemePath(source).length + 1);
          if (suffix !== 'rules.json' && !/^matrix\/i-[^/]+\.json$/.test(suffix) && !/^primitives\/prim-[^/]+\.json$/.test(suffix)) continue;
          const value = touch(r, await r.storage.readJson(path)); value.schemeId = scheme.schemeId;
          if (suffix === 'rules.json') value.status = 'draft';
          if (value.variants) value.variants.forEach(v => { v.productionStatus = v.layers.length ? 'draft' : 'planned'; v.reviewStatus = 'unreviewed'; v.compiledRevision = null; });
          await r.storage.writeJson(`${schemePath(scheme)}/${suffix}`, value);
        }
      }
      await r.writeDocument('scheme', `${schemePath(scheme)}/scheme.json`, scheme); return { scheme };
    } });
  for (const name of ['update_scheme', 'archive_scheme', 'restore_scheme']) define(name, {
    description: '更新或归档/恢复方案，不删除历史。', input: input({ ...s, ...(name === 'update_scheme' ? { changes: object({ name: shortText, description: nullable(text) }, [], { minProperties: 1 }) } : {}) }),
    data: object({ scheme: doc('scheme') }), mutates: true, persists: true, handler: async (r, a) => {
      const scheme = { ...touch(r, await readScheme(r, a)), ...(a.changes ?? { status: name === 'archive_scheme' ? 'archived' : 'draft' }) };
      await r.writeDocument('scheme', `${schemePath(a)}/scheme.json`, scheme); return { scheme };
    } });
  define('set_primary_scheme', { description: '用户明确选择或取消主方案；倾向、查看和编辑不构成确认。确认设计方向，不冻结图标、不删除其他方案。', input: input({ ...p, schemeId: nullable(identity.schemeId), evidenceReference: text }), data: object({ project: doc('project') }), mutates: true, persists: true, handler: async (r, a) => {
    if (!a.evidenceReference.trim()) throw new StudioError('VALIDATION_FAILED', '需要用户明确确认的原文引用。');
    if (a.schemeId && (await readScheme(r, a)).status === 'archived') throw new StudioError('VALIDATION_FAILED', '不能采用已归档方案。');
    const project = touch(r, await readProject(r, a.projectId)); project.primarySchemeId = a.schemeId;
    project.primarySchemeConfirmedAt = a.schemeId ? r.time() : null;
    project.primarySchemeEvidence = a.schemeId ? a.evidenceReference : null;
    await r.writeDocument('project', `${projectPath(a)}/project.json`, project); return { project };
  } });
  define('get_design_rules', { description: '读取 Agent 制定的方案规则及生产版本，不代表用户审核。', input: object(s), data: object({ rules: doc('rules') }), handler: async (r, a) => ({ rules: await readRules(r, a) }) });
  define('set_design_rules', { description: '需求确认后由 Agent 保存可用于生产的方案规则，无需用户再次确认；不自动改变已有几何。', input: input({ ...s, content: ruleContentSchema }), data: object({ rules: doc('rules') }), mutates: true, persists: true, handler: async (r, a) => {
    await confirmedBrief(r, a); const scheme = await readScheme(r, a);
    if (scheme.status === 'archived' || (await readProject(r, a.projectId)).status === 'archived') throw new StudioError('VALIDATION_FAILED', '归档目标需要先恢复。');
    if (a.content.padding * 2 >= a.content.gridSize) throw new StudioError('VALIDATION_FAILED', '留白不能占满画布。');
    const rules = { ...r.header(), projectId: a.projectId, schemeId: a.schemeId, content: a.content, status: 'ready' };
    await r.writeDocument('rules', `${schemePath(a)}/rules.json`, rules);
    await r.writeDocument('scheme', `${schemePath(a)}/scheme.json`, { ...touch(r, scheme), ruleRevision: rules.revision, status: 'active' });
    return { rules };
  } });
  define('list_vocabulary', { description: '读取项目图标语义与同义标签。', input: object(p), data: object({ icons: array(vocabularyItemSchema) }), handler: async (r, a) => ({ icons: (await readVocabulary(r, a)).icons }) });
  define('register_icons', { description: '登记独立图标的名称、含义、同义标签及用途，生成稳定身份。', input: input({ ...p, icons: array(semanticInput, { minItems: 1, maxItems: 100 }) }), data: object({ icons: array(vocabularyItemSchema) }), mutates: true, persists: true, handler: async (r, a) => {
    await confirmedBrief(r, a); const vocabulary = touch(r, await readVocabulary(r, a));
    const icons = a.icons.map(icon => ({ ...icon, iconId: r.id('i'), status: 'active' }));
    const concepts = [...vocabulary.icons, ...icons].map(i => i.concept.trim().toLocaleLowerCase());
    if (new Set(concepts).size !== concepts.length) throw new StudioError('VALIDATION_FAILED', '同一语义已登记，请复用图标或更新同义标签。');
    vocabulary.icons.push(...icons); await r.writeDocument('vocabulary', `${projectPath(a)}/vocabulary.json`, vocabulary); return { icons };
  } });
  for (const name of ['update_icon_metadata', 'retire_icon', 'restore_icon']) define(name, {
    description: '维护项目语义；退役保留实现与历史。', input: input({ ...p, iconId: identity.iconId, ...(name === 'update_icon_metadata' ? { metadata: semanticInput } : {}) }), data: object({ icon: vocabularyItemSchema }), mutates: true, persists: true, handler: async (r, a) => {
      const vocabulary = touch(r, await readVocabulary(r, a)); const icon = requireValue(vocabulary.icons.find(i => i.iconId === a.iconId));
      Object.assign(icon, a.metadata ?? { status: name === 'retire_icon' ? 'retired' : 'active' });
      if (vocabulary.icons.some(i => i.iconId !== icon.iconId && i.concept.trim().toLocaleLowerCase() === icon.concept.trim().toLocaleLowerCase())) throw new StudioError('VALIDATION_FAILED', '同一语义已登记。');
      await r.writeDocument('vocabulary', `${projectPath(a)}/vocabulary.json`, vocabulary); return { icon };
    } });
  define('list_variants', { description: '读取独立绘制的尺寸、样式与轻重，不把显示缩放登记成变体。', input: object(i), data: variantsData, handler: async (r, a) => ({ variants: (await readMatrix(r, a)).variants }) });
  define('register_variants', { description: '登记变体；尚未写几何时保持 planned。', input: input({ ...i, variants: array(object({ size: dimensions, style: enumeration('filled', 'outline'), weight: enumeration('light', 'regular', 'medium', 'bold') }), { minItems: 1, maxItems: 100 }) }), data: variantsData, mutates: true, persists: true,
    handler: async (r, a) => {
      await productionGate(r, a); requireValue((await readVocabulary(r, a)).icons.find(i => i.iconId === a.iconId && i.status === 'active'));
      const matrix = touch(r, await readOptional(r, matrixPath(a), { ...r.header(), projectId: a.projectId, schemeId: a.schemeId, iconId: a.iconId, variants: [] }));
      const variants = a.variants.map(x => ({ ...x, variantId: r.id('v'), status: 'active', productionStatus: 'planned', reviewStatus: 'unreviewed', sourceRevision: null, compiledRevision: null, layers: [] }));
      const keys = [...matrix.variants, ...variants].map(v => `${v.size}/${v.style}/${v.weight}`);
      if (new Set(keys).size !== keys.length) throw new StudioError('VALIDATION_FAILED', '同一尺寸、样式和轻重已登记。');
      matrix.variants.push(...variants); await r.writeDocument('matrix', matrixPath(a), matrix); return { variants };
    } });
  for (const name of ['retire_variant', 'restore_variant']) define(name, { description: '退役或恢复明确变体，不删除几何。', input: input(v), data: variantsData, mutates: true, persists: true, handler: async (r, a) => {
    const matrix = touch(r, await readMatrix(r, a)); requireValue(matrix.variants.find(v => v.variantId === a.variantId)).status = name === 'retire_variant' ? 'retired' : 'active';
    await r.writeDocument('matrix', matrixPath(a), matrix); return { variants: matrix.variants };
  } });
}
