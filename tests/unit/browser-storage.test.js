import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserStorage, chooseDirectory, authorizeDirectory } from '../../src/storage/browser.js';

function directory(name = 'selected') {
  const entries = new Map();
  const root = { kind: 'directory', name, permission: 'granted', entries: async function* () { yield* entries; },
    queryPermission: async () => root.permission,
    async getDirectoryHandle(name, { create = false } = {}) {
      if (!entries.has(name) && create) entries.set(name, directory(name));
      if (!entries.has(name)) throw new DOMException('', 'NotFoundError');
      return entries.get(name);
    },
    async getFileHandle(name, { create = false } = {}) {
      if (!entries.has(name) && create) {
        let content = '';
        entries.set(name, { kind: 'file', getFile: async () => ({ text: async () => content }),
          async createWritable(options) {
            assert.equal(options.keepExistingData, false);
            assert.notEqual(options.mode, 'exclusive');
            let draft = '';
            return { write: async text => { draft = text; }, close: async () => {
              if (root.failClose) throw new DOMException('', 'QuotaExceededError');
              content = draft;
            }, abort: async () => { root.aborted = true; } };
          } });
      }
      if (!entries.has(name)) throw new DOMException('', 'NotFoundError');
      return entries.get(name);
    } };
  return root;
}

test('完整文本、JSON、排序扫描、重连读取与后保存覆盖', async () => {
  const root = directory(), store = new BrowserStorage(root);
  await store.writeJson('projects/p/project.json', { name: '合成项目' });
  await store.writeText('a.svg', '<svg/>');
  assert.deepEqual(await store.list(), ['a.svg', 'projects/p/project.json']);
  assert.deepEqual(await store.list('missing'), []);
  const reopened = new BrowserStorage(root);
  assert.deepEqual(await reopened.readJson('projects/p/project.json'), { name: '合成项目' });
  await reopened.writeText('a.svg', 'last');
  assert.equal(await store.readText('a.svg'), 'last');
});

test('撤权、越界、无效 JSON 和保存失败不伪报成功', async () => {
  const root = directory(), store = new BrowserStorage(root);
  await store.writeText('file', 'old');
  root.failClose = true;
  await assert.rejects(store.writeText('file', 'new'), { code: 'SAVE_FAILED' });
  assert.equal(root.aborted, true);
  assert.equal(await store.readText('file'), 'old');
  await assert.rejects(store.readJson('file'), { code: 'VALIDATION_FAILED' });
  await assert.rejects(store.writeText('../outside', 'x'), { code: 'VALIDATION_FAILED' });
  await assert.rejects(store.writeJson('bad', { n: Infinity }), { code: 'VALIDATION_FAILED' });
  root.permission = 'denied';
  await assert.rejects(store.readText('file'), { code: 'PERMISSION_DENIED' });
  await assert.rejects(store.list(), { code: 'PERMISSION_DENIED' });
  root.permission = 'prompt';
  await assert.rejects(store.readText('file'), { code: 'PERMISSION_REQUIRED' });
});

test('目录选择只建议文稿位置，取消和不支持均不创建替代存储', async () => {
  const states = [];
  const selected = await chooseDirectory({ picker: async options => {
    assert.deepEqual(options, { id: 'boplet-library', mode: 'readwrite', startIn: 'documents' });
    return directory();
  }, onState: state => states.push(state) });
  assert.equal(selected.status, 'granted');
  assert.deepEqual(states, ['pending', 'granted']);
  assert.equal((await chooseDirectory({ picker: async () => { throw new DOMException('', 'AbortError'); } })).status, 'cancelled');
  assert.equal((await chooseDirectory({ picker: null })).status, 'unsupported');
  assert.equal((await chooseDirectory({ picker: async () => { throw new DOMException('', 'NotAllowedError'); } })).status, 'denied');
});

test('已有句柄重新授权必须显式触发，拒绝后不影响原目录数据', async () => {
  const root = directory(), store = new BrowserStorage(root);
  await store.writeText('existing', 'preserved');
  root.permission = 'prompt';
  let requests = 0;
  root.requestPermission = async options => {
    requests++;
    assert.deepEqual(options, { mode: 'readwrite' });
    return root.permission = requests === 1 ? 'denied' : 'granted';
  };
  await assert.rejects(store.readText('existing'), { code: 'PERMISSION_REQUIRED' });
  assert.equal(requests, 0);
  const states = [];
  assert.equal((await authorizeDirectory(root, { onState: state => states.push(state) })).status, 'denied');
  assert.deepEqual(states, ['pending', 'denied']);
  assert.equal((await authorizeDirectory(root)).status, 'granted');
  assert.equal(await new BrowserStorage(root).readText('existing'), 'preserved');
  assert.equal((await authorizeDirectory(null)).status, 'unsupported');
});
