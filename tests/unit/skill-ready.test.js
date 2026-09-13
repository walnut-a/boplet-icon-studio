import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudio } from '../../src/core/studio.js';

test('宿主声明须含完整 Skill 与 HTML 同意证据，并明确标注来源', async () => {
  const studio = createStudio({ transport: 'browser_worker', requireUI: true });
  const input = { requestId: crypto.randomUUID(), version: '0.1.0-dev.2', fullSkillLoaded: true, htmlConsent: true, evidence: '用户同意 HTML；宿主已读取完整 Skill 及所需引用。' };
  assert.equal((await studio.execute('acknowledge_skill', input)).ok, false);
  studio.attachUI();
  assert.equal((await studio.execute('acknowledge_skill', { ...input, htmlConsent: false })).ok, false);
  const result = await studio.execute('acknowledge_skill', { ...input, requestId: crypto.randomUUID() });
  assert.equal(result.ok, true);
  assert.equal(result.data.skill.status, 'loaded');
  assert.match(result.data.skill.evidence, /^host_attestation:/);
  assert.equal((await studio.execute('get_workflow', {})).data.stage, 'storage_required');
});
