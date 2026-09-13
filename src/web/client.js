export function createWorkerClient() {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  let sequence = 0, closed = false;
  const pending = new Map();
  const close = () => { closed = true; worker.terminate(); for (const entry of pending.values()) entry.reject(Error('网页运行会话已结束，请刷新重试。')); pending.clear(); };
  worker.onerror = close;
  worker.onmessage = ({ data }) => {
    const entry = pending.get(data.id); if (!entry) return;
    pending.delete(data.id); data.error ? entry.reject(Error(data.error)) : entry.resolve(data.result);
  };
  const call = message => new Promise((resolve, reject) => {
    if (closed) return reject(Error('网页运行会话已结束。'));
    const id = ++sequence; pending.set(id, { resolve, reject });
    try { worker.postMessage({ id, ...message }); }
    catch (error) { pending.delete(id); reject(error); }
  });
  return { call, close };
}
