import { createStudio } from '../core/studio.js';
import { BrowserStorage } from '../storage/browser.js';
import { StudioError } from '../contracts/errors.js';

// One directory/session per Worker. The page must terminate it before switching.
let studio;
let storage;
let binding = false;
const directory = { kind: 'browser' };
for (const method of ['readText', 'readJson', 'writeText', 'writeJson', 'list']) {
  directory[method] = (...args) => {
    if (!storage) throw new StudioError('PERMISSION_REQUIRED', '请先在网页中选择目录。');
    return storage[method](...args);
  };
}
self.addEventListener('message', async ({ data }) => {
  const { id, type } = data ?? {};
  try {
    if (type === 'initialize') {
      if (studio) throw Error('运行会话已建立；切换目录请创建新 Worker。');
      storage = data.handle ? new BrowserStorage(data.handle) : null;
      studio = createStudio({ storage: directory, transport: 'browser_worker', requireUI: true });
      // Initialization comes from the HTML host, not proof that Skill is loaded.
      studio.attachUI();
      self.postMessage({ id, result: { sessionId: studio.sessionId } });
      return;
    }
    if (type === 'bind_directory' && studio && !storage && !binding) {
      binding = true;
      try {
      const candidate = new BrowserStorage(data.handle);
      if (await data.handle.queryPermission({ mode: 'readwrite' }) !== 'granted') throw Error('需要目录授权');
      storage = candidate;
      self.postMessage({ id, result: { bound: true } });
      return;
      } finally { binding = false; }
    }
    if (type !== 'execute' || !studio) throw Error('请先初始化网页运行会话。');
    self.postMessage({ id, result: await studio.execute(data.name, data.input ?? {}) });
  } catch {
    self.postMessage({ id, error: '网页运行请求失败；未确认执行成功。' });
  }
});
