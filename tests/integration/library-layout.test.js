import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeStorage } from '../../src/storage/node.js';
import { createStudio } from '../../src/core/studio.js';

const skill = { status: 'loaded', version: '0.1.0-dev.4', evidence: 'isolated-test' };
const call = async (studio, name, input = {}) => {
  const result = await studio.execute(name, input);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.data;
};

test('统一根目录直接保存多个项目，重开后可切换且存储位置不变', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'icon-direct-layout-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const storage = await NodeStorage.open(directory);
  const studio = createStudio({ storage, skill });
  await call(studio, 'connect_library', { create: true, requestId: 'connect' });
  const projects = [];
  for (const name of ['FileBox', 'HETAO']) {
    const { project } = await call(studio, 'create_project', { name, requestId: name });
    projects.push(project);
    assert.equal((await storage.readJson(`${project.projectId}/project.json`)).name, name);
  }
  assert.deepEqual((await readdir(directory)).sort(), ['library.json', ...projects.map(p => p.projectId)].sort());
  const reopened = createStudio({ storage: await NodeStorage.open(directory), skill });
  await call(reopened, 'connect_library', { create: false, requestId: 'reopen' });
  assert.equal((await call(reopened, 'list_projects')).total, 2);
  for (const project of projects) {
    await call(reopened, 'open_project', { projectId: project.projectId, requestId: project.projectId });
    assert.equal((await call(reopened, 'get_view_context')).projectId, project.projectId);
    assert.equal((await call(reopened, 'get_storage')).location, storage.identity);
  }
});

test('缺少布局标记的已有 v3 库沿用 projects 层，不迁移或重写库文件', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'icon-existing-layout-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const storage = await NodeStorage.open(directory);
  const library = { formatVersion: 3, libraryId: 'lib-existing', revision: 'r-existing', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await storage.writeJson('library.json', library);
  const before = await storage.readText('library.json');
  const studio = createStudio({ storage, skill });
  await call(studio, 'connect_library', { create: false, requestId: 'connect' });
  const { project } = await call(studio, 'create_project', { name: '已有库的新项目', requestId: 'new' });
  assert.equal((await storage.readJson(`projects/${project.projectId}/project.json`)).name, project.name);
  assert.equal(await storage.readText('library.json'), before);
  assert.equal((await call(studio, 'list_projects')).total, 1);
  assert.deepEqual((await readdir(directory)).sort(), ['library.json', 'projects']);
});
