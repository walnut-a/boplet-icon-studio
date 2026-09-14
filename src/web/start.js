import { landing } from './landing.js';
import { addMarkConstruction } from './mark-construction.js';

if (/^\/studio\/?$/.test(location.pathname)) {
  const { startWorkbench } = await import('./workbench.js');
  await startWorkbench();
} else {
  const originalBody = document.body.innerHTML;
  const $ = selector => document.querySelector(selector);
  const mark = $('.skill-mark').outerHTML;
  const workspace = $('.workspace-body');
  workspace.classList.add('is-library', 'web-start', 'landing-page');
  workspace.append($('.skill-footer'));
  const footerTools = document.createElement('div');
  footerTools.className = 'footer-tools';
  const repositoryLink = document.createElement('a');
  repositoryLink.href = 'https://github.com/walnut-a/icon-studio';
  repositoryLink.textContent = 'GitHub';
  repositoryLink.target = '_blank';
  repositoryLink.rel = 'noopener noreferrer';
  footerTools.append(repositoryLink, $('#language'));
  $('.skill-brand-row').append(footerTools);
  $('.sidebar').remove();
  $('#startup').hidden = true;
  workspace.hidden = false;
  let en = true;
  try { en = localStorage.getItem('icon-studio-language') !== 'zh'; } catch { /* Storage may be disabled; language switching still works. */ }
  const instruction = '请从 https://boplet.app/skill/SKILL.md 完整读取 Boplet — Icon Studio Skill，以及其中所需的引用与 version.json。在线方式无需安装 Skill。取得本次 HTML 运行同意后，在当前官网页面通过原生 WebMCP 读取 acknowledge_skill 的操作 schema，再调用写网关提供真实加载及同意证据。成功后页面会自动进入 /studio/ 工作区，不需要我手动跳转；接着引导我授权本地目录。只有浏览器和你都能使用本页原生 WebMCP 时才继续；不能伪造加载、同意或工具能力，不让公网页面调用 localhost。';
  const localInstruction = '请读取 https://boplet.app/downloads/release.json，下载并核对完整 Boplet — Icon Studio Skill 预览包的 SHA-256，再按你的 Skill 安装方式安装；不擅自覆盖已有安装。完整读取 SKILL.md 和所需引用，征得本次 HTML 使用同意及目录授权后，使用包内的本地 HTML 容器开始图标设计。不需要浏览器支持 WebMCP。';
  function render() {
    document.documentElement.lang = en ? 'en' : 'zh-CN';
    $('#language').textContent = en ? '中文' : 'EN';
    $('.skip').textContent = en ? 'Skip to content' : '跳到内容';
    $('#main').innerHTML = landing(en, typeof showDirectoryPicker === 'function' && !!document.modelContext?.registerTool, mark);
    addMarkConstruction($('.mascot-stage .skill-mark'));
    $('#preview-tone').onclick = event => {
      const button = event.currentTarget, inverse = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(inverse));
      $('.icon-showcase').classList.toggle('inverse', inverse);
    };
    $('#preview-geometry').onclick = event => {
      const button = event.currentTarget, active = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(active));
      $('.icon-showcase').classList.toggle('show-construction', active);
    };
    const copy = (button, target, value) => async () => {
      try { await navigator.clipboard.writeText(value); button.textContent = en ? 'Copied' : '已复制'; }
      catch { const field = document.createElement('textarea'); field.readOnly = true; field.value = value; field.setAttribute('aria-label', en ? 'Instructions for Agent' : '给 Agent 的指令'); $(target).replaceChildren(field); field.focus(); field.select(); }
    };
    $('#copy').onclick = copy($('#copy'), '#copy-fallback', en ? 'Read https://boplet.app/skill/SKILL.md in full, including its required references and version.json. Online use needs no local Skill installation. Obtain my consent to use the HTML workspace, then use this page’s native WebMCP to read the acknowledge_skill operation schema and submit genuine loading and consent evidence through the write gateway. On success, the page opens /studio/ automatically; guide me to authorize a local folder. Continue only if both you and the browser support native WebMCP on this page. Do not fabricate loading, consent, or capabilities, and do not make the public page call localhost.' : instruction);
    $('#copy-local').onclick = copy($('#copy-local'), '#local-fallback', en ? 'Read https://boplet.app/downloads/release.json, download the complete Boplet — Icon Studio Skill preview package, and verify its SHA-256. Install it using your supported Skill installation method; do not overwrite an existing installation without permission. Read SKILL.md and the required references in full. Obtain my consent to use HTML and authorize a data folder, then start designing with the bundled local HTML workspace. Browser WebMCP support is not required.' : localInstruction);
  }
  $('#language').onclick = () => { en = !en; try { localStorage.setItem('icon-studio-language', en ? 'en' : 'zh'); } catch { /* Keep the choice for this page session. */ } render(); };
  render();
  if (document.modelContext?.registerTool && typeof showDirectoryPicker === 'function') {
    const { createWorkerClient } = await import('./client.js');
    const { registerWebMCP } = await import('../transports/webmcp.js');
    const client = createWorkerClient();
    let registration, entering = false;
    const cleanup = () => { registration?.dispose(); client.close(); };
    addEventListener('pagehide', cleanup, { once: true });
    try {
      await client.call({ type: 'initialize' });
      const caps = await client.call({ type: 'execute', name: 'get_capabilities', input: {} });
      registration = await registerWebMCP(document.modelContext, caps.data, async (name, input) => {
        const result = await client.call({ type: 'execute', name, input });
        if (name === 'acknowledge_skill' && result.ok && !entering) {
          entering = true;
          // Return the gateway receipt before replacing its host UI and registrations.
          setTimeout(async () => {
            registration.dispose();
            removeEventListener('pagehide', cleanup);
            history.pushState(null, '', '/studio/');
            document.body.innerHTML = originalBody;
            const { startWorkbench } = await import('./workbench.js');
            await startWorkbench({ initializedClient: client });
          }, 0);
        }
        return result;
      });
      document.body.dataset.runtime = registration.available ? 'ready' : 'unsupported';
      if (!registration.available) cleanup();
    } catch { cleanup(); document.body.dataset.runtime = 'unsupported'; }
  }
}
