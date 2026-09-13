import Ajv from 'ajv';
import { StudioError } from './errors.js';

// Schemas are authored by this application, never compiled from tool/user content.
export const ajv = new Ajv({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
ajv.addFormat('studio-time', value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);

export const text = { type: 'string', minLength: 1, maxLength: 4096 };
export const shortText = { type: 'string', minLength: 1, maxLength: 200 };
export const bool = { type: 'boolean' };
export const number = { type: 'number' };
export const timestamp = { type: 'string', format: 'studio-time' };
export const enumeration = (...values) => ({ enum: values });
export const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
export const array = (items, options = {}) => ({ type: 'array', items, ...options });
export const object = (properties, required = Object.keys(properties), extra = {}) => ({ type: 'object', properties, required, additionalProperties: false, ...extra });
export const id = prefix => ({ type: 'string', pattern: `^${prefix}-[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$` });
export const revision = id('r');
export const requestId = { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$' };
export const point = array(number, { minItems: 2, maxItems: 2 });
export const dimensions = { type: 'number', exclusiveMinimum: 0, maximum: 16384 };
export const positiveInteger = { type: 'integer', minimum: 1 };

export function assertSchema(schema, value) {
  const validate = (schema.$id ? ajv.getSchema(schema.$id) : undefined) ?? ajv.compile(schema);
  if (!validate(value)) {
    const issues = validate.errors.map(error => ({ path: error.instancePath, keyword: error.keyword,
      field: error.keyword === 'additionalProperties' ? error.params.additionalProperty : error.keyword === 'required' ? error.params.missingProperty : null }));
    throw new StudioError('VALIDATION_FAILED', '输入或数据不符合当前合同。', { issues });
  }
  return value;
}
