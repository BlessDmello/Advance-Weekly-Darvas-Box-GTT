import type { CookieOptions, Request, Response } from 'express';
import type { ApiEnvironment } from '../../config/env.js';
import { hashToken } from './tokens.js';

export function authCookies(environment: ApiEnvironment) {
  const secure = environment.NODE_ENV === 'production';
  const prefix = secure ? '__Host-adb_' : 'adb_';
  const options: CookieOptions = { httpOnly: true, secure, sameSite: 'lax', path: '/' };
  const names = { session: `${prefix}session`, csrf: `${prefix}csrf`, preauth: `${prefix}preauth` };
  return {
    options,
    names,
    clear(response: Response) {
      for (const name of Object.values(names)) response.clearCookie(name, options);
    },
  };
}
export function readCookie(request: Request, name: string): string | undefined {
  const value: unknown = (request.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' ? value : undefined;
}
export function readSessionHash(request: Request, name: string): string | undefined {
  const token = readCookie(request, name);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? hashToken(token) : undefined;
}
