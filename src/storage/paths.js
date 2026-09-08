import { StudioError } from '../contracts/errors.js';

export function validatePath(path, { allowRoot = false } = {}) {
  if (path === '' && allowRoot) return path;
  if (typeof path !== 'string' || !path || path.length > 1024 || /[\\:%\u0000-\u001f]/.test(path)
    || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new StudioError('VALIDATION_FAILED', '只接受授权根目录内的规范相对路径。');
  }
  return path;
}
