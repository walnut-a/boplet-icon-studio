import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { zipSync } from 'fflate';
import { buildApplication, buildContracts } from './build.js';

const sourceFiles = ['SKILL.md', 'references/runtime.md', 'references/design-method.md', 'references/data-and-maintenance.md', 'references/workflows.md'];
const licenses = ['ajv/LICENSE', 'paper/LICENSE.txt', 'fflate/LICENSE', 'fast-deep-equal/LICENSE', 'fast-uri/LICENSE', 'json-schema-traverse/LICENSE', 'require-from-string/license'];
const allowed = new Set([...sourceFiles, 'contracts.json', 'version.json', 'runtime/start.mjs', 'app/index.html', 'app/style.css', 'app/app.js', 'package-manifest.json', ...licenses.map(p => 'licenses/'+p.replaceAll('/','-'))]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(directory,prefix),{withFileTypes:true})) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw Error('包中不允许符号链接');
    if (entry.isDirectory()) result.push(...await files(directory,path)); else result.push(path);
  }
  return result.sort();
}
export async function buildSkill(directory) {
  await mkdir(directory,{recursive:true});
  if ((await readdir(directory)).length) throw Error('候选输出目录必须为空；不得覆盖已有安装包或用户文件。');
  const { version } = JSON.parse(await readFile('package.json','utf8'));
  await buildContracts(directory); await buildApplication(directory);
  for (const file of sourceFiles) { await mkdir(dirname(join(directory,file)),{recursive:true}); await copyFile(join('skill',file),join(directory,file)); }
  await mkdir(join(directory,'runtime'),{recursive:true});
  const result = await build({ stdin: { contents: (await readFile('src/runtime/skill-entry.js','utf8')).replaceAll('__SKILL_VERSION__',version), resolveDir: resolve('src/runtime'), sourcefile: 'skill-entry.js' },
    outfile: join(directory,'runtime/start.mjs'), bundle:true, platform:'node', format:'esm', target:'node22', minify:false, legalComments:'eof', external:['jsdom','canvas'],
    banner:{js:'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);'}, metafile:true });
  // Browser Paper.js adapters are optional; no unbundled production package is allowed.
  for (const output of Object.values(result.metafile.outputs)) for (const dep of output.imports) if (dep.external && !dep.path.startsWith('node:') && !['fs','path','os','url','http','https','module','vm','util','jsdom','canvas','jsdom/lib/jsdom/living/generated/utils'].includes(dep.path)) throw Error(`未随包提供的运行依赖：${dep.path}`);
  for (const file of licenses) { const destination = join(directory,'licenses',file.replaceAll('/','-')); await mkdir(dirname(destination),{recursive:true}); await copyFile(join('node_modules',file),destination); }
  await writeFile(join(directory,'version.json'),JSON.stringify({ skillId:'make-product-icons', version, contractVersion:3,formatVersion:3,releaseSource:null,stage:'candidate',productionReady:false },null,2)+'\n');
  const entries=[];
  for (const path of await files(directory)) { const content=await readFile(join(directory,path)); entries.push({path,bytes:content.length,sha256:sha(content)}); }
  await writeFile(join(directory,'package-manifest.json'),JSON.stringify({version,files:entries},null,2)+'\n');
  return inspectPackage(directory);
}
export async function inspectPackage(directory) {
  const paths=await files(directory); for(const path of paths) if(!allowed.has(path)) throw Error(`非白名单文件：${path}`);
  for(const path of allowed) if(!paths.includes(path)) throw Error(`缺失发布文件：${path}`);
  const manifest=JSON.parse(await readFile(join(directory,'package-manifest.json'),'utf8'));
  if(new Set(manifest.files.map(f=>f.path)).size!==paths.length-1)throw Error('发布清单不完整');
  for(const entry of manifest.files){if(!allowed.has(entry.path)||entry.path==='package-manifest.json')throw Error('非法清单路径');const content=await readFile(join(directory,entry.path));if(content.length!==entry.bytes||sha(content)!==entry.sha256)throw Error(`哈希不符：${entry.path}`);
    if(/hetao-app|hetao-status|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|\/Users\/zhaolixing|session-[a-f0-9]{8}-/.test(content.toString('utf8')))throw Error(`发现真实数据或凭据痕迹：${entry.path}`);
  }
  return {ok:true,files:paths,version:manifest.version};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const base=resolve('outputs/icon-studio-next');
  if(process.argv.includes('--check')) console.log(JSON.stringify(await inspectPackage(join(base,'skill')),null,2));
  else {
    const report=await buildSkill(join(base,'skill'));const archive={};for(const path of report.files)archive[`make-product-icons/${path}`]=[new Uint8Array(await readFile(join(base,'skill',path))),{mtime:new Date(2026,0,1)}];
    const bytes=zipSync(archive,{level:9});await writeFile(join(base,'make-product-icons.zip'),bytes);await writeFile(join(base,'sha256.txt'),sha(bytes)+'  make-product-icons.zip\n');
    console.log(JSON.stringify({version:report.version,files:report.files.length,bytes:bytes.length,sha256:sha(bytes),installed:false,deployed:false}));
  }
}
