const { getFirestore, admin } = require('../config/firebase');
const { getDoc, listDocs } = require('../services/firestore.service');
const { getActiveTeamIdForUser } = require('../services/teamMembership.service');
const { ApiError } = require('../middleware/errorHandler');
const {
  canTransitionReferralStatus,
  isReferralCommissionEligible,
  normalizeKenyanPhone,
  referralDocumentId,
} = require('../services/referralRegistration.service');

function timestampMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value._seconds === 'number') return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function canReadReferral(user, referral) {
  return user.role === 'manager'
    || (user.role === 'recruiter' && referral.recruiterId === user.uid)
    || (user.role === 'team_leader' && (user.teamIds || []).includes(referral.teamId));
}

function commissionInfo(referral, campaign) {
  const amountKsh = Number(campaign?.referralCommissionKsh);
  const eligibleAt = campaign?.referralCommissionAt;
  const configured = Number.isFinite(amountKsh) && amountKsh > 0 && Boolean(eligibleAt);
  const eligible = configured && isReferralCommissionEligible(referral.status, eligibleAt);
  return {
    commissionAmountKsh: configured ? amountKsh : null,
    commissionEligibleAt: eligibleAt || null,
    commissionConfigured: configured,
    commissionEligible: eligible,
    payoutStatus: referral.paidAt ? 'paid' : eligible ? 'due' : configured ? 'not_eligible' : 'not_configured',
  };
}

async function recruiterNamesFor(referrals) {
  const recruiterIds = [...new Set(referrals.map((referral) => referral.recruiterId).filter(Boolean))];
  if (!recruiterIds.length) return new Map();
  const db = getFirestore();
  const snapshots = await db.getAll(...recruiterIds.map((id) => db.collection('reps').doc(id)));
  return new Map(snapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => [snapshot.id, snapshot.get('name')])
    .filter(([, name]) => typeof name === 'string' && name.trim()));
}

async function availableCampaigns(req, res, next) {
  try {
    const teamId = await getActiveTeamIdForUser(req.user.uid);
    const campaigns = await listDocs('campaigns', {
      where: [['status', '==', 'active']],
      orderBy: { field: 'startsAt', direction: 'desc' },
    });
    const now = Date.now();
    return res.json({ campaigns: campaigns.filter((campaign) => campaign.programType === 'candidate_recruitment'
      && (campaign.recruiterIds?.includes(req.user.uid) || (teamId && campaign.teamIds?.includes(teamId)))
      && timestampMillis(campaign.startsAt) <= now
      && (!campaign.endsAt || timestampMillis(campaign.endsAt) >= now)) });
  } catch (err) { return next(err); }
}

