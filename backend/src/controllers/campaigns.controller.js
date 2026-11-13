const { admin } = require('../config/firebase');
const { createDoc, getDoc, listDocs, updateDoc } = require('../services/firestore.service');
const { ApiError } = require('../middleware/errorHandler');
const { buildCompanyReport, loadCompanyReportData } = require('../services/companyReport.service');

function timestampMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value._seconds === 'number') return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestampFrom(value) {
  if (value === null) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new ApiError(400, 'Invalid campaign date');
  return admin.firestore.Timestamp.fromDate(date);
}

async function validateAssignments({ regionIds = [], teamIds = [], recruiterIds = [], programType }) {
  if (recruiterIds.length && programType !== 'candidate_recruitment') {
    throw new ApiError(400, 'Recruiter assignments are only valid for candidate recruitment campaigns');
  }
  const [regions, teams, recruiters] = await Promise.all([
    Promise.all(regionIds.map((id) => getDoc('regions', id))),
    Promise.all(teamIds.map((id) => getDoc('teams', id))),
    Promise.all(recruiterIds.map((id) => getDoc('reps', id))),
  ]);
  if (regions.some((region) => !region || region.active !== true)) {
    throw new ApiError(400, 'Campaign regions must reference active regions');
  }
  if (teams.some((team) => !team || team.active !== true)) {
    throw new ApiError(400, 'Campaign teams must reference active teams');
  }
  if (recruiters.some((recruiter) => !recruiter || recruiter.active === false || recruiter.role !== 'recruiter')) {
    throw new ApiError(400, 'Campaign recruiters must reference active recruiter accounts');
  }
  const regionIdSet = new Set(regionIds);
  if (regionIdSet.size && teams.some((team) => !regionIdSet.has(team.regionId))) {
    throw new ApiError(400, 'Each assigned team must belong to an assigned campaign region');
  }
}

function normalizeDates(input) {
  return {
    ...input,
    ...(Object.hasOwn(input, 'startsAt') ? { startsAt: timestampFrom(input.startsAt) } : {}),
    ...(Object.hasOwn(input, 'endsAt') ? { endsAt: timestampFrom(input.endsAt) } : {}),
  };
}

async function listCampaigns(req, res, next) {
  try {
    const campaigns = await listDocs('campaigns', { orderBy: { field: 'startsAt', direction: 'desc' } });
    return res.json({ campaigns });
  } catch (err) {
    return next(err);
  }
}

async function listAvailableCampaigns(req, res, next) {
  try {
    const { getActiveTeamIdForUser } = require('../services/teamMembership.service');
    const teamId = await getActiveTeamIdForUser(req.user.uid);
    if (!teamId) return res.json({ campaigns: [] });
    const campaigns = await listDocs('campaigns', {
      where: [['status', '==', 'active']],
      orderBy: { field: 'startsAt', direction: 'desc' },
    });
    const now = Date.now();
    return res.json({
      campaigns: campaigns.filter((campaign) => campaign.teamIds?.includes(teamId)
        && timestampMillis(campaign.startsAt) <= now
        && (!campaign.endsAt || timestampMillis(campaign.endsAt) >= now)),
    });
  } catch (err) {
    return next(err);
  }
}

async function createCampaign(req, res, next) {
  try {
    const payload = {
      ...req.body,
      regionIds: [...new Set(req.body.regionIds)],
      teamIds: [...new Set(req.body.teamIds)],
      recruiterIds: [...new Set(req.body.recruiterIds || [])],
    };
    await validateAssignments(payload);
    const campaign = await createDoc('campaigns', {
      ...normalizeDates(payload),
      createdBy: req.user.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.status(201).json({ campaign });
  } catch (err) {
    return next(err);
  }
}

async function updateCampaign(req, res, next) {
  try {
    const existing = await getDoc('campaigns', req.params.id);
    if (!existing) throw new ApiError(404, 'Campaign not found');
    const payload = {
      ...req.body,
      ...(req.body.regionIds ? { regionIds: [...new Set(req.body.regionIds)] } : {}),
      ...(req.body.teamIds ? { teamIds: [...new Set(req.body.teamIds)] } : {}),
      ...(req.body.recruiterIds ? { recruiterIds: [...new Set(req.body.recruiterIds)] } : {}),
    };
    const merged = { ...existing, ...payload };
    if (merged.endsAt && timestampMillis(merged.endsAt) < timestampMillis(merged.startsAt)) {
      throw new ApiError(400, 'endsAt must be at or after startsAt');
    }
    if (Object.hasOwn(payload, 'regionIds') || Object.hasOwn(payload, 'teamIds') || Object.hasOwn(payload, 'recruiterIds')) {
      await validateAssignments({
        regionIds: merged.regionIds || [],
        teamIds: merged.teamIds || [],
        recruiterIds: merged.recruiterIds || [],
        programType: merged.programType,
      });
    }
    const campaign = await updateDoc('campaigns', req.params.id, {
      ...normalizeDates(payload),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.json({ campaign });
  } catch (err) {
    return next(err);
  }
}

async function archiveCampaign(req, res, next) {
  try {
    const existing = await getDoc('campaigns', req.params.id);
    if (!existing) throw new ApiError(404, 'Campaign not found');
    const campaign = await updateDoc('campaigns', req.params.id, {
      status: 'archived',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.json({ campaign });
  } catch (err) {
    return next(err);
  }
}

async function getCompanyReport(req, res, next) {
  try {
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const to = req.query.to ? new Date(req.query.to) : new Date();
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
      throw new ApiError(400, 'Provide a valid from/to date range');
    }

    const [selectedCampaign, selectedRegion] = await Promise.all([
      req.query.campaignId ? getDoc('campaigns', req.query.campaignId) : null,
      req.query.regionId ? getDoc('regions', req.query.regionId) : null,
    ]);
    if (req.query.campaignId && !selectedCampaign) throw new ApiError(404, 'Campaign not found');
    if (req.query.regionId && !selectedRegion) throw new ApiError(404, 'Region not found');

    const data = await loadCompanyReportData(from, to);

    return res.json({
      filters: {
        from: from.toISOString(),
        to: to.toISOString(),
        campaignId: req.query.campaignId || null,
        campaignName: selectedCampaign?.name || null,
        regionId: req.query.regionId || null,
        regionName: selectedRegion?.name || null,
      },
      ...buildCompanyReport({
        ...data,
        from: from.getTime(),
        to: to.getTime(),
        campaignId: req.query.campaignId,
        regionId: req.query.regionId,
      }),
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listCampaigns,
  listAvailableCampaigns,
  createCampaign,
  updateCampaign,
  archiveCampaign,
  getCompanyReport,
};
