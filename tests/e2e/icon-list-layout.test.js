import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApplication } from '../../scripts/build.js';
import { startServer } from '../../src/runtime/server.js';
import { produce, call, req, skill } from '../fixtures/workflow.js';

test('详情返回列表时，缩略图未完成也保持最终列宽和卡片位置', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'icon-list-layout-'));
  let browser, server, release;
  try {
    await buildApplication(directory);
    const { studio, storage, p, s } = await produce();
    const { icons } = await call(studio, 'register_icons', { ...p, requestId: req(), icons: Array.from({ length: 15 }, (_, n) => ({ name: `样本 ${n}`, concept: `布局样本 ${n}`, tags: [], usages: [] })) });
    for (const icon of icons) await call(studio, 'register_variants', { ...s, iconId: icon.iconId, requestId: req(), variants: [{ size: 16, style: 'outline', weight: 'regular' }] });
    server = await startServer({ storage, skill, appDirectory: join(directory, 'app') });
    const response = await fetch(`${server.url}/operation`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${server.token}` }, body: JSON.stringify({ name: 'connect_library', input: { requestId: req(), create: false } }) });
    assert.equal((await response.json()).ok, true);
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1966, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${server.url}/#${encodeURIComponent(JSON.stringify({ view: 'icons', ...s }))}`);
    await expect(page.locator('.page-body .icon-tile')).toHaveCount(16);
    await page.locator('.icon-tile').first().click();
    await expect(page.locator('.page-body[data-layout=detail]')).toBeVisible();

    let sawPreview;
    const requested = new Promise(resolve => { sawPreview = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/operation', async route => {
      if (route.request().postDataJSON()?.name === 'preview_icon') { sawPreview(); await gate; }
      await route.continue();
    });
    await page.getByRole('button', { name: '返回图标列表', exact: true }).click();
    await requested;
    const positions = () => page.locator('.icon-tile').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
    const loading = await positions();
    const rail = await page.locator('.icon-grid').boundingBox();
    assert.ok(rail.width <= 1120, `缩略图等待期间列表已限宽，实际 ${rail.width}`);
    assert.equal(await page.locator('.page-body[data-layout=collection] .icon-grid').count(), 1);
    release();
    await expect(page.locator('.thumbnail svg')).toHaveCount(1);
    await expect(page.locator('.thumbnail').filter({ hasText: '尚未绘制' })).toHaveCount(15);
    assert.deepEqual(await positions(), loading, '成功和失败缩略图填入后卡片位置不变');
    assert.equal(await page.locator('.page-body .page-body').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    release?.();
    await browser?.close();
    await server?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
