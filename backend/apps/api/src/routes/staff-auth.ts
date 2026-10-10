import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { OtpRequest, OtpRequestResponse, OtpVerify, OtpVerifyResponse, type StaffUser } from '@paisa/contracts';
import { schema, type Db } from '@paisa/db';
import { HttpError, unauthorized } from '../errors';
import { route } from '../http';
import { signToken, STAFF_TTL_S } from '../tokens';

/** Email port (B3). Development logs the code; production must inject a real sender. */
export interface Mailer {
  sendOtp(email: string, code: string): Promise<void>;
}

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;

export function toStaffUser(row: typeof schema.staffUsers.$inferSelect): StaffUser {
  return { id: row.id, orgId: row.orgId, name: row.name, email: row.email, role: row.role };
}

export async function staffAuthRoutes(
  app: FastifyInstance,
  { db, mailer, devEcho }: { db: Db; mailer: Mailer; devEcho: boolean },
) {
  const hmac = (data: string) => createHmac('sha256', app.jwtSecret).update(data).digest('hex');
  const emailHash = (email: string) => hmac(`email:${email.trim().toLowerCase()}`);
  const codeHash = (eh: string, code: string) => hmac(`otp:${eh}:${code}`);

  route(
    app,
    {
      method: 'POST',
      url: '/v1/auth/otp/request',
      summary: 'Email a one-time sign-in code to a staff member',
      tag: 'staff auth',
      auth: 'none',
      body: OtpRequest,
      response: OtpRequestResponse,
    },
    async ({ body }) => {
      const now = app.now();
      const eh = emailHash(body.email);
      const [existing] = await db.select().from(schema.otpCodes).where(eq(schema.otpCodes.emailHash, eh));
      if (existing && now.getTime() - existing.createdAt.getTime() < RESEND_AFTER_MS) {
        throw new HttpError(429, 'too_many_requests', 'wait a few seconds before asking for another code');
      }
      const [user] = await db.select().from(schema.staffUsers).where(eq(schema.staffUsers.email, body.email.trim().toLowerCase()));
      // Same answer for unknown emails, so the endpoint cannot be used to find staff accounts.
      if (!user) return { sent: true as const };

      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const values = { codeHash: codeHash(eh, code), expiresAt: new Date(now.getTime() + OTP_TTL_MS), attempts: 0, createdAt: now };
      await db
        .insert(schema.otpCodes)
        .values({ emailHash: eh, ...values })
        .onConflictDoUpdate({ target: schema.otpCodes.emailHash, set: values });
      await mailer.sendOtp(user.email, code);
      return devEcho ? { sent: true as const, devCode: code } : { sent: true as const };
    },
  );

  route(
    app,
    {
      method: 'POST',
      url: '/v1/auth/otp/verify',
      summary: 'Exchange the one-time code for a staff session token',
      tag: 'staff auth',
      auth: 'none',
      body: OtpVerify,
      response: OtpVerifyResponse,
    },
    async ({ body }) => {
      const now = app.now();
      const eh = emailHash(body.email);
      const [otp] = await db.select().from(schema.otpCodes).where(eq(schema.otpCodes.emailHash, eh));
      if (!otp || otp.expiresAt <= now) throw unauthorized('the code is wrong or has expired');
      if (otp.attempts >= MAX_ATTEMPTS) {
        await db.delete(schema.otpCodes).where(eq(schema.otpCodes.emailHash, eh));
        throw new HttpError(429, 'too_many_attempts', 'too many wrong codes; ask for a new one');
      }
      const expected = Buffer.from(otp.codeHash);
      const given = Buffer.from(codeHash(eh, body.code));
      if (!timingSafeEqual(expected, given)) {
        await db.update(schema.otpCodes).set({ attempts: otp.attempts + 1 }).where(eq(schema.otpCodes.emailHash, eh));
        throw unauthorized('the code is wrong or has expired');
      }
      await db.delete(schema.otpCodes).where(eq(schema.otpCodes.emailHash, eh));
      const [user] = await db.select().from(schema.staffUsers).where(eq(schema.staffUsers.email, body.email.trim().toLowerCase()));
      if (!user) throw unauthorized('the code is wrong or has expired');
      const token = signToken({ kind: 'staff', sub: user.id, role: user.role, org: user.orgId }, app.jwtSecret, STAFF_TTL_S, now);
      return { token, user: toStaffUser(user) };
    },
  );

  route(
    app,
    { method: 'GET', url: '/v1/auth/me', summary: 'The signed-in staff member', tag: 'staff auth', auth: 'staff', response: OtpVerifyResponse.shape.user },
    async ({ staff }) => {
      const [user] = await db.select().from(schema.staffUsers).where(eq(schema.staffUsers.id, staff.sub));
      if (!user) throw unauthorized();
      return toStaffUser(user);
    },
  );
}
