import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

test('目录句柄可跨刷新恢复，遗忘句柄不删除文件（OPFS 仅作测试夹具）', async t => {
  const bundle = await build({ entryPoints: ['src/storage/directory-memory.js'], bundle: true, format: 'esm', write: false });
  // Chrome 153 的无痕模式反序列化目录句柄会崩溃；空路径创建自动清理的独立临时配置。
  const browser = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://boplet.test/**', route => route.fulfill({ contentType: route.request().url().endsWith('.js') ? 'text/javascript' : 'text/html', body: route.request().url().endsWith('.js') ? bundle.outputFiles[0].text : '<!doctype html><title>Directory memory</title>' }));
  await page.goto('https://boplet.test/');
  assert.equal(await page.evaluate(async () => {
    const { directoryMemory } = await import('/memory.js');
    const root = await navigator.storage.getDirectory();
    const file = await root.getFileHandle('existing', { create: true });
    const stream = await file.createWritable(); await stream.write('keep'); await stream.close();
    await directoryMemory.save(root);
    return (await directoryMemory.load()).kind;
  }), 'directory');
  await page.reload();
  assert.deepEqual(await page.evaluate(async () => {
    const { directoryMemory } = await import('/memory.js');
    const root = await directoryMemory.load();
    const content = await (await (await root.getFileHandle('existing')).getFile()).text();
    await directoryMemory.clear();
    return { content, remembered: await directoryMemory.load(), stillExists: await (await (await root.getFileHandle('existing')).getFile()).text() };
  }), { content: 'keep', remembered: null, stillExists: 'keep' });
});
