import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildSkill } from '../../scripts/package.js';
import { checkInstalledSkill, installCurrentSkill, packageIdentity } from '../../scripts/local-skill.js';

test('local Skill check detects drift and installation backs up before atomic replacement', async t => {
  const root = await mkdtemp(join(tmpdir(), 'icon-local-skill-')); t.after(() => rm(root, { recursive: true, force: true }));
  const target = join(root, 'skills', 'make-product-icons'), backups = join(root, 'backups');
  await buildSkill(target);
  assert.equal((await checkInstalledSkill(target)).current, true);
  const unchanged = await installCurrentSkill(target, backups);
  assert.equal(unchanged.changed, false); assert.equal(unchanged.backup, null);

  await appendFile(join(target, 'app/app.js'), '\n// stale local installation\n');
  const stale = await checkInstalledSkill(target);
  assert.equal(stale.current, false); assert.equal(stale.reason, 'invalid_installation');
  const installed = await installCurrentSkill(target, backups);
  assert.equal(installed.changed, true); assert.ok(installed.backup);
  assert.equal((await packageIdentity(target)).buildId, installed.buildId);
  const candidate = join(root, 'release-skill');
  await buildSkill(candidate);
  const exact = await installCurrentSkill(target, backups, candidate);
  assert.equal(exact.buildId, (await packageIdentity(candidate)).buildId);
  await appendFile(join(candidate, 'app/app.js'), '\n// damaged candidate');
  await assert.rejects(installCurrentSkill(target, backups, candidate));
  assert.equal((await packageIdentity(target)).buildId, exact.buildId);
});
