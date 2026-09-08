import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,call,req,rectangle} from '../fixtures/workflow.js';

const content={gridSize:16,padding:1,strokeWidth:1.5,cornerRadius:2,lineCap:'round',lineJoin:'round',opticalNotes:[]};
test('需求确认后直接保存 Agent 规则并编译，不需要第二次用户确认',async()=>{
 const {studio,p,s,target}=await setup();
 const {rules}=await call(studio,'set_design_rules',{...s,content,requestId:req()});
 assert.equal(rules.status,'ready'); assert.equal('confirmation' in rules,false);
 assert.equal((await call(studio,'get_scheme',s)).scheme.ruleRevision,rules.revision);
 const {batch}=await call(studio,'create_batch',{...s,targets:[{iconId:target.iconId,variantId:target.variantId}],requestId:req()});
 await call(studio,'start_batch',{...p,batchId:batch.batchId,requestId:req()});
 await call(studio,'apply_operations',{...target,taskId:batch.taskIds[0],operations:[{op:'add_layer',layer:rectangle}],requestId:req()});
 const result=await call(studio,'compile_scheme',{...target,requestId:req()});
 assert.ok(result.items.every(x=>x.ok));
 assert.equal((await studio.execute('prepare_confirmation',s)).ok,false);
 assert.equal((await studio.execute('confirm_design_rules',{...s,requestId:req()})).ok,false);
 const rejected=await studio.execute('set_design_rules',{...s,content:{...content,padding:8},requestId:req()});
 assert.equal(rejected.ok,false);
 assert.equal((await call(studio,'get_design_rules',s)).rules.revision,rules.revision);
 await call(studio,'set_design_rules',{...s,content:{...content,cornerRadius:3},requestId:req()});
 assert.equal((await studio.execute('apply_operations',{...target,taskId:batch.taskIds[0],operations:[{op:'add_layer',layer:{...rectangle,layerId:'l-new'}}],requestId:req()})).ok,false);
 const brief=(await call(studio,'get_brief',p)).brief;
 await call(studio,'update_brief',{...p,content:brief.content,requestId:req()});
 assert.equal((await studio.execute('set_design_rules',{...s,content,requestId:req()})).error.code,'BRIEF_UNCONFIRMED');
});

test('方案按名称自然顺序排序后分页，不依赖目录或最近修改顺序',async()=>{
 const {studio,p}=await setup();
 for(const name of ['C · 三','A10 · 十','B · 二','A2 · 两','A · 一'])await call(studio,'create_scheme',{...p,name,requestId:req()});
 const page=await call(studio,'list_schemes',{...p,limit:3});
 assert.deepEqual(page.items.map(x=>x.name),['A · 一','A2 · 两','A10 · 十']);
 assert.equal((await call(studio,'list_schemes',{...p,offset:3,limit:1})).items[0].name,'B · 二');
 await call(studio,'update_scheme',{...p,schemeId:page.items[0].schemeId,changes:{description:'修改不改变顺序'},requestId:req()});
 assert.deepEqual((await call(studio,'list_schemes',{...p,limit:3})).items.map(x=>x.name),page.items.map(x=>x.name));
});
