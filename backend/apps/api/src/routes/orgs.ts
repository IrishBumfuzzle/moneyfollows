import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Centre, CreateCentre, CreateOrganisation, Organisation, StaffRole, StaffUser } from '@paisa/contracts';
import { schema, type Db } from '@paisa/db';
import { badRequest, conflict, forbidden } from '../errors';
import { route } from '../http';
import { isUniqueViolation } from './student';
import { toStaffUser } from './staff-auth';

export async function orgRoutes(app: FastifyInstance, { db }: { db: Db }) {
  route(
    app,
    { method: 'GET', url: '/v1/orgs', summary: 'Partner NGOs you can see', tag: 'orgs', auth: 'staff', response: z.array(Organisation) },
    async ({ staff }) => {
      const q = db.select({ id: schema.organisations.id, name: schema.organisations.name, city: schema.organisations.city }).from(schema.organisations);
      if (staff.role === 'vanguard') return q;
      return staff.org ? q.where(eq(schema.organisations.id, staff.org)) : [];
    },
  );

  route(
    app,
    {
      method: 'POST',
      url: '/v1/orgs',
      summary: 'Add a partner NGO',
      tag: 'orgs',
      auth: 'staff',
      roles: ['vanguard'],
      body: CreateOrganisation,
      response: Organisation,
    },
    async ({ body }) => {
      const [row] = await db.insert(schema.organisations).values(body).returning();
      return { id: row!.id, name: row!.name, city: row!.city };
    },
  );

  route(
    app,
    { method: 'GET', url: '/v1/centres', summary: "Schools and centres in your NGO", tag: 'orgs', auth: 'staff', response: z.array(Centre) },
    async ({ staff }) => {
      const q = db.select({ id: schema.centres.id, orgId: schema.centres.orgId, name: schema.centres.name, type: schema.centres.type }).from(schema.centres);
      if (staff.role === 'vanguard') return q;
      return staff.org ? q.where(eq(schema.centres.orgId, staff.org)) : [];
    },
  );

  route(
    app,
    {
      method: 'POST',
      url: '/v1/centres',
      summary: 'Add a school or community centre to your NGO',
      tag: 'orgs',
      auth: 'staff',
      roles: ['ngo_admin', 'vanguard'],
      body: CreateCentre,
      response: Centre,
    },
    async ({ staff, body }) => {
      const orgId = staff.role === 'vanguard' ? body.orgId : staff.org;
      if (!orgId) throw badRequest('orgId is required');
      if (staff.role === 'ngo_admin' && body.orgId && body.orgId !== staff.org) throw forbidden('you can only add centres to your own NGO');
      const [row] = await db.insert(schema.centres).values({ orgId, name: body.name, type: body.type }).returning();
      return { id: row!.id, orgId: row!.orgId, name: row!.name, type: row!.type };
    },
  );

  route(
    app,
    {
      method: 'POST',
      url: '/v1/staff',
      summary: 'Invite a facilitator or NGO admin to your NGO (they sign in with an email code)',
      tag: 'orgs',
      auth: 'staff',
      roles: ['ngo_admin', 'vanguard'],
      body: z.strictObject({
        name: z.string().trim().min(2).max(80),
        email: z.email(),
        role: StaffRole,
        orgId: z.uuid().optional(),
      }),
      response: StaffUser,
    },
    async ({ staff, body }) => {
      if (staff.role === 'ngo_admin' && body.role === 'vanguard') throw forbidden('NGO admins cannot create Vanguard accounts');
      const orgId = staff.role === 'vanguard' ? (body.orgId ?? null) : staff.org;
      if (body.role !== 'vanguard' && !orgId) throw badRequest('orgId is required');
      try {
        const [row] = await db
          .insert(schema.staffUsers)
          .values({ name: body.name, email: body.email.trim().toLowerCase(), role: body.role, orgId: body.role === 'vanguard' ? null : orgId })
          .returning();
        return toStaffUser(row!);
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('email_taken', 'a staff account with that email already exists');
        throw err;
      }
    },
  );
}
