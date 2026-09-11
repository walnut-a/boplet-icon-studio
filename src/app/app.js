import { registerWebMCP } from '../transports/webmcp.js';
import { zipSync, strToU8 } from 'fflate';

const $ = selector => document.querySelector(selector);
const main = $('#main'), navigation = $('#navigation'), inspector = $('#inspector');
let runtimeInfo = '';
let token, context, capabilities, rendering = false, lastSnapshot = '', language = localStorage.getItem('icon-studio-language') ?? 'zh', options = { grid: true, nodes: true, zoom: 1, search: '', tag: null, offset: 0 };
const translations = { '项目库': 'Projects', '项目': 'Project', '方案': 'Schemes', '图标列表': 'Icons', '返回项目库': 'All projects', '返回项目': 'Project overview', '返回图标列表': 'All icons', '导出': 'Export', '图标结构': 'Structure', '应用场景': 'Contexts', '图标详情': 'Icon details', '下载 SVG': 'Download SVG', '图层': 'Layers', '属性': 'Properties', '网格': 'Grid', '节点': 'Nodes', '缩放': 'Zoom', '实际尺寸': 'Actual size', '尺寸 / 样式': 'Size / style', '填充': 'Filled', '描边': 'Outline', '标签': 'Tags', '全部': 'All', '搜索图标': 'Search icons', '上一页': 'Previous', '下一页': 'Next', '刷新': 'Refresh', '断开目录': 'Disconnect', '暂无项目': 'No projects yet', '在对话中描述设计需求，即可开始一个新项目。': 'Describe your design needs in the conversation to start a project.', '暂无方案': 'No schemes yet', '项目需求确认后，可在对话中创建方案。': 'Create a scheme in the conversation after confirming the brief.', '没有匹配的图标': 'No matching icons', '尝试调整搜索条件。': 'Try a different search.', '尚未绘制': 'Not drawn yet', '暂无应用场景': 'No contexts yet', '尚未登记这个图标的应用用途。': 'No usage contexts are registered for this icon.', '选择图层或节点查看属性。': 'Select a layer or node to inspect it.', '设计目的': 'Purpose', '用户': 'Audience', '使用场景': 'Usage', '范围': 'Scope', '约束': 'Constraints', '未提供': 'Not provided', '需求': 'Brief', '尚未连接数据目录': 'No data directory connected', '请在对话中选择并授权本地目录。': 'Choose and authorize a local directory in the conversation.', '连接已有目录': 'Connect directory', '连接失败，请刷新或按 Skill 说明重新启动本地服务。': 'Connection failed. Refresh or restart the local service using the Skill instructions.' };
Object.assign(translations, {
  '复制给 Agent': 'Copy for Agent', '已复制': 'Copied', '正在复制…': 'Copying…', '已确认': 'Confirmed',
  '给 Agent 的指令': 'Instructions for Agent', '无法自动复制，请选中下方指令手动复制。': 'Automatic copy is unavailable. Select and copy the instructions below.',
  '项目信息': 'Project information', '存储位置': 'Storage location', '未连接': 'Not connected',
  '风格偏好': 'Style preferences',
  '步骤': 'Steps', '确认需求': 'Confirm brief', '生成方案': 'Generate schemes', '微调细节': 'Refine details',
  '请在输入框中确认需求信息是否正确。如果不正确，请直接对话进行修改。如果需求信息没问题，请回复“需求已确认”。': 'Confirm in the conversation whether the brief is correct. If not, describe the changes there. If everything is correct, reply “Brief confirmed”.',
  '需求已确认。请在对话中继续生成方案。': 'Brief confirmed. Continue in the conversation to generate schemes.',
});
const t = value => language === 'en' ? translations[value] ?? value : value;
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rid = () => crypto.randomUUID();
const error = message => { $('#error').textContent = message; $('#error').hidden = !message; if (message) $('#startup').hidden = true; };
const button = (label, action, attrs = '') => `<button data-action="${action}" ${attrs}>${esc(t(label))}</button>`;
const empty = (title, description = '') => `<div class="empty"><h2>${esc(t(title))}</h2><p>${esc(t(description))}</p></div>`;
const storageDetails = storage => `<section class="project-storage"><h2>${esc(t('存储位置'))}</h2><p id="storage-location">${esc(storage.location ?? t(storage.connected ? '未提供' : '未连接'))}</p><small>${esc(runtimeInfo)}</small><div class="storage-actions">${button('刷新', 'refresh', 'id="refresh"')}${button('断开目录', 'disconnect', `id="disconnect" ${storage.connected ? '' : 'disabled'}`)}</div></section>`;
const scope = keys => Object.fromEntries(keys.map(k => [k, context.selection[k]]).filter(([, value]) => value));
const iconScope = () => scope(['projectId', 'schemeId', 'iconId']);
const variantScope = () => scope(['projectId', 'schemeId', 'iconId', 'variantId']);
async function raw(name, input = {}, signal) {
  const response = await fetch('/operation', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name, input }), signal });
  if (!response.ok) throw Error(t('连接失败，请刷新或按 Skill 说明重新启动本地服务。'));
  return response.json();
}
async function run(name, input = {}) {
  let result = await raw(name, input);
  while (result.status === 'accepted') { await new Promise(resolve => setTimeout(resolve, 100)); result = (await raw('get_operation', { operationId: result.operationId })).data.result; }
  if (!result.ok) throw Error(result.error.message); return result.data;
}
async function navigate(view, args = {}, push = true) {
  await run('navigate', { requestId: rid(), view, ...args });
  if (push) history.pushState(null, '', `#${encodeURIComponent(JSON.stringify({ view, ...args }))}`);
  await render(true); main.focus({ preventScroll: true });
}
async function exportFiles(target, exportScope) {
  const { delivery } = await run('prepare_export', { ...target, scope: exportScope, kind: 'svg', requestId: rid() });
  const files = {};
  for (const artifact of delivery.artifacts) { const result = await run('read_artifact', { projectId: target.projectId, exportId: delivery.exportId, artifactId: artifact.artifactId }); files[result.relativePath] = strToU8(result.content); }
  const single = delivery.artifacts.length === 1; const name = single ? delivery.artifacts[0].relativePath.split('/').at(-1) : `${delivery.exportId}.zip`;
  const blob = new Blob([single ? Object.values(files)[0] : zipSync(files)], { type: single ? 'image/svg+xml' : 'application/zip' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copyForAgent(element) {
  const view = context.view;
  const target = view === 'icons' ? scope(['projectId','schemeId']) : view === 'structure' ? variantScope() : iconScope();
  const handoffScope = view === 'icons' ? 'scheme' : view === 'structure' ? 'variant' : 'icon';
  const payload = run('get_agent_handoff', { ...target, scope: handoffScope, language }).then(data=>data.instruction);
  element.disabled = true; element.textContent = t('正在复制…');
  document.getElementById('handoff-fallback')?.remove();
  try {
    // Queue the clipboard request during the click, including browsers that require user activation.
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({'text/plain':payload.then(text=>new Blob([text],{type:'text/plain'}))})]);
    } else {
      const text=await payload;
      if (!navigator.clipboard?.writeText) throw Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
    }
    element.textContent=t('已复制');
    setTimeout(()=>{if(element.isConnected)element.textContent=t('复制给 Agent');},2000);
  } catch (failure) {
    // Only expose a selectable read-only field when clipboard access actually fails.
    const instruction=await payload;
    if (!element.isConnected) return;
    const fallback=document.createElement('section');fallback.id='handoff-fallback';
    const label=document.createElement('label');label.textContent=t('无法自动复制，请选中下方指令手动复制。');
    const textarea=document.createElement('textarea');textarea.readOnly=true;textarea.value=instruction;textarea.setAttribute('aria-label',t('给 Agent 的指令'));
    label.append(textarea);fallback.append(label);element.closest('section,.page-body')?.append(fallback);
    textarea.focus();textarea.select();element.textContent=t('复制给 Agent');
  } finally { element.disabled=false; if(element.textContent===t('正在复制…'))element.textContent=t('复制给 Agent'); }
}
async function render(force = false) {
  if (rendering) return; rendering = true;
  try {
    const next = await run('get_view_context');
    options = next.options;
    const storage = await run('get_storage');
    const updates = await run('get_skill_update_status');
    $('#update').hidden = updates.status !== 'update_available';
    if (!$('#update').hidden) $('#update').textContent = language === 'zh' ? `Skill ${updates.latestVersion} 可更新。` : `Skill ${updates.latestVersion} is available.`;
    let project = null, schemes = [], data = null;
    if (next.projectId && storage.connected) { project = (await run('get_project', { projectId: next.projectId })).project; schemes = (await run('list_schemes', { projectId: next.projectId, limit: 100 })).items; }
    const a = Object.fromEntries(Object.entries(next.selection).filter(([, value]) => value));
    const target = Object.fromEntries(['projectId', 'schemeId', 'iconId', 'variantId'].filter(k => a[k]).map(k => [k, a[k]]));
    if (storage.connected) {
      if (next.view === 'library') data = await run('list_projects', { status: 'active', limit: 100 });
      else if (next.view === 'project') data = await run('get_brief', { projectId: next.projectId });
      else if (next.view === 'icons') data = await run('query_icons', { projectId: next.projectId, schemeId: a.schemeId, offset: options.offset, search: options.search, ...(options.tag ? { tag: options.tag } : {}) });
      else { data = await run('get_icon', { projectId: a.projectId, schemeId: a.schemeId, iconId: a.iconId }); if (next.view === 'scenes') data.scenes = await run('get_context_preview', { projectId: a.projectId, schemeId: a.schemeId, iconId: a.iconId }); else try { data.preview = await run('preview_icon', target); } catch { data.preview = null; } }
    }
    if (next.view === 'structure' && a.layerId && data.preview) data.layer = await run('get_layer', { ...target, layerId: a.layerId });
    const snapshot = JSON.stringify({ next, project, schemes, data, storage, options, language });
    context = next;
    if (!force && snapshot === lastSnapshot) return;
    lastSnapshot = snapshot;
    const focused = document.activeElement?.id; const selectionStart = document.activeElement?.selectionStart;
    const workspace = $('.workspace-body'), sidebar = $('.sidebar');
    const header = $('.workspace-header'), footer = $('.skill-footer');
    const libraryLayout = !project;
    header.hidden = libraryLayout;
    workspace.classList.toggle('is-library', libraryLayout);
    sidebar.hidden = libraryLayout;
    if (libraryLayout && header.parentElement !== workspace) {
      workspace.prepend(header); workspace.append(footer);
    } else if (!libraryLayout && header.parentElement !== sidebar) {
      sidebar.prepend(header); sidebar.append(footer);
    }
    $('#project-label').textContent = project?.name ?? ''; $('#project-label').hidden = !project; $('#language').textContent = language === 'zh' ? 'EN' : '中文';
    $('#skill-name').textContent = 'Boplet';
    const onboarding = next.view === 'project' && Boolean(project) && schemes.length === 0;
    $('#library-back').hidden = !project; $('#library-back').setAttribute('aria-label', t('返回项目库')); $('#library-back').title = t('返回项目库');
    $('#brief-link').hidden = !project; $('#brief-link').textContent = t('项目信息');
    $('#project-info').hidden = !project;
    $('#brief-link').setAttribute('aria-current', next.view === 'project' ? 'page' : 'false');
    navigation.hidden = !project || onboarding;
    $('.workspace-body').classList.toggle('is-onboarding', onboarding);
    navigation.innerHTML = navigation.hidden ? '' : `<h2>${esc(t('方案'))}</h2><nav>${schemes.map(s => `<button data-action="scheme" data-id="${s.schemeId}" class="scheme-link${project.primarySchemeId && project.primarySchemeId !== s.schemeId ? ' scheme-secondary' : ''}" aria-current="${s.schemeId === next.selection.schemeId ? 'page' : 'false'}"><span>${esc(s.name)}</span>${project.primarySchemeId === s.schemeId ? `<span class="scheme-confirmed">${esc(t('已确认'))}</span>` : ''}</button>`).join('')}</nav>`;
    inspector.hidden = true; inspector.innerHTML = '';
    if (!storage.connected) { main.innerHTML = empty('尚未连接数据目录', '请在对话中选择并授权本地目录。') + button('连接已有目录', 'connect'); wrapPage('library'); return; }
    if (next.view === 'library') {
      main.innerHTML = `<div class="heading"><h1>${esc(t('项目库'))}</h1></div>` + (!data.items.length ? empty('暂无项目', '在对话中描述设计需求，即可开始一个新项目。') : `<div class="project-list">${data.items.map(p => `<button class="project-row" data-action="open-project" data-id="${p.projectId}"><span><strong>${esc(p.name)}</strong><small>${esc(p.purpose ?? '')}</small></span><small>${esc(p.updatedAt.slice(0, 10))}</small></button>`).join('')}</div>`);
      main.innerHTML += storageDetails(storage);
    } else if (next.view === 'project') {
      const labels = { purpose: '设计目的', stylePreferences: '风格偏好', audience: '用户', usage: '使用场景', scope: '范围', constraints: '约束' };
      const brief = `<div class="brief">${Object.entries(labels).map(([key, label]) => `<section><h2>${esc(t(label))}</h2><p>${esc(data.brief.content.fields[key]?.value ?? t('未提供'))}</p></section>`).join('')}</div>`;
      const confirmed = data.brief.status === 'confirmed';
      main.innerHTML = onboarding ? `<div class="brief-onboarding">
        <div class="workflow-progress"><ol class="workflow-steps" aria-label="${esc(t('步骤'))}">${['确认需求', '生成方案', '微调细节'].map((label, index) => `<li${index === (confirmed ? 1 : 0) ? ' aria-current="step"' : ''}><span class="step-number" aria-hidden="true">${index + 1}</span><span>${esc(t(label))}</span></li>`).join('')}</ol></div>
        <header class="brief-intro"><h1>${esc(t(confirmed ? '生成方案' : '确认需求'))}</h1><p class="brief-instruction">${esc(t(confirmed ? '需求已确认。请在对话中继续生成方案。' : '请在输入框中确认需求信息是否正确。如果不正确，请直接对话进行修改。如果需求信息没问题，请回复“需求已确认”。'))}</p></header>
        ${brief}${storageDetails(storage)}</div>` : `<div class="project-details"><div class="heading"><h1>${esc(t('项目信息'))}</h1></div>${brief}${storageDetails(storage)}</div>`;
    } else if (next.view === 'icons') {
      main.innerHTML = `<div class="heading"><h1>${esc(t('图标列表'))}</h1>${button('导出', 'export-scheme')}</div><div class="filters"><input id="search" type="search" placeholder="${esc(t('搜索图标'))}" aria-label="${esc(t('搜索图标'))}" value="${esc(options.search)}">${data.tags.length ? `<label>${esc(t('标签'))}<select id="tags"><option value="">${esc(t('全部'))}</option>${data.tags.map(tag => `<option ${tag === options.tag ? 'selected' : ''}>${esc(tag)}</option>`).join('')}</select></label>` : ''}<span class="count">${data.total} ${language === 'en' ? 'icons' : '图标'}</span></div><div class="icon-grid">${data.items.map(({ icon, variants }) => `<button class="icon-tile" data-action="icon" data-id="${icon.iconId}" data-variant="${variants[0]?.variantId ?? ''}"><span class="thumbnail" data-thumb="${icon.iconId}"></span><strong>${esc(icon.name)}</strong><small>${variants.map(v => v.size).join(' / ')} px</small></button>`).join('')}</div>${!data.items.length ? empty('没有匹配的图标', '尝试调整搜索条件。') : ''}<div class="pagination">${button('上一页', 'previous', options.offset ? '' : 'disabled')}<small>${Math.floor(options.offset / 48) + 1} / ${Math.max(1, Math.ceil(data.total / 48))}</small>${button('下一页', 'next', options.offset + 48 >= data.total ? 'disabled' : '')}</div>`;
      const actions=document.createElement('div');actions.className='heading-actions';
      actions.innerHTML=button('复制给 Agent','copy-agent','id="copy-agent" aria-live="polite"');
      actions.append(main.querySelector('[data-action="export-scheme"]'));main.querySelector('.heading').append(actions);
      await Promise.all(data.items.map(async ({ icon, variants }) => { const slot = main.querySelector(`[data-thumb="${icon.iconId}"]`); if (!variants[0]) return; try { const preview = await run('preview_icon', { projectId: a.projectId, schemeId: a.schemeId, iconId: icon.iconId, variantId: variants[0].variantId }); if (slot?.isConnected) slot.innerHTML = preview.svg; } catch { if (slot) slot.textContent = t('尚未绘制'); } }));
    } else {
      main.innerHTML = `${button('返回图标列表', 'icons', 'class="quiet back"')}<header class="detail-heading"><div class="title"><h1>${esc(data.icon.name)}</h1><small>${esc(data.icon.concept)}</small></div><div class="preview-switch">${button('图标结构', 'structure', `aria-pressed="${next.view === 'structure'}" data-variant="${a.variantId ?? data.matrix.variants[0]?.variantId}"`)}${button('应用场景', 'scenes', `aria-pressed="${next.view === 'scenes'}"`)}</div></header>`;
      if (next.view === 'scenes') {
        main.innerHTML += `<div class="heading-actions scene-actions">${button('复制给 Agent','copy-agent','id="copy-agent" aria-live="polite"')}</div>`;
        main.innerHTML += sceneBoard(data.scenes.samples);
      } else {
        const variant = data.matrix.variants.find(v => v.variantId === a.variantId); if (!variant) throw Error('当前变体不存在，请返回列表。');
        main.innerHTML += `<div class="versions">${data.matrix.variants.filter(v => v.status === 'active').map(v => button(`${v.size} × ${v.size} px · ${t(v.style === 'filled' ? '填充' : '描边')} · ${({light:'细',regular:'常规',medium:'中等',bold:'粗'})[v.weight]&&language==='zh'?({light:'细',regular:'常规',medium:'中等',bold:'粗'})[v.weight]:v.weight}`, 'structure', `data-variant="${v.variantId}" aria-pressed="${v.variantId === a.variantId}"`)).join('')}</div><div class="frame"><div class="toolbar"><label><input id="grid" type="checkbox" ${options.grid ? 'checked' : ''}>${esc(t('网格'))}</label><label><input id="nodes" type="checkbox" ${options.nodes ? 'checked' : ''}>${esc(t('节点'))}</label><label>${esc(t('缩放'))}<select id="zoom">${[0.5, 1, 2, 4].map(z => `<option value="${z}" ${options.zoom === z ? 'selected' : ''}>${z * 100}%</option>`).join('')}</select></label></div><div class="canvas"></div><div class="actual"><small>${esc(t('实际尺寸'))}</small></div></div>`;
        $('.actual').style.setProperty('--sample-size', `${Math.max(64, ...data.matrix.variants.filter(v => v.status === 'active').map(v => v.size + 32))}px`);
        const preview = data.preview; if (!preview) $('.canvas').innerHTML = empty('尚未绘制');
        if (preview) { $('.canvas').innerHTML = preview.svg; const svg = $('.canvas svg'); svg.style.width = `${Math.min(520, window.innerWidth - 96) * options.zoom}px`; svg.style.maxWidth = 'none';
          if (options.grid) { const ns = 'http://www.w3.org/2000/svg'; const grid = document.createElementNS(ns, 'g'); for (let n = 0; n <= variant.size; n++) { for (const [x1,y1,x2,y2] of [[n,0,n,variant.size],[0,n,variant.size,n]]) { const line = document.createElementNS(ns, 'line'); Object.entries({ x1,y1,x2,y2,class:'grid-line' }).forEach(([k,v])=>line.setAttribute(k,v)); grid.append(line); } } svg.prepend(grid); }
          $('.actual').innerHTML += `<span class="sample">${preview.svg}</span><span class="sample inverse">${preview.svg}</span><small>${variant.size} × ${variant.size} px</small>`;
          if (data.layer) drawSelection(svg, data.layer.preview, a.layerId);
          if (options.nodes && a.layerId) drawNodes(svg, variant.layers, a, variant.size);
        }
        inspector.hidden = false;
        inspector.innerHTML = `<section><h2>${esc(t('图标详情'))}</h2><small>${variant.size} × ${variant.size} px · ${esc(t(variant.style === 'filled' ? '填充' : '描边'))}</small>${button('下载 SVG', 'download', 'class="primary"')}</section><section><h2>${esc(t('图层'))}</h2><div class="layers">${layerButtons(variant.layers, a.layerId)}</div></section><section><h2>${esc(t('属性'))}</h2>${properties(variant.layers, a)}</section>`;
      }
    }
    if(next.view==='structure')inspector.querySelector('section')?.insertAdjacentHTML('beforeend',button('复制给 Agent','copy-agent','id="copy-agent" aria-live="polite"'));
    wrapPage(next.view);
    if (focused && document.getElementById(focused)) { const el = document.getElementById(focused); el.focus(); if (typeof selectionStart === 'number' && el.setSelectionRange) el.setSelectionRange(selectionStart, selectionStart); }
  } catch (e) { error(e.message); } finally { rendering = false; }
}
function wrapPage(view) {
  const body = document.createElement('div');
  body.className = 'page-body';
  body.dataset.layout = view === 'project' ? 'reading' : ['structure', 'scenes'].includes(view) ? 'detail' : 'collection';
  body.append(...main.childNodes);
  main.append(body);
  $('.workspace-body').hidden = false;
  $('#startup').hidden = true;
}
function sceneBoard(samples) {
  if (!samples.length) return empty('暂无应用场景', '尚未登记这个图标的应用用途。');
  const names={usage:language==='zh'?'用途':'Usage',size_comparison:language==='zh'?'尺寸对比':'Size comparison',inverse:language==='zh'?'反色':'Inverse'};
  return ['usage','size_comparison','inverse'].map(kind=>`<section class="scene-section"><h2>${names[kind]}</h2><div class="scene-grid">${samples.filter(s=>s.kind===kind).map(sample=>{const svg=sample.svg.replace(/width="[^"]+" height="[^"]+"/,'width="100%" height="100%"');const drawing=`<span class="scene-icon" style="width:${sample.displaySize}px;height:${sample.displaySize}px">${svg}</span>`;const contextual=sample.kind==='usage'&&sample.presetId!=='app';return `<button class="scene-sample ${sample.inverse?'inverse':''}" data-action="structure" data-variant="${sample.variantId}" aria-label="${esc(sample.name)} ${sample.displaySize} px"><span class="${contextual?'context-strip':'context-art'}">${contextual?'<span class="context-placeholder" aria-hidden="true"></span>':''}${drawing}${contextual?'<span class="context-placeholder short" aria-hidden="true"></span>':''}</span><span>${esc(sample.name)} · ${sample.displaySize} px<small>${language==='zh'?'源':'Source'} ${sample.sourceSize} px</small></span></button>`;}).join('')}</div></section>`).join('');
}
function flatten(layers) { return layers.flatMap(l => [l, ...(l.children ? flatten(l.children) : [])]); }
function layerButtons(layers, selected, depth = 0) {
  return layers.map(l => button(l.name, 'layer', `id="layer-${esc(l.layerId)}" data-id="${esc(l.layerId)}" style="padding-inline-start:${12 + depth * 16}px" aria-pressed="${l.layerId === selected}"`) + (l.children ? layerButtons(l.children, selected, depth + 1) : '')).join('');
}
function drawSelection(svg, preview, layerId) {
  if (!preview.bounds) return;
  const source = new DOMParser().parseFromString(preview.svg, 'image/svg+xml').documentElement;
  const group = document.createElementNS(svg.namespaceURI, 'g');
  group.setAttribute('class', 'geometry-selection'); group.setAttribute('data-layer-id', layerId); group.setAttribute('aria-hidden', 'true');
  for (const kind of ['selection-halo', 'selection-contour']) for (const path of source.querySelectorAll('path')) {
    const clone = document.importNode(path, true);
    clone.setAttribute('class', kind); clone.setAttribute('vector-effect', 'non-scaling-stroke'); group.append(clone);
  }
  svg.append(group);
}
function properties(layers, selection) {
  const layer = flatten(layers).find(l => l.layerId === selection.layerId); if (!layer) return `<p>${esc(t('选择图层或节点查看属性。'))}</p>`;
  const node = layer.nodes?.find(n => n.nodeId === selection.nodeId);
  const values = node ? { nodeId: node.nodeId, handle: selection.handle ?? 'point', point: node[selection.handle ?? 'point'] } : Object.fromEntries(Object.entries(layer).filter(([k])=>!['name','children','nodes'].includes(k)));
  const labels = {layerId:'图层 ID',type:'类型',drawing:'绘制',visible:'可见',x:'X',y:'Y',width:'宽度',height:'高度',radius:'圆角',strokeWidth:'描边宽度',center:'中心',radiusX:'横向半径',radiusY:'纵向半径',start:'起点',end:'终点',transform:'变换',operation:'布尔运算',primitiveId:'组件 ID',closed:'闭合',nodeId:'节点 ID',handle:'控制点',point:'坐标'};
  const names = {rect:'矩形',ellipse:'椭圆',line:'直线',path:'路径',boolean:'布尔组合',group:'组',instance:'组件实例',fill:'填充',stroke:'描边',subtract:'相减',union:'合并',intersect:'相交',exclude:'排除',point:'锚点',in:'入控制柄',out:'出控制柄'};
  return `<dl class="properties">${Object.entries(values).map(([k,v])=>`<dt>${esc(language==='zh'?labels[k]??k:k)}</dt><dd>${esc(Array.isArray(v)?v.join(', '):typeof v==='boolean'?(language==='zh'?(v?'是':'否'):String(v)):language==='zh'?names[v]??v:v)}</dd>`).join('')}</dl>`;
}
function drawNodes(svg, layers, selection, size) {
  const layer = flatten(layers).find(l => l.layerId === selection.layerId); if (!layer?.nodes) return;
  const scale = size / (Math.min(520, window.innerWidth - 96) * options.zoom);
  const chain = (items, matrices = []) => { for (const item of items) { const next = [...matrices, ...(item.transform ? [item.transform] : [])]; if (item.layerId === selection.layerId) return next; if (item.children) { const found = chain(item.children, next); if (found) return found; } } };
  const transforms = chain(layers) ?? [];
  const world = point => transforms.reduceRight(([x,y],[a,b,c,d,tx,ty])=>[a*x+c*y+tx,b*x+d*y+ty],point);
  for (const node of layer.nodes) for (const handle of ['point','in','out']) { if (!node[handle]) continue;
    const group = document.createElementNS('http://www.w3.org/2000/svg','g'); const [x,y]=world(node[handle]);
    Object.entries({ id:`node-${node.nodeId}-${handle}`,class:'selection-node',tabindex:0,role:'button','aria-label':`${node.nodeId} ${handle}`,'aria-pressed':String(node.nodeId===selection.nodeId&&handle===selection.handle),'data-action':'node','data-node':node.nodeId,'data-handle':handle }).forEach(([k,v])=>group.setAttribute(k,v));
    group.innerHTML=`<circle cx="${x}" cy="${y}" r="${12*scale}" class="node-hit"/><circle cx="${x}" cy="${y}" r="${4*scale}" class="node-dot" vector-effect="non-scaling-stroke"/>`;svg.append(group);
  }
}
document.addEventListener('click', async event => {
  const element = event.target.closest('[data-action]'); if (!element || element.disabled) return; error('');
  try { const action = element.dataset.action;
    if (action === 'refresh') await render(true);
    else if (action === 'disconnect') { await run('disconnect_storage',{requestId:rid()}); await render(true); }
    else if (action === 'library') await navigate('library');
    else if (action === 'project') await navigate('project', { projectId: context.projectId });
    else if (action === 'open-project') await navigate('project', { projectId: element.dataset.id });
    else if (action === 'scheme') { await run('set_view_options',{requestId:rid(),options:{offset:0,tag:null}}); await navigate('icons',{projectId:context.projectId,schemeId:element.dataset.id}); }
    else if (action === 'icons') await navigate('icons', scope(['projectId','schemeId']));
    else if (action === 'icon') await navigate('structure',{...scope(['projectId','schemeId']),iconId:element.dataset.id,variantId:element.dataset.variant});
    else if (action === 'structure') await navigate('structure',{...iconScope(),variantId:element.dataset.variant});
    else if (action === 'scenes') await navigate('scenes',iconScope());
    else if (action === 'layer' || action === 'node') { await run('select_geometry',{requestId:rid(),expectedContextId:context.contextId,layerId:action==='layer'?element.dataset.id:context.selection.layerId,...(action==='node'?{nodeId:element.dataset.node,handle:element.dataset.handle}:{})}); await render(true); }
    else if (action === 'previous' || action === 'next') {await run('set_view_options',{requestId:rid(),options:{offset:options.offset+(action==='next'?48:-48)}});await render(true);}
    else if (action === 'download') await exportFiles(variantScope(),'variant');
    else if (action === 'export-scheme') await exportFiles(scope(['projectId','schemeId']),'scheme');
    else if (action === 'copy-agent') await copyForAgent(element);
    else if (action === 'connect') {await run('connect_library',{requestId:rid(),create:false});await render(true);}
  } catch(e) {error(e.message);}
});
document.addEventListener('keydown',event=>{if(event.target.matches('.selection-node')){if(['Enter',' '].includes(event.key)){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();const nodes=[...document.querySelectorAll('.selection-node')],index=nodes.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?nodes.length-1:(index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+nodes.length)%nodes.length;nodes[next].focus();}}});
let searchTimer;
document.addEventListener('input',event=>{if(event.target.id==='search'){clearTimeout(searchTimer);const search=event.target.value;searchTimer=setTimeout(async()=>{await run('set_view_options',{requestId:rid(),options:{search,offset:0}});await render(true);},180);}});
document.addEventListener('change',async event=>{const id=event.target.id;if(['grid','nodes','zoom','tags'].includes(id)){options[id==='tags'?'tag':id]=id==='zoom'?Number(event.target.value):id==='tags'?event.target.value||null:event.target.checked;options.offset=0;await run('set_view_options',{requestId:rid(),options});await render(true);}});
$('#language').onclick=()=>{language=language==='zh'?'en':'zh';localStorage.setItem('icon-studio-language',language);document.documentElement.lang=language==='zh'?'zh-CN':'en';render(true);};
async function restoreRoute(){try{if(location.hash){const route=JSON.parse(decodeURIComponent(location.hash.slice(1)));await navigate(route.view,Object.fromEntries(Object.entries(route).filter(([k])=>k!=='view')),false);}}catch(e){error(e.message);}}
window.addEventListener('popstate',restoreRoute);
let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>render(true),100);});
async function start(){
  try{const boot=await fetch('/bootstrap'+location.search,{method:'POST'});if(!boot.ok)throw Error(t('连接失败，请刷新或按 Skill 说明重新启动本地服务。'));({token}=await boot.json());capabilities=await run('get_capabilities');
    const mcp=await registerWebMCP(document.modelContext,capabilities,async(name,args,signal)=>{const result=await raw(name,args,signal);if(result.ok&&capabilities.operations.find(o=>o.name===name)?.readOnly===false)await render(true);return result;});
    runtimeInfo=mcp.available?'WebMCP · '+capabilities.skill.version:'本地运行 · '+(capabilities.skill.version??'未知版本');
    await restoreRoute();await render(true);
    setInterval(()=>{if(!document.hidden)render();},1500);
    const updates=await run('get_skill_update_status');if(updates.status==='update_available'){$('#update').hidden=false;$('#update').textContent=`Skill ${updates.latestVersion} 可更新。`;}
  }catch(e){error(e.message);}
}
start();
