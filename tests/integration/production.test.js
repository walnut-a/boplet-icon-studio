import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, call, req, produce, rectangle } from '../fixtures/workflow.js';

test('几何需要登记任务；草稿、编译、审核相互独立', async () => {
  const { studio, target } = await setup();
  const denied = await studio.execute('apply_operations', { ...target, taskId: 'task-missing', requestId: req(), operations: [{ op: 'add_layer', layer: rectangle }] });
  assert.equal(denied.error.code, 'TARGET_NOT_FOUND');
  const built = await produce();
  const compiled = await call(built.studio, 'compile_scheme', { ...built.s, requestId: req() });
  assert.equal(compiled.items[0].ok, true);
  const { matrix } = await call(built.studio, 'get_icon', built.i);
  assert.equal(matrix.variants[0].productionStatus, 'compiled');
  assert.equal(matrix.variants[0].reviewStatus, 'unreviewed');
  assert.equal((await call(built.studio, 'get_task', { ...built.p, taskId: built.batch.taskIds[0] })).task.status, 'succeeded');
});
test('不合格几何保留原源文件；暂停任务不接受生产写入', async () => {
  const { studio, target, batch, p, i } = await produce();
  const before = await call(studio, 'get_icon', i);
  const invalid = await studio.execute('apply_operations', { ...target, taskId: batch.taskIds[0], requestId: req(), operations: [{ op: 'replace_layer', layerId: 'l-shell', layer: { ...rectangle, x: -10 } }] });
  assert.equal(invalid.ok, false);
  assert.deepEqual(await call(studio, 'get_icon', i), before);
  await call(studio, 'pause_task', { ...p, taskId: batch.taskIds[0], requestId: req() });
  const paused = await studio.execute('apply_operations', { ...target, taskId: batch.taskIds[0], requestId: req(), operations: [{ op: 'delete_layer', layerId: 'l-shell' }] });
  assert.equal(paused.ok, false);
});
