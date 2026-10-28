const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { validateBody } = require('../middleware/validate.middleware');
const {
  ReferralCreateSchema, ReferralUpdateSchema, ReferralStatusUpdateSchema, ReferralPaidSchema,
  ReferralRecruiterAssignmentSchema,
} = require('../models/referralRegistration.model');
const controller = require('../controllers/referralRegistrations.controller');

const router = express.Router();
router.use(requireAuth);
router.get('/campaigns/available', controller.availableCampaigns);
router.get('/summary', controller.getRecruiterSummary);
router.get('/', controller.listReferrals);
router.post('/', validateBody(ReferralCreateSchema), controller.createReferral);
router.get('/:id', controller.getReferral);
router.patch('/:id', validateBody(ReferralUpdateSchema), controller.updateReferral);
router.delete('/:id', controller.deleteReferral);
router.patch('/:id/status', validateBody(ReferralStatusUpdateSchema), controller.updateReferralStatus);
router.post('/:id/assign-recruiter', validateBody(ReferralRecruiterAssignmentSchema), controller.assignRecruiter);
router.post('/:id/pay', validateBody(ReferralPaidSchema), controller.markReferralPaid);
module.exports = router;
