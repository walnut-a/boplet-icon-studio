import test from 'node:test';
import assert from 'node:assert/strict';
import { produce, rectangle } from '../fixtures/workflow.js';
import { call, req } from '../fixtures/workflow.js';

test('审核绑定内容；修改后旧审核失效，导出必须来自最新实际编译', async () => {
  const { studio, target, s, batch } = await produce();
  await call(studio, 'compile_scheme', { ...s, requestId: req() });
  const preview = await call(studio, 'preview_icon', target);
  await call(studio, 'record_review', { ...target, requestId: req(), contentHash: preview.contentHash, status: 'accepted', evidenceReference: '用户确认', comment: null });
  assert.equal((await call(studio, 'get_review_status', target)).status, 'accepted');
  const { delivery } = await call(studio, 'prepare_export', { ...target, requestId: req(), scope: 'variant', kind: 'svg' });
  const artifact = await call(studio, 'read_artifact', { projectId: target.projectId, exportId: delivery.exportId, artifactId: delivery.artifacts[0].artifactId });
  assert.ok(artifact.content.startsWith('<svg'));
  await call(studio, 'apply_operations', { ...target, requestId: req(), taskId: batch.taskIds[0], operations: [{ op: 'replace_layer', layerId: 'l-shell', layer: { ...rectangle, radius: 1 } }] });
  assert.equal((await call(studio, 'get_review_status', target)).status, 'stale');
  assert.equal((await studio.execute('prepare_export', { ...target, requestId: req(), scope: 'variant', kind: 'svg' })).ok, false);
});
test('固定场景仅按已确认用途；反馈保存原文，无自动评价', async () => {
  const { studio, target, p } = await produce();
  await call(studio, 'set_usage_bindings', { ...target, requestId: req(), bindings: ['toolbar'] });
  const scenes = await call(studio, 'get_context_preview', target);
  assert.ok(scenes.samples.some(s => s.presetId === 'toolbar'));
  assert.deepEqual(scenes.samples.filter(s=>s.kind==='size_comparison').map(s=>s.displaySize),[16,32,64,128]);
  assert.equal(scenes.samples.filter(s=>s.kind==='inverse').length,1);
  assert.equal(JSON.stringify(scenes).includes('评价'), false);
  const { feedback } = await call(studio, 'record_feedback', { ...target, requestId: req(), comment: '外壳圆角再小一点' });
  assert.equal((await call(studio, 'list_feedback', target)).items[0].comment, feedback.comment);
  await call(studio, 'resolve_feedback', { ...p, requestId: req(), feedbackId: feedback.feedbackId });
});
