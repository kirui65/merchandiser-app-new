import axios from 'axios';

const BASE_URL =
  import.meta.env.VITE_API_URL || 'https://brandsphere-backend-kgvr.onrender.com/api';

// The hosted API may need time to wake after an idle period. A finite timeout
// still prevents the dashboard from being left in a permanent loading state.
const client = axios.create({ baseURL: BASE_URL, timeout: 75000 });

// Lets the connection banner know whether the API is reachable.
export const API_STATUS_EVENT = 'brandsphere:api-status';
function reportReachable(reachable) {
  window.dispatchEvent(new CustomEvent(API_STATUS_EVENT, { detail: { reachable } }));
}

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => {
    reportReachable(true);
    return res;
  },
  (err) => {
    // No response at all means a network failure or timeout, not an API error.
    reportReachable(Boolean(err.response) || axios.isCancel(err));
    if (err.response?.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export default client;
