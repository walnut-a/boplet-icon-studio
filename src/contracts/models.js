import { ajv, array, assertSchema, bool, dimensions, enumeration, id, nullable, number, object, point, positiveInteger, revision, shortText, text, timestamp } from './schema.js';
import { StudioError } from './errors.js';

export const FORMAT_VERSION = 3;
export const CONTRACT_VERSION = 3;
export const identity = {
  libraryId: id('lib'), projectId: id('p'), schemeId: id('s'), iconId: id('i'), variantId: id('v'),
};
const lifecycle = enumeration('active', 'archived');
const versionStatus = enumeration('draft', 'awaiting_confirmation', 'confirmed', 'superseded');
export const productionStatus = enumeration('planned', 'draft', 'validated', 'compiled');
export const reviewStatus = enumeration('unreviewed', 'changes_requested', 'accepted', 'stale');
export const taskStatus = enumeration('planned', 'running', 'waiting_user', 'blocked', 'paused', 'succeeded', 'failed', 'cancelled');
export const scopeTarget = object({
  projectId: identity.projectId, schemeId: identity.schemeId, iconId: identity.iconId, variantId: identity.variantId,
}, ['projectId']);
const header = { formatVersion: { const: FORMAT_VERSION }, revision, createdAt: timestamp, updatedAt: timestamp };
export const provenanceSchema = object({
  kind: enumeration('user', 'source', 'agent_suggestion'), reference: nullable(text), awaitingConfirmation: bool,
});
export const briefFieldSchema = object({ value: text, provenance: provenanceSchema });
export const vocabularyItemSchema = object({
  iconId: identity.iconId, name: shortText, concept: text,
  tags: array(shortText, { uniqueItems: true, maxItems: 100 }),
  usages: array(object({ usageId: id('u'), name: shortText, description: text, confirmed: bool }), { maxItems: 100 }),
  status: enumeration('active', 'retired'),
});
export const confirmationSummary = { type: 'string', maxLength: 2 * 1024 * 1024 };
export const confirmationSchema = object({
  confirmationId: id('cf'), revision, contentHash: { type: 'string', pattern: '^sha256-[a-f0-9]{64}$' },
  summary: confirmationSummary, confirmedAt: timestamp, evidenceKind: enumeration('host_attestation', 'verified_host_receipt'), evidenceReference: text,
});
const briefFields = Object.fromEntries(Object.entries({
  purpose: '设计目的：为什么设计、要解决什么问题，不重复风格偏好。',
  stylePreferences: '风格偏好：记录用户明确的审美倾向；无倾向可明确写不限定。不得把 Agent 提出的具体造型预设为需求，造型探索属于方案。',
  audience: '目标用户。', usage: '实际使用场景。', scope: '本次设计和交付范围。', constraints: '必须遵守的边界；用户明确指定的造型约束可在此记录并保留来源。',
}).map(([name, description]) => [name, { ...briefFieldSchema, description }]));
export const briefContentSchema = object({
  fields: object(briefFields, []),
  vocabularyDraft: array(object({ name: shortText, concept: text, tags: array(shortText, { uniqueItems: true }), provenance: provenanceSchema })),
});
export const ruleContentSchema = object({
  gridSize: dimensions, padding: { type: 'number', minimum: 0 }, strokeWidth: dimensions,
  cornerRadius: { type: 'number', minimum: 0 }, lineCap: enumeration('butt', 'round', 'square'),
  lineJoin: enumeration('miter', 'round', 'bevel'), opticalNotes: array(text),
});
const nodeSchema = object({ nodeId: id('n'), point, in: nullable(point), out: nullable(point) });
const layerBase = { layerId: id('l'), name: shortText, visible: bool };
const paint = { drawing: enumeration('fill', 'stroke'), strokeWidth: { type: 'number', minimum: 0 } };
const layerRef = { $ref: '#/$defs/layer' };
export const layerSchema = { oneOf: [
  object({ ...layerBase, type: { const: 'rect' }, ...paint, x: number, y: number, width: dimensions, height: dimensions, radius: { type: 'number', minimum: 0 } }),
  object({ ...layerBase, type: { const: 'ellipse' }, ...paint, center: point, radiusX: dimensions, radiusY: dimensions }),
  object({ ...layerBase, type: { const: 'line' }, start: point, end: point, strokeWidth: dimensions }),
  object({ ...layerBase, type: { const: 'path' }, ...paint, closed: bool, nodes: array(nodeSchema, { minItems: 2, maxItems: 10000 }) }),
  object({ ...layerBase, type: { const: 'group' }, children: array(layerRef, { minItems: 1, maxItems: 1000 }) }),
  object({ ...layerBase, type: { const: 'boolean' }, operation: enumeration('union', 'subtract', 'intersect', 'exclude'), children: array(layerRef, { minItems: 2, maxItems: 1000 }) }),
  object({ ...layerBase, type: { const: 'instance' }, primitiveId: id('prim'), transform: array(number, { minItems: 6, maxItems: 6 }) }),
] .map(schema => ({ ...schema, properties: { ...schema.properties, transform: array(number, { minItems: 6, maxItems: 6 }) } })) };
export const variantSchema = object({
  variantId: identity.variantId, size: dimensions, style: enumeration('filled', 'outline'),
  weight: enumeration('light', 'regular', 'medium', 'bold'), status: enumeration('active', 'retired'),
  productionStatus, reviewStatus, sourceRevision: nullable(revision), compiledRevision: nullable(revision),
  layers: array(layerRef, { maxItems: 1000 }),
});