async function createReferral(req, res, next) {
  try {
    if (req.user.role !== 'recruiter') throw new ApiError(403, 'Campaign recruiter role required');
    const teamId = await getActiveTeamIdForUser(req.user.uid);
    const campaign = await getDoc('campaigns', req.body.campaignId);
    const directlyAssigned = campaign?.recruiterIds?.includes(req.user.uid);
    const assignedThroughTeam = Boolean(teamId && campaign?.teamIds?.includes(teamId));
    if (!campaign || campaign.programType !== 'candidate_recruitment' || campaign.status !== 'active'
      || (!directlyAssigned && !assignedThroughTeam)
      || timestampMillis(campaign.startsAt) > Date.now()
      || (campaign.endsAt && timestampMillis(campaign.endsAt) < Date.now())) {
      throw new ApiError(403, 'This recruitment campaign is not active or assigned to your account');
    }
    const normalizedPhone = normalizeKenyanPhone(req.body.phone);
    if (!normalizedPhone) throw new ApiError(400, 'Enter a valid Kenyan mobile number');
    const recruiter = await getDoc('reps', req.user.uid);
    const existing = await getFirestore().collection('referralRegistrations').where('phone', '==', normalizedPhone).limit(1).get();
    if (!existing.empty) {
      throw new ApiError(409, 'This applicant is already registered. Ask a manager to review the existing application.');
    }
    const id = referralDocumentId(normalizedPhone);
    const db = getFirestore();
    const ref = db.collection('referralRegistrations').doc(id);
    const data = {
      id,
      campaignId: campaign.id,
      teamId: teamId || null,
      recruiterId: req.user.uid,
      recruiterName: recruiter?.name || 'Recruiter',
      source: 'recruiter_app',
      createdBy: req.user.uid,
      applicantName: req.body.applicantName,
      applicantIdNumber: req.body.applicantIdNumber,
      phone: normalizedPhone,
      email: req.body.email,
      county: req.body.county,
      education: req.body.education,
      passportStatus: req.body.passportStatus,
      nitaFeeStatus: req.body.nitaFeeStatus,
      eligibleForWomenOnlyIntake: true,
      applicantConsent: true,
      applicantConsentAt: admin.firestore.FieldValue.serverTimestamp(),
      consentTextVersion: 'recruitment-referral-v1',
      status: 'submitted',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    try {
      await ref.create(data);
    } catch (error) {
      if (error.code === 6 || error.code === 'already-exists') {
        throw new ApiError(409, 'This applicant is already registered for this campaign. Ask a manager to review the existing referral.');
      }
      throw error;
    }
    const saved = await ref.get();
    return res.status(201).json({ referral: { id, ...saved.data(), ...commissionInfo(data, campaign) } });
  } catch (err) { return next(err); }
}

async function listReferrals(req, res, next) {
  try {
    const { role, uid, teamIds = [] } = req.user;
    let referrals;
    if (role === 'recruiter') {
      referrals = await listDocs('referralRegistrations', { where: [['recruiterId', '==', uid]], limit: 1000 });
    } else if (role === 'team_leader') {
      referrals = (await Promise.all(teamIds.map((teamId) => listDocs('referralRegistrations', { where: [['teamId', '==', teamId]], limit: 1000 })))).flat();
    } else if (role === 'manager') {
      referrals = await listDocs('referralRegistrations', {
        ...(req.query.campaignId ? { where: [['campaignId', '==', req.query.campaignId]] } : {}),
        limit: 2000,
      });
    } else {
      throw new ApiError(403, 'Campaign recruiter or manager role required');
    }
    if (req.query.campaignId && role !== 'manager') referrals = referrals.filter((item) => item.campaignId === req.query.campaignId);
    if (req.query.teamId) referrals = referrals.filter((item) => item.teamId === req.query.teamId);
    if (req.query.recruiterId && role !== 'recruiter') referrals = referrals.filter((item) => item.recruiterId === req.query.recruiterId);
    if (req.query.status) referrals = referrals.filter((item) => item.status === req.query.status);
    const campaignIds = [...new Set(referrals.map((item) => item.campaignId))];
    const [campaigns, recruiterNameById] = await Promise.all([
      Promise.all(campaignIds.map((id) => getDoc('campaigns', id))),
      recruiterNamesFor(referrals),
    ]);
    const campaignById = new Map(campaigns.filter(Boolean).map((campaign) => [campaign.id, campaign]));
    referrals.sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
    let enriched = referrals.map((item) => ({
      ...item,
      source: item.source || 'recruiter_app',
      ...commissionInfo(item, campaignById.get(item.campaignId)),
      campaignName: campaignById.get(item.campaignId)?.name || 'Recruitment campaign',
      recruiterName: item.recruiterName || recruiterNameById.get(item.recruiterId) || null,
    }));
    if (req.query.payoutStatus) enriched = enriched.filter((item) => item.payoutStatus === req.query.payoutStatus);
    return res.json({ referrals: enriched });
  } catch (err) { return next(err); }
}

async function assignRecruiter(req, res, next) {
  try {
    if (req.user.role !== 'manager') throw new ApiError(403, 'Manager role required to assign an applicant');
    const recruiterTeamId = await getActiveTeamIdForUser(req.body.recruiterId);
    const db = getFirestore();
    const referralRef = db.collection('referralRegistrations').doc(req.params.id);
    const eventRef = db.collection('referralRegistrationEvents').doc();
    const assigned = await db.runTransaction(async (transaction) => {
      const referralSnapshot = await transaction.get(referralRef);
      if (!referralSnapshot.exists) throw new ApiError(404, 'Applicant registration not found');
      const referral = { id: referralSnapshot.id, ...referralSnapshot.data() };
      if (!['web_ad', 'web_engagement'].includes(referral.source || 'recruiter_app') || referral.recruiterId) {
        throw new ApiError(409, 'Only unclaimed web applications can be assigned to a recruiter');
      }
      const [campaignSnapshot, recruiterSnapshot] = await Promise.all([
        transaction.get(db.collection('campaigns').doc(referral.campaignId)),
        transaction.get(db.collection('reps').doc(req.body.recruiterId)),
      ]);
      const campaign = campaignSnapshot.exists ? { id: campaignSnapshot.id, ...campaignSnapshot.data() } : null;
      const recruiter = recruiterSnapshot.exists ? { id: recruiterSnapshot.id, ...recruiterSnapshot.data() } : null;
      if (!campaign || campaign.programType !== 'candidate_recruitment') throw new ApiError(409, 'The linked recruitment campaign is unavailable');
      if (!recruiter || recruiter.active === false || recruiter.role !== 'recruiter') throw new ApiError(400, 'Choose an active recruiter account');
      const directlyAssigned = campaign.recruiterIds?.includes(recruiter.id);
      const assignedThroughTeam = Boolean(recruiterTeamId && campaign.teamIds?.includes(recruiterTeamId));
      if (!directlyAssigned && !assignedThroughTeam) {
        throw new ApiError(400, 'Choose a recruiter assigned to this campaign or one of its assigned teams');
      }
      transaction.update(referralRef, {
        recruiterId: recruiter.id,
        recruiterName: recruiter.name || 'Recruiter',
        teamId: recruiterTeamId || null,
        convertedAt: admin.firestore.FieldValue.serverTimestamp(),
        convertedBy: req.user.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.create(eventRef, {
        registrationId: referral.id,
        actorId: req.user.uid,
        action: 'web_lead_assigned_to_recruiter',
        recruiterId: recruiter.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { ...referral, recruiterId: recruiter.id, recruiterName: recruiter.name || 'Recruiter', teamId: recruiterTeamId || null };
    });
    const campaign = await getDoc('campaigns', assigned.campaignId);
    return res.json({ referral: { ...assigned, source: assigned.source || 'recruiter_app', ...commissionInfo(assigned, campaign) } });
  } catch (err) { return next(err); }
}

async function getReferral(req, res, next) {
  try {
    const referral = await getDoc('referralRegistrations', req.params.id);
    if (!referral) throw new ApiError(404, 'Applicant registration not found');
    if (!canReadReferral(req.user, referral)) throw new ApiError(403, 'You cannot view this applicant registration');
    const [campaign, events, recruiter] = await Promise.all([
      getDoc('campaigns', referral.campaignId),
      listDocs('referralRegistrationEvents', { where: [['registrationId', '==', referral.id]], limit: 100 }),
      getDoc('reps', referral.recruiterId),
    ]);
    events.sort((a, b) => timestampMillis(a.createdAt) - timestampMillis(b.createdAt));
    return res.json({ referral: { ...referral, recruiterName: referral.recruiterName || recruiter?.name || null, ...commissionInfo(referral, campaign) }, events });
  } catch (err) { return next(err); }
}

async function updateReferral(req, res, next) {
  try {
    const db = getFirestore();
    const ref = db.collection('referralRegistrations').doc(req.params.id);
    const updated = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new ApiError(404, 'Applicant registration not found');
      const referral = { id: snapshot.id, ...snapshot.data() };
      if (!canReadReferral(req.user, referral)) throw new ApiError(403, 'You cannot edit this applicant registration');
      if (req.user.role === 'recruiter' && referral.status !== 'submitted') throw new ApiError(409, 'Applications can only be edited before review begins');
      const patch = { ...req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      if (patch.phone) {
        patch.phone = normalizeKenyanPhone(patch.phone);
        if (!patch.phone) throw new ApiError(400, 'Enter a valid Kenyan mobile number');
      }
      if (patch.email) patch.email = patch.email.toLowerCase();
      transaction.update(ref, patch);
      return { ...referral, ...patch };
    });
    const campaign = await getDoc('campaigns', updated.campaignId);
    return res.json({ referral: { ...updated, ...commissionInfo(updated, campaign) } });
  } catch (err) { return next(err); }
}

async function deleteReferral(req, res, next) {
  try {
    if (req.user.role !== 'manager') throw new ApiError(403, 'Manager role required to delete an applicant registration');
    const db = getFirestore();
    const ref = db.collection('referralRegistrations').doc(req.params.id);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new ApiError(404, 'Applicant registration not found');
      const referral = { id: snapshot.id, ...snapshot.data() };
      transaction.delete(ref);
    });
    return res.status(204).send();
  } catch (err) { return next(err); }
}

async function updateReferralStatus(req, res, next) {
  try {
    const db = getFirestore();
    const referralRef = db.collection('referralRegistrations').doc(req.params.id);
    const eventRef = db.collection('referralRegistrationEvents').doc();
    const outcome = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(referralRef);
      if (!snapshot.exists) throw new ApiError(404, 'Applicant registration not found');
      const referral = { id: snapshot.id, ...snapshot.data() };
      if (!canReadReferral(req.user, referral) || req.user.role === 'recruiter') {
        throw new ApiError(403, 'Only a manager or the applicant’s team leader can review this registration');
      }
      if (!canTransitionReferralStatus(referral.status, req.body.status)) {
        throw new ApiError(409, `Cannot move an applicant from ${referral.status} to ${req.body.status}`);
      }
      transaction.update(referralRef, {
        status: req.body.status,
        reviewNote: req.body.note || null,
        reviewedBy: req.user.uid,
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.create(eventRef, {
        registrationId: referral.id,
        actorId: req.user.uid,
        action: 'status_changed',
        fromStatus: referral.status,
        toStatus: req.body.status,
        note: req.body.note || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { ...referral, status: req.body.status };
    });
    const campaign = await getDoc('campaigns', outcome.campaignId);
    return res.json({ referral: { ...outcome, ...commissionInfo(outcome, campaign) } });
  } catch (err) { return next(err); }
}

async function markReferralPaid(req, res, next) {
  try {
    if (req.user.role !== 'manager') throw new ApiError(403, 'Manager role required to record a commission payment');
    const db = getFirestore();
    const referralRef = db.collection('referralRegistrations').doc(req.params.id);
    const eventRef = db.collection('referralRegistrationEvents').doc();
    const paid = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(referralRef);
      if (!snapshot.exists) throw new ApiError(404, 'Applicant registration not found');
      const referral = { id: snapshot.id, ...snapshot.data() };
      const campaignRef = db.collection('campaigns').doc(referral.campaignId);
      const campaignSnapshot = await transaction.get(campaignRef);
      const campaign = campaignSnapshot.exists ? { id: campaignSnapshot.id, ...campaignSnapshot.data() } : null;
      const info = commissionInfo(referral, campaign);
      if (!info.commissionConfigured || !info.commissionEligible) throw new ApiError(409, 'This referral is not eligible for a configured commission yet');
      if (referral.paidAt) throw new ApiError(409, 'A commission payment is already recorded for this referral');
      transaction.update(referralRef, {
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        paidBy: req.user.uid,
        paymentReference: req.body.paymentReference,
        paymentAmountKsh: info.commissionAmountKsh,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.create(eventRef, {
        registrationId: referral.id,
        actorId: req.user.uid,
        action: 'commission_paid',
        amountKsh: info.commissionAmountKsh,
        paymentReference: req.body.paymentReference,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { ...referral, paidBy: req.user.uid, paymentReference: req.body.paymentReference, paymentAmountKsh: info.commissionAmountKsh };
    });
    return res.json({ referral: { ...paid, payoutStatus: 'paid' } });
  } catch (err) { return next(err); }
}

async function getRecruiterSummary(req, res, next) {
  try {
    const role = req.user.role;
    let referrals;
    if (role === 'recruiter') {
      referrals = await listDocs('referralRegistrations', { where: [['recruiterId', '==', req.user.uid]], limit: 2000 });
    } else if (role === 'manager') {
      referrals = await listDocs('referralRegistrations', { limit: 5000 });
    } else {
      throw new ApiError(403, 'Campaign recruiter or manager role required');
    }
    const statuses = ['submitted', 'contacted', 'requirements_checked', 'training_scheduled', 'placed', 'rejected'];
    const campaigns = await Promise.all([...new Set(referrals.map((item) => item.campaignId))].map((id) => getDoc('campaigns', id)));
    const campaignById = new Map(campaigns.filter(Boolean).map((campaign) => [campaign.id, campaign]));
    const counts = Object.fromEntries(statuses.map((status) => [status, referrals.filter((item) => item.status === status).length]));
    const dueKsh = referrals.reduce((total, referral) => {
      if (referral.paidAt) return total;
      const info = commissionInfo(referral, campaignById.get(referral.campaignId));
      return total + (info.commissionEligible ? info.commissionAmountKsh : 0);
    }, 0);
    const paidKsh = referrals.reduce((total, referral) => total + (referral.paidAt ? Number(referral.paymentAmountKsh || 0) : 0), 0);
    const notConfigured = referrals.some((referral) => !commissionInfo(referral, campaignById.get(referral.campaignId)).commissionConfigured);
    return res.json({ summary: { total: referrals.length, counts, dueKsh, paidKsh, commissionRuleMissing: notConfigured } });
  } catch (err) { return next(err); }
}

module.exports = {
  availableCampaigns,
  createReferral,
  listReferrals,
  getReferral,
  updateReferral,
  deleteReferral,
  updateReferralStatus,
  assignRecruiter,
  markReferralPaid,
  getRecruiterSummary,
};
