import { createWorkerClient } from './client.js';
import { DirectorySession } from '../storage/directory-session.js';
import { registerWebMCP } from '../transports/webmcp.js';

export async function startWorkbench({ initializedClient } = {}) {
  const $ = selector => document.querySelector(selector);
  const originalBody = document.body.innerHTML;
  const workspace = $('.workspace-body');
  const mark = $('.skill-mark').outerHTML;
  workspace.classList.add('is-library', 'web-start', 'workbench-entry');
  workspace.append($('.skill-footer'));
  $('.sidebar').remove();
  $('#startup').hidden = true;
  workspace.hidden = false;
  const session = new DirectorySession();
  let client = initializedClient ?? createWorkerClient();
  const supported = typeof showDirectoryPicker === 'function';
  let en = false, initialized = false, bound = false, boundHandle, mounted = false, refresh, registration;
  const message = text => { if ($('#web-status')) $('#web-status').textContent = text; };
  async function enter() {
    if (!initialized || !session.authorizedHandle || mounted) return;
    if (bound && boundHandle !== session.authorizedHandle) {
      registration?.dispose(); client.close(); client = createWorkerClient(); bound = false;
      await initialize();
    }
    if (!bound) { await client.call({ type: 'bind_directory', handle: session.authorizedHandle }); bound = true; boundHandle = session.authorizedHandle; }
    const result = await client.call({ type: 'execute', name: 'connect_library', input: { requestId: crypto.randomUUID(), create: false } });
    if (!result.ok && result.error.code !== 'TARGET_NOT_FOUND') throw Error(result.error.message);
    mounted = true;
    document.body.innerHTML = originalBody;
    const { mountOnline } = await import('/studio.js');
    refresh = await mountOnline((name, input) => client.call({ type: 'execute', name, input }), {
      webmcp: !!registration?.available,
      directoryName: session.authorizedHandle.name,
      disconnect: async () => { await session.disconnect(); location.assign('/studio/'); },
    });
  }
  async function act(promise) {
    $('#choose').disabled = true;
    try {
      const result = await promise;
      const labels = en
        ? { granted: 'Folder authorized.', pending: 'Authorize your saved folder to continue.', denied: 'Permission was denied. Authorize again or choose another folder.', cancelled: 'Selection cancelled. No files changed.', disconnected: 'Choose the folder containing your Boplet projects.' }
        : { granted: '目录已授权。', pending: '已记住上次的目录，重新授权即可继续。', denied: '目录权限已失效，请重新授权或选择其他目录。', cancelled: '已取消选择，没有改动文件。', disconnected: '选择保存 Boplet 项目的文件夹，即可查看已有图标。' };
      message(labels[result.status] ?? '');
      $('#authorize').hidden = !['pending', 'denied'].includes(result.status);
      $('#forget').hidden = result.status === 'disconnected';
      if (result.status === 'granted') await enter();
    } catch (error) { message(en ? 'Could not open the folder. Choose it again or check that it contains a Boplet library.' : '无法打开目录，请重选目录并确认其中有可用的 Boplet 项目库。'); }
    finally { if ($('#choose')) $('#choose').disabled = !initialized || !supported; }
  }
  function render() {
    $('#main').innerHTML = `<div class="landing"><header class="landing-nav"><a href="/" class="landing-brand">${mark}<span><strong>Boplet</strong><small>Icon Studio</small></span></a><a href="/">${en ? 'Back to website' : '返回官网'}</a></header><section class="workspace-welcome"><h1>${en ? 'Open your workspace' : '打开你的工作区'}</h1><p>${en ? 'View, inspect and export your local icons. No Agent needed.' : '查看、检查和导出本地图标，不需要经过 Agent。'}</p><div class="storage-actions"><button class="primary" id="choose" ${!initialized || !supported ? 'disabled' : ''}>${en ? 'Choose directory' : '选择目录'}</button><button id="authorize" hidden>${en ? 'Authorize again' : '重新授权'}</button><button id="forget" hidden>${en ? 'Forget directory' : '忘记目录'}</button></div><p id="web-status" role="status"></p><p>${supported ? (en ? 'Your files stay local. To create or edit icons, ask your Agent to load the Skill in this workspace.' : '文件留在本地。需要创建或修改图标时，再让 Agent 在这个工作区加载 Skill。') : (en ? 'This browser cannot access local folders. Use a supported desktop browser or the local Skill.' : '当前浏览器不能访问本地目录，请使用支持目录访问的桌面浏览器或本地 Skill。')}</p><a href="/#get-started">${en ? 'How to design with an Agent' : '如何让 Agent 开始设计'}</a></section></div>`;
    $('#choose').onclick = () => act(session.choose());
    $('#authorize').onclick = () => act(session.authorize());
    $('#forget').onclick = () => act(session.disconnect());
  }
  $('#language').onclick = () => { en = !en; $('#language').textContent = en ? '中文' : 'EN'; document.documentElement.lang = en ? 'en' : 'zh-CN'; render(); if (initialized && supported) act(session.restore()); };
  render();
  async function initialize() {
    if (initializedClient) initializedClient = undefined;
    else await client.call({ type: 'initialize' });
    const caps = await client.call({ type: 'execute', name: 'get_capabilities', input: {} });
    registration = await registerWebMCP(document.modelContext, caps.data, async (name, input) => {
      const result = await client.call({ type: 'execute', name, input });
      if (mounted && result.ok) await refresh?.();
      return result;
    });
    initialized = true;
    document.body.dataset.runtime = registration.available ? 'ready' : 'unsupported';
  }
  try {
    await initialize();
    $('#choose').disabled = !supported;
    if (supported) await act(session.restore());
  } catch { message(en ? 'Workspace failed to load. Refresh to retry.' : '工作区加载失败，请刷新重试。'); }
  addEventListener('pagehide', () => { registration?.dispose(); client.close(); });
}
