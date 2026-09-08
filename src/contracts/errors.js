export const ERROR_CODES = Object.freeze([
  'CAPABILITY_UNAVAILABLE', 'PERMISSION_REQUIRED', 'PERMISSION_DENIED', 'TARGET_NOT_FOUND',
  'CONTEXT_CHANGED', 'BRIEF_UNCONFIRMED', 'TASK_UNREGISTERED', 'VALIDATION_FAILED',
  'STORAGE_UNAVAILABLE', 'SAVE_FAILED', 'RECEIPT_EXPIRED', 'SCHEMA_UNSUPPORTED', 'CANCELLED',
]);

export class StudioError extends Error {
  constructor(code, message, { retryable = false, issues = [], nextActions = [] } = {}) {
    super(message);
    if (!ERROR_CODES.includes(code)) throw new TypeError('Unknown error code');
    this.name = 'StudioError';
    this.code = code;
    this.retryable = retryable;
    this.issues = issues;
    this.nextActions = nextActions;
  }
}
