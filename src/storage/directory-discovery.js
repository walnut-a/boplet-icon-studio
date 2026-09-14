import { BrowserStorage } from './browser.js';
import { validateDocument } from '../contracts/models.js';

const legacyMarkers = ['studio-collection.json', 'studio-schemes.json', 'icon-system.json', 'build-manifest.json'];
const entriesOf = async handle => {
  const entries = new Map();
  for await (const [name, entry] of handle.entries()) entries.set(name, entry);
  return entries;
};
const classify = entries => entries.has('library.json') ? 'library'
  : entries.has('project.json') ? 'project'
  : legacyMarkers.some(name => entries.has(name)) ? 'legacy'
  : entries.size === 0 ? 'empty' : 'unrecognized';

/** Read only: selected directory plus its immediate children, never an arbitrary recursive scan. */
export async function discoverDirectory(handle) {
  const entries = await entriesOf(handle);
  const result = { kind: classify(entries), libraries: [], issues: [] };
  const inspect = async (directory, path) => {
    const storage = new BrowserStorage(directory);
    try {
      const library = validateDocument('library', await storage.readJson('library.json'));
      const found = { path, handle: directory, libraryId: library.libraryId, projects: [] };
      result.libraries.push(found);
      let projects;
      try { projects = await directory.getDirectoryHandle('projects'); }
      catch (error) { if (error.name === 'NotFoundError') return; throw error; }
      for (const [id, entry] of await entriesOf(projects)) {
        if (entry.kind !== 'directory' || !/^p-[A-Za-z0-9_-]+$/.test(id)) continue;
        try {
          const project = validateDocument('project', await storage.readJson(`projects/${id}/project.json`));
          if (project.projectId !== id || project.libraryId !== library.libraryId) throw Error('Identity mismatch');
          if (project.status === 'active') found.projects.push(project);
        } catch { result.issues.push({ path: [path, 'projects', id].filter(Boolean).join('/'), kind: 'invalid' }); }
      }
      found.projects.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      result.issues.push({ path, kind: 'invalid' });
      if (!path) result.kind = 'invalid';
    }
  };
  if (result.kind === 'library') await inspect(handle, '');
  else if (result.kind === 'unrecognized') {
    for (const [name, entry] of entries) {
      if (entry.kind !== 'directory' || name.startsWith('.')) continue;
      try {
        const kind = classify(await entriesOf(entry));
        if (kind === 'library') await inspect(entry, name);
        else if (kind === 'legacy' || kind === 'project') result.issues.push({ path: name, kind });
      } catch { result.issues.push({ path: name, kind: 'unreadable' }); }
    }
    if (result.libraries.length) result.kind = 'collection';
  }
  result.libraries.sort((a, b) => a.path.localeCompare(b.path));
  return result;
}
