const { z } = require('zod');

const WeekdaySchema = z.number().int().min(0).max(6);
const REPORT_TYPES = Object.freeze(['summary', 'sales', 'leads', 'referrals', 'field_activity']);
const ReportTypeSchema = z.enum(REPORT_TYPES);

const ReportSettingsSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(['daily', 'weekly']),
  weekday: WeekdaySchema,
  recipients: z.array(z.string().trim().toLowerCase().email()).max(20),
  includedReports: z.array(ReportTypeSchema).min(1).max(REPORT_TYPES.length),
});

const SettingsSchema = z.object({
  companyName: z.string().trim().min(1).max(100),
  workWeekDays: z.array(WeekdaySchema).min(1).max(7)
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  defaultMonthlyTargetKsh: z.number().nonnegative().max(1e9),
  defaultCommissionKsh: z.number().nonnegative().max(1e7),
  reports: ReportSettingsSchema,
});

// Partial updates; nested report settings may also be partial.
const SettingsUpdateSchema = SettingsSchema.extend({ reports: ReportSettingsSchema.partial() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one setting to update' });

const DEFAULT_SETTINGS = Object.freeze({
  companyName: 'Brandsphere',
  workWeekDays: [1, 2, 3, 4, 5, 6],
  defaultMonthlyTargetKsh: 0,
  defaultCommissionKsh: 0,
  reports: {
    enabled: false,
    frequency: 'weekly',
    weekday: 1,
    recipients: [],
    includedReports: [...REPORT_TYPES],
  },
});

function withDefaults(stored = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    reports: { ...DEFAULT_SETTINGS.reports, ...(stored.reports || {}) },
  };
}

module.exports = { REPORT_TYPES, SettingsSchema, SettingsUpdateSchema, DEFAULT_SETTINGS, withDefaults };
