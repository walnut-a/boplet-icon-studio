import { StudioError } from '../contracts/errors.js';

// Persist only the selected handle. Project documents never enter this database.
async function transaction(mode, action) {
  if (!globalThis.indexedDB) throw new StudioError('CAPABILITY_UNAVAILABLE', '浏览器无法记住目录；请重新选择目录。');
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('boplet-directory', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('handles');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new StudioError('STORAGE_UNAVAILABLE', '目录偏好暂时不可用，请关闭旧页面后重试。'));
  });
  database.onversionchange = () => database.close();
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction('handles', mode);
      let result;
      const request = action(tx.objectStore('handles'));
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result ?? null);
      tx.onabort = () => reject(tx.error ?? new StudioError('STORAGE_UNAVAILABLE', '目录偏好未保存。'));
      tx.onerror = () => {}; // onabort is the definitive transaction failure.
    });
  } finally { database.close(); }
}

export const directoryMemory = {
  load: () => transaction('readonly', store => store.get('selected')),
  save(handle) {
    if (handle?.kind !== 'directory' || typeof handle.queryPermission !== 'function') {
      throw new StudioError('VALIDATION_FAILED', '只能记住所选目录句柄。');
    }
    return transaction('readwrite', store => store.put(handle, 'selected'));
  },
  clear: () => transaction('readwrite', store => store.delete('selected')),
};
