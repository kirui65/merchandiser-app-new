const { z } = require('zod');

const RepRoleSchema = z.enum(['rep', 'manager', 'brand_ambassador', 'telemarketer', 'team_leader', 'recruiter']);
const RepAccessModeSchema = z.enum(['apk', 'web', 'both']);

const RepSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email(),
  passwordHash: z.string().optional(), // set server-side, never accepted from client input
  role: RepRoleSchema,
  accessMode: RepAccessModeSchema.default('both'),
  assignedOutletIds: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  createdAt: z.any().optional(),
});

// Shape accepted from the client on create — never accept passwordHash directly.
const RepCreateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: RepRoleSchema.default('rep'),
  accessMode: RepAccessModeSchema.default('both'),
  assignedOutletIds: z.array(z.string()).default([]),
});

const RepUpdateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email(),
  role: RepRoleSchema,
  accessMode: RepAccessModeSchema.default('both'),
  // Optional: managers only provide this when resetting an account password.
  password: z.string().min(8).optional(),
});

module.exports = { RepRoleSchema, RepAccessModeSchema, RepSchema, RepCreateSchema, RepUpdateSchema };
