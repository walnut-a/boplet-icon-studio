const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const check = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const points = items => `<ul class="path-points">${items.map(item => `<li>${check}<span>${item}</span></li>`).join('')}</ul>`;

import { howItWorks } from './how-it-works.js';

export function landing(en, supported, mark) {
  return `<div class="landing">
    <!-- THESIS: A playful icon workbench, not a boxed logo. OWN-WORLD: marigold field, ink, warm white sheets, approved square mascot and system type. STORY: See an icon take shape, then choose the Agent entry. FIRST VIEWPORT: Oversized left headline, overlapping construction and finished-size sheets on the right; two existing copy actions below. FORM: User-approved Superr playfulness plus Craft product demonstration, code-led extension. FINISH: reviewed against desktop and mobile renders; document the built surface. -->
    <header class="landing-nav"><a href="#" class="landing-brand" aria-label="Boplet Icon Studio">${mark}<span><strong>Boplet</strong><small>Icon Studio</small></span></a><a href="/studio/">${en ? 'Open workspace' : '进入工作区'} ${arrow}</a></header>
    <section class="landing-hero" aria-labelledby="hero-title">
      <div class="hero-copy"><h1 id="hero-title" aria-label="${en ? 'Your new favorite icon design tool.' : '超好用的图标设计工具'}">${en ? 'Your new favorite<br>icon design tool.' : '超好用的<br>图标设计工具'}</h1><p>${en ? 'Share your ideas with your AI assistant. View icons, choose a design, and export SVGs in Boplet.' : '把想法告诉你的 AI 助手，在 Boplet 查看图标、挑选方案、导出 SVG。'}</p></div>
      <figure class="icon-showcase">
        <div class="idea-note">${en ? 'An icon with a little personality.' : '来个有趣的图标。'}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4c0 10 5 15 15 15m-5-5 5 5-6 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <div class="drawing-sheet"><div class="showcase-top"><span>${en ? 'Boplet / brand icon' : 'Boplet / 品牌图标'}</span><span>64 × 64</span></div>
          <div class="mascot-stage">${mark}</div>
          <div class="drawing-controls"><button id="preview-geometry" aria-pressed="false" aria-label="${en ? 'View icon construction' : '查看图标构造'}">${en ? 'Construction' : '看看构造'}</button><button id="preview-tone" aria-pressed="false" aria-label="${en ? 'Toggle icon background' : '切换图标正反色'}">${en ? 'Inverse' : '试试反色'} ${arrow}</button></div>
        </div>
        <div class="size-sheet" aria-label="${en ? 'Icon size comparison' : '图标尺寸对比'}">${[16,32,64].map(size => `<div><span class="size-icon size-${size}">${mark}</span><small>${size}px</small></div>`).join('')}</div>
      </figure>
    </section>
    <div class="case-link"><p>${en ? 'This little character was designed with Boplet, too.' : '这个小家伙，也是用 Boplet 设计的。'}</p><a href="#get-started">${en ? 'Get started' : '开始使用'} ${arrow}</a></div>
<section class="getting-started" id="get-started" aria-labelledby="start-title"><header><h2 id="start-title">${en ? 'Get started' : '开始使用'}</h2><p>${en ? 'Choose a route. Send the instructions to your AI assistant.' : '选一种方式，把指令发给 AI 助手。'}</p></header>
<div class="usage-paths"><section class="online-path"><h3>${en ? 'Online with WebMCP' : '在线使用 WebMCP'}</h3><p class="path-description">${en ? 'If your browser and Agent support WebMCP, send the instructions below to your Agent. Nothing extra to install; your data stays local.' : '如果你的浏览器和 Agent 支持 WebMCP，复制下方指令发给 Agent 即可，无需额外安装，数据保存在本地。'}</p>${points(en ? ['WebMCP support required', 'No local Skill installation', 'No project uploads to Boplet'] : ['需要 WebMCP 支持', '无需安装 Skill 到本地', '项目数据不上传到 Boplet'])}<button class="landing-cta" id="copy">${en ? 'Copy online instructions' : '复制在线指令'} ${arrow}</button><div id="copy-fallback"></div>${supported ? '' : `<p class="capability-note">${en ? 'WebMCP or local folder access was not detected here. Try opening Boplet in Codex’s built-in browser, then send it the online instructions. Availability depends on your app version, model, and settings; you can also use the local Skill option.' : '当前页面未检测到 WebMCP 或本地文件夹访问能力。可在 Codex 内置浏览器中打开本站，再把在线指令发给 Codex。支持情况取决于版本、模型和设置；也可选择本地 Skill 方式。'} <a href="https://learn.chatgpt.com/docs/webmcp" target="_blank" rel="noopener noreferrer">${en ? 'Supported environments' : '查看支持说明'}</a></p>`}</section>
      <section class="local-path"><h3>${en ? 'Local with Skill' : '本地使用 Skill'}</h3><p class="path-description">${en ? 'If your Agent or browser does not support WebMCP, use the traditional Skill route. Send the instructions below to install it; your data stays local.' : '如果你的 Agent 或浏览器还不支持 WebMCP，可通过传统 Skill 方式使用。复制下方指令安装即可，数据同样保存在本地。'}</p>${points(en ? ['No WebMCP support required', 'Local Skill installation required', 'No project uploads to Boplet'] : ['不需要 WebMCP 支持', '需要安装 Skill 到本地', '项目数据不上传到 Boplet'])}<button id="copy-local">${en ? 'Copy local instructions' : '复制本地指令'} ${arrow}</button><div id="local-fallback"></div></section></div>
    </section>
    ${howItWorks(en, mark)}
  </div>`;
}
