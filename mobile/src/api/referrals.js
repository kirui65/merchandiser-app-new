import client from './client';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function getWithRetry(path, config = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await client.get(path, { ...config, headers: { ...(config.headers || {}), 'Cache-Control': 'no-cache' } });
    } catch (error) {
      lastError = error;
      const retryable = !error.response || error.response.status >= 500;
      if (!retryable || attempt === 2) throw error;
      await wait(500 * (attempt + 1));
    }
  }
  throw lastError;
}

export async function getRecruitmentCampaigns() {
  const response = await getWithRetry('/referrals/campaigns/available', { params: { refresh: Date.now() } });
  return response.data.campaigns || [];
}
export async function getReferralSummary() { return (await getWithRetry('/referrals/summary')).data.summary; }
export async function getReferrals() { return (await client.get('/referrals')).data.referrals || []; }
export async function submitReferral(payload) { return (await client.post('/referrals', payload)).data.referral; }
