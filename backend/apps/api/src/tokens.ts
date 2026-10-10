import { createHmac, timingSafeEqual } from 'node:crypto';
import type { StaffRole } from '@paisa/contracts';

// Minimal HS256 JWTs. Student tokens identify one anonymous profile on a device;
// staff tokens carry the role claims the route guards check.

export interface StudentClaims {
  kind: 'student';
  sub: string;
  cls: string | null;
}

export interface StaffClaims {
  kind: 'staff';
  sub: string;
  role: StaffRole;
  org: string | null;
}

export type Claims = StudentClaims | StaffClaims;

export const STUDENT_TTL_S = 365 * 24 * 3600;
export const STAFF_TTL_S = 12 * 3600;

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const HEADER = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function signToken(claims: Claims, secret: string, ttlSeconds: number, now: Date): string {
  const iat = Math.floor(now.getTime() / 1000);
  const body = b64(JSON.stringify({ ...claims, iat, exp: iat + ttlSeconds }));
  return `${HEADER}.${body}.${sign(`${HEADER}.${body}`, secret)}`;
}

export function verifyToken(token: string, secret: string, now: Date): Claims | null {
  const [header, body, sig] = token.split('.');
  if (!header || !body || !sig || header !== HEADER) return null;
  const expected = Buffer.from(sign(`${header}.${body}`, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Claims & { exp: number };
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now.getTime()) return null;
    if (claims.kind !== 'student' && claims.kind !== 'staff') return null;
    return claims;
  } catch {
    return null;
  }
}
