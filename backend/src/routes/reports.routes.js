const express = require('express');
const { z } = require('zod');
const env = require('../config/env');
const { requireAuth, requireManager } = require('../middleware/auth.middleware');
const { getCompanyReport } = require('../controllers/campaigns.controller');
const { ApiError } = require('../middleware/errorHandler');
const { recordAudit } = require('../services/audit.service');
const { runScheduledReport, sendTestReport, secretMatches } = require('../services/reportEmail.service');

const router = express.Router();

// Called by the scheduler (see .github/workflows/scheduled-report.yml), which
// authenticates with a shared secret instead of a user token.
router.post('/scheduled/run', async (req, res, next) => {
  try {
    if (!env.reportsCronSecret) throw new ApiError(503, 'REPORTS_CRON_SECRET is not configured');
    if (!secretMatches(req.get('x-cron-secret'), env.reportsCronSecret)) throw new ApiError(401, 'Invalid scheduler secret');
    return res.json(await runScheduledReport());
  } catch (err) {
    return next(err);
  }
});

router.use(requireAuth, requireManager);
router.get('/company', getCompanyReport);

router.post('/scheduled/send-test', async (req, res, next) => {
  try {
    const to = req.body?.to ? z.string().trim().email().safeParse(req.body.to) : null;
    if (to && !to.success) throw new ApiError(400, 'Enter a valid email address');
    const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    const from = req.body?.from ? dateSchema.safeParse(req.body.from) : null;
    const toDate = req.body?.toDate ? dateSchema.safeParse(req.body.toDate) : null;
    if (from && !from.success) throw new ApiError(400, 'Enter a valid From date');
    if (toDate && !toDate.success) throw new ApiError(400, 'Enter a valid To date');
    if (Boolean(from) !== Boolean(toDate)) throw new ApiError(400, 'Choose both a From and To date');
    const range = from && toDate ? { from: from.data, to: toDate.data } : null;
    const result = await sendTestReport(to?.data, range);
    await recordAudit(req, { action: 'report_sent', entityType: 'settings', entity: { id: 'reports', name: 'Scheduled report' }, changedFields: ['test_email', ...(range ? ['report_from', 'report_to'] : [])] });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
