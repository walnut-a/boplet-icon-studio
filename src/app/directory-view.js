const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function directoryIssues(issues = [], en = false) {
  const labels = en
    ? { legacy: 'Older format; no migration performed', project: 'Project folder; choose its library folder', invalid: 'Invalid or unsupported project data', unreadable: 'Folder could not be read' }
    : { legacy: '旧格式，未进行迁移', project: '单个项目目录，请选择所属项目库', invalid: '数据损坏或格式不受支持', unreadable: '无法读取目录' };
  return issues.length ? `<section class="directory-issues"><h2>${en ? 'Some folders need attention' : '部分目录未能打开'}</h2><ul>${issues.map(i => `<li>${esc(i.path || (en ? 'Selected folder' : '当前目录'))} — ${esc(labels[i.kind])}</li>`).join('')}</ul></section>` : '';
}
export function directoryCollection(options, en) {
  return `<div class="heading"><h1>${en ? 'Projects' : '项目库'}</h1><button data-action="connect">${en ? 'Choose another folder' : '更换目录'}</button></div>
    <p class="collection-location">${en ? 'Selected folder: ' : '已选择目录：'}${esc(options.rootName)}</p>
    <div class="project-list">${options.discoveredLibraries.flatMap(library => library.projects.length ? library.projects.map(p => `<button class="project-row" data-action="open-discovered" data-library="${esc(library.path)}" data-id="${esc(p.projectId)}"><span><strong>${esc(p.name)}</strong><small>${esc(p.purpose)}</small><small>${en ? 'Library: ' : '所属项目库：'}${esc(library.path)}</small></span><small>${esc(p.updatedAt.slice(0, 10))}</small></button>`) : [`<button class="project-row" data-action="open-library" data-library="${esc(library.path)}"><strong>${esc(library.path)}</strong><small>${en ? 'Empty library — open to get started' : '空项目库，打开后开始创建'}</small></button>`]).join('')}</div>
    ${directoryIssues(options.directoryIssues, en)}
    <div class="storage-actions"><button data-action="refresh">${en ? 'Refresh' : '刷新'}</button><button data-action="disconnect">${en ? 'Disconnect' : '断开目录'}</button></div>`;
}
export function directoryEmpty(options, en) {
  const kind = options.directoryKind;
  const titles = en ? { empty: 'Ready for your first project', project: 'Choose the project’s library folder', legacy: 'This folder uses an older format', invalid: 'This library could not be read' }
    : { empty: '准备好创建第一个项目', project: '请选择项目所属的项目库', legacy: '这个目录使用旧版格式', invalid: '这个项目库暂时无法读取' };
  const help = en ? { empty: 'This folder is empty. Send the online instructions to your Agent, then ask it to create a project here after loading the Skill.', project: 'This is a single project’s data folder. Choose the folder containing library.json, or its parent folder.', legacy: 'These files belong to an older format. They have been kept unchanged; choose a current Boplet library to continue.', invalid: 'The library data is invalid or unsupported. Check the files or choose another library.', unrecognized: 'No supported library was found here or in its immediate subfolders. Choose a Boplet library, a folder containing libraries, or an empty folder for new projects.' }
    : { empty: '这个文件夹是空的。把在线指令发给 Agent，加载 Skill 后告诉它在当前目录创建项目。', project: '这里是单个项目的数据目录。请选择包含 library.json 的项目库文件夹，或项目库的上一级目录。', legacy: '已保留所有旧文件，没有进行迁移。请选择当前格式的 Boplet 项目库继续使用。', invalid: '项目库数据损坏或格式不受支持。请检查文件，或更换项目库。', unrecognized: '当前目录及下一级文件夹中没有可识别的项目库。可选择 Boplet 项目库、包含项目库的总目录，或用于新项目的空目录。' };
  return `<section class="directory-empty"><h1>${esc(titles[kind] ?? (en ? 'No Boplet projects found yet' : '还没有找到 Boplet 项目'))}</h1>
    <p class="selected-directory">${en ? 'Selected folder: ' : '已选择目录：'}<strong>${esc(options.directoryName)}</strong></p>
    <p>${esc(help[kind] ?? help.unrecognized)}</p>
    ${directoryIssues(options.directoryIssues, en)}
    <div class="storage-actions"><button class="${kind === 'empty' ? '' : 'primary'}" data-action="connect">${en ? 'Choose another folder' : '更换目录'}</button><a href="/#get-started" target="_blank" rel="noopener noreferrer">${en ? 'View getting-started instructions' : '查看使用指引'}</a></div>
    <p class="directory-safety">${en ? 'Choosing a folder does not create, modify, or migrate files.' : '选择目录不会创建、修改或迁移文件。'}</p></section>`;
}
