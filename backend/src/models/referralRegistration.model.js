const { z } = require('zod');

const ReferralStatusSchema = z.enum([
  'submitted',
  'contacted',
  'requirements_checked',
  'training_scheduled',
  'placed',
  'rejected',
]);

const ReferralCreateSchema = z.object({
  campaignId: z.string().min(1),
  applicantName: z.string().trim().min(2).max(160),
  applicantIdNumber: z.string().trim().regex(/^\d{7,10}$/, 'Enter a valid national ID number'),
  phone: z.string().trim().min(7).max(24),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  county: z.string().trim().min(2).max(100),
  education: z.enum(['KCPE', 'KCSE', 'certificate', 'diploma', 'degree', 'postgraduate', 'other']),
  passportStatus: z.enum(['has_passport', 'will_get_self_funded', 'not_ready']),
  nitaFeeStatus: z.enum(['not_paid', 'paid']),
  eligibleForWomenOnlyIntake: z.literal(true),
  applicantConsent: z.literal(true),
}).strict();

// This deliberately shares every applicant field with the recruiter flow.
// The public endpoint receives a slug rather than a trusted campaign ID.
const WebReferralCreateSchema = ReferralCreateSchema.omit({ campaignId: true }).extend({
  campaignSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Enter a valid campaign link'),
  source: z.enum(['web_ad', 'web_engagement']).optional().default('web_ad'),
  // Honeypot: browsers hide this field; submissions with a value are accepted
  // and discarded before validation so it does not become bot feedback.
  companyWebsite: z.string().max(500).optional().default(''),
}).strict();

const ReferralStatusUpdateSchema = z.object({
  status: ReferralStatusSchema,
  note: z.string().trim().max(1000).optional(),
}).strict();

const ReferralUpdateSchema = ReferralCreateSchema.omit({ campaignId: true, eligibleForWomenOnlyIntake: true, applicantConsent: true })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

const ReferralPaidSchema = z.object({
  paymentReference: z.string().trim().min(2).max(120),
}).strict();

const ReferralRecruiterAssignmentSchema = z.object({
  recruiterId: z.string().trim().min(1),
}).strict();

module.exports = {
  ReferralStatusSchema,
  ReferralCreateSchema,
  ReferralUpdateSchema,
  WebReferralCreateSchema,
  ReferralStatusUpdateSchema,
  ReferralPaidSchema,
  ReferralRecruiterAssignmentSchema,
};
