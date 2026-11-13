const { getDoc, setDoc } = require('./firestore.service');
const { withDefaults } = require('../models/settings.model');

const SETTINGS_COLLECTION = 'settings';
const COMPANY_SETTINGS_ID = 'company';

async function getSettings() {
  const stored = await getDoc(SETTINGS_COLLECTION, COMPANY_SETTINGS_ID);
  if (!stored) return withDefaults();
  const { id, createdAt, updatedAt, ...settings } = stored;
  return withDefaults(settings);
}

async function updateSettings(changes) {
  const current = await getSettings();
  const next = withDefaults({
    ...current,
    ...changes,
    reports: { ...current.reports, ...(changes.reports || {}) },
  });
  await setDoc(SETTINGS_COLLECTION, COMPANY_SETTINGS_ID, { ...next, updatedAt: new Date().toISOString() });
  return next;
}

module.exports = { SETTINGS_COLLECTION, getSettings, updateSettings };
