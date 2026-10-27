// axios wrapper: base URL + auth header injection.
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Set EXPO_PUBLIC_API_URL in mobile/.env (see .env.example). The deployed
// backend is the safe fallback, so release builds never point at localhost.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://brandsphere-backend-kgvr.onrender.com/api';

// Free Render instances can take around a minute to wake after being idle.
const client = axios.create({ baseURL: BASE_URL, timeout: 75000 });

client.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default client;
