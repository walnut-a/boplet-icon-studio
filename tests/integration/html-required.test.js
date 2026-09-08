import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudio } from '../../src/core/studio.js';
import { MemoryStorage } from '../../src/storage/memory.js';
import { skill, call, req } from '../fixtures/workflow.js';

test('要求 HTML 的运行会话未连接页面时不能进入设计；连接后支持 HTTP 回退', async () => {
  const storage = new MemoryStorage();
  const studio = createStudio({ storage, skill, requireUI: true, transport: 'local_http' });
  await call(studio, 'connect_library', { create: true, requestId: req() });
  assert.equal((await call(studio, 'get_workflow')).stage, 'html_required');
  const rejected = await studio.execute('create_project', { name: '不应创建', requestId: req() });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'PERMISSION_REQUIRED');
  assert.deepEqual(await storage.list('projects'), []);
  studio.attachUI();
  assert.equal((await call(studio, 'get_workflow')).stage, 'project_ready');
  const { project } = await call(studio, 'create_project', { name: '可见项目', requestId: req() });
  assert.equal(project.name, '可见项目');
});
