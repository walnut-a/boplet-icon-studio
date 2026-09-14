import { array, bool, enumeration, id, nullable, number, object, revision, shortText, text } from './schema.js';
import { identity, reviewStatus } from './models.js';
import { doc, i, input, p, s, v } from './project-operations.js';
import { schemeTargets } from './production-operations.js';
import { hash, matrixPath, projectPath, readMatrix, readOptional, readScheme, requireValue, schemePath, touch } from '../core/documents.js';
import { readPrimitives, saveMatrix, validateGeometry, variantContent } from '../core/production.js';
import { getBrief, listSchemes, readProject } from '../core/projects.js';
import { StudioError } from './errors.js';

const longText = { type: 'string', maxLength: 8 * 1024 * 1024 };
const target = a => Object.fromEntries(Object.keys(v).map(k => [k, a[k]]));
const feedbackSchema = object({ feedbackId: id('feedback'), projectId: identity.projectId, target: object(v), comment: text, resolved: bool, contentHash: text, createdAt: text });
const presets = [
  { presetId: 'app', name: '应用图标', sizes: [16, 32, 64, 128] },
  { presetId: 'toolbar', name: '工具栏', sizes: [16, 24] },
  { presetId: 'statusbar', name: '状态栏', sizes: [16, 18] },
  { presetId: 'navigation', name: '导航', sizes: [16, 24] },
];
const bindingPath = (a, r) => `${schemePath(a, r)}/usages/${a.iconId}/${a.variantId}.json`;
const historyRoot = (a, r) => `${projectPath(a, r)}/history/${a.schemeId}/${a.iconId}`;
const bindingSchema = array(enumeration(...presets.map(p => p.presetId)), { uniqueItems: true });

