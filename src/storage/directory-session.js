import { BrowserStorage, chooseDirectory, authorizeDirectory } from './browser.js';
import { directoryMemory } from './directory-memory.js';

/** Directory lifecycle only. Connecting/creating a library remains a core operation. */
export class DirectorySession {
  #memory;
  #handle = null;
  storage = null;
  constructor({ memory = directoryMemory } = {}) { this.#memory = memory; }
  get authorizedHandle() { return this.storage ? this.#handle : null; }
  async restore() {
    const handle = await this.#memory.load();
    this.#handle = handle;
    this.storage = null;
    if (!handle) return { status: 'disconnected' };
    const permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission === 'granted') this.storage = new BrowserStorage(handle);
    return { status: permission === 'prompt' ? 'pending' : permission };
  }
  async choose(picker) {
    const result = await chooseDirectory(picker ? { picker } : {});
    // A cancelled or rejected switch must leave the previous connection intact.
    if (result.status !== 'granted') return { status: result.status };
    this.#handle = result.handle;
    this.storage = new BrowserStorage(result.handle);
    try {
      await this.#memory.save(result.handle);
      return { status: 'granted', remembered: true };
    } catch {
      return { status: 'granted', remembered: false };
    }
  }
  async authorize() {
    const result = await authorizeDirectory(this.#handle);
    this.storage = result.status === 'granted' ? new BrowserStorage(this.#handle) : null;
    return { status: result.status };
  }
  async disconnect() {
    this.storage = null;
    this.#handle = null;
    await this.#memory.clear();
    return { status: 'disconnected' };
  }
}
