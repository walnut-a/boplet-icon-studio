import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { buildSkill, inspectPackage } from '../../scripts/package.js';
import { produce, call, req } from '../fixtures/workflow.js';

test('白名单包脱离仓库依赖启动、离线重开，卸载不删除独立数据', async t => {
  const root = await mkdtemp(join(tmpdir(), 'icon-package-')); t.after(() => rm(root, { recursive: true, force: true }));
  const packageDirectory = join(root, 'installed', 'make-product-icons');
  // Release acceptance copies the exact candidate into an isolated installation.
  if (process.env.BOPLET_TEST_SKILL) {
    await inspectPackage(process.env.BOPLET_TEST_SKILL);
    await cp(process.env.BOPLET_TEST_SKILL, packageDirectory, { recursive: true });
  } else await buildSkill(packageDirectory);
  const report = await inspectPackage(packageDirectory);
  assert.equal(report.ok, true); assert.ok(report.files.includes('runtime/start.mjs')); assert.ok(report.files.includes('contracts.json'));
  assert.equal(await readFile(join(packageDirectory, 'LICENSE'), 'utf8'), await readFile('LICENSE', 'utf8'));
  const version = JSON.parse(await readFile(join(packageDirectory, 'version.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(packageDirectory, 'package-manifest.json'), 'utf8'));
  assert.equal(version.version, JSON.parse(await readFile('package.json', 'utf8')).version); assert.equal(version.schemaRevision, 2);
  assert.equal(manifest.version, version.version); assert.equal(manifest.schemaRevision, version.schemaRevision);
  assert.match(report.buildId, /^sha256-[a-f0-9]{64}$/);
  const data = join(root, 'user-data'), config = join(root, 'config');
  const environment = { ...process.env, NODE_PATH: '', ICON_STUDIO_CONFIG_DIRECTORY: config, ICON_STUDIO_SKILL_LOADED: version.version, ICON_STUDIO_HTML_CONSENT: 'granted', ICON_STUDIO_HTML_CONSENT_REFERENCE: '合成用户允许 HTML 测试' };
  for (const consent of [undefined, 'denied']) {
    const denied = spawnSync(process.execPath, [join(packageDirectory, 'runtime/start.mjs'), data], { cwd: root, env: { ...environment, ICON_STUDIO_HTML_CONSENT: consent }, encoding: 'utf8', timeout: 5000 });
    assert.equal(denied.status, 1); assert.match(denied.stderr, /HTML/);
    assert.equal(existsSync(data), false); assert.equal(existsSync(config), false);
  }
  async function start() {
    const child = spawn(process.execPath, [join(packageDirectory, 'runtime/start.mjs'), data], { cwd: root, env: environment, stdio: ['ignore','pipe','pipe'] });
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
  const first = await start(); const health=await fetch(first.receipt.url+'/health').then(r=>r.json());assert.equal(health.ready,true);assert.equal(health.schemaRevision,2);assert.equal(health.buildId,report.buildId);
  const transport={execute:(name,input)=>fetch(first.receipt.url+'/operation',{method:'POST',headers:{Authorization:`Bearer ${first.receipt.token}`,'Content-Type':'application/json'},body:JSON.stringify({name,input})}).then(r=>r.json())};
  assert.equal((await call(transport, 'get_workflow')).stage, 'html_required');
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); t.after(() => browser.close());
  const page = await browser.newPage(); await page.goto(first.receipt.url);
  await page.getByRole('heading', { name: '项目库', exact: true }).waitFor();
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
