import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

test('所有工作区页面和侧栏共用 24px 顶部留白', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const css = await readFile(new URL('../../src/app/style.css', import.meta.url), 'utf8');
    for (const width of [1911, 858, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [view, layout] of [['library', 'collection'], ['icons', 'collection'], ['project', 'reading'], ['structure', 'detail'], ['scenes', 'detail']]) {
        await page.setContent(`<style>${css}</style><div class="workspace-body ${view === 'library' ? 'is-library' : ''}"><div class="content"><main id="main"><div class="page-body" data-layout="${layout}"><h1>页面标题</h1></div></main></div></div>`);
        const padding = await page.locator('#main').evaluate(el => getComputedStyle(el).paddingTop);
        assert.equal(padding, '24px', `${view} / ${width}px`);
      }
      await page.setContent(`<style>${css}</style><aside id="inspector"><section><h2>图标详情</h2><small>16 × 16 px</small><button>下载 SVG</button></section></aside>`);
      const inset = await page.locator('#inspector').evaluate(el => {
        const title = el.querySelector('h2');
        return title.getBoundingClientRect().top - el.getBoundingClientRect().top - parseFloat(getComputedStyle(el).borderTopWidth);
      });
      assert.equal(inset, 24, `检查栏标题行框补偿 / ${width}px`);
      assert.ok((await page.locator('#inspector button').boundingBox()).height >= 36);
      for (const container of ['sidebar', 'workspace-body is-library']) {
        await page.setContent(`<style>${css}</style><div class="${container}"><header class="workspace-header"><button>返回项目库</button></header></div>`);
        assert.equal(await page.locator('.workspace-header').evaluate(el => getComputedStyle(el).paddingTop), '24px', `${container} / ${width}px`);
      }
    }
  } finally {
    await browser.close();
  }
});

test('图标网格均分整行宽度，末行保持相同列宽', async () => {
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage();
    const css=await readFile(new URL('../../src/app/style.css',import.meta.url),'utf8');
    for(const width of [1120,818,390,140]) {
      await page.setContent(`<style>${css}</style><div class="icon-grid" style="width:${width}px">${Array.from({length:16},()=>'<button class="icon-tile">图标</button>').join('')}</div>`);
      const result=await page.locator('.icon-grid').evaluate(grid=>{const r=grid.getBoundingClientRect(),cards=[...grid.children].map(n=>n.getBoundingClientRect()),row=cards.filter(c=>c.y===cards[0].y);return {edge:row.at(-1).right-r.right,widths:cards.map(c=>c.width)};});
      assert.ok(Math.abs(result.edge)<1,`${width}px 右边缘偏差 ${result.edge}`);
      assert.ok(Math.max(...result.widths)-Math.min(...result.widths)<1);
    }
  }finally{await browser.close();}
});
