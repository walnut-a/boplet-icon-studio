import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch } from '../../src/runtime/launcher.js';

test('启动器记住明确目录，健康实例复用；退出后重开仍读取原库', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'icon-launch-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const configDirectory = join(directory, 'config'), root = join(directory, 'data');
  const options = { configDirectory, root, skill: { status: 'loaded', version: '0.1.0-dev.1', evidence: 'isolated' } };
  const first = await launch(options); t.after(first.close);
  const second = await launch({ ...options, root: undefined });
  assert.equal(second.reused, true); assert.equal(second.url, first.url);
  assert.equal(second.token, first.token);
  const newer = await launch({ ...options, buildId: 'new-build' }); t.after(newer.close);
  assert.equal(newer.reused,false); assert.notEqual(newer.url,first.url);
  assert.equal((await fetch(first.url+'/health').then(r=>r.json())).ready,true);
  const library = JSON.parse(await readFile(join(root, 'library.json'), 'utf8'));
  await first.close();
  const third = await launch({ ...options, root: undefined }); t.after(third.close);
  assert.equal(third.reused, false);
  assert.equal(JSON.parse(await readFile(join(root, 'library.json'), 'utf8')).libraryId, library.libraryId);
});
