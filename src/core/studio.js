import { StudioError } from '../contracts/errors.js';
import { assertSchema } from '../contracts/schema.js';
import { identity, validateDocument } from '../contracts/models.js';
import { operationCatalog } from '../contracts/operations.js';
import { validateResult } from '../contracts/results.js';
import { header } from './projects.js';
import { createUpdateChecker } from './updates.js';

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function createStudio({ storage, sources = null, updateSource = null, updateCache = null, transport = 'headless', fetcher = globalThis.fetch, skill = { status: 'not_loaded', version: null, evidence: null }, clock = Date.now,
  receiptTtlMs = 24 * 60 * 60 * 1000, maxRequests = 10000, requireUI = false } = {}) {
  const id = prefix => `${prefix}-${crypto.randomUUID()}`;
  const time = () => new Date(clock()).toISOString();
  const receipts = new Map();
  const runtime = {
    storage, sources, transport, requireUI, attached: false, skill: structuredClone(skill), library: null, revoked: false, sessionId: id('session'), id, time,
    permissions: new Map(), operationResults: new Map(), operationControls: new Map(), events: [], eventSequence: 0, listeners: new Set(),
    viewOptions: { grid: true, nodes: true, zoom: 1, search: '', tag: null, offset: 0 },
    emit(event) { this.events.push({ cursor: ++this.eventSequence, type: event.type, operationId: event.operationId ?? null, name: event.name ?? null, target: event.target ?? {}, time: time(), status: event.status ?? null }); if (this.events.length > 1000) this.events.shift(); for (const done of this.listeners) done(); },
    header: () => header(id, time),
    resetView(projectId = null) {
      this.view = { contextId: id('ctx'), view: projectId ? 'project' : 'library', projectId, options: this.viewOptions, uiStatus: this.attached ? 'attached' : 'unattached',
        selection: { projectId: null, schemeId: null, iconId: null, variantId: null, layerId: null, nodeId: null, handle: null } };
    },
    storageStatus() { return { connected: Boolean(this.library), kind: this.storage?.kind ?? null, libraryId: this.library?.libraryId ?? null, location: this.library && this.storage?.kind === 'node' ? this.storage.identity : null }; },
    async readDocument(kind, path) { return validateDocument(kind, await this.storage.readJson(path)); },
    async writeDocument(kind, path, document) { validateDocument(kind, document); await this.storage.writeJson(path, document); },
  };
  runtime.resetView();
  runtime.updates = createUpdateChecker({ currentVersion: skill.version, source: updateSource, cache: updateCache, fetcher, clock, notify: e => runtime.emit({ ...e, target: { version: e.version } }) });
  runtime.updates.trigger();

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
      runtime.updates.trigger();
      if (args.expectedContextId && args.expectedContextId !== runtime.view.contextId) throw new StudioError('CONTEXT_CHANGED', '当前指代对象已变化，请重读选区。');
      if (args.expectedContextId && Object.keys(identity).some(k => args[k] && args[k] !== runtime.view.selection[k])) throw new StudioError('CONTEXT_CHANGED', '显式目标与当前指代对象不符。');
      for (const key of Object.keys(identity)) if (args[key]) base.target[key] = args[key];
      if (runtime.revoked && !['get_capabilities', 'get_session', 'get_storage', 'get_view_context', 'get_selection'].includes(name)) throw new StudioError('PERMISSION_DENIED', '当前会话已撤销。');
      if ((def.requiresSkill || (name === 'connect_library' && args.create)) && runtime.skill.status !== 'loaded') throw new StudioError('CAPABILITY_UNAVAILABLE', '设计操作需要先由宿主完整加载 Skill。', { nextActions: ['get_workflow'] });
      if (runtime.requireUI && !runtime.attached && def.requiresStorage) throw new StudioError('PERMISSION_REQUIRED', '请先打开本会话的 HTML 容器；不能在没有页面的情况下进入设计流程。', { nextActions: ['get_workflow', 'get_view_context'] });
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
      const controller = new AbortController();
      runtime.operationControls.set(base.operationId, controller);
      const work = (async () => {
        let result;
        try {
          const data = structuredClone(await def.handler(runtime, args, controller.signal));
          assertSchema(def.dataSchema, data);
          const entity = data.project ?? data.library ?? data.brief ?? data.matrix ?? data.scheme;
          for (const key of Object.keys(identity)) if (entity?.[key]) base.target[key] = entity[key];
          result = { ...base, ok: true, status: 'completed', revision: entity?.revision ?? null, persistence: def.persists ? 'persisted' : 'not_applicable', data };
          if (['compile_scheme','validate_scheme'].includes(name)) {
            const failed = data.items.filter(item => !item.ok).length;
            if (failed || !data.items.length) result.warnings.push(`${data.items.length - failed} 个目标成功，${failed} 个目标失败。请查看逐项回执。`);
            if (!data.items.some(item => item.ok)) result.persistence = 'not_applicable';
          }
          if (name.startsWith('request_') && data.permission?.status === 'waiting_user') result = { ...base, ok: true, status: 'waiting_user', persistence: 'not_applicable', permissionRequestId: data.permission.permissionRequestId };
          assertSchema(def.outputSchema, result);
        } catch (error) { result = errorResult(error, base); }
        runtime.operationControls.delete(base.operationId);
        runtime.operationResults.set(base.operationId, result);
        if (runtime.operationResults.size > 1000) runtime.operationResults.delete(runtime.operationResults.keys().next().value);
        if (def.mutates) runtime.emit({ type: 'operation', operationId: base.operationId, name, target: base.target, status: result.status });
        return result;
      })();
      let timer;
      const result = ['compile_scheme', 'validate_scheme', 'prepare_export', 'check_skill_updates'].includes(name)
        ? await Promise.race([work, new Promise(resolve => { timer = setTimeout(() => {
          const accepted = validateResult({ ...base, ok: true, status: 'accepted', persistence: 'pending' });
          runtime.operationResults.set(base.operationId, accepted); resolve(accepted);
        }, 100); })]).finally(() => clearTimeout(timer)) : await work;
      if (receipt) { receipt.expiresAt = clock() + receiptTtlMs; receipt.resolve(result); delete receipt.resolve; }
      return structuredClone(result);
    } catch (error) {
      const result = errorResult(error, base);
      runtime.operationResults.set(base.operationId, result);
      if (receipt) { receipt.expiresAt = clock() + receiptTtlMs; receipt.resolve(result); delete receipt.resolve; }
      return structuredClone(result);
    }
  }
  return Object.freeze({ execute, sessionId: runtime.sessionId, get revoked() { return runtime.revoked; }, attachUI() { runtime.attached = true; runtime.view.uiStatus = 'attached'; } });
}
