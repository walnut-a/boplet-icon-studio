import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

export async function buildWeb(directory) {
  await mkdir(directory, { recursive: true });
  const homepage = (await readFile('src/app/index.html', 'utf8')).replace('lang="zh-CN"', 'lang="en"').replace('正在加载…', 'Loading…').replace('>跳到内容</a>', '>Skip to content</a>');
  await writeFile(join(directory, 'index.html'), homepage);
  await mkdir(join(directory, 'studio'), { recursive: true });
  await copyFile('src/app/index.html', join(directory, 'studio', 'index.html'));
  await writeFile(join(directory, 'style.css'), await readFile('src/app/style.css', 'utf8') + '\n' + await readFile('src/web/start.css', 'utf8'));
  await build({ entryPoints: { app: 'src/web/start.js', worker: 'src/web/worker.js' }, outdir: directory, bundle: true, format: 'esm', platform: 'browser', external: ['/studio.js'] });
  await build({ entryPoints: ['src/app/app.js'], outfile: join(directory, 'studio.js'), bundle: true, format: 'esm', platform: 'browser', minify: true, define: { __BOPLET_WEB__: 'true' } });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await buildWeb(resolve('dist/web'));
  console.log('官网及 /studio 工作区构建完成，未部署。');
}
