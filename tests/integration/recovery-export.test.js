import test from 'node:test';
import assert from 'node:assert/strict';
import { produce, setup, call, req } from '../fixtures/workflow.js';
import { StudioError } from '../../src/contracts/errors.js';

test('源导出包含需求、语义、方案和规则；不要求先编译', async () => {
  const {studio,p}=await produce();
  const {delivery}=await call(studio,'prepare_export',{...p,scope:'project',kind:'source',requestId:req()});
  const names=delivery.artifacts.map(a=>a.relativePath);
  assert.ok(names.includes('project.json'));assert.ok(names.includes('design-brief.json'));assert.ok(names.includes('vocabulary.json'));
  assert.ok(names.some(n=>n.endsWith('/scheme.json')));assert.ok(names.some(n=>n.endsWith('/rules.json')));
  assert.ok(names.some(n=>n.includes('/matrix/')));
});

test('需求多文件发布失败，当前引用仍能读回原内容，显式重试可继续', async () => {
  const {studio,storage,p}=await setup(); const before=await call(studio,'get_brief',p);
  const write=storage.writeJson.bind(storage);let fail=true;
  storage.writeJson=async(path,data)=>{if(fail&&path.endsWith('/project.json')){fail=false;throw new StudioError('SAVE_FAILED','模拟项目指针发布失败')}return write(path,data)};
  const content=structuredClone(before.brief.content);content.fields.goals.value='新的目标';
  const result=await studio.execute('update_brief',{...p,requestId:req(),content});assert.equal(result.ok,false);
  assert.deepEqual(await call(studio,'get_brief',p),before);
  await call(studio,'update_brief',{...p,requestId:req(),content});
  assert.equal((await call(studio,'get_brief',p)).brief.content.fields.goals.value,'新的目标');
});
