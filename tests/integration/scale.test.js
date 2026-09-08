import { createScaleFixture } from '../fixtures/scale.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir, cpus, platform, release } from 'node:os';
import { join } from 'node:path';
import { setup, call, req } from '../fixtures/workflow.js';
import { NodeStorage } from '../../src/storage/node.js';

test('20 项目 × 5 方案、600 图标 × 4 变体：分页只读当前页，不全库编译', async t => {
  const directory=await mkdtemp(join(tmpdir(),'icon-scale-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const storage=await NodeStorage.open(directory);const {studio,p,s,i}=await createScaleFixture(storage);
  let reads=0;const original=storage.readJson.bind(storage);storage.readJson=async path=>{if(path.includes('/matrix/'))reads++;return original(path)};
  const durations=[];for(let n=0;n<20;n++){reads=0;const start=performance.now();const page=await call(studio,'query_icons',{...s,offset:(n%12)*48});durations.push(performance.now()-start);assert.equal(page.items.length,48);assert.equal(page.total,600);assert.equal(reads,48);}
  reads=0;assert.equal((await call(studio,'list_projects',{limit:100})).total,20);assert.equal(reads,0);
  assert.equal((await storage.list('projects')).some(p=>p.includes('/builds/')),false);
  const p95=durations.sort((a,b)=>a-b)[18];assert.ok(p95<=300,`分页 p95 ${p95}ms > 300ms`);
  const report={os:`${platform()} ${release()}`,cpu:cpus()[0]?.model,node:process.version,cache:'同进程热文件缓存，无预览缓存',projects:20,schemesPerProject:5,icons:600,variantsPerIcon:4,queryP95Ms:p95,matrixReadsPerPage:48,unopenedCompilations:0};
  await mkdir('.qa',{recursive:true});await writeFile('.qa/scale.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
});