const definitions = {
  library: object({ ...header, libraryId: identity.libraryId }),
  project: object({ ...header, libraryId: identity.libraryId, projectId: identity.projectId, name: shortText,
    purpose: nullable(text), status: lifecycle, currentBriefRevision: revision, preferredSchemeId: nullable(identity.schemeId) }),
  brief: object({ ...header, projectId: identity.projectId, status: versionStatus, content: briefContentSchema,
    confirmation: nullable(confirmationSchema), previousConfirmedRevision: nullable(revision) }),
  vocabulary: object({ ...header, projectId: identity.projectId, icons: array(vocabularyItemSchema) }),
  scheme: object({ ...header, projectId: identity.projectId, schemeId: identity.schemeId, name: shortText,
    description: nullable(text), status: enumeration('draft', 'active', 'archived'), ruleRevision: nullable(revision), sourceSchemeId: nullable(identity.schemeId) }),
  rules: object({ ...header, projectId: identity.projectId, schemeId: identity.schemeId, status: enumeration('draft', 'ready', 'superseded'),
    content: ruleContentSchema }),
  matrix: object({ ...header, projectId: identity.projectId, schemeId: identity.schemeId, iconId: identity.iconId,
    variants: array(variantSchema) }, undefined, { $defs: { layer: layerSchema } }),
  task: object({ ...header, projectId: identity.projectId, taskId: id('task'), batchId: nullable(id('batch')),
    target: scopeTarget, status: taskStatus, briefRevision: revision, ruleRevision: revision,
    progress: object({ completed: { type: 'integer', minimum: 0 }, total: positiveInteger, source: enumeration('core', 'agent_report') }),
    checkpoint: nullable(id('checkpoint')), operationIds: array(id('op')), reason: nullable(text) }),
  batch: object({ ...header, projectId: identity.projectId, schemeId: identity.schemeId, batchId: id('batch'),
    briefRevision: revision, ruleRevision: revision, taskIds: array(id('task'), { uniqueItems: true }), status: taskStatus }),
  review: object({ ...header, projectId: identity.projectId, reviewId: id('review'), target: scopeTarget,
    contentRevision: revision, contentHash: { type: 'string', pattern: '^sha256-[a-f0-9]{64}$' }, status: reviewStatus,
    comment: nullable(text), evidenceKind: enumeration('host_attestation', 'verified_host_receipt'), evidenceReference: text }),
  delivery: object({ ...header, projectId: identity.projectId, exportId: id('export'), target: scopeTarget,
    scope: enumeration('project', 'scheme', 'icon', 'variant'), kind: enumeration('svg', 'source'),
    status: enumeration('preparing', 'ready', 'failed'),
    artifacts: array(object({ artifactId: id('artifact'), relativePath: text, mediaType: shortText,
      bytes: { type: 'integer', minimum: 0 }, contentHash: { type: 'string', pattern: '^sha256-[a-f0-9]{64}$' }, sourceRevision: revision })) }),
};

export const documentSchemas = Object.fromEntries(Object.entries(definitions).map(([name, schema]) => [name, { $id: `urn:icon-studio:v3:${name}`, ...schema }]));
for (const schema of Object.values(documentSchemas)) ajv.addSchema(schema);

export function validateDocument(kind, document) {
  if (!documentSchemas[kind]) throw new StudioError('SCHEMA_UNSUPPORTED', '未知文档类型。');
  if (document?.formatVersion !== FORMAT_VERSION) throw new StudioError('SCHEMA_UNSUPPORTED', '此数据格式不受支持；不转换或覆盖旧项目。');
  assertSchema(documentSchemas[kind], document);
  const unique = (values, message) => { if (new Set(values).size !== values.length) throw new StudioError('VALIDATION_FAILED', message); };
  if (kind === 'vocabulary') unique(document.icons.map(x => x.iconId), '图标身份重复。');
  if (kind === 'matrix') {
    unique(document.variants.map(x => x.variantId), '变体身份重复。');
    for (const variant of document.variants) {
      const layers = [];
      const walk = items => { for (const layer of items) { layers.push(layer.layerId); if (layer.nodes) unique(layer.nodes.map(x => x.nodeId), '节点身份重复。'); if (layer.children) walk(layer.children); } };
      walk(variant.layers);
      unique(layers, '图层身份重复。');
      if (variant.productionStatus === 'compiled' && variant.compiledRevision === null) throw new StudioError('VALIDATION_FAILED', '编译状态缺少实际来源版本。');
    }
  }
  if (kind === 'task' && (document.target.projectId !== document.projectId || document.progress.completed > document.progress.total)) throw new StudioError('VALIDATION_FAILED', '任务目标或进度无效。');
  if (['review', 'delivery'].includes(kind) && document.target.projectId !== document.projectId) throw new StudioError('VALIDATION_FAILED', '目标不属于文档项目。');
  if (kind === 'brief' && document.status === 'confirmed' && document.confirmation?.revision !== document.revision) throw new StudioError('VALIDATION_FAILED', '确认记录必须绑定相同内容版本。');
  return document;
}
