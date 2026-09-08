import { StudioError } from '../contracts/errors.js';

export function encodeJson(document) {
  try {
    const text = JSON.stringify(document, (_, value) => {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError();
      if (value === undefined || ['function', 'symbol', 'bigint'].includes(typeof value)) throw new TypeError();
      return value;
    });
    if (text === undefined) throw new TypeError();
    return text;
  } catch { throw new StudioError('VALIDATION_FAILED', '文档必须是完整的 JSON 数据。'); }
}
