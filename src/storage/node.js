import { lstat, mkdir, open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { StudioError } from '../contracts/errors.js';
import { validatePath } from './paths.js';
import { encodeJson } from './json.js';

export const defaultLibraryPath = () => join(homedir(), 'Documents', 'Codex', 'Icon Projects');
const failure = (error, writing = false) => error instanceof StudioError ? error : new StudioError(
  error.code === 'ENOENT' ? 'TARGET_NOT_FOUND' : ['EACCES', 'EPERM', 'ELOOP'].includes(error.code) ? 'PERMISSION_DENIED' : writing ? 'SAVE_FAILED' : 'STORAGE_UNAVAILABLE',
  writing ? '文件未确认保存；请检查目录权限和存储空间。' : '无法读取授权目录内的目标。', { retryable: true });

/** One authorized root. No lock, CAS, merge or cross-file transaction. */
export class NodeStorage {
  kind = 'node';
  #root;
  constructor(root) { this.#root = root; }
  get identity() { return this.#root; }
  static async open(root, { create = false } = {}) {
    const absolute = resolve(root);
    try {
      if (create) await mkdir(absolute, { recursive: true, mode: 0o700 });
      const stat = await lstat(absolute);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new StudioError('PERMISSION_DENIED', '数据根目录必须是明确授权的真实目录。');
      return new NodeStorage(await realpath(absolute));
    } catch (error) { throw failure(error); }
  }
  async #path(relative, createParents = false) {
    validatePath(relative);
    let current = this.#root;
    const rootStat = await lstat(current);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new StudioError('PERMISSION_DENIED', '授权目录已改变。');
    const parts = relative.split('/');
    for (const part of parts.slice(0, -1)) {
      current = join(current, part);
      if (createParents) await mkdir(current, { mode: 0o700 }).catch(e => { if (e.code !== 'EEXIST') throw e; });
      const stat = await lstat(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new StudioError('PERMISSION_DENIED', '不能通过符号链接访问数据。');
    }
    const target = join(current, parts.at(-1));
    try { if ((await lstat(target)).isSymbolicLink()) throw new StudioError('PERMISSION_DENIED', '目标是符号链接。'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    return target;
  }
  async readText(path) {
    let file;
    try {
      file = await open(await this.#path(path), constants.O_RDONLY | constants.O_NOFOLLOW);
      if (!(await file.stat()).isFile()) throw new StudioError('PERMISSION_DENIED', '目标不是普通文件。');
      return await file.readFile('utf8');
    } catch (e) { throw failure(e); } finally { await file?.close(); }
  }
  async readJson(path) {
    const content = await this.readText(path);
    try { return JSON.parse(content); } catch { throw new StudioError('VALIDATION_FAILED', '保存的数据不是有效 JSON。'); }
  }
  async writeText(path, content) {
    if (typeof content !== 'string') throw new StudioError('VALIDATION_FAILED', '文件内容必须是文本。');
    let temporary;
    let file;
    try {
      const target = await this.#path(path, true);
      temporary = `${target}.tmp-${crypto.randomUUID()}`;
      file = await open(temporary, 'wx', 0o600);
      await file.writeFile(content, 'utf8');
      await file.sync();
      await file.close(); file = null;
      // Recheck parents before publication. Atomic replacement is not version arbitration.
      await this.#path(path);
      await rename(temporary, target); temporary = null;
    } catch (e) { throw failure(e, true); }
    finally { await file?.close(); if (temporary) await unlink(temporary).catch(() => {}); }
  }
  async writeJson(path, document) { return this.writeText(path, encodeJson(document)); }
  async list(prefix = '') {
    validatePath(prefix, { allowRoot: true });
    const results = [];
    const walk = async relative => {
      let directory;
      try {
        directory = relative ? await this.#path(`${relative}/.probe`) : this.#root;
        if (relative) directory = directory.slice(0, -7);
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          if (entry.isSymbolicLink() || entry.name.includes('.tmp-')) continue;
          const name = relative ? `${relative}/${entry.name}` : entry.name;
          if (entry.isDirectory()) await walk(name);
          else if (entry.isFile()) results.push(name);
        }
      } catch (e) { if (e.code !== 'ENOENT' && e.code !== 'TARGET_NOT_FOUND') throw failure(e); }
    };
    await walk(prefix);
    return results.sort();
  }
}
