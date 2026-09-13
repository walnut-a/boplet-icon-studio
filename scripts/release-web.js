import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildSkill, archiveSkill } from './package.js';
import { readRelease } from './release-skill.js';
import { buildWeb } from './build-web.js';

const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0 && !process.argv[outputIndex + 1]) throw Error('--output 需要明确目录');
const directory = resolve(outputIndex >= 0 ? process.argv[outputIndex + 1] : 'dist/web');
const candidateIndex = process.argv.indexOf('--skill-release');
if (candidateIndex >= 0 && !process.argv[candidateIndex + 1]) throw Error('--skill-release 需要候选目录');
const candidate = candidateIndex >= 0 ? resolve(process.argv[candidateIndex + 1]) : null;
const release = candidate ? await readRelease(candidate) : null;
await buildWeb(directory);
const temp = candidate ? join(candidate, 'skill') : await mkdtemp(join(tmpdir(), 'boplet-release-'));
try {
  if (!candidate) await buildSkill(temp);
  const { report, bytes, sha256 } = await archiveSkill(temp);
  // Publish the exact packaged instructions for online reading, without requiring installation.
  const skillDirectory = join(directory, 'skill');
  for (const path of report.files.filter(path => path === 'SKILL.md' || path === 'version.json' || path === 'contracts.json' || path.startsWith('references/'))) {
    const destination = join(skillDirectory, path);
    await mkdir(join(destination, '..'), { recursive: true });
    await writeFile(destination, await readFile(join(temp, path)));
  }
  const downloads = join(directory, 'downloads'); await mkdir(downloads, { recursive: true });
  const filename = `make-product-icons-${sha256.slice(0,16)}.zip`;
  if (!release) await writeFile(join(downloads, filename), bytes);
  await writeFile(join(downloads, 'release.json'), JSON.stringify(release || { skillId: 'make-product-icons', version: report.version, buildId: report.buildId, stage: 'preview', url: `https://boplet.app/downloads/${filename}`, sha256, bytes: bytes.length }, null, 2));
  await writeFile(join(directory, '_headers'), '/*\n  Cache-Control: no-store\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: default-src \'self\'; script-src \'self\' \'unsafe-eval\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; worker-src \'self\'; connect-src \'self\'; frame-ancestors \'none\'; base-uri \'self\'\n');
  console.log(JSON.stringify({ directory, version: report.version, sha256, stage: 'preview', deployed: false }));
} finally { if (!candidate) await rm(temp, { recursive: true, force: true }); }
