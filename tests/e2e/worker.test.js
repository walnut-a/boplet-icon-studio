import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { renderGeometry } from '../../src/core/geometry.js';

test('同一几何核心在真实浏览器 Worker 与 Node 输出相同', async t => {
  const compiled = await build({stdin:{contents:"import {renderGeometry} from './src/core/geometry.js'; self.onmessage=e=>{try{postMessage({result:renderGeometry(e.data)})}catch(e){postMessage({error:e.message})}}",resolveDir:process.cwd()},bundle:true,platform:'browser',format:'iife',write:false});
  const server=createServer((q,s)=>{s.setHeader('Content-Type',q.url==='/worker.js'?'text/javascript':'text/html');s.end(q.url==='/worker.js'?compiled.outputFiles[0].text:'<!doctype html><title>Shared core test</title>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const browser=await chromium.launch({channel:'chrome',headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const rect=(id,x)=>({layerId:id,name:id,type:'rect',visible:true,drawing:'fill',strokeWidth:0,x,y:2,width:10,height:10,radius:2});
  const samples=[{size:24,layers:[rect('l-a',2)]},{size:24,layers:[{layerId:'l-b',name:'差集',type:'boolean',visible:true,operation:'subtract',children:[rect('l-a',2),rect('l-c',6)]}]},
    {size:24,layers:[{layerId:'l-curve',name:'曲线',type:'path',visible:true,drawing:'stroke',strokeWidth:1,closed:false,nodes:[{nodeId:'n-a',point:[3,10],in:null,out:[3,2]},{nodeId:'n-b',point:[20,10],in:[20,20],out:null}]}]}];
  for(const sample of samples){const actual=await page.evaluate(data=>new Promise((resolve,reject)=>{const w=new Worker('/worker.js');w.onmessage=e=>{w.terminate();resolve(e.data)};w.onerror=e=>{w.terminate();reject(Error(e.message))};w.postMessage(data)}),sample);assert.equal(actual.error,undefined);assert.deepEqual(actual.result,renderGeometry(sample));}
});
