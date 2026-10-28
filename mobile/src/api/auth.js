import client from './client';
import * as SecureStore from 'expo-secure-store';

const LAST_SELECTED_ROLE_KEY = 'lastSelectedLoginRole';

const ROLE_ALIASES = { merchandiser: 'rep', admin: 'manager' };

function assertResponseRole(user, pickedRole) {
  const expectedRole = ROLE_ALIASES[pickedRole] || pickedRole;
  if (!user || user.role !== expectedRole) {
    const error = new Error(`This account is not registered as ${pickedRole}`);
    error.response = { status: 403, data: { error: { message: error.message } } };
    throw error;
  }
  if (expectedRole === 'recruiter' && user.accessMode === 'web') {
    const error = new Error('This account is configured for the web portal only');
    error.response = { status: 403, data: { error: { message: error.message } } };
    throw error;
  }
}

export async function login(email, password, role) {
  const { data } = await client.post('/auth/login', { email, password, role });
  if (data.mfaRequired) return data;
  assertResponseRole(data.user, role);
  await SecureStore.setItemAsync('authToken', data.token);
  await SecureStore.setItemAsync('authUser', JSON.stringify(data.user));
  return data.user;
}

export async function getLastSelectedRole() {
  return SecureStore.getItemAsync(LAST_SELECTED_ROLE_KEY);
}

export async function rememberSelectedRole(role) {
  await SecureStore.setItemAsync(LAST_SELECTED_ROLE_KEY, role);
}

export async function verifyMfaLogin(challenge, code, role) {
  const { data } = await client.post('/auth/mfa/verify-login', { challenge, code });
  assertResponseRole(data.user, role);
  await SecureStore.setItemAsync('authToken', data.token);
  await SecureStore.setItemAsync('authUser', JSON.stringify(data.user));
  return data.user;
}

export async function logout() {
  const results = await Promise.allSettled([
    SecureStore.deleteItemAsync('authToken'),
    SecureStore.deleteItemAsync('authUser'),
  ]);
  if (results.some((result) => result.status === 'rejected')) {
    throw new Error('Unable to clear the current app session from this device.');
  }
}

export async function getStoredUser() {
  const raw = await SecureStore.getItemAsync('authUser');
  return raw ? JSON.parse(raw) : null;
}

export async function hasStoredAuthToken() {
  return Boolean(await SecureStore.getItemAsync('authToken'));
}
