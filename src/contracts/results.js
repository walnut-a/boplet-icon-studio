import { array, assertSchema, enumeration, id, nullable, object, revision, shortText, text } from './schema.js';
import { identity } from './models.js';
import { ERROR_CODES } from './errors.js';

export const resultTarget = object(identity, []);
const common = {
  operationId: id('op'), target: resultTarget, revision: nullable(revision), eventCursor: nullable(id('event')),
  warnings: array(text), nextActions: array(text),
};
export const errorResultSchema = object({
  ...common, ok: { const: false }, status: { const: 'failed' },
  persistence: enumeration('failed', 'not_applicable'),
  error: object({ code: enumeration(...ERROR_CODES), message: text, retryable: { type: 'boolean' },
    issues: array(object({ path: { type: 'string' }, keyword: text, field: nullable(shortText) })) }),
});
export function resultSchema(dataSchema) {
  return { oneOf: [object({ ...common, ok: { const: true }, status: { const: 'completed' },
    persistence: enumeration('persisted', 'not_applicable'), data: dataSchema }),
    object({ ...common, ok: { const: true }, status: { const: 'accepted' }, persistence: { const: 'pending' } }),
    object({ ...common, ok: { const: true }, status: { const: 'waiting_user' }, persistence: { const: 'not_applicable' }, permissionRequestId: id('perm') }),
    errorResultSchema] };
}
// The envelope validates transport fields; each operation also validates its own data schema.
export const resultEnvelopeSchema = { $id: 'urn:icon-studio:v3:result', ...resultSchema({ type: 'object' }) };
export const validateResult = value => assertSchema(resultEnvelopeSchema, value);
