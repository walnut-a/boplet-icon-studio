import test from 'node:test';
import assert from 'node:assert/strict';
import { produce, rectangle } from '../fixtures/workflow.js';
import { call, req } from '../fixtures/workflow.js';

test('变换组件拆分后保持墨迹，不再依赖组件；批次编译后完成', async () => {
  const { studio, target, batch, s, p } = await produce();
  const apply = operations => call(studio, 'apply_operations', { ...target, taskId: batch.taskIds[0], requestId: req(), operations });
  await apply([{ op: 'define_primitive', primitiveId: 'prim-dot', name: '点', layers: [{ ...rectangle, width: 4, height: 4, radius: 1 }] },
    { op: 'replace_layer', layerId: 'l-shell', layer: { layerId: 'l-shell', name: '点实例', type: 'instance', visible: true, primitiveId: 'prim-dot', transform: [1, 0, 0, 1, 4, 4] } }]);
  const before = await call(studio, 'preview_icon', target);
  await apply([{ op: 'detach_instance', layerId: 'l-shell' }]);
  assert.deepEqual((await call(studio, 'preview_icon', target)).bounds, before.bounds);
  await apply([{ op: 'transform_layer', layerId: 'l-shell', transform: [1, 0, 0, 1, 2, 0] }]);
  assert.equal((await call(studio, 'preview_icon', target)).bounds.left, 4);
  const grouped=await call(studio,'preview_icon',target);
  await apply([{op:'ungroup',layerId:'l-shell'}]);
  assert.deepEqual((await call(studio,'preview_icon',target)).bounds,grouped.bounds);
  await call(studio, 'compile_scheme', { ...s, requestId: req() });
  assert.equal((await call(studio, 'get_batch', { ...p, batchId: batch.batchId })).batch.status, 'succeeded');
});
