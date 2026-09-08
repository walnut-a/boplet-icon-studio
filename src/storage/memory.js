import { StudioError } from '../contracts/errors.js';
import { validatePath } from './paths.js';

/** Test adapter. No disk durability; never offered as an online storage fallback. */
export class MemoryStorage {
  kind = 'memory';
  #files = new Map();
  #failWrite = false;

  async readJson(path) {
    validatePath(path);
    if (!this.#files.has(path)) throw new StudioError('TARGET_NOT_FOUND', '目标文件不存在。');
    return JSON.parse(this.#files.get(path));
  }

  async writeJson(path, document) {
    validatePath(path);
    if (this.#failWrite) {
      this.#failWrite = false;
      throw new StudioError('SAVE_FAILED', '测试适配器模拟写入失败。', { retryable: true });
    }
    let content;
    try {
      content = JSON.stringify(document, (_, value) => {
        if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Non-finite');
        if (value === undefined || typeof value === 'function' || typeof value === 'symbol') throw new TypeError('Not JSON');
        return value;
      });
    } catch { throw new StudioError('VALIDATION_FAILED', '文档必须是完整的 JSON 数据。'); }
    this.#files.set(path, content);
  }

  async list(prefix = '') {
    validatePath(prefix, { allowRoot: true });
    return [...this.#files.keys()].filter(path => !prefix || path.startsWith(`${prefix}/`)).sort();
  }

  failNextWrite() { this.#failWrite = true; }
}
