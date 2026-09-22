import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWeb } from '../../scripts/build-web.js';

test('首页仅在两条用法下提供复制指令，首屏不重复开始按钮', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'boplet-web-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await buildWeb(dir);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.addInitScript(() => { window.copied = ''; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copied = text; } } }); });
  const urls = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()); urls.push(url.href);
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    await route.fulfill({ body: await readFile(join(dir, name)), contentType: name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' });
  });
  await page.goto('https://boplet.test/');
  await page.getByRole('heading', { name: 'Your new favorite icon design tool.' }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  const footer = page.locator('.skill-footer');
  assert.equal(await footer.getByRole('link', { name: 'GitHub', exact: true }).getAttribute('href'), 'https://github.com/walnut-a/boplet-icon-studio');
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
  await page.getByRole('heading', { name: '超好用的图标设计工具' }).waitFor();
  await page.getByText('当前页面未检测到 WebMCP').waitFor();
  assert.match(await page.locator('.online-path .capability-note').innerText(), /Codex 内置浏览器/);
  assert.equal(await page.getByRole('link', { name: '查看支持说明' }).getAttribute('href'), 'https://learn.chatgpt.com/docs/webmcp');
  assert.equal(await page.locator('#choose').isVisible(), false);
  await page.getByRole('heading', { name: '在线使用 WebMCP' }).waitFor();
  await page.getByRole('heading', { name: '本地使用 Skill' }).waitFor();
  assert.equal(await page.locator('#get-started + #how-it-works').count(), 1);
  assert.equal(await page.locator('.method-row').count(), 3);
  assert.equal(await page.locator('.method-flow').count(), 0);
  assert.equal(await page.locator('.online-path li').count(), 3);
  assert.equal(await page.locator('.local-path li').count(), 3);
  assert.equal(await page.getByRole('link', { name: '开始做图标' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /复制.*指令/ }).count(), 2);
  assert.equal(await page.locator('.icon-ribbon').count(), 0);
  const startLink = page.locator('.case-link a');
  assert.equal(await startLink.getAttribute('href'), '#get-started');
  await startLink.click();
  assert.ok(await page.locator('#start-title').evaluate(el => {
    const rect = el.getBoundingClientRect(); return rect.top >= 0 && rect.bottom < innerHeight;
  }));
  const heroPaths = await page.locator('.mascot-stage .skill-mark path').evaluateAll(paths => paths.map(p => p.getAttribute('d')));
  for (const mark of await page.locator('.method-diagram .skill-mark').all()) {
    assert.deepEqual(await mark.locator('path').evaluateAll(paths => paths.map(p => p.getAttribute('d'))), heroPaths);
  }
  assert.equal(await page.locator('.case-options .draft-mark').count(), 3);
  const drafts = await page.locator('.case-options .draft-mark').evaluateAll(marks => marks.map(m => m.innerHTML));
  assert.equal(new Set(drafts).size, 3);
  assert.equal(await page.locator('.case-refinement .draft-mark').innerHTML(), drafts[0]);
  assert.notEqual(await page.locator('.case-refinement .draft-mark path').first().getAttribute('d'), heroPaths[0]);
  await page.getByText('双眼改成偏心镂空，保留歪头和小脚。', { exact: true }).waitFor();
  assert.equal(await page.locator('.case-sizes .skill-mark').count(), 3);
  await page.getByRole('button', { name: '查看图标构造' }).click();
  assert.equal(await page.locator('.icon-showcase').evaluate(el => el.classList.contains('show-construction')), true);
  assert.equal(await page.locator('.icon-showcase figcaption, .construction-lines, .drawing-node').count(), 0);
  const firstAnchor = page.locator('.mascot-stage .geometry-anchors circle').first();
  assert.equal(await firstAnchor.getAttribute('cx'), '12.23163');
  assert.equal(await firstAnchor.getAttribute('cy'), '22.61314');
  assert.ok(await page.locator('.mascot-stage .geometry-handles line').count() > 0);
  await page.screenshot({ path: '.qa/home-construction.png' });
  await page.getByRole('button', { name: '查看图标构造' }).click();
  await page.getByRole('button', { name: '切换图标正反色' }).click();
  assert.equal(await page.locator('#preview-tone').getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: '切换图标正反色' }).click();
  for (const width of [1957, 1280, 858, 390]) {
    await page.setViewportSize({ width, height: 850 });
    const brand = await footer.locator('.skill-brand-row').boundingBox();
    const credit = await footer.locator('.skill-credit').boundingBox();
    assert.ok(credit.y >= brand.y + brand.height, '灵感来源应独立放在品牌下方');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `.qa/web-start-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: '复制在线指令' }).click();
  assert.match(await page.evaluate(() => window.copied), /\/studio\//);
  assert.match(await page.evaluate(() => window.copied), /无需安装/);
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw Error('denied'); }; });
  await page.getByRole('button', { name: '复制本地指令' }).click();
  assert.match(await page.getByRole('textbox', { name: '给 Agent 的指令' }).inputValue(), /SHA-256/);
  assert.ok(urls.every(url => url.startsWith('https://boplet.test/')));
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 850 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.locator('#language').click();
  await page.evaluate(() => { navigator.clipboard.writeText = async text => { window.copied = text; }; });
  await page.getByRole('heading', { name: 'Your new favorite icon design tool.' }).waitFor();
  await page.getByRole('button', { name: 'Copy online instructions' }).click();
  assert.match(await page.evaluate(() => window.copied), /Read.*SKILL.md/);
  await page.reload();
  await page.getByRole('heading', { name: 'Your new favorite icon design tool.' }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 850 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `.qa/web-start-en-${width}.png`, fullPage: true });
  }
});
