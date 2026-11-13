const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { ApiError } = require('./errorHandler');
const { getDoc } = require('../services/firestore.service');
const { getFirestore } = require('../config/firebase');

function authenticatedUserFromAccount(uid, account) {
  return { uid, role: account.role };
}

// Verify the token and attach the current account to the request. The API
// checks permissions here because its Firestore calls use the Admin SDK.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Missing or malformed Authorization header'));
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (err) {
    return next(new ApiError(401, 'Invalid or expired token'));
  }

  try {
    const rep = await getDoc('reps', payload.uid);
    if (!rep || rep.active === false || Number(rep.authVersion || 0) !== Number(payload.authVersion || 0)) {
      return next(new ApiError(401, 'Session is no longer valid'));
    }
    req.user = authenticatedUserFromAccount(payload.uid, rep);
    if (rep.role === 'team_leader') {
      req.user.teamIds = await attachActiveTeamIds(payload.uid);
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireRole(...roles) {
  if (roles.length === 0) throw new Error('requireRole needs at least one role');
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ApiError(403, `${roles.join(' or ')} role required`));
    }
    return next();
  };
}

/**
 * Restricts a route to managers only. Use after requireAuth.
 */
const requireManager = requireRole('manager');

/**
 * Scopes a rep-owned resource: a rep may only act on their own repId; a
 * manager may act on any repId. Expects the target repId to already be
 * resolved onto req (e.g. req.params.repId or the record just fetched) —
 * call scopeCheck(req.user, targetRepId) inside controllers doing per-doc
 * checks, e.g. after fetching a sale to confirm req.user.uid === sale.repId.
 */
function scopeCheck(user, targetRepId) {
  if (user.role === 'manager') return true;
  return user.uid === targetRepId;
}

function teamScopeCheck(user, recordTeamId) {
  if (user.role === 'manager') return true;
  return user.role === 'team_leader'
    && typeof recordTeamId === 'string'
    && Array.isArray(user.teamIds)
    && user.teamIds.includes(recordTeamId);
}

async function attachActiveTeamIds(uid, firestore = getFirestore()) {
  const teams = await firestore.collection('teams')
    .where('teamLeaderId', '==', uid)
    .get();
  return teams.docs
    .filter((team) => team.data().active === true)
    .map((team) => team.id);
}

function requireTeamLeader(req, res, next) {
  if (!req.user || req.user.role !== 'team_leader') {
    return next(new ApiError(403, 'Team leader role required'));
  }
  return next();
}

module.exports = {
  requireAuth,
  authenticatedUserFromAccount,
  requireManager,
  requireRole,
  scopeCheck,
  teamScopeCheck,
  attachActiveTeamIds,
  requireTeamLeader,
};
