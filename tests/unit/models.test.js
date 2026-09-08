import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocument, documentSchemas } from '../../src/contracts/models.js';
import { createFixtureLibrary } from '../fixtures/library.js';

test('synthetic empty library and zero-scheme projects round-trip as strict JSON', () => {
  for (const options of [{ projects: 0 }, { projects: 2, schemes: 0 }, { projects: 2, schemes: 3, icons: 2, variants: 4 }]) {
    const files = createFixtureLibrary(options);
    for (const { kind, document } of files.values()) {
      const copy = JSON.parse(JSON.stringify(document));
      assert.equal(validateDocument(kind, copy), copy);
    }
    assert.equal([...files.values()].filter(x => x.kind === 'project').length, options.projects);
  }
});

test('project identity is independent of names and cannot be a scheme ID', () => {
  const docs = [...createFixtureLibrary({ projects: 2, schemes: 0 }).values()];
  const projects = docs.filter(x => x.kind === 'project').map(x => x.document);
  assert.equal(projects[0].name, projects[1].name);
  assert.notEqual(projects[0].projectId, projects[1].projectId);
  assert.throws(() => validateDocument('project', { ...projects[0], projectId: 's-example' }), { code: 'VALIDATION_FAILED' });
  assert.throws(() => validateDocument('project', { ...projects[0], projectKey: 'old-scheme' }), { code: 'VALIDATION_FAILED' });
});

test('unsupported disk formats are rejected without conversion or mutation', () => {
  const doc = structuredClone(createFixtureLibrary().get('library.json').document);
  doc.formatVersion = 2;
  const before = structuredClone(doc);
  assert.throws(() => validateDocument('library', doc), { code: 'SCHEMA_UNSUPPORTED' });
  assert.deepEqual(doc, before);
});

test('unknown nested metadata and non-finite geometry are rejected, not stripped', () => {
  const docs = [...createFixtureLibrary({ projects: 1, schemes: 1, icons: 1, variants: 1 }).values()];
  const vocabulary = structuredClone(docs.find(x => x.kind === 'vocabulary').document);
  vocabulary.icons[0].tags = ['search'];
  vocabulary.icons[0].script = 'ignored?';
  assert.throws(() => validateDocument('vocabulary', vocabulary), { code: 'VALIDATION_FAILED' });
  assert.equal(vocabulary.icons[0].script, 'ignored?');
  const matrix = structuredClone(docs.find(x => x.kind === 'matrix').document);
  matrix.variants[0].layers[0].width = Infinity;
  assert.throws(() => validateDocument('matrix', matrix), { code: 'VALIDATION_FAILED' });
});

test('variant size/style/weight and production/review are distinct dimensions', () => {
  const matrix = [...createFixtureLibrary({ projects: 1, schemes: 1, icons: 1, variants: 4 }).values()].find(x => x.kind === 'matrix').document;
  assert.equal(new Set(matrix.variants.map(x => x.variantId)).size, 4);
  assert.equal(new Set(matrix.variants.map(x => x.weight)).size, 2);
  assert.equal(new Set(matrix.variants.map(x => x.size)).size, 2);
  assert.equal(new Set(matrix.variants.map(x => x.style)).size, 2);
  const bad = structuredClone(matrix);
  bad.variants[0].productionStatus = 'accepted';
  assert.throws(() => validateDocument('matrix', bad), { code: 'VALIDATION_FAILED' });
});

test('every core entity has a strict schema, including tasks, reviews and delivery', () => {
  for (const name of ['library', 'project', 'brief', 'vocabulary', 'scheme', 'rules', 'matrix', 'task', 'batch', 'review', 'delivery']) {
    assert.equal(documentSchemas[name].additionalProperties, false, name);
  }
});

test('duplicate nested node/layer IDs and incompatible content status are rejected', () => {
  const matrix = [...createFixtureLibrary({ projects: 1, schemes: 1, icons: 1, variants: 1 }).values()].find(x => x.kind === 'matrix').document;
  const duplicate = structuredClone(matrix);
  duplicate.variants[0].layers.push(structuredClone(duplicate.variants[0].layers[0]));
  assert.throws(() => validateDocument('matrix', duplicate), { code: 'VALIDATION_FAILED' });
  const compiled = structuredClone(matrix);
  compiled.variants[0].productionStatus = 'compiled';
  assert.throws(() => validateDocument('matrix', compiled), { code: 'VALIDATION_FAILED' });
});

test('invalid calendar dates are rejected even when the timestamp looks well formed', () => {
  const library = createFixtureLibrary().get('library.json').document;
  assert.throws(() => validateDocument('library', { ...library, updatedAt: '2026-02-31T00:00:00.000Z' }), { code: 'VALIDATION_FAILED' });
});
