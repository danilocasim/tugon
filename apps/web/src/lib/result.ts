export type Result<T = null> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; meta?: Record<string, unknown> };

export const success = <T>(data: T): Result<T> => ({ ok: true, data });
export const failure = (code: string, message: string, field?: string): Result<never> => ({
  ok: false, code, message, ...(field ? { meta: { field } } : {}),
});
