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
  // Chrome 153 的无痕模式反序列化目录句柄会崩溃；空路径创建自动清理的独立临时配置。
  const browser = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.pickerMode = 'empty';
    window.pickerCalls = 0;
    window.showDirectoryPicker = async () => {
      window.pickerCalls++;
      if (window.pickerMode === 'cancel') throw new DOMException('Cancelled', 'AbortError');
      const root = await navigator.storage.getDirectory();
      if (window.pickerMode === 'collection') return root.getDirectoryHandle('collection');
      return window.pickerMode === 'empty' ? root.getDirectoryHandle('empty-folder', { create: true }) : root;
    };
  });
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
  await expect(page.locator('#main h1')).toHaveText('准备好创建第一个项目');
  await expect(page.locator('#main')).toContainText('empty-folder');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 850 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `.qa/workspace-empty-${width}.png`, fullPage: true });
  }
  await page.evaluate(() => { window.pickerMode = 'cancel'; });
  await page.getByRole('button', { name: '更换目录', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.pickerCalls)).toBe(2);
  await expect(page.locator('#main h1')).toHaveText('准备好创建第一个项目');
  assert.equal(await page.evaluate(async () => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('empty-folder');
    let count = 0; for await (const entry of folder.values()) count++; return count;
  }), 0);
  await page.evaluate(() => { window.pickerMode = 'library'; });
  await page.getByRole('button', { name: '更换目录', exact: true }).click();
  await expect(page.locator('#main h1')).toHaveText('项目库');
  await expect(page.locator('#error')).toBeHidden();
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
  await page.evaluate(async files => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('collection', { create: true });
    for (const library of ['Alpha', 'Beta']) {
      const base = await root.getDirectoryHandle(library, { create: true });
      for (const [path, text] of files) {
        const parts = path.split('/'); const name = parts.pop(); let folder = base;
        for (const part of parts) folder = await folder.getDirectoryHandle(part, { create: true });
        const stream = await (await folder.getFileHandle(name, { create: true })).createWritable();
        const content = JSON.parse(text);
        if (name === 'project.json') content.name = library + ' 项目';
        await stream.write(JSON.stringify(content)); await stream.close();
      }
    }
    const old = await root.getDirectoryHandle('旧方案', { create: true });
    const stream = await (await old.getFileHandle('studio-collection.json', { create: true })).createWritable();
    await stream.write('{}'); await stream.close();
    const empty = await root.getDirectoryHandle('Empty', { create: true });
    const marker = await (await empty.getFileHandle('library.json', { create: true })).createWritable();
    await marker.write(files.find(([path]) => path === 'library.json')[1]); await marker.close();
    window.pickerMode = 'collection';
  }, files);
  await page.getByRole('button', { name: '选择目录', exact: true }).click();
  await expect(page.locator('[data-action="open-discovered"]')).toHaveCount(2);
  await expect(page.locator('.directory-issues')).toContainText('旧格式，未进行迁移');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 850 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `.qa/directory-collection-${width}.png`, fullPage: true });
  }
  await page.locator('#language').click();
  await expect(page.locator('.directory-issues')).toContainText('Older format');
  await page.screenshot({ path: '.qa/directory-collection-en.png', fullPage: true });
  await page.locator('#language').click();
  await page.locator('[data-action="open-library"][data-library="Empty"]').click();
  await expect(page.locator('#main')).toContainText('暂无项目');
  await expect(page.locator('#storage-location')).toHaveText('collection/Empty');
  await page.getByRole('button', { name: '返回项目库', exact: true }).click();
  await expect(page.locator('[data-action="open-discovered"]')).toHaveCount(2);
  await page.locator('[data-action="open-discovered"][data-library="Alpha"]').click();
  await expect(page.locator('#project-label')).toHaveText('Alpha 项目');
  await page.reload();
  await expect(page.locator('#project-label')).toHaveText('Alpha 项目');
  await page.getByRole('button', { name: '返回项目库', exact: true }).click();
  await expect(page.locator('[data-action="open-discovered"]')).toHaveCount(2);
  await page.locator('[data-action="open-discovered"][data-library="Beta"]').click();
  await expect(page.locator('#project-label')).toHaveText('Beta 项目');
  await page.goBack();
  await expect(page.locator('[data-action="open-discovered"]')).toHaveCount(2);
  await page.goBack();
  await expect(page.locator('#project-label')).toHaveText('Alpha 项目');
  await expect(page.locator('#error')).toBeHidden();
  assert.equal(await page.evaluate(async () => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('collection');
    try { await root.getFileHandle('library.json'); return true; } catch { return false; }
  }), false);
  assert.deepEqual(errors, []);
});
