import { StudioError } from '../contracts/errors.js';
import { assertSchema } from '../contracts/schema.js';
import { identity, validateDocument } from '../contracts/models.js';
import { operationCatalog } from '../contracts/operations.js';
import { validateResult } from '../contracts/results.js';
import { header } from './projects.js';

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function createStudio({ storage, skill = { status: 'not_loaded', version: null, evidence: null }, clock = Date.now,
  receiptTtlMs = 24 * 60 * 60 * 1000, maxRequests = 10000 } = {}) {
  const id = prefix => `${prefix}-${crypto.randomUUID()}`;
  const time = () => new Date(clock()).toISOString();
  const receipts = new Map();
  const runtime = {
    storage, skill: structuredClone(skill), library: null, revoked: false, sessionId: id('session'), id, time,
    header: () => header(id, time),
    resetView(projectId = null) {
      this.view = { contextId: id('ctx'), view: projectId ? 'project' : 'library', projectId, uiStatus: 'unattached',
        selection: { projectId: null, schemeId: null, iconId: null, variantId: null, layerId: null, nodeId: null, handle: null } };
    },
    storageStatus() { return { connected: Boolean(this.library), kind: this.storage?.kind ?? null, libraryId: this.library?.libraryId ?? null }; },
    async readDocument(kind, path) { return validateDocument(kind, await this.storage.readJson(path)); },
    async writeDocument(kind, path, document) { validateDocument(kind, document); await this.storage.writeJson(path, document); },
  };
  runtime.resetView();

  function errorResult(error, base) {
    const safe = error instanceof StudioError ? error : new StudioError('CAPABILITY_UNAVAILABLE', '内部操作失败；未确认执行成功。', { retryable: false });
    return validateResult({ ...base, ok: false, status: 'failed', persistence: safe.code === 'SAVE_FAILED' ? 'failed' : 'not_applicable',
      error: { code: safe.code, message: safe.message, retryable: safe.retryable, issues: safe.issues }, nextActions: safe.nextActions });
  }

  async function execute(name, input) {
    const base = { operationId: id('op'), target: {}, revision: null, eventCursor: null, warnings: [], nextActions: [] };
    let args;
    let def;
    let receipt;
    try {
      def = Object.hasOwn(operationCatalog, name) ? operationCatalog[name] : null;
      if (!def?.handler) throw new StudioError('CAPABILITY_UNAVAILABLE', '此操作尚未实现或不属于当前合同。', { nextActions: ['get_capabilities'] });
      args = structuredClone(input);
      assertSchema(def.inputSchema, args);
      for (const key of Object.keys(identity)) if (args[key]) base.target[key] = args[key];
      if (runtime.revoked && !['get_capabilities', 'get_session', 'get_storage', 'get_view_context', 'get_selection'].includes(name)) throw new StudioError('PERMISSION_DENIED', '当前会话已撤销。');
      if (def.requiresSkill && runtime.skill.status !== 'loaded') throw new StudioError('CAPABILITY_UNAVAILABLE', '需要先由宿主安装并加载 Skill。', { nextActions: ['get_workflow'] });
      if (def.requiresStorage && !runtime.library) throw new StudioError('PERMISSION_REQUIRED', '尚未连接已授权的数据目录。', { nextActions: ['get_storage'] });
      if (def.mutates) {
        const fingerprint = canonicalJson({ name, args });
        const existing = receipts.get(args.requestId);
        if (existing) {
          if (existing.fingerprint !== fingerprint) throw new StudioError('VALIDATION_FAILED', '同一 requestId 不能改用不同操作或参数。');
          if (existing.expiresAt <= clock()) { existing.promise = null; throw new StudioError('RECEIPT_EXPIRED', '回执已过期；请先读取现状，不自动重放。', { nextActions: ['list_projects'] }); }
          return structuredClone(await existing.promise);
        }
        // Bounded, session-local receipts. Do not evict and silently re-execute forgotten writes.
        if (receipts.size >= maxRequests) throw new StudioError('CAPABILITY_UNAVAILABLE', '当前会话回执容量已满；请读取现状后建立新会话。');
        let resolve;
        const promise = new Promise(done => { resolve = done; });
        receipt = { fingerprint, expiresAt: Infinity, promise, resolve };
        receipts.set(args.requestId, receipt);
      }
      const data = structuredClone(await def.handler(runtime, args));
      assertSchema(def.dataSchema, data);
      const entity = data.project ?? data.library ?? data.brief;
      for (const key of Object.keys(identity)) if (entity?.[key]) base.target[key] = entity[key];
      const result = { ...base, ok: true, status: 'completed', revision: entity?.revision ?? null,
        persistence: def.persists ? 'persisted' : 'not_applicable', data };
      assertSchema(def.outputSchema, result);
      if (receipt) { receipt.expiresAt = clock() + receiptTtlMs; receipt.resolve(result); delete receipt.resolve; }
      return structuredClone(result);
    } catch (error) {
      const result = errorResult(error, base);
      if (receipt) { receipt.expiresAt = clock() + receiptTtlMs; receipt.resolve(result); delete receipt.resolve; }
      return structuredClone(result);
    }
  }
  return Object.freeze({ execute });
}
