const express = require('express');
const bcrypt = require('bcryptjs');
const { requireAuth, requireManager } = require('../middleware/auth.middleware');
const { validateBody } = require('../middleware/validate.middleware');
const { RepCreateSchema, RepUpdateSchema } = require('../models/rep.model');
const { createDoc, listDocs, getDoc, updateDoc } = require('../services/firestore.service');
const { getFirestore, admin } = require('../config/firebase');
const { ApiError } = require('../middleware/errorHandler');
const { recordAudit } = require('../services/audit.service');
const { assertCanDeleteAccount } = require('../services/accountAdministration.service');

const router = express.Router();

router.use(requireAuth);

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function emailIndexId(email) {
  return Buffer.from(email).toString('base64url');
}

async function assertEmailIsAvailable(email, excludeRepId = null) {
  // Older documents predate the email index, so include them in the check.
  const reps = await listDocs('reps');
  const duplicate = reps.find((rep) => rep.id !== excludeRepId && normalizeEmail(rep.email || '') === email);
  if (duplicate) throw new ApiError(409, 'An account already uses this email address');
}

async function createRepWithUniqueEmail(data) {
  const db = getFirestore();
  const repRef = db.collection('reps').doc();
  const emailRef = db.collection('repEmailIndex').doc(emailIndexId(data.email));

  await db.runTransaction(async (transaction) => {
    const emailSnap = await transaction.get(emailRef);
    if (emailSnap.exists) throw new ApiError(409, 'An account already uses this email address');
    transaction.create(repRef, { ...data, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    transaction.create(emailRef, { repId: repRef.id, email: data.email, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  });

  const snap = await repRef.get();
  return { id: snap.id, ...snap.data() };
}

async function updateRepWithUniqueEmail(repId, data) {
  const db = getFirestore();
  const repRef = db.collection('reps').doc(repId);
  const emailRef = db.collection('repEmailIndex').doc(emailIndexId(data.email));

  await db.runTransaction(async (transaction) => {
    const emailSnap = await transaction.get(emailRef);
    if (emailSnap.exists && emailSnap.data().repId !== repId) {
      throw new ApiError(409, 'An account already uses this email address');
    }
    if (!emailSnap.exists) transaction.create(emailRef, { repId, email: data.email, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    transaction.update(repRef, data);
  });

  return getDoc('reps', repId);
}

// Only managers can create/list reps — this is the rep roster, not sales data.
router.post('/', requireManager, validateBody(RepCreateSchema), async (req, res, next) => {
  try {
    const { password, ...rest } = req.body;
    const email = normalizeEmail(rest.email);
    await assertEmailIsAvailable(email);
    const passwordHash = await bcrypt.hash(password, 10);

    const rep = await createRepWithUniqueEmail({
      ...rest,
      email,
      passwordHash,
      active: true,
    });
    await recordAudit(req, { action: 'created', entityType: 'rep', entity: rep, changedFields: Object.keys(rest) });

    const { passwordHash: _omit, ...safeRep } = rep;
    return res.status(201).json({ rep: safeRep });
  } catch (err) {
    return next(err);
  }
});

router.get('/', requireManager, async (req, res, next) => {
  try {
    const reps = await listDocs('reps');
    const safeReps = reps.map(({ passwordHash, ...r }) => r);
    return res.json({ reps: safeReps });
  } catch (err) {
    return next(err);
  }
});

router.put('/:id', requireManager, validateBody(RepUpdateSchema), async (req, res, next) => {
  try {
    const existing = await getDoc('reps', req.params.id);
    if (!existing) throw new ApiError(404, 'Rep not found');
    const email = normalizeEmail(req.body.email);
    await assertEmailIsAvailable(email, req.params.id);
    const rep = await updateRepWithUniqueEmail(req.params.id, { ...req.body, email, authVersion: Number(existing.authVersion || 0) + 1 });
    await recordAudit(req, { action: 'edited', entityType: 'rep', entity: rep, changedFields: Object.keys(req.body) });
    const { passwordHash: _omit, ...safeRep } = rep;
    return res.json({ rep: safeRep });
  } catch (err) { return next(err); }
});

router.patch('/:id/status', requireManager, async (req, res, next) => {
  try {
    const existing = await getDoc('reps', req.params.id);
    if (!existing) throw new ApiError(404, 'Rep not found');
    const rep = await updateDoc('reps', req.params.id, { active: req.body.active === true, authVersion: Number(existing.authVersion || 0) + 1 });
    await recordAudit(req, { action: rep.active ? 'reactivated' : 'deactivated', entityType: 'rep', entity: rep, changedFields: ['active'] });
    const { passwordHash: _omit, ...safeRep } = rep;
    return res.json({ rep: safeRep });
  } catch (err) { return next(err); }
});

router.post('/:id/reset-password', requireManager, async (req, res, next) => {
  try {
    const existing = await getDoc('reps', req.params.id);
    if (!existing) throw new ApiError(404, 'Rep not found');
    const temporaryPassword = `Bs-${require('crypto').randomBytes(5).toString('base64url')}`;
    const rep = await updateDoc('reps', req.params.id, { passwordHash: await bcrypt.hash(temporaryPassword, 10), authVersion: Number(existing.authVersion || 0) + 1 });
    await recordAudit(req, { action: 'password_reset', entityType: 'rep', entity: rep, changedFields: ['password'] });
    return res.json({ temporaryPassword });
  } catch (err) { return next(err); }
});

router.post('/:id/reset-mfa', requireManager, async (req, res, next) => {
  try {
    const existing = await getDoc('reps', req.params.id);
    if (!existing) throw new ApiError(404, 'Rep not found');
    if (!existing.mfaEnabled) throw new ApiError(409, 'MFA is not enabled for this account');
    const rep = await updateDoc('reps', req.params.id, { mfaEnabled: false, mfaSecretEncrypted: null, mfaSetupSecretEncrypted: null, authVersion: Number(existing.authVersion || 0) + 1 });
    await recordAudit(req, { action: 'mfa_reset', entityType: 'rep', entity: rep, changedFields: ['mfaEnabled', 'sessions'] });
    return res.json({ message: `MFA reset for ${rep.name}. The account must sign in again.` });
  } catch (err) { return next(err); }
});

router.delete('/:id', requireManager, async (req, res, next) => {
  try {
    const target = await getDoc('reps', req.params.id);
    const [reps, teams] = await Promise.all([listDocs('reps'), listDocs('teams')]);
    assertCanDeleteAccount({ target, currentUserId: req.user.uid, activeManagers: reps.filter((rep) => rep.role === 'manager' && rep.active !== false).length, ledTeams: teams.filter((team) => team.teamLeaderId === req.params.id) });
    const db = getFirestore();
    await db.runTransaction(async (transaction) => {
      transaction.delete(db.collection('reps').doc(target.id));
      transaction.delete(db.collection('repEmailIndex').doc(emailIndexId(normalizeEmail(target.email))));
    });
    await recordAudit(req, { action: 'deleted', entityType: 'rep', entity: target, changedFields: ['account'] });
    return res.status(204).send();
  } catch (err) { return next(err); }
});

// A rep can fetch their own profile; managers can fetch any.
router.get('/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'manager' && req.user.uid !== req.params.id) {
      throw new ApiError(403, 'Not authorized to view this rep');
    }
    const rep = await getDoc('reps', req.params.id);
    if (!rep) throw new ApiError(404, 'Rep not found');
    const { passwordHash, ...safeRep } = rep;
    return res.json({ rep: safeRep });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
