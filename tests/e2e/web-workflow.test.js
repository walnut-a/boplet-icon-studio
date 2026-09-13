import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWeb } from '../../scripts/build-web.js';
import { produce, call, req } from '../fixtures/workflow.js';
import { operationCatalog } from '../../src/contracts/operations.js';
import { createServer } from 'node:http';

test('在线原生网关从授权到生产、详情、SVG 导出及刷新重连', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'boplet-online-'));
  t.after(() => rm(dir, { recursive: true, force: true })); await buildWeb(dir);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-experimental-web-platform-features'] }); t.after(() => browser.close());
  const page = await browser.newPage(); const errors = [], urls = [];
  page.on('pageerror', e => errors.push(e.message));
  // Only the picker is substituted; real directory handles, Worker and native WebMCP remain intact.
  await page.addInitScript(() => { window.showDirectoryPicker = () => navigator.storage.getDirectory(); });
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://static.test'); urls.push(url.href);
    const name = ['/', '/studio', '/studio/'].includes(url.pathname) ? 'index.html' : url.pathname.slice(1);
    try { response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'); response.end(await readFile(join(dir, name))); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const transport = { execute: async (name, input) => page.evaluate(async ({ name, input, write }) => {
    const tools = await document.modelContext.getTools();
    const tool = tools.find(t => t.name === `icon_studio_v3_${write ? 'write' : 'read'}`);
    if (!tool) throw Error(JSON.stringify(tools.map(t => t.name)));
    return JSON.parse(await document.modelContext.executeTool(tool, JSON.stringify({ name, input })));
  }, { name, input, write: operationCatalog[name].mutates }) };
  const ready = async () => {
    await page.locator('[data-runtime="ready"]').waitFor({ timeout: 15000 });
    await call(transport, 'acknowledge_skill', { requestId: req(), version: '0.1.0-dev.2', fullSkillLoaded: true, htmlConsent: true, evidence: '合成宿主，测试 HTML 许可及完整加载声明' });
  };
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('[data-runtime="ready"]').waitFor();
  assert.equal(new URL(page.url()).pathname, '/');
  const rejected = await transport.execute('acknowledge_skill', { requestId: req(), version: '0.1.0-dev.2', fullSkillLoaded: true, htmlConsent: false, evidence: '未同意' });
  assert.equal(rejected.ok, false);
  assert.equal(new URL(page.url()).pathname, '/');
  await ready();
  await expect(page).toHaveURL(/\/studio\/$/);
  assert.equal((await call(transport, 'get_session')).skill.status, 'loaded');
  await page.getByRole('button', { name: '选择目录', exact: true }).click();
  await page.getByRole('button', { name: '连接已有目录' }).waitFor();
  const { p, s, target } = await produce(undefined, transport);
  await call(transport, 'compile_scheme', { ...s, requestId: req() });
  await call(transport, 'navigate', { ...target, view: 'structure', requestId: req() });
  await expect(page.locator('#main h1')).toHaveText('收件箱');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载 SVG', exact: true }).click();
  assert.match((await download).suggestedFilename(), /\.svg$/);
  await page.screenshot({ path: '.qa/online-structure.png', fullPage: true });
  await page.getByRole('button', { name: '返回图标列表', exact: true }).click();
  await page.getByRole('button', { name: /收件箱.*16/ }).click();
  await expect(page.locator('#main h1')).toHaveText('收件箱');
  await page.reload();
  await expect(page.locator('#main h1')).toHaveText('收件箱');
  assert.equal((await call(transport, 'get_session')).skill.status, 'not_loaded');
  const freshDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载 SVG', exact: true }).click();
  assert.match((await freshDownload).suggestedFilename(), /\.svg$/);
  assert.equal((await transport.execute('create_project', { requestId: req(), name: '禁止未加载修改' })).ok, false);
  assert.equal((await call(transport, 'get_project', p)).project.projectId, p.projectId);
  assert.equal((await call(transport, 'get_scheme', s)).scheme.schemeId, s.schemeId);
  assert.deepEqual(errors, []);
  assert.ok(!urls.some(u => /bootstrap|operation|localhost|127\.0\.0\.1/.test(u)));
});
