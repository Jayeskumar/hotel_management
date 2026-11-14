import { formatMessage, type MessageKey, type MessageParams } from '@tablewise/shared';

/**
 * Domain error carrying a translatable message key. The English message is
 * included for logs and API consumers; clients localise via `key` + `params`.
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    public key: MessageKey,
    public params?: MessageParams,
    public details?: unknown,
  ) {
    super(formatMessage('en', key, params));
  }
}

type EntityKey = Extract<MessageKey, `entity.${string}`>;

export const badRequest = (key: MessageKey, params?: MessageParams) => new AppError(400, 'BAD_REQUEST', key, params);
export const unauthorized = (key: MessageKey = 'auth.required') => new AppError(401, 'UNAUTHORIZED', key);
export const forbidden = (key: MessageKey = 'error.forbidden', params?: MessageParams) => new AppError(403, 'FORBIDDEN', key, params);
export const notFound = (entity: EntityKey) => new AppError(404, 'NOT_FOUND', 'error.notFound', { entity });
export const conflict = (key: MessageKey, params?: MessageParams) => new AppError(409, 'CONFLICT', key, params);
