import { cp, mkdir, mkdtemp, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { buildSkill, inspectPackage } from './package.js';

const digest = bytes => `sha256-${createHash('sha256').update(bytes).digest('hex')}`;
const exists = async path => stat(path).then(() => true, error => error.code === 'ENOENT' ? false : Promise.reject(error));

export async function packageIdentity(directory) {
  const report = await inspectPackage(directory);
  const manifest = JSON.parse(await readFile(join(directory, 'package-manifest.json'), 'utf8'));
  return { version: report.version, schemaRevision: manifest.schemaRevision, buildId: digest(await readFile(join(directory, 'package-manifest.json'))) };
}

async function buildTemporary(parent = tmpdir(), source = null) {
  if (source) await packageIdentity(resolve(source));
  const directory = await mkdtemp(join(parent, '.icon-studio-skill-'));
  try {
    if (source) { await cp(resolve(source), directory, { recursive: true }); await packageIdentity(directory); }
    else await buildSkill(directory);
    return directory;
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}

export async function checkInstalledSkill(installedDirectory, source = null) {
  const target = resolve(installedDirectory);
  if (basename(target) !== 'make-product-icons') throw Error('安装目标必须明确指向 make-product-icons 目录。');
  const candidate = await buildTemporary(tmpdir(), source);
  try {
    const expected = await packageIdentity(candidate);
    if (!await exists(target)) return { current: false, reason: 'not_installed', expected, installed: null };
    try {
      const installed = await packageIdentity(target);
      return { current: installed.buildId === expected.buildId, reason: installed.buildId === expected.buildId ? null : 'build_mismatch', expected, installed };
    } catch {
      return { current: false, reason: 'invalid_installation', expected, installed: null };
    }
  } finally {
    await rm(candidate, { recursive: true, force: true });
  }
}

export async function installCurrentSkill(installedDirectory, backupRoot, source = null) {
  const target = resolve(installedDirectory), backups = resolve(backupRoot);
  if (basename(target) !== 'make-product-icons') throw Error('安装目标必须明确指向 make-product-icons 目录。');
  await mkdir(dirname(target), { recursive: true }); await mkdir(backups, { recursive: true });
  const candidate = await buildTemporary(dirname(target), source);
  const expected = await packageIdentity(candidate);
  let backup = null, displaced = null;
  try {
    if (await exists(target)) {
      try {
        const installed = await packageIdentity(target);
        if (installed.buildId === expected.buildId) { await rm(candidate, { recursive: true, force: true }); return { changed: false, target, backup: null, ...expected }; }
      } catch { /* Preserve an invalid or partial installation before replacement. */ }
      backup = join(backups, `make-product-icons-${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${expected.buildId.slice(-8)}`);
      await cp(target, backup, { recursive: true, errorOnExist: true, force: false });
      displaced = `${target}.previous-${randomUUID()}`;
      await rename(target, displaced);
    }
    await rename(candidate, target);
    const installed = await packageIdentity(target);
    if (installed.buildId !== expected.buildId) throw Error('安装后 build ID 不一致。');
    if (displaced) await rm(displaced, { recursive: true, force: true });
    return { changed: true, target, backup, ...installed };
  } catch (error) {
    if (displaced && await exists(displaced) && !await exists(target)) await rename(displaced, target);
    if (await exists(candidate)) await rm(candidate, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, target, backupRoot, source] = process.argv.slice(2);
  if (!target || !['check', 'install'].includes(command) || (command === 'install' && !backupRoot)) {
    console.error('用法：node scripts/local-skill.js check <安装目录> [候选 Skill 目录] | install <安装目录> <备份目录> [候选 Skill 目录]；省略候选则构建当前源码。');
    process.exitCode = 1;
  } else if (command === 'check') {
    const report = await checkInstalledSkill(target, backupRoot); console.log(JSON.stringify(report, null, 2)); if (!report.current) process.exitCode = 2;
  } else console.log(JSON.stringify(await installCurrentSkill(target, backupRoot, source), null, 2));
}
