import { fileURLToPath } from 'node:url';
import { launch } from './launcher.js';
import { NodeStorage } from '../storage/node.js';
import { readFile } from 'node:fs/promises';
import { hash } from '../core/documents.js';

// Replaced with build-time constants. No user data or installation claim is baked in.
const version = '__SKILL_VERSION__';
const directory = process.argv[2];
if (process.argv.includes('--help')) {
  console.log('用法：node runtime/start.mjs [用户授权的数据目录]\n首次启动前在对话中确认目录。未传目录使用已记住的目录或系统文稿目录。');
} else {
  const loaded = process.env.ICON_STUDIO_SKILL_LOADED === version;
  if (!loaded) { console.error('请先完整读取此包 SKILL.md，再设置 ICON_STUDIO_SKILL_LOADED 为包版本；这表示宿主加载声明，不是安装签名。'); process.exitCode = 1; }
  else {
    try {
      const service = await launch({ root: directory, configDirectory: process.env.ICON_STUDIO_CONFIG_DIRECTORY,
        buildId: await hash(await readFile(new URL('../package-manifest.json',import.meta.url),'utf8')),
        sources: process.env.ICON_STUDIO_SOURCE_DIRECTORY ? await NodeStorage.open(process.env.ICON_STUDIO_SOURCE_DIRECTORY) : null,
        appDirectory: fileURLToPath(new URL('../app/', import.meta.url)), skill: { status: 'loaded', version, evidence: 'host_attestation:SKILL.md read' } });
      console.log(JSON.stringify({ ...service, close: undefined }));
      if (!service.reused) for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await service.close(); });
    } catch (e) { console.error(e.message); process.exitCode = 1; }
  }
}
