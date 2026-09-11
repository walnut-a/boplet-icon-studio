import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NodeStorage } from '../../src/storage/node.js';
import { startServer } from '../../src/runtime/server.js';
import { createScaleFixture } from '../fixtures/scale.js';
import { skill } from '../fixtures/workflow.js';

test('600 图标真实页面只渲染 48 张，标题对齐，缓存详情切换计时', async t=>{
  const directory=await mkdtemp(join(tmpdir(),'icon-browser-scale-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const storage=await NodeStorage.open(directory),{s}=await createScaleFixture(storage);
  const server=await startServer({storage,skill,appDirectory:resolve(process.env.ICON_STUDIO_TEST_APP ?? 'dist/app')});t.after(server.close);
  const invoke=async(name,input={})=>{const result=await fetch(server.url+'/operation',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${server.token}`},body:JSON.stringify({name,input})}).then(r=>r.json());assert.equal(result.ok,true,JSON.stringify(result));return result.data;};
  await invoke('connect_library',{requestId:crypto.randomUUID(),create:false});await invoke('navigate',{...s,view:'icons',requestId:crypto.randomUUID()});
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-experimental-web-platform-features']});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1903,height:1320}});
  const start=performance.now();await page.goto(server.url);await expect(page.locator('.icon-tile svg')).toHaveCount(48);const firstPageMs=performance.now()-start;
  assert.equal(await page.locator('.icon-tile').count(),48);assert.equal(await page.locator('.icon-tile[aria-pressed]').count(),0);
  const aligned=await page.evaluate(()=>{
    const heading=document.querySelector('.heading').getBoundingClientRect(),title=document.querySelector('.heading h1').getBoundingClientRect();
    const actions=document.querySelector('.heading-actions').getBoundingClientRect(),filters=document.querySelector('.filters').getBoundingClientRect();
    return Math.abs(title.left-filters.left)<1&&Math.abs(actions.right-filters.right)<1&&Math.abs(title.top+title.height/2-actions.top-actions.height/2)<1&&heading.bottom<=filters.top;
  });assert.equal(aligned,true);
  await mkdir('.impeccable/review',{recursive:true});await page.screenshot({path:'.impeccable/review/list-600.png',fullPage:true});
  await page.locator('.icon-tile').first().click();await page.locator('.canvas svg').waitFor();
  const measurements=await page.evaluate(async()=>{
    const tools=await document.modelContext.getTools();const call=async(name,input={})=>JSON.parse(await document.modelContext.executeTool(tools.find(t=>t.name==='icon_studio_v3_'+name),JSON.stringify(input)));
    const context=(await call('get_view_context')).data;const target=Object.fromEntries(['projectId','schemeId','iconId','variantId'].map(k=>[k,context.selection[k]]));const times=[];
    for(let n=0;n<20;n++){const start=performance.now();const r=await call('navigate',{...target,variantId:`v-size-${n%4}`,view:'structure',requestId:crypto.randomUUID()});if(!r.ok)throw Error(JSON.stringify(r));times.push(performance.now()-start);}return times;
  });
  const p95=measurements.sort((a,b)=>a-b)[18];assert.ok(p95<=200,`缓存详情切换 p95 ${p95}ms`);
  await page.getByRole('button',{name:'返回图标列表',exact:true}).click();await expect(page.locator('.icon-tile')).toHaveCount(48);await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(page.locator('.pagination small')).toHaveText('2 / 13');
  await mkdir('.qa',{recursive:true});const report={browser:browser.version(),viewport:'1903x1320',icons:600,firstPageMs,cachedDetailP95Ms:p95,renderedTiles:48,headingsAligned:aligned};await writeFile('.qa/browser-scale.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
});
