require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.warn(`[env] Warning: ${name} is not set`);
  }
  return value;
}

module.exports = {
  port: process.env.PORT || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  firebase: {
    projectId: required('FIREBASE_PROJECT_ID'),
    clientEmail: required('FIREBASE_CLIENT_EMAIL'),
    // Render/most hosts store the key with literal \n escapes in the env var.
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    // Set this to the bucket shown in Firebase Console > Storage. Keeping it
    // explicit avoids guessing between legacy *.appspot.com and newer
    // *.firebasestorage.app bucket names.
    storageBucket: required('FIREBASE_STORAGE_BUCKET'),
  },

  daraja: {
    consumerKey: process.env.DARAJA_CONSUMER_KEY,
    consumerSecret: process.env.DARAJA_CONSUMER_SECRET,
    shortcode: process.env.DARAJA_SHORTCODE,
    passkey: process.env.DARAJA_PASSKEY,
    callbackUrl: process.env.DARAJA_CALLBACK_URL,
    callbackToken: process.env.DARAJA_CALLBACK_TOKEN,
    env: process.env.DARAJA_ENV || 'sandbox',
  },

  reconciliationWindowMinutes: Number(process.env.RECONCILIATION_WINDOW_MINUTES || 15),
  geofenceRadiusMeters: Number(process.env.GEOFENCE_RADIUS_METERS || 100),
  outletOverdueDays: Number(process.env.OUTLET_OVERDUE_DAYS || 7),

  // Scheduled report emails (Resend) and the secret the scheduler sends.
  resendApiKey: process.env.RESEND_API_KEY,
  reportEmailFrom: process.env.REPORT_EMAIL_FROM,
  reportsCronSecret: process.env.REPORTS_CRON_SECRET,
  dashboardUrl: process.env.DASHBOARD_URL,

  // Optional manager dashboard assistant. The key stays server-side.
  coarenaApiKey: process.env.COARENA_API_KEY,
  coarenaModel: process.env.COARENA_MODEL || 'claude-fable-5',

  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim()),
};
