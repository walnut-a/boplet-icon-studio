// Missing marker is the original v3 layout. Reading it never rewrites the library.
export const projectPrefix = library => library.projectLayout === 'direct' ? '' : 'projects';
export const projectDirectory = (library, projectId) => [projectPrefix(library), projectId].filter(Boolean).join('/');
