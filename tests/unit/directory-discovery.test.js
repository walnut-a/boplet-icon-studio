import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverDirectory } from '../../src/storage/directory-discovery.js';
import { setup } from '../fixtures/workflow.js';

function folder(files, prefix = '', name = 'chosen') {
  const entries = new Map();
  for (const path of Object.keys(files).filter(p => p.startsWith(prefix))) {
    const part = path.slice(prefix.length).split('/')[0];
    if (entries.has(part)) continue;
    entries.set(part, path.slice(prefix.length).includes('/') ? folder(files, prefix + part + '/', part) : {
      kind: 'file', getFile: async () => ({ text: async () => files[path] }),
    });
  }
  const get = async name => { if (!entries.has(name)) throw new DOMException('', 'NotFoundError'); return entries.get(name); };
  return { kind: 'directory', name, queryPermission: async () => 'granted', entries: async function* () { yield* entries; }, getDirectoryHandle: get, getFileHandle: get };
}
async function fixture() {
  const { storage } = await setup();
  return Object.fromEntries(await Promise.all((await storage.list()).map(async path => [path, JSON.stringify(await storage.readJson(path))])));
}
test('直接项目库及下一层项目库识别，不递归遍历其他文件夹', async () => {
  const files = await fixture();
  const direct = await discoverDirectory(folder(files));
  assert.equal(direct.kind, 'library');
  assert.equal(direct.libraries[0].projects.length, 1);
  const nested = Object.fromEntries(Object.entries(files).flatMap(([p, v]) => [['one/'+p,v],['two/'+p,v],['deep/hidden/'+p,v]]));
  nested['old/studio-collection.json'] = '{}';
  const result = await discoverDirectory(folder(nested));
  assert.equal(result.kind, 'collection');
  assert.deepEqual(result.libraries.map(l => l.path), ['one', 'two']);
  assert.equal(result.libraries.flatMap(l => l.projects).length, 2);
  assert.ok(result.issues.some(i => i.path === 'old' && i.kind === 'legacy'));
});
test('空目录、项目目录、旧格式与损坏数据分开反馈，不写文件', async () => {
  assert.equal((await discoverDirectory(folder({}))).kind, 'empty');
  assert.equal((await discoverDirectory(folder({'project.json':'{}'}))).kind, 'project');
  assert.equal((await discoverDirectory(folder({'studio-collection.json':'{}'}))).kind, 'legacy');
  assert.equal((await discoverDirectory(folder({'notes.txt':'hello'}))).kind, 'unrecognized');
  assert.equal((await discoverDirectory(folder({'library.json':'broken'}))).kind, 'invalid');
  const files = await fixture();
  const path = Object.keys(files).find(p => p.endsWith('/project.json'));
  const project = JSON.parse(files[path]); project.libraryId = 'lib-other'; files[path] = JSON.stringify(project);
  const result = await discoverDirectory(folder(files));
  assert.equal(result.libraries[0].projects.length, 0);
  assert.ok(result.issues.some(i => i.kind === 'invalid'));
});
