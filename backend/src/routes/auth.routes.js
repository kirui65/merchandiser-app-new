const express = require('express');
const { rateLimit } = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { generateSecret, generateURI, verify } = require('otplib');
const { listDocs, getDoc } = require('../services/firestore.service');
const { requireAuth } = require('../middleware/auth.middleware');
const { ApiError } = require('../middleware/errorHandler');
const env = require('../config/env');
const { recordAudit } = require('../services/audit.service');
const { createDoc } = require('../services/firestore.service');
const { getFirestore, admin } = require('../config/firebase');
const { assertPickedRoleMatches } = require('../services/authRole.service');

const router = express.Router();
const loginRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { message: 'Too many sign-in attempts. Try again in 15 minutes.' } } });
const mfaRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { message: 'Too many verification attempts. Try again in 15 minutes.' } } });

function mfaKey() {
  return crypto.createHash('sha256').update(env.jwtSecret).digest();
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', mfaKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

function decryptSecret(value) {
  const [iv, tag, encrypted] = String(value || '').split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', mfaKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function createSessionToken(rep) {
  return jwt.sign({ uid: rep.id, role: rep.role, authVersion: Number(rep.authVersion || 0) }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

function safeUser(rep) {
  return { id: rep.id, name: rep.name, email: rep.email, role: rep.role, accessMode: rep.accessMode || 'both' };
}

function recordLoginEvent(data) {
  return createDoc('securityEvents', data).catch(() => null);
}

/**
 * POST /api/auth/login
 * body: { email, password }
 * Looks up the rep by email, verifies password against passwordHash,
 * issues a JWT carrying { uid, role }.
 */
router.post('/login', loginRateLimit, async (req, res, next) => {
  try {
    const { password, mfaChallenge, mfaCode } = req.body || {};
    const email = normalizeEmail(req.body?.email);
    if (!email || !password) {
      throw new ApiError(400, 'email and password are required');
    }

    const matches = await listDocs('reps', { where: [['email', '==', email]], limit: 1 });
    const rep = matches[0];

    if (!rep || !rep.active) {
      await recordLoginEvent({ event: 'login_failed', email, actorId: null });
      throw new ApiError(401, 'Invalid credentials');
    }

    const valid = await bcrypt.compare(password, rep.passwordHash);
    if (!valid) {
      await recordLoginEvent({ event: 'login_failed', email, actorId: null });
      throw new ApiError(401, 'Invalid credentials');
    }

    assertPickedRoleMatches(rep.role, req.body?.role);

    if (rep.mfaEnabled && !mfaCode) {
      const challenge = jwt.sign({ uid: rep.id, role: rep.role, authVersion: Number(rep.authVersion || 0), purpose: 'mfa-login' }, env.jwtSecret, { expiresIn: '5m' });
      return res.json({ mfaRequired: true, challenge });
    }

    if (rep.mfaEnabled) {
      let challengePayload;
      try { challengePayload = jwt.verify(mfaChallenge, env.jwtSecret); } catch { throw new ApiError(401, 'MFA challenge expired. Sign in again.'); }
      if (challengePayload.purpose !== 'mfa-login' || challengePayload.uid !== rep.id || Number(challengePayload.authVersion || 0) !== Number(rep.authVersion || 0)) throw new ApiError(401, 'Invalid MFA challenge');
      let secret;
      try { secret = decryptSecret(rep.mfaSecretEncrypted); } catch { throw new ApiError(500, 'MFA setup is unavailable. Contact an administrator.'); }
      if (!(await verify({ token: String(mfaCode), secret })).valid) {
        await recordLoginEvent({ event: 'login_failed', email, actorId: rep.id });
        throw new ApiError(401, 'Invalid authenticator code');
      }
    }

    await recordLoginEvent({ event: 'login_succeeded', email, actorId: rep.id, actorRole: rep.role });

    const token = createSessionToken(rep);

    return res.json({
      token,
      user: safeUser(rep),
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/mfa/status', requireAuth, async (req, res, next) => {
  try {
    const rep = await getDoc('reps', req.user.uid);
    if (!rep || rep.active === false) throw new ApiError(401, 'Account is not active');
    return res.json({ enabled: rep.mfaEnabled === true });
  } catch (err) { return next(err); }
});

router.post('/mfa/setup', requireAuth, async (req, res, next) => {
  try {
    const rep = await getDoc('reps', req.user.uid);
    if (!rep || rep.active === false) throw new ApiError(401, 'Account is not active');
    if (rep.mfaEnabled) throw new ApiError(409, 'MFA is already enabled');
    const secret = await generateSecret();
    const uri = await generateURI({ issuer: 'Brandsphere', label: rep.email, secret });
    const { getFirestore } = require('../config/firebase');
    await getFirestore().collection('reps').doc(rep.id).update({ mfaSetupSecretEncrypted: encryptSecret(secret) });
    return res.json({ secret, uri });
  } catch (err) { return next(err); }
});

router.post('/mfa/enable', requireAuth, mfaRateLimit, async (req, res, next) => {
  try {
    const { currentPassword, code } = req.body || {};
    const rep = await getDoc('reps', req.user.uid);
    if (!rep || rep.active === false) throw new ApiError(401, 'Account is not active');
    if (!currentPassword || !(await bcrypt.compare(currentPassword, rep.passwordHash))) throw new ApiError(401, 'Current password is incorrect');
    if (!rep.mfaSetupSecretEncrypted) throw new ApiError(409, 'Start MFA setup before verifying a code');
    const secret = decryptSecret(rep.mfaSetupSecretEncrypted);
    if (!(await verify({ token: String(code || ''), secret })).valid) throw new ApiError(400, 'Authenticator code is invalid');
    const { getFirestore, admin } = require('../config/firebase');
    await getFirestore().collection('reps').doc(rep.id).update({ mfaEnabled: true, mfaSecretEncrypted: rep.mfaSetupSecretEncrypted, mfaSetupSecretEncrypted: admin.firestore.FieldValue.delete(), authVersion: admin.firestore.FieldValue.increment(1) });
    const updated = await getDoc('reps', rep.id);
    await recordAudit(req, { action: 'mfa_enabled', entityType: 'rep', entity: updated, changedFields: ['mfaEnabled'] }).catch(() => null);
    return res.json({ message: 'Authenticator verification enabled', token: createSessionToken(updated), user: safeUser(updated), enabled: true });
  } catch (err) { return next(err); }
});

router.post('/mfa/disable', requireAuth, mfaRateLimit, async (req, res, next) => {
  try {
    const { currentPassword, code } = req.body || {};
    const rep = await getDoc('reps', req.user.uid);
    if (!rep || rep.active === false) throw new ApiError(401, 'Account is not active');
    if (!rep.mfaEnabled) throw new ApiError(409, 'MFA is not enabled');
    if (!currentPassword || !(await bcrypt.compare(currentPassword, rep.passwordHash))) throw new ApiError(401, 'Current password is incorrect');
    if (!(await verify({ token: String(code || ''), secret: decryptSecret(rep.mfaSecretEncrypted) })).valid) throw new ApiError(400, 'Authenticator code is invalid');
    const { getFirestore, admin } = require('../config/firebase');
    await getFirestore().collection('reps').doc(rep.id).update({ mfaEnabled: false, mfaSecretEncrypted: admin.firestore.FieldValue.delete(), mfaSetupSecretEncrypted: admin.firestore.FieldValue.delete(), authVersion: admin.firestore.FieldValue.increment(1) });
    const updated = await getDoc('reps', rep.id);
    await recordAudit(req, { action: 'mfa_disabled', entityType: 'rep', entity: updated, changedFields: ['mfaEnabled'] }).catch(() => null);
    return res.json({ message: 'Authenticator verification disabled', token: createSessionToken(updated), user: safeUser(updated), enabled: false });
  } catch (err) { return next(err); }
});

router.post('/mfa/verify-login', mfaRateLimit, async (req, res, next) => {
  try {
    const { challenge, code } = req.body || {};
    let payload;
    try { payload = jwt.verify(challenge, env.jwtSecret); } catch { throw new ApiError(401, 'MFA challenge expired. Sign in again.'); }
    if (payload.purpose !== 'mfa-login') throw new ApiError(401, 'Invalid MFA challenge');
    const rep = await getDoc('reps', payload.uid);
    if (!rep || rep.active === false || !rep.mfaEnabled || Number(rep.authVersion || 0) !== Number(payload.authVersion || 0)) throw new ApiError(401, 'Session is no longer valid');
    if (!(await verify({ token: String(code || ''), secret: decryptSecret(rep.mfaSecretEncrypted) })).valid) {
      await recordLoginEvent({ event: 'login_failed', email: rep.email, actorId: rep.id });
      throw new ApiError(401, 'Invalid authenticator code');
    }
    await recordLoginEvent({ event: 'login_succeeded', email: rep.email, actorId: rep.id, actorRole: rep.role });
    return res.json({ token: createSessionToken(rep), user: safeUser(rep) });
  } catch (err) { return next(err); }
});

/**
 * Changes the password for the currently authenticated account. The current
 * password is required so a stolen dashboard session cannot silently take
 * over an account.
 */
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      throw new ApiError(400, 'currentPassword and newPassword are required');
    }
    if (newPassword.length < 8) {
      throw new ApiError(400, 'New password must be at least 8 characters');
    }

    const rep = await getDoc('reps', req.user.uid);
    if (!rep || !rep.active) throw new ApiError(401, 'Account is not active');
    if (!(await bcrypt.compare(currentPassword, rep.passwordHash))) {
      throw new ApiError(401, 'Current password is incorrect');
    }

    await getFirestore().collection('reps').doc(rep.id).update({ passwordHash: await bcrypt.hash(newPassword, 12), authVersion: admin.firestore.FieldValue.increment(1) });
    const updated = await getDoc('reps', rep.id);
    await recordAudit(req, { action: 'password_changed', entityType: 'rep', entity: updated, changedFields: ['password'] }).catch(() => null);
    return res.json({ message: 'Password updated successfully', token: createSessionToken(updated), user: safeUser(updated) });
  } catch (err) {
    return next(err);
  }
});

router.post('/change-email', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword } = req.body || {};
    const email = normalizeEmail(req.body?.email);
    if (!currentPassword || !email) throw new ApiError(400, 'currentPassword and email are required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Enter a valid email address');

    const rep = await getDoc('reps', req.user.uid);
    if (!rep || rep.active === false) throw new ApiError(401, 'Account is not active');
    if (!(await bcrypt.compare(currentPassword, rep.passwordHash))) throw new ApiError(401, 'Current password is incorrect');
    if (email === normalizeEmail(rep.email)) throw new ApiError(409, 'That is already your account email');

    const reps = await listDocs('reps');
    if (reps.some((item) => item.id !== rep.id && normalizeEmail(item.email) === email)) throw new ApiError(409, 'An account already uses this email address');

    const db = require('../config/firebase').getFirestore();
    const emailIndexId = (value) => Buffer.from(value).toString('base64url');
    const oldIndex = db.collection('repEmailIndex').doc(emailIndexId(normalizeEmail(rep.email)));
    const newIndex = db.collection('repEmailIndex').doc(emailIndexId(email));
    const repRef = db.collection('reps').doc(rep.id);
    await db.runTransaction(async (transaction) => {
      const [newIndexSnapshot, oldIndexSnapshot, repSnapshot] = await Promise.all([transaction.get(newIndex), transaction.get(oldIndex), transaction.get(repRef)]);
      if (!repSnapshot.exists) throw new ApiError(404, 'Account not found');
      if (newIndexSnapshot.exists && newIndexSnapshot.data().repId !== rep.id) throw new ApiError(409, 'An account already uses this email address');
      if (!newIndexSnapshot.exists) transaction.create(newIndex, { repId: rep.id, email });
      if (oldIndexSnapshot.exists && oldIndexSnapshot.data().repId === rep.id) transaction.delete(oldIndex);
      transaction.update(repRef, { email, authVersion: Number(repSnapshot.data().authVersion || 0) + 1 });
    });

    const updated = await getDoc('reps', rep.id);
    await recordAudit(req, { action: 'email_changed', entityType: 'rep', entity: updated, changedFields: ['email'] }).catch(() => null);
    return res.json({ message: 'Email updated successfully', token: createSessionToken(updated), user: safeUser(updated) });
  } catch (err) {
    return next(err);
  }
});

router.post('/revoke-sessions', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword } = req.body || {};
    if (!currentPassword) throw new ApiError(400, 'currentPassword is required');
    const rep = await getDoc('reps', req.user.uid);
    if (!rep || rep.active === false) throw new ApiError(401, 'Account is not active');
    if (!(await bcrypt.compare(currentPassword, rep.passwordHash))) throw new ApiError(401, 'Current password is incorrect');
    await getFirestore().collection('reps').doc(rep.id).update({ authVersion: admin.firestore.FieldValue.increment(1) });
    const updated = await getDoc('reps', rep.id);
    await recordAudit(req, { action: 'sessions_revoked', entityType: 'rep', entity: updated, changedFields: ['sessions'] }).catch(() => null);
    return res.json({ message: 'Other sessions have been signed out', token: createSessionToken(updated), user: safeUser(updated) });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
