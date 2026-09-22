import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSkill, archiveSkill } from './package.js';

export const repository = 'walnut-a/boplet-icon-studio';
// 已发布清单不可变，改名前的仓库地址继续参与完整校验。
const releaseRepositories = new Set([repository, 'walnut-a/icon-studio']);

// Prepare artifacts only. Publishing and repository visibility are separate operations.
export async function prepareRelease(directory, { tag } = {}) {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  if (tag !== `v${version}`) throw Error('标签必须与 package.json 版本一致：v' + version);
  await mkdir(directory, { recursive: true });
  if ((await readdir(directory)).length) throw Error('发布候选目录非空，不覆盖已有候选。');
  await buildSkill(join(directory, 'skill'));
  const { report, bytes, sha256 } = await archiveSkill(join(directory, 'skill'));
  const filename = `make-product-icons-${version}.zip`;
  const manifest = { skillId: 'make-product-icons', version, buildId: report.buildId,
    stage: version.includes('-') ? 'preview' : 'release', repository, tag, filename,
    url: `https://github.com/${repository}/releases/download/${tag}/${filename}`, sha256, bytes: bytes.length };
  await writeFile(join(directory, filename), bytes);
  await writeFile(join(directory, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(join(directory, 'sha256.txt'), `${sha256}  ${filename}\n`);
  return { directory: resolve(directory), ...manifest, published: false };
}

export async function readRelease(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'release.json'), 'utf8'));
  const { report, bytes, sha256 } = await archiveSkill(join(directory, 'skill'));
  const filename = `make-product-icons-${report.version}.zip`;
  if (manifest.skillId !== 'make-product-icons' || !releaseRepositories.has(manifest.repository) ||
      manifest.version !== report.version || manifest.tag !== `v${report.version}` ||
      manifest.filename !== filename || manifest.buildId !== report.buildId ||
      manifest.url !== `https://github.com/${manifest.repository}/releases/download/${manifest.tag}/${filename}` ||
      manifest.sha256 !== sha256 || manifest.bytes !== bytes.length ||
      !Buffer.from(bytes).equals(await readFile(join(directory, filename)))) throw Error('发布候选校验失败');
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, directory, tag] = process.argv.slice(2);
  if (!directory || !['prepare', 'check'].includes(command)) throw Error('用法：release-skill.js prepare <空目录> <v版本> | check <候选目录>');
  console.log(JSON.stringify(command === 'prepare' ? await prepareRelease(resolve(directory), { tag }) : await readRelease(resolve(directory)), null, 2));
}
