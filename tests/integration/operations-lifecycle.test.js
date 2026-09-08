import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudio } from '../../src/core/studio.js';
import { produce, call, req, skill } from '../fixtures/workflow.js';

test('需要授权返回 waiting_user，不冒充完成', async () => {
  const studio=createStudio({skill});const result=await studio.execute('request_source_access',{requestId:req()});
  assert.equal(result.status,'waiting_user');assert.ok(result.permissionRequestId);
  assert.equal((await call(studio,'get_permission_request',{permissionRequestId:result.permissionRequestId})).permission.status,'waiting_user');
});

test('长编译一秒内受理，可取消并按 operationId 取得最终结果', async () => {
  const {studio,storage,s}=await produce();const read=storage.readJson.bind(storage);let slow=true;
  storage.readJson=async path=>{if(slow&&path.endsWith('/rules.json'))await new Promise(r=>setTimeout(r,180));return read(path)};
  const started=performance.now();const result=await studio.execute('compile_scheme',{...s,requestId:req()});
  assert.equal(result.status,'accepted');assert.ok(performance.now()-started<1000);
  await call(studio,'cancel_operation',{requestId:req(),operationId:result.operationId});
  let final;do{await new Promise(r=>setTimeout(r,50));final=(await call(studio,'get_operation',{operationId:result.operationId})).result;}while(final.status==='accepted');slow=false;
  // Cancellation cannot retract a file already being saved; the final receipt must be inspectable.
  assert.ok(['failed','completed'].includes(final.status));
  const events=await call(studio,'list_events',{});assert.ok(events.events.some(e=>e.operationId===result.operationId));
});

test('全部编译失败不能声称已持久化', async () => {
  const {studio,s,target,batch,p}=await produce();await call(studio,'pause_task',{...p,taskId:batch.taskIds[0],requestId:req()});
  const result=await studio.execute('compile_scheme',{...s,requestId:req()});
  assert.equal(result.data.items[0].ok,false);assert.equal(result.persistence,'not_applicable');assert.ok(result.warnings.length);
});