export function registerMaintenanceOperations(define) {
  define('get_scene_presets', { description: '读取固定用途模板；不接受自定义 HTML 或评价。', data: object({ presets: array(object({ presetId: text, name: text, sizes: array(number) })) }), requiresStorage: false, handler: async () => ({ presets }) });
  define('get_usage_bindings', { description: '读取当前变体已绑定用途，没有数据返回空数组。', input: object(v), data: object({ bindings: bindingSchema }), handler: async (r, a) => { await readMatrix(r, a); return { bindings: await readOptional(r, bindingPath(a, r), []) }; } });
  define('set_usage_bindings', { description: '按对话明确用途绑定固定模板，不生成评价。', input: input({ ...v, bindings: bindingSchema }), data: object({ bindings: bindingSchema }), mutates: true, persists: true, handler: async (r, a) => {
    const matrix = await readMatrix(r, a); requireValue(matrix.variants.find(v => v.variantId === a.variantId)); await r.storage.writeJson(bindingPath(a, r), a.bindings); return { bindings: a.bindings };
  } });
  define('get_context_preview', { description: '展开图标全部绑定用途、固定尺寸对比和反色；样本标明源变体，不继承隐藏结构选区。', input: object(v, Object.keys(i)), data: object({ samples: array(object({ kind: enumeration('usage','size_comparison','inverse'), presetId: text, name: text, displaySize: number, sourceSize: number, variantId: identity.variantId, inverse: bool, svg: longText })) }), handler: async (r, a) => {
    const matrix = await readMatrix(r, a); const samples = [], candidates=[];
    for (const variant of matrix.variants.filter(v => v.status === 'active' && (!a.variantId || v.variantId === a.variantId))) {
      const source = { ...a, variantId: variant.variantId }; const bindings = await readOptional(r, bindingPath(source, r), []); if (!bindings.length) continue;
      const c = await variantContent(r, source); const { svg } = validateGeometry(c.variant, c.rules, c.primitives);
      candidates.push({ bindings, sourceSize: c.variant.size, variantId: variant.variantId, svg });
    }
    const sample=(items,displaySize,kind,presetId,name)=>{const source=[...items].sort((a,b)=>Math.abs(a.sourceSize-displaySize)-Math.abs(b.sourceSize-displaySize)||b.sourceSize-a.sourceSize)[0];if(source)samples.push({kind,presetId,name,displaySize,sourceSize:source.sourceSize,variantId:source.variantId,inverse:kind==='inverse',svg:source.svg});};
    for(const preset of presets){const items=candidates.filter(c=>c.bindings.includes(preset.presetId));for(const size of preset.sizes)sample(items,size,'usage',preset.presetId,preset.name);}
    if(candidates.length){for(const size of [16,32,64,128])sample(candidates,size,'size_comparison','comparison','尺寸对比');sample(candidates,64,'inverse','inverse','反色');}
    return { samples };
  } });
  define('record_feedback', { description: '保留用户原文反馈与目标内容版本。', input: input({ ...v, comment: text }), data: object({ feedback: feedbackSchema }), mutates: true, persists: true, handler: async (r, a) => {
    const c = await variantContent(r, a); const feedback = { feedbackId: r.id('feedback'), projectId: a.projectId, target: target(a), comment: a.comment, resolved: false, contentHash: c.contentHash, createdAt: r.time() };
    await r.storage.writeJson(`${projectPath(a, r)}/feedback/${feedback.feedbackId}.json`, feedback); return { feedback };
  } });
  define('list_feedback', { description: '读取明确目标的用户反馈，不添加主观评价。', input: object(v), data: object({ items: array(feedbackSchema) }), handler: async (r, a) => {
    await readMatrix(r, a); const items = [];
    for (const path of await r.storage.list(`${projectPath(a, r)}/feedback`)) { const f = await r.storage.readJson(path); if (Object.keys(v).every(k => f.target[k] === a[k])) items.push(f); }
    return { items };
  } });
  define('resolve_feedback', { description: '显式标记用户反馈已处理。', input: input({ ...p, feedbackId: id('feedback') }), data: object({ feedback: feedbackSchema }), mutates: true, persists: true, handler: async (r, a) => {
    await readProject(r, a.projectId); const path = `${projectPath(a, r)}/feedback/${a.feedbackId}.json`; const feedback = await r.storage.readJson(path);
    if (feedback.projectId !== a.projectId) throw new StudioError('VALIDATION_FAILED', '反馈项目不符。'); feedback.resolved = true; await r.storage.writeJson(path, feedback); return { feedback };
  } });
  define('record_review', { description: '记录对确切当前内容的审核；宿主转述非签名。', input: input({ ...v, contentHash: text, status: enumeration('accepted', 'changes_requested'), comment: nullable(text), evidenceReference: text }), data: object({ review: doc('review') }), mutates: true, persists: true, handler: async (r, a) => {
    const c = await variantContent(r, a); if (c.contentHash !== a.contentHash) throw new StudioError('VALIDATION_FAILED', '审核内容与当前内容不符，请重新查看。');
    const review = { ...r.header(), projectId: a.projectId, reviewId: r.id('review'), target: target(a), contentRevision: c.matrix.revision, contentHash: c.contentHash, status: a.status, comment: a.comment, evidenceKind: 'host_attestation', evidenceReference: a.evidenceReference };
    await r.writeDocument('review', `${projectPath(a, r)}/reviews/${review.reviewId}.json`, review); return { review };
  } });
  define('get_review_status', { description: '按当前几何、规则和组件哈希判断旧审核是否已失效。', input: object(v), data: object({ status: reviewStatus, review: nullable(doc('review')) }), handler: async (r, a) => {
    const c = await variantContent(r, a); const items = [];
    for (const path of await r.storage.list(`${projectPath(a, r)}/reviews`)) { const review = await r.readDocument('review', path); if (Object.keys(v).every(k => review.target[k] === a[k])) items.push(review); }
    const review = items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    return { status: !review ? 'unreviewed' : review.contentHash !== c.contentHash ? 'stale' : review.status, review };
  } });
  define('list_history', { description: '读取明确图标的已保存几何历史，未发布快照不作为当前内容。', input: object(i), data: object({ items: array(object({ revision, updatedAt: text })) }), handler: async (r, a) => {
    await readMatrix(r, a); const items = [];
    for (const path of await r.storage.list(historyRoot(a, r))) { const m = await r.readDocument('matrix', path); items.push({ revision: m.revision, updatedAt: m.updatedAt }); }
    return { items: items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
  } });
  define('get_revision', { description: '读取图标的一个历史矩阵。', input: object({ ...i, revision }), data: object({ matrix: doc('matrix') }), handler: async (r, a) => { await readMatrix(r, a); return { matrix: await r.readDocument('matrix', `${historyRoot(a, r)}/${a.revision}.json`) }; } });
  define('compare_revisions', { description: '比较两个历史矩阵的变体内容，不合并。', input: object({ ...i, from: revision, to: revision }), data: object({ changedVariantIds: array(identity.variantId) }), handler: async (r, a) => {
    await readMatrix(r, a); const from = await r.readDocument('matrix', `${historyRoot(a, r)}/${a.from}.json`); const to = await r.readDocument('matrix', `${historyRoot(a, r)}/${a.to}.json`);
    return { changedVariantIds: [...new Set([...from.variants, ...to.variants].map(v => v.variantId))].filter(id => JSON.stringify(from.variants.find(v => v.variantId === id)) !== JSON.stringify(to.variants.find(v => v.variantId === id))) };
  } });
  for (const name of ['restore_revision', 'undo', 'redo']) define(name, { description: '显式恢复指定历史版本为新保存；保留历史，不自动合并其他会话。', input: input({ ...i, revision, evidenceReference: text }), data: object({ matrix: doc('matrix') }), mutates: true, persists: true, handler: async (r, a) => {
    const matrix = touch(r, await r.readDocument('matrix', `${historyRoot(a, r)}/${a.revision}.json`));
    if (Object.keys(i).some(k => matrix[k] !== a[k])) throw new StudioError('VALIDATION_FAILED', '历史目标不符。');
    for (const variant of matrix.variants) { variant.productionStatus = variant.layers.length ? 'draft' : 'planned'; variant.compiledRevision = null; variant.reviewStatus = 'stale'; }
    await saveMatrix(r, a, matrix); return { matrix };
  } });
  define('get_impact', { description: '枚举规则与组件可能影响的变体和任务；仅报告，不自动修改。', input: object(s), data: object({ targets: array(object(v)), primitiveIds: array(id('prim')), taskIds: array(id('task')) }), handler: async (r, a) => {
    const taskIds = []; for (const path of await r.storage.list(`${projectPath(a, r)}/tasks`)) { const task = await r.readDocument('task', path); if (task.target.schemeId === a.schemeId) taskIds.push(task.taskId); }
    return { targets: await schemeTargets(r, a), primitiveIds: Object.keys(await readPrimitives(r, a)), taskIds };
  } });
  define('prepare_export', { description: '输出明确范围的 SVG 或源快照；逐文件校验来源，不把保存当导出。', input: input({ ...v, scope: enumeration('project', 'scheme', 'icon', 'variant'), kind: enumeration('svg', 'source') }, ['projectId', 'scope', 'kind']), data: object({ delivery: doc('delivery') }), mutates: true, persists: true, handler: async (r, a, signal) => {
    await readProject(r, a.projectId);
    const needed = { project: ['projectId'], scheme: ['projectId', 'schemeId'], icon: ['projectId', 'schemeId', 'iconId'], variant: Object.keys(v) }[a.scope];
    if (needed.some(k => !a[k]) || Object.keys(v).some(k => a[k] && !needed.includes(k))) throw new StudioError('VALIDATION_FAILED', '导出范围与明确目标不一致。');
    const delivery = { ...r.header(), projectId: a.projectId, exportId: r.id('export'), target: Object.fromEntries(needed.map(k => [k, a[k]])), scope: a.scope, kind: a.kind, status: 'preparing', artifacts: [] };
    const root = `${projectPath(a, r)}/deliveries/${delivery.exportId}`;
    const add = async (relativePath, mediaType, content, sourceRevision) => {
      const artifactId = r.id('artifact'); await r.storage.writeJson(`${root}/${artifactId}.json`, { content });
      delivery.artifacts.push({ artifactId, relativePath, mediaType, bytes: new TextEncoder().encode(content).length, contentHash: await hash(content), sourceRevision });
    };
    const schemes = a.schemeId ? [await readScheme(r, a)] : [];
    if (!a.schemeId) { let offset=0,total; do { const page=await listSchemes(r,{projectId:a.projectId,offset,limit:100});schemes.push(...page.items);total=page.total;offset+=100; } while(offset<total); }
    if (a.kind === 'source') {
      const project=await readProject(r,a.projectId),brief=(await getBrief(r,a)).brief,vocabulary=await r.readDocument('vocabulary',`${projectPath(a, r)}/vocabulary.json`);
      if(a.iconId)vocabulary.icons=vocabulary.icons.filter(icon=>icon.iconId===a.iconId);
      for(const [path,value] of [['project.json',project],['design-brief.json',brief],['vocabulary.json',vocabulary]])await add(path,'application/json',JSON.stringify(value),value.revision);
      for(const scheme of schemes){
        const prefix=`schemes/${scheme.schemeId}`,target={...a,schemeId:scheme.schemeId};
        await add(`${prefix}/scheme.json`,'application/json',JSON.stringify(scheme),scheme.revision);
        const rules=await readOptional(r,`${schemePath(target, r)}/rules.json`,null);if(rules)await add(`${prefix}/rules.json`,'application/json',JSON.stringify(rules),rules.revision);
        for(const path of await r.storage.list(schemePath(target, r))){
          await new Promise(resolve=>setTimeout(resolve,0));if(signal?.aborted)throw new StudioError('CANCELLED','源导出已取消，已保存文件保留。');
          const suffix=path.slice(schemePath(target, r).length+1),match=/^matrix\/(i-[^/]+)\.json$/.exec(suffix);
          if(match&&(!a.iconId||a.iconId===match[1])){const matrix=await readMatrix(r,{...target,iconId:match[1]});if(a.variantId)matrix.variants=matrix.variants.filter(v=>v.variantId===a.variantId);await add(`${prefix}/${suffix}`,'application/json',JSON.stringify(matrix),matrix.revision);}
          else if(/^primitives\/prim-[^/]+\.json$/.test(suffix)){const value=await r.storage.readJson(path);await add(`${prefix}/${suffix}`,'application/json',JSON.stringify(value),value.revision);}
          else if(/^usages\/i-[^/]+\/v-[^/]+\.json$/.test(suffix)&&(!a.iconId||suffix.split('/')[1]===a.iconId)&&(!a.variantId||suffix.endsWith(`/${a.variantId}.json`)))await add(`${prefix}/${suffix}`,'application/json',JSON.stringify(await r.storage.readJson(path)),scheme.revision);
        }
      }
    }
    if (a.kind === 'svg')
    for (const scheme of schemes) for (const target of await schemeTargets(r, { ...a, schemeId: scheme.schemeId })) {
      await new Promise(resolve => setTimeout(resolve, 0));
      if (signal?.aborted) throw new StudioError('CANCELLED', '导出已取消，已写入文件保留。');
      const c = await variantContent(r, target);
      {
        const built = await r.storage.readJson(`${schemePath(target, r)}/builds/${target.iconId}/${target.variantId}/latest.json`);
        if (built.contentHash !== c.contentHash || built.svgHash !== await hash(built.svg)) throw new StudioError('VALIDATION_FAILED', '当前内容尚未编译或生产产物被改变。');
        await add(`${scheme.schemeId}/${target.iconId}/${target.variantId}.svg`, 'image/svg+xml', built.svg, built.sourceRevision);
      }
    }
    if (!delivery.artifacts.length) throw new StudioError('VALIDATION_FAILED', '范围内没有可导出对象。');
    delivery.status = 'ready'; await r.writeDocument('delivery', `${root}/delivery.json`, delivery); return { delivery };
  } });
  define('get_export', { description: '读取已准备交付的范围、哈希和文件清单。', input: object({ ...p, exportId: id('export') }), data: object({ delivery: doc('delivery') }), handler: async (r, a) => { await readProject(r, a.projectId); return { delivery: await r.readDocument('delivery', `${projectPath(a, r)}/deliveries/${a.exportId}/delivery.json`) }; } });
  define('read_artifact', { description: '只读取已登记交付物，校验字节和哈希，不开放任意文件路径。', input: object({ ...p, exportId: id('export'), artifactId: id('artifact') }), data: object({ content: longText, mediaType: text, relativePath: text }), handler: async (r, a) => {
    await readProject(r, a.projectId); const root = `${projectPath(a, r)}/deliveries/${a.exportId}`; const delivery = await r.readDocument('delivery', `${root}/delivery.json`);
    const artifact = requireValue(delivery.artifacts.find(x => x.artifactId === a.artifactId)); const { content } = await r.storage.readJson(`${root}/${a.artifactId}.json`);
    if (await hash(content) !== artifact.contentHash || new TextEncoder().encode(content).length !== artifact.bytes) throw new StudioError('VALIDATION_FAILED', '交付物校验不符。'); return { content, mediaType: artifact.mediaType, relativePath: artifact.relativePath };
  } });
}
