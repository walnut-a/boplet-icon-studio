import { StudioError } from '../contracts/errors.js';
import { validatePath } from './paths.js';
import { encodeJson } from './json.js';

const failure = (error, writing = false) => error instanceof StudioError ? error : new StudioError(
  ['NotAllowedError', 'SecurityError'].includes(error.name) ? 'PERMISSION_DENIED'
    : writing ? 'SAVE_FAILED' : error.name === 'NotFoundError' ? 'TARGET_NOT_FOUND' : 'STORAGE_UNAVAILABLE',
  writing ? '文件未确认保存；请检查目录权限和存储空间。' : '无法读取所选目录，请重新授权。', { retryable: true });

/** Only an explicitly supplied directory handle; never falls back to OPFS or memory. */
export class BrowserStorage {
  kind = 'browser';
  #root;
  constructor(handle) {
    if (handle?.kind !== 'directory' || typeof handle.queryPermission !== 'function') {
      throw new StudioError('PERMISSION_REQUIRED', '请先选择并授权本地目录。');
    }
    this.#root = handle;
  }
  get identity() { return this.#root.name; } // Not an absolute filesystem path.
  async #permission(writing = false) {
    const status = await this.#root.queryPermission({ mode: writing ? 'readwrite' : 'read' });
    if (status !== 'granted') throw new StudioError(status === 'denied' ? 'PERMISSION_DENIED' : 'PERMISSION_REQUIRED', '请通过页面重新授权所选目录。');
  }
  async #directory(parts, create = false) {
    let handle = this.#root;
    for (const part of parts) handle = await handle.getDirectoryHandle(part, { create });
    return handle;
  }
  async readText(path) {
    validatePath(path);
    try {
      await this.#permission();
      const parts = path.split('/'), name = parts.pop();
      const file = await (await this.#directory(parts)).getFileHandle(name);
      return await (await file.getFile()).text();
    } catch (error) { throw failure(error); }
  }
  async readJson(path) {
    const text = await this.readText(path);
    try { return JSON.parse(text); }
    catch { throw new StudioError('VALIDATION_FAILED', '保存的数据不是有效 JSON。'); }
  }
  async writeText(path, content) {
    validatePath(path);
    if (typeof content !== 'string') throw new StudioError('VALIDATION_FAILED', '文件内容必须是文本。');
    let stream;
    try {
      await this.#permission(true);
      const parts = path.split('/'), name = parts.pop();
      const file = await (await this.#directory(parts, true)).getFileHandle(name, { create: true });
      stream = await file.createWritable({ keepExistingData: false, mode: 'siloed' });
      await stream.write(content);
      await stream.close(); // Only close confirms publication; no application lock/CAS.
    } catch (error) {
      if (stream) await stream.abort().catch(() => {});
      throw failure(error, true);
    }
  }
  async writeJson(path, document) { return this.writeText(path, encodeJson(document)); }
  async list(prefix = '') {
    validatePath(prefix, { allowRoot: true });
    try {
      await this.#permission();
      let root;
      try { root = await this.#directory(prefix ? prefix.split('/') : []); }
      catch (error) { if (error.name === 'NotFoundError') return []; throw error; }
      const results = [];
      const walk = async (directory, parent) => {
        for await (const [name, handle] of directory.entries()) {
          if (name.includes('.tmp-')) continue;
          const path = parent ? `${parent}/${name}` : name;
          validatePath(path);
          if (handle.kind === 'directory') await walk(handle, path);
          else if (handle.kind === 'file') results.push(path);
        }
      };
      await walk(root, prefix);
      return results.sort();
    } catch (error) { throw failure(error); }
  }
}

/** Call directly from a user gesture. No async work before opening the picker. */
export async function chooseDirectory({ picker = globalThis.showDirectoryPicker?.bind(globalThis), onState = () => {} } = {}) {
  const result = (status, handle = null) => { onState(status); return { status, handle }; };
  if (typeof picker !== 'function') return result('unsupported');
  onState('pending');
  try {
    const handle = await picker({ id: 'boplet-library', mode: 'readwrite', startIn: 'documents' });
    const permission = await handle.queryPermission({ mode: 'readwrite' });
    return result(permission === 'granted' ? 'granted' : permission === 'prompt' ? 'pending' : 'denied', handle);
  } catch (error) {
    if (error.name === 'AbortError') return result('cancelled');
    if (['NotAllowedError', 'SecurityError'].includes(error.name)) return result('denied');
    throw failure(error);
  }
}

/** Explicit reconnect button only: request permission before any awaited work. */
export async function authorizeDirectory(handle, { onState = () => {} } = {}) {
  const result = status => { onState(status); return { status, handle }; };
  if (handle?.kind !== 'directory' || typeof handle.requestPermission !== 'function') return result('unsupported');
  onState('pending');
  try {
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    return result(permission === 'granted' ? 'granted' : permission === 'prompt' ? 'pending' : 'denied');
  } catch (error) {
    if (error.name === 'AbortError') return result('cancelled');
    if (['NotAllowedError', 'SecurityError'].includes(error.name)) return result('denied');
    throw failure(error);
  }
}
