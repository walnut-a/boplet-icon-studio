import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

test('静态 Worker 使用共享合同且不绕过 Skill 门槛', async t => {
  const bundle = await build({ entryPoints: ['src/web/worker.js'], bundle: true, platform: 'browser', format: 'esm', write: false });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const requests = [];
  await page.route('https://boplet.test/**', route => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: route.request().url().endsWith('.js') ? 'text/javascript' : 'text/html', body: route.request().url().endsWith('.js') ? bundle.outputFiles[0].text : '<!doctype html><title>Worker runtime</title>' });
  });
  await page.goto('https://boplet.test/');
  const result = await page.evaluate(async () => {
    const worker = new Worker('/worker.js', { type: 'module' });
    let sequence = 0;
    const call = message => new Promise((resolve, reject) => {
      const id = ++sequence;
      const listener = event => { if (event.data.id === id) { worker.removeEventListener('message', listener); event.data.error ? reject(Error(event.data.error)) : resolve(event.data.result); } };
      worker.addEventListener('message', listener); worker.postMessage({ id, ...message });
    });
    try {
      await call({ type: 'initialize' });
      const session = await call({ type: 'execute', name: 'get_session', input: {} });
      const workflow = await call({ type: 'execute', name: 'get_workflow', input: {} });
      const denied = await call({ type: 'execute', name: 'create_project', input: { requestId: crypto.randomUUID(), name: '不可创建' } });
      const ready = await call({ type: 'execute', name: 'acknowledge_skill', input: { requestId: crypto.randomUUID(), version: '0.1.0-dev.2', fullSkillLoaded: true, htmlConsent: true, evidence: '合成宿主声明，仅用于测试' } });
      const root = await navigator.storage.getDirectory(); // Isolated fixture, not product fallback.
      await call({ type: 'bind_directory', handle: root });
      const library = await call({ type: 'execute', name: 'connect_library', input: { requestId: crypto.randomUUID(), create: true } });
      const project = await call({ type: 'execute', name: 'create_project', input: { requestId: crypto.randomUUID(), name: '静态 Worker 合成项目' } });
      const folder = await root.getDirectoryHandle(project.data.project.projectId);
      const saved = JSON.parse(await (await (await folder.getFileHandle('project.json')).getFile()).text());
      return { session, workflow, denied, ready, library, project, saved };
    } finally { worker.terminate(); }
  });
  assert.equal(result.session.data.transport, 'browser_worker');
  assert.equal(result.session.data.skill.status, 'not_loaded');
  assert.equal(result.workflow.data.stage, 'skill_required');
  assert.equal(result.denied.ok, false);
  assert.equal(result.denied.error.code, 'CAPABILITY_UNAVAILABLE');
  assert.equal(result.ready.ok, true);
  assert.equal(result.library.data.storageKind, 'browser');
  assert.deepEqual(result.saved, result.project.data.project);
  assert.deepEqual(requests.sort(), ['https://boplet.test/', 'https://boplet.test/worker.js']);
});
