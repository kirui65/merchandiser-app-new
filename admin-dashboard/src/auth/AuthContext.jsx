import React, { createContext, useContext, useState } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

function storedUser() {
  const raw = localStorage.getItem('authUser');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // A partially written or legacy value must never prevent access to login.
    localStorage.removeItem('authUser');
    localStorage.removeItem('authToken');
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(storedUser);

  async function signIn(email, password, role) {
    const { data } = await client.post('/auth/login', { email, password, role });
    if (data.mfaRequired) return data;
    if (!['manager', 'recruiter'].includes(data.user.role)) {
      throw new Error('This web workspace is available to Admin and campaign recruiter accounts');
    }
    localStorage.setItem('authToken', data.token);
    localStorage.setItem('authUser', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  async function verifyMfa(challenge, code) {
    const { data } = await client.post('/auth/mfa/verify-login', { challenge, code });
    if (!['manager', 'recruiter'].includes(data.user.role)) throw new Error('This web workspace is available to Admin and campaign recruiter accounts');
    updateSession(data);
    return data.user;
  }

  function signOut() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    setUser(null);
  }

  function updateSession({ token, user: updatedUser }) {
    localStorage.setItem('authToken', token);
    localStorage.setItem('authUser', JSON.stringify(updatedUser));
    setUser(updatedUser);
  }

  return <AuthContext.Provider value={{ user, signIn, verifyMfa, signOut, updateSession }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
