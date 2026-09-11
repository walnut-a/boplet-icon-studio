import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

test('全局外缘使用一致的光学间距，标题与返回链接分别补偿内部留白', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const css = await readFile(new URL('../../src/app/style.css', import.meta.url), 'utf8');
    for (const width of [1911, 858, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [view, layout] of [['library', 'collection'], ['icons', 'collection'], ['project', 'reading'], ['structure', 'detail'], ['scenes', 'detail']]) {
        await page.setContent(`<style>${css}</style><div class="workspace-body ${view === 'library' ? 'is-library' : ''}"><div class="content"><main id="main"><div class="page-body" data-layout="${layout}"><h1>页面标题</h1></div></main></div></div>`);
        const padding = await page.locator('#main').evaluate(el => getComputedStyle(el).paddingTop);
        assert.equal(padding, layout === 'detail' ? '4px' : '8px', `${view} / ${width}px`);
      }
      await page.setContent(`<style>${css}</style><aside id="inspector"><section><h2>图标详情</h2><small>16 × 16 px</small><button>下载 SVG</button></section></aside>`);
      const inset = await page.locator('#inspector').evaluate(el => {
        const title = el.querySelector('h2');
        return title.getBoundingClientRect().top - el.getBoundingClientRect().top - parseFloat(getComputedStyle(el).borderTopWidth);
      });
      assert.equal(inset, 12, `检查栏标题行框补偿 / ${width}px`);
      assert.ok((await page.locator('#inspector button').boundingBox()).height >= 36);
    }
  } finally {
    await browser.close();
  }
});
