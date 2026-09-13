import { draftA, draftB, draftC } from './brand-drafts.js';

function diagram(index, en, mark) {
  const labels = en ? ['Three original directions', 'Original and refined A', 'One character, at every size'] : ['最初的三个方向', 'A 修改前后对比', '不同尺寸，同一个小家伙'];
  const drawings = [
    `<div class="case-options">${[draftA, draftB, draftC].map((svg, i) => `<div>${svg}<small>${(en ? ['A Peek', 'B Buddies', 'C Lift'] : ['A 探头', 'B 搭肩', 'C 举块'])[i]}</small></div>`).join('')}</div>`,
    `<div class="case-refinement"><div>${draftA}<small>${en ? 'Original A' : 'A 初稿'}</small></div><svg class="case-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg><div>${mark}<small>${en ? 'Refined A' : 'A 调整后'}</small></div></div>`,
    `<div class="case-sizes">${[16,32,64].map(size => `<div><span class="size-icon size-${size}">${mark}</span><small>${size} px</small></div>`).join('')}</div>`,
  ];
  return `<figure class="method-diagram" aria-label="${labels[index]}">${drawings[index]}</figure>`;
}

export function howItWorks(en, mark) {
  const sections = en ? [
    ['Compare three directions', 'We preferred A. B was hard to read; C felt too complex.'],
    ['Refine A', 'Replace the eyes with an offset opening. Keep the tilt and feet.'],
    ['Check and export', 'Keep the character consistent at every size, then export SVGs.'],
  ] : [
    ['对比三个初稿', '我们更喜欢 A；B 不够好懂，C 有些复杂。'],
    ['选中 A，微调', '双眼改成偏心镂空，保留歪头和小脚。'],
    ['检查尺寸，导出', '不同尺寸保持同一个姿态，确认后导出 SVG。'],
  ];
  return `<section class="how-it-works" id="how-it-works" aria-labelledby="how-title">
    <header class="method-intro"><h2 id="how-title">${en ? 'How it works' : '工作原理'}</h2><p>${en ? 'Boplet started with a simple brief: “Make it more fun.”' : 'Boplet 的图标，从一句“有趣一点”开始。'}</p></header>
    <div class="method-sections">${sections.map(([title, text], index) => `<section class="method-row">${diagram(index, en, mark)}<h3>${title}</h3><p>${text}</p></section>`).join('')}</div>
    <p class="method-summary">${en ? 'Skill guides the method. Your AI assistant draws with web tools. You guide the result.' : 'Skill 提供方法，AI 助手调用网页工具绘制，你来决定方向。'}</p>
  </section>`;
}
