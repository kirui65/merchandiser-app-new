const { getFirestore, admin } = require('../config/firebase');
const { listDocs } = require('../services/firestore.service');
const { ApiError } = require('../middleware/errorHandler');
const { normalizeKenyanPhone, referralDocumentId } = require('../services/referralRegistration.service');

function timestampMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value._seconds === 'number') return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function isPubliclyOpen(campaign) {
  const now = Date.now();
  return campaign?.programType === 'candidate_recruitment'
    && campaign.status === 'active'
    && timestampMillis(campaign.startsAt) <= now
    && (!campaign.endsAt || timestampMillis(campaign.endsAt) >= now)
    && Boolean(campaign.publicSlug);
}

async function campaignForSlug(slug) {
  const campaigns = await listDocs('campaigns', { where: [['publicSlug', '==', slug]], limit: 1 });
  return campaigns[0] || null;
}

function discardHoneypot(req, res, next) {
  if (typeof req.body?.companyWebsite === 'string' && req.body.companyWebsite.trim()) {
    return res.status(202).json({ accepted: true });
  }
  return next();
}

async function getPublicCampaign(req, res, next) {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const campaign = await campaignForSlug(slug);
    if (!isPubliclyOpen(campaign)) throw new ApiError(404, 'This application link is not currently available');
    return res.json({ campaign: { slug: campaign.publicSlug, name: campaign.name, description: campaign.description || '' } });
  } catch (err) { return next(err); }
}

async function createWebReferral(req, res, next) {
  try {
    const campaign = await campaignForSlug(req.body.campaignSlug);
    if (!isPubliclyOpen(campaign)) throw new ApiError(400, 'This application link is not currently available');
    const phone = normalizeKenyanPhone(req.body.phone);
    if (!phone) throw new ApiError(400, 'Enter a valid Kenyan mobile number');

    const db = getFirestore();
    // This also catches records created before canonical phone document IDs.
    const existing = await db.collection('referralRegistrations').where('phone', '==', phone).limit(1).get();
    if (!existing.empty) throw new ApiError(409, 'An application already exists for this phone number. Our team will review it.');

    const id = referralDocumentId(phone);
    const ref = db.collection('referralRegistrations').doc(id);
    const data = {
      id,
      campaignId: campaign.id,
      campaignSlug: campaign.publicSlug,
      teamId: null,
      recruiterId: null,
      recruiterName: null,
      source: req.body.source || 'web_ad',
      applicantName: req.body.applicantName,
      applicantIdNumber: req.body.applicantIdNumber,
      phone,
      email: req.body.email,
      county: req.body.county,
      education: req.body.education,
      passportStatus: req.body.passportStatus,
      nitaFeeStatus: req.body.nitaFeeStatus,
      eligibleForWomenOnlyIntake: true,
      applicantConsent: true,
      applicantConsentAt: admin.firestore.FieldValue.serverTimestamp(),
      consentTextVersion: 'public-recruitment-web-v1',
      status: 'submitted',
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    try {
      await ref.create(data);
    } catch (error) {
      if (error.code === 6 || error.code === 'already-exists') {
        throw new ApiError(409, 'An application already exists for this phone number. Our team will review it.');
      }
      throw error;
    }
    return res.status(201).json({ accepted: true });
  } catch (err) { return next(err); }
}

module.exports = { discardHoneypot, getPublicCampaign, createWebReferral, campaignForSlug, isPubliclyOpen };
