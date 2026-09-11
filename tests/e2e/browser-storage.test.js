import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NodeStorage } from '../../src/storage/node.js';

test('真实 Chromium 文件流与 Node 存储合同一致（OPFS 仅作隔离测试夹具）', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'boplet-browser-storage-'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const bundle = await build({ entryPoints: [resolve('src/storage/browser.js')], bundle: true, format: 'esm', write: false });
    const page = await browser.newPage();
    await page.route('https://boplet.test/**', route => route.fulfill({ contentType: route.request().url().endsWith('.js') ? 'text/javascript' : 'text/html', body: route.request().url().endsWith('.js') ? bundle.outputFiles[0].text : '<!doctype html><title>Boplet storage test</title>' }));
    await page.goto('https://boplet.test/');
    const input = { projectId: 'synthetic-project', name: '合成项目', primarySchemeId: null };
    const result = await page.evaluate(async input => {
      const { BrowserStorage } = await import('/storage.js');
      const root = await navigator.storage.getDirectory();
      const store = new BrowserStorage(root);
      await store.writeJson('projects/p/project.json', input);
      await store.writeText('preview.svg', '<svg/>');
      await store.writeText('preview.svg', 'short');
      const reopened = new BrowserStorage(root);
      return { json: await reopened.readJson('projects/p/project.json'), text: await reopened.readText('preview.svg'), paths: await reopened.list() };
    }, input);
    const node = await NodeStorage.open(directory);
    await node.writeJson('projects/p/project.json', input);
    await node.writeText('preview.svg', '<svg/>');
    await node.writeText('preview.svg', 'short');
    assert.deepEqual(result, { json: await node.readJson('projects/p/project.json'), text: await node.readText('preview.svg'), paths: await node.list() });
    await page.reload();
    assert.deepEqual(await page.evaluate(async () => {
      const { BrowserStorage } = await import('/storage.js');
      return new BrowserStorage(await navigator.storage.getDirectory()).readJson('projects/p/project.json');
    }), input);
  } finally {
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});
