import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, call, req } from '../fixtures/workflow.js';

test('显示设置可被工具读取，导航保留连接状态，场景清除几何指代', async () => {
  const { studio, target, i } = await setup();
  studio.attachUI();
  await call(studio, 'set_view_options', { requestId: req(), options: { grid: false, zoom: 2, search: 'inbox' } });
  await call(studio, 'navigate', { requestId: req(), view: 'structure', ...target });
  const context = await call(studio, 'get_view_context');
  assert.equal(context.uiStatus, 'attached');
  assert.equal(context.options.grid, false);
  assert.equal(context.options.zoom, 2);
  await call(studio, 'navigate', { requestId: req(), view: 'scenes', ...i });
  const scenes = await call(studio, 'get_selection');
  assert.equal(scenes.selection.variantId, null);
  assert.equal(scenes.selection.nodeId, null);
});

test('流程工具不再报告基础骨架，指向当前项目的真实阶段', async () => {
  const { studio, p } = await setup();
  await call(studio, 'open_project', { requestId: req(), ...p });
  const workflow = await call(studio, 'get_workflow');
  assert.equal(workflow.stage, 'design_ready');
  assert.ok(workflow.nextActions.includes('list_schemes'));
  assert.equal(workflow.scope, 'full_skill');
});
