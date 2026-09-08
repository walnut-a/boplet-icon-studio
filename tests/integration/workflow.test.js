import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudio } from '../../src/core/studio.js';
import { MemoryStorage } from '../../src/storage/memory.js';

import { setup, call, req, skill } from '../fixtures/workflow.js';

test('确认绑定确切内容，草稿不能生产，创建不跳转', async () => {
  const studio = createStudio({ storage: new MemoryStorage(), skill });
  await call(studio, 'connect_library', { requestId: req(), create: true });
  const { project } = await call(studio, 'create_project', { requestId: req(), name: '未确认' });
  const result = await studio.execute('create_scheme', { projectId: project.projectId, name: '不能创建', requestId: req() });
  assert.equal(result.error.code, 'BRIEF_UNCONFIRMED');
  assert.equal((await call(studio, 'get_view_context')).view, 'library');
});

test('需求到独立方案和变体登记可重开，标签是有内容的语义元数据', async () => {
  const { studio, storage, p, s, i } = await setup();
  const reopened = createStudio({ storage, skill });
  await call(reopened, 'connect_library', { create: false, requestId: req() });
  assert.equal((await call(reopened, 'get_brief', p)).brief.status, 'confirmed');
  assert.equal((await call(reopened, 'get_design_rules', s)).rules.status, 'confirmed');
  assert.equal((await call(reopened, 'list_variants', i)).variants.length, 1);
  assert.equal((await call(studio, 'list_vocabulary', p)).icons[0].tags[0], 'inbox');
  const copy = await call(studio, 'create_scheme', { ...p, requestId: req(), name: '副本', sourceSchemeId: s.schemeId });
  assert.notEqual(copy.scheme.schemeId, s.schemeId);
});
test('长需求确认摘要不截断，也不因摘要上限小于合法字段总长而失败',async()=>{
  const {studio,p}=await setup();const content=(await call(studio,'get_brief',p)).brief.content;
  for(const field of Object.values(content.fields))field.value='需求'.repeat(1500);
  await call(studio,'update_brief',{...p,requestId:req(),content});
  const {confirmation}=await call(studio,'prepare_confirmation',p);assert.ok(confirmation.summary.length>18000);
  await call(studio,'confirm_brief',{...p,requestId:req(),confirmationId:confirmation.confirmationId,evidenceReference:'合成测试长内容确认'});
});
