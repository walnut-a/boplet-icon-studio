import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { buildSkill, inspectPackage } from '../../scripts/package.js';
import { produce, call, req } from '../fixtures/workflow.js';

test('白名单包脱离仓库依赖启动、离线重开，卸载不删除独立数据', async t => {
  const root = await mkdtemp(join(tmpdir(), 'icon-package-')); t.after(() => rm(root, { recursive: true, force: true }));
  const packageDirectory = join(root, 'installed', 'make-product-icons');
  await buildSkill(packageDirectory); const report = await inspectPackage(packageDirectory);
  assert.equal(report.ok, true); assert.ok(report.files.includes('runtime/start.mjs')); assert.ok(report.files.includes('contracts.json'));
  const data = join(root, 'user-data'), config = join(root, 'config');
  async function start() {
    const child = spawn(process.execPath, [join(packageDirectory, 'runtime/start.mjs'), data], { cwd: root, env: { ...process.env, NODE_PATH: '', ICON_STUDIO_CONFIG_DIRECTORY: config, ICON_STUDIO_SKILL_LOADED: '0.1.0-dev.1' }, stdio: ['ignore','pipe','pipe'] });
    t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
    let output = '', errors = '';
    child.stderr.on('data', x => { errors += x; });
    const receipt = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill('SIGTERM'); reject(Error('启动超时 '+errors)); }, 15000);
      child.once('exit', code => { clearTimeout(timeout); reject(Error('启动失败 '+code+' '+errors)); });
      child.stdout.on('data', chunk => { output += chunk; if (output.includes('\n')) { clearTimeout(timeout); try { resolve(JSON.parse(output.split('\n')[0])); } catch (e) { reject(e); } } });
    });
    return { receipt, stop: () => new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); }) };
  }
  const first = await start(); assert.equal((await fetch(first.receipt.url+'/health').then(r=>r.json())).ready,true);
  const transport={execute:(name,input)=>fetch(first.receipt.url+'/operation',{method:'POST',headers:{Authorization:`Bearer ${first.receipt.token}`,'Content-Type':'application/json'},body:JSON.stringify({name,input})}).then(r=>r.json())};
  const {s,target}=await produce(undefined,transport);
  assert.ok((await call(transport,'compile_scheme',{...s,requestId:req()})).items.every(item=>item.ok));
  const {delivery}=await call(transport,'prepare_export',{...target,scope:'variant',kind:'svg',requestId:req()});
  const artifact=await call(transport,'read_artifact',{projectId:target.projectId,exportId:delivery.exportId,artifactId:delivery.artifacts[0].artifactId});assert.ok(artifact.content.includes('<path'));
  const before = JSON.parse(await readFile(join(data,'library.json'),'utf8'));
  await first.stop(); const second = await start(); await second.stop();
  assert.equal(JSON.parse(await readFile(join(data,'library.json'),'utf8')).libraryId,before.libraryId);
  await rm(packageDirectory,{recursive:true,force:true});
  assert.equal(JSON.parse(await readFile(join(data,'library.json'),'utf8')).libraryId,before.libraryId);
});
