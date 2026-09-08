import { FORMAT_VERSION } from '../../src/contracts/models.js';

const time = '2026-09-08T00:00:00.000Z';
const header = { formatVersion: FORMAT_VERSION, revision: 'r-fixture', createdAt: time, updatedAt: time };

/** Synthetic only. Stable IDs deliberately do not depend on repeated display names. */
export function createFixtureLibrary({ projects = 0, schemes = 0, icons = 0, variants = 0 } = {}) {
  const files = new Map();
  const put = (path, kind, data) => files.set(path, { kind, document: { ...header, ...data } });
  put('library.json', 'library', { libraryId: 'lib-fixture' });
  for (let p = 0; p < projects; p++) {
    const projectId = `p-${p}`;
    const root = `projects/${projectId}`;
    put(`${root}/project.json`, 'project', { libraryId: 'lib-fixture', projectId, name: 'Synthetic project', purpose: null, status: 'active', currentBriefRevision: 'r-fixture', preferredSchemeId: null });
    put(`${root}/design-brief.json`, 'brief', { projectId, status: 'draft', content: { fields: {}, vocabularyDraft: [] }, confirmation: null, previousConfirmedRevision: null });
    put(`${root}/vocabulary.json`, 'vocabulary', { projectId, icons: Array.from({ length: icons }, (_, i) => ({ iconId: `i-${i}`, name: `Synthetic ${i}`, concept: `test-concept-${i}`, tags: ['fixture'], usages: [], status: 'active' })) });
    for (let s = 0; s < schemes; s++) {
      const schemeId = `s-${s}`;
      const base = `${root}/schemes/${schemeId}`;
      put(`${base}/scheme.json`, 'scheme', { projectId, schemeId, name: `Direction ${s}`, description: null, status: 'draft', ruleRevision: null, sourceSchemeId: null });
      for (let i = 0; i < icons; i++) {
        put(`${base}/matrix/i-${i}.json`, 'matrix', { projectId, schemeId, iconId: `i-${i}`, variants: Array.from({ length: variants }, (_, v) => ({
          variantId: `v-${v}`, size: v % 2 === 0 ? 16 : 64, style: v % 2 === 0 ? 'filled' : 'outline', weight: Math.floor(v / 2) % 2 === 0 ? 'regular' : 'bold',
          status: 'active', productionStatus: 'draft', reviewStatus: 'unreviewed', sourceRevision: 'r-fixture', compiledRevision: null,
          layers: [{ layerId: 'l-shell', type: 'rect', name: 'Synthetic rectangle', visible: true, drawing: v % 2 === 0 ? 'fill' : 'stroke', strokeWidth: v % 2 === 0 ? 0 : 1, x: 2, y: 2, width: 12, height: 12, radius: 2 }],
        })) });
      }
    }
  }
  return files;
}
