const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const logger = require('./utils/logger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const salesRoutes = require('./routes/sales.routes');
const outletsRoutes = require('./routes/outlets.routes');
const productsRoutes = require('./routes/products.routes');
const repsRoutes = require('./routes/reps.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const routesRoutes = require('./routes/routes.routes');
const mpesaRoutes = require('./routes/mpesa.routes');
const uploadsRoutes = require('./routes/uploads.routes');
const auditRoutes = require('./routes/audit.routes');
const targetsRoutes = require('./routes/targets.routes');
const territoriesRoutes = require('./routes/territories.routes');
const leadsRoutes = require('./routes/leads.routes');
const callsRoutes = require('./routes/calls.routes');
const activationsRoutes = require('./routes/activations.routes');
const merchandisingRoutes = require('./routes/merchandising.routes');
const teamsRoutes = require('./routes/teams.routes');
const teamLeaderRoutes = require('./routes/teamLeader.routes');
const broadcastsRoutes = require('./routes/broadcasts.routes');
const fieldRequestsRoutes = require('./routes/fieldRequests.routes');
const campaignsRoutes = require('./routes/campaigns.routes');
const reportsRoutes = require('./routes/reports.routes');
const referralRegistrationsRoutes = require('./routes/referralRegistrations.routes');
const adminRoutes = require('./routes/admin.routes');
const publicReferralsRoutes = require('./routes/publicReferrals.routes');
const settingsRoutes = require('./routes/settings.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const assistantRoutes = require('./routes/assistant.routes');

const app = express();

app.set('trust proxy', 1);
app.use(cors({ origin: env.allowedOrigins }));
app.use(express.json({ limit: '5mb' })); // generous-ish for base64 photo payloads if used before object storage

// Makes the deployed service URL useful when opened in a browser. API clients
// should use the routes under /api; hosting health checks can use /health.
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Brandsphere API',
    health: '/health',
    api: '/api',
  });
});

app.get('/health', (req, res) => res.json({ status: 'ok', env: env.nodeEnv }));

app.use('/api/auth', authRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/outlets', outletsRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/reps', repsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/routes', routesRoutes);
app.use('/api/mpesa', mpesaRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/audit-log', auditRoutes);
app.use('/api/targets', targetsRoutes);
app.use('/api/territories', territoriesRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/activations', activationsRoutes);
app.use('/api/merchandising', merchandisingRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/team-leader', teamLeaderRoutes);
app.use('/api/broadcasts', broadcastsRoutes);
app.use('/api/field-requests', fieldRequestsRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/referrals', referralRegistrationsRoutes);
app.use('/api/public', publicReferralsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/assistant', assistantRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.port, () => {
  logger.info(`Backend listening on port ${env.port} (${env.nodeEnv})`);
});

module.exports = app;
