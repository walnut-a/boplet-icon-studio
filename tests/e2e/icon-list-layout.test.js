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

test('返回列表立即复用缩略图，几何和规则修改后刷新预览', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'icon-thumbnail-cache-'));
  let browser, server;
  try {
    await buildApplication(directory);
    const { studio, storage, s, target, batch } = await produce();
    server = await startServer({ storage, skill, appDirectory: join(directory, 'app') });
    await fetch(`${server.url}/operation`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${server.token}` }, body: JSON.stringify({ name: 'connect_library', input: { requestId: req(), create: false } }) });
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage();
    let previews = 0;
    page.on('request', request => { if (request.url().endsWith('/operation') && request.postDataJSON()?.name === 'preview_icon') previews++; });
    await page.goto(`${server.url}/#${encodeURIComponent(JSON.stringify({ view: 'icons', ...s }))}`);
    await expect(page.locator('.thumbnail svg')).toHaveCount(1);
    const original = await page.locator('.thumbnail').innerHTML();
    await page.locator('.icon-tile').click();
    await expect(page.getByRole('button', { name: '返回图标列表', exact: true })).toBeVisible();
    previews = 0;
    await page.getByRole('button', { name: '返回图标列表', exact: true }).click();
    await expect(page.locator('.icon-tile')).toHaveCount(1);
    assert.equal(await page.locator('.thumbnail').innerHTML(), original, '首帧包含已加载 SVG');
    assert.equal(previews, 0, '未改动时不重新请求缩略图');
    await page.locator('.icon-tile').click();
    await expect(page.getByRole('button', { name: '返回图标列表', exact: true })).toBeVisible();
    await call(studio, 'apply_operations', { ...target, taskId: batch.taskIds[0], requestId: req(), operations: [{ op: 'add_layer', layer: { layerId: 'l-extra', name: '新增', type: 'rect', visible: true, drawing: 'fill', strokeWidth: 0, x: 1, y: 1, width: 2, height: 2, radius: 0 } }] });
    await page.getByRole('button', { name: '返回图标列表', exact: true }).click();
    await expect(page.locator('.thumbnail svg')).toHaveCount(1);
    await expect.poll(() => page.locator('.thumbnail').innerHTML()).not.toBe(original);
    const beforePrimitive = (await call(studio, 'query_icons', s)).items[0].previewKey;
    const schemeFile = (await storage.list()).find(path => path.endsWith(`/${s.schemeId}/scheme.json`));
    await storage.writeJson(schemeFile.replace('scheme.json', 'primitives/prim-test.json'), { ...s, primitiveId: 'prim-test', layers: [{ layerId: 'l-primitive', name: '共享组件', type: 'rect', visible: true, drawing: 'fill', strokeWidth: 0, x: 1, y: 1, width: 2, height: 2, radius: 0 }] });
    assert.notEqual((await call(studio, 'query_icons', s)).items[0].previewKey, beforePrimitive, '其他图标更新共享组件也使缓存失效');
    const geometryKey = (await call(studio, 'query_icons', s)).items[0].previewKey;
    const { rules } = await call(studio, 'get_design_rules', s);
    await call(studio, 'set_design_rules', { ...s, requestId: req(), content: { ...rules.content, strokeWidth: 1.5 } });
    assert.notEqual((await call(studio, 'query_icons', s)).items[0].previewKey, geometryKey, '设计规则变化使缓存失效');
  } finally {
    await browser?.close(); await server?.close(); await rm(directory, { recursive: true, force: true });
  }
});
