import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudio } from '../../src/core/studio.js';
import { MemoryStorage } from '../../src/storage/memory.js';
import { call, req, skill } from '../fixtures/workflow.js';

test('需求区分设计目的与风格偏好，校验和确认使用同一字段，不接受旧 goals', async () => {
  const studio = createStudio({ storage: new MemoryStorage(), skill });
  await call(studio, 'connect_library', { create: true, requestId: req() });
  const { project } = await call(studio, 'create_project', { name: '合成项目', requestId: req() });
  const p = { projectId: project.projectId };
  const field = value => ({ value, provenance: { kind: 'user', reference: null, awaitingConfirmation: false } });
  const fields = Object.fromEntries(['purpose', 'audience', 'usage', 'scope', 'constraints'].map(key => [key, field(`合成${key}`)]));
  await call(studio, 'update_brief', { ...p, content: { fields, vocabularyDraft: [] }, requestId: req() });
  assert.deepEqual((await call(studio, 'validate_brief', p)).missing, ['stylePreferences']);
  fields.stylePreferences = field('安静、克制；不限定具体造型');
  await call(studio, 'update_brief', { ...p, content: { fields, vocabularyDraft: [] }, requestId: req() });
  assert.equal((await call(studio, 'validate_brief', p)).valid, true);
  const { confirmation } = await call(studio, 'prepare_confirmation', p);
  assert.match(confirmation.summary, /stylePreferences: 安静、克制/);
  assert.doesNotMatch(confirmation.summary, /goals:/);
  await call(studio, 'confirm_brief', { ...p, confirmationId: confirmation.confirmationId, evidenceReference: '合成确认', requestId: req() });
  assert.equal((await call(studio, 'get_brief', p)).brief.content.fields.stylePreferences.value, fields.stylePreferences.value);
  const legacy = { ...fields, goals: fields.stylePreferences }; delete legacy.stylePreferences;
  const rejected = await studio.execute('update_brief', { ...p, content: { fields: legacy, vocabularyDraft: [] }, requestId: req() });
  assert.equal(rejected.ok, false);
  assert.equal((await call(studio, 'get_brief', p)).brief.status, 'confirmed');
});
