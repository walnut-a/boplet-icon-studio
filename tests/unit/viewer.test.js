import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudio } from '../../src/core/studio.js';
import { MemoryStorage } from '../../src/storage/memory.js';
import { produce, call, req } from '../fixtures/workflow.js';

test('未加载 Skill 也能打开已有库、导航和导出，设计写入仍被拦截', async () => {
  const storage = new MemoryStorage();
  const { studio: author, p, s, target } = await produce(storage);
  await call(author, 'compile_scheme', { ...s, requestId: req() });
  const viewer = createStudio({ storage, requireUI: true });
  viewer.attachUI();
  await call(viewer, 'connect_library', { requestId: req(), create: false });
  assert.equal((await call(viewer, 'list_projects')).items.length, 1);
  await call(viewer, 'navigate', { ...target, view: 'structure', requestId: req() });
  await call(viewer, 'preview_icon', target);
  const { delivery } = await call(viewer, 'prepare_export', { ...target, scope: 'variant', kind: 'svg', requestId: req() });
  assert.equal(delivery.status, 'ready');
  assert.equal((await call(viewer, 'get_session')).skill.status, 'not_loaded');
  assert.equal((await call(viewer, 'get_workflow')).stage, 'skill_required');
  const denied = await viewer.execute('update_project', { ...p, requestId: req(), changes: { name: '不可写入' } });
  assert.equal(denied.ok, false);
  assert.equal((await call(viewer, 'get_project', p)).project.name, '合成笔记系统');
});

test('独立查看不能创建库，也不能绕过 HTML 限制', async () => {
  const viewer = createStudio({ storage: new MemoryStorage(), requireUI: true });
  viewer.attachUI();
  assert.equal((await viewer.execute('connect_library', { requestId: req(), create: true })).ok, false);
  const { storage } = await produce();
  const unattached = createStudio({ storage, requireUI: true });
  await call(unattached, 'connect_library', { requestId: req(), create: false });
  assert.equal((await unattached.execute('list_projects', {})).error.code, 'PERMISSION_REQUIRED');
});
