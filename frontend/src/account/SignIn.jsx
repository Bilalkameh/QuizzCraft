import React, { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { account } from '../api.js';
import { startSession, useSession } from '../auth.js';
import { returnPath } from './returnPath.js';

// Sign-in screen (QC-24, ACC-02). Wrong credentials show one generic error and store no token.
export default function SignIn() {
  const location = useLocation();
  const session = useSession();
  const state = location.state ?? {};
  const [email, setEmail] = useState(state.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to={returnPath(state.from)} replace />;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      startSession(await account.login({ email, password }));
    } catch (failure) {
      setError(failure.status === 401 ? 'Email or password is incorrect.' : 'Could not sign in. Try again.');
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <section className="auth-page" aria-labelledby="signin-heading">
      <h1 id="signin-heading">Sign in</h1>
      {state.message && (
        <div className="notice auth-reason">
          <p>{state.message}</p>
          {state.hint && <p className="hint-text">{state.hint}</p>}
        </div>
      )}
      {state.notice && <p role="status" className="success-text">{state.notice}</p>}
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="signin-email">Email</label>
        <input
          id="signin-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="signin-password">Password</label>
        <input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <p role="alert" className="error-text">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="auth-switch">
        No account yet? <Link to="/register" state={{ from: state.from, message: state.message, hint: state.hint }}>Register</Link>
      </p>
    </section>
  );
}
