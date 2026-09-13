import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWeb } from '../../scripts/build-web.js';
import { produce, call, req } from '../fixtures/workflow.js';

test('没有 WebMCP 或 Agent 也能直接打开、刷新恢复、导出及遗忘目录', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'boplet-viewer-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await buildWeb(dir);
  const { studio, storage, s, target } = await produce();
  await call(studio, 'compile_scheme', { ...s, requestId: req() });
  const files = await Promise.all((await storage.list()).map(async path => [path, JSON.stringify(await storage.readJson(path))]));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { window.showDirectoryPicker = () => navigator.storage.getDirectory(); });
  await page.route('https://boplet.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const name = ['/', '/studio', '/studio/'].includes(path) ? (path === '/' ? 'index.html' : 'studio/index.html') : path.slice(1);
    await route.fulfill({ body: await readFile(join(dir, name)), contentType: name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' });
  });
  await page.goto('https://boplet.test/');
  // Synthetic OPFS fixture only. Production still requires the user's real folder picker.
  await page.evaluate(async files => {
    const root = await navigator.storage.getDirectory();
    for (const [path, content] of files) {
      const parts = path.split('/'); const name = parts.pop(); let folder = root;
      for (const part of parts) folder = await folder.getDirectoryHandle(part, { create: true });
      const file = await folder.getFileHandle(name, { create: true }); const stream = await file.createWritable();
      await stream.write(content); await stream.close();
    }
  }, files);
  await page.getByRole('link', { name: 'Open workspace' }).click();
  assert.match(page.url(), /\/studio\/$/);
  await expect(page.getByRole('button', { name: '选择目录', exact: true })).toBeEnabled();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 850 });
    await page.getByRole('heading', { name: '打开你的工作区' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `.qa/workspace-entry-${width}.png`, fullPage: true });
  }
  assert.equal(await page.evaluate(() => !!document.modelContext?.registerTool), false);
  await page.getByRole('button', { name: '选择目录', exact: true }).click();
  await expect(page.locator('#main h1')).toHaveText('项目库');
  await page.goto('https://boplet.test/studio/#' + encodeURIComponent(JSON.stringify({ view: 'structure', ...target })));
  await expect(page.locator('#main h1')).toHaveText('收件箱');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载 SVG', exact: true }).click();
  assert.match((await download).suggestedFilename(), /\.svg$/);
  await page.reload();
  await expect(page.locator('#main h1')).toHaveText('收件箱');
  await page.getByRole('button', { name: '返回项目库', exact: true }).click();
  await page.getByRole('button', { name: '断开目录', exact: true }).click();
  await expect(page.locator('#main h1')).toHaveText('打开你的工作区');
  assert.equal(await page.evaluate(async () => !!(await (await navigator.storage.getDirectory()).getFileHandle('library.json'))), true);
  assert.deepEqual(errors, []);
});
