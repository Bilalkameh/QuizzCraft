import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { account } from '../api.js';
import { startSession, useSession } from '../auth.js';
import { returnPath } from './returnPath.js';

const FIELDS = [
  { name: 'displayName', label: 'Display name', type: 'text', autoComplete: 'nickname' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password' },
];

function registrationError(failure) {
  if (failure.status === 409) return { message: 'An account with this email already exists.', emailTaken: true, fields: {} };
  if (failure.status === 422) {
    const fields = {};
    failure.fieldErrors.forEach(({ field, message }) => {
      (fields[field] ??= []).push(message);
    });
    return { message: 'Check the highlighted fields.', fields };
  }
  return { message: 'Could not create the account. Try again.', fields: {} };
}

// Registration screen (QC-24, ACC-01). A new account is signed in straight away.
export default function Register() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const state = location.state ?? {};
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to={returnPath(state.from)} replace />;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await account.register(form);
    } catch (failure) {
      setError(registrationError(failure));
      setBusy(false);
      return;
    }
    try {
      startSession(await account.login(form));
    } catch {
      navigate('/signin', {
        replace: true,
        state: { from: state.from, email: form.email, notice: 'Your account was created. Sign in to continue.' },
      });
    }
  }

  return (
    <section className="auth-page" aria-labelledby="register-heading">
      <h1 id="register-heading">Create an account</h1>
      <p className="hint-text">One account lets you both make and play quizzes.</p>
      <form className="auth-form" onSubmit={submit}>
        {FIELDS.map(({ name, label, type, autoComplete }) => {
          const messages = error?.fields[name] ?? [];
          const errorId = `register-${name}-error`;
          return (
            <React.Fragment key={name}>
              <label htmlFor={`register-${name}`}>{label}</label>
              <input
                id={`register-${name}`}
                type={type}
                autoComplete={autoComplete}
                required
                value={form[name]}
                onChange={(event) => setForm({ ...form, [name]: event.target.value })}
                aria-invalid={messages.length > 0 || (name === 'email' && error?.emailTaken) ? 'true' : undefined}
                aria-describedby={messages.length ? errorId : undefined}
              />
              {messages.length > 0 && <p id={errorId} className="field-error">{label} {messages.join(', ')}.</p>}
            </React.Fragment>
          );
        })}
        {error && (
          <p role="alert" className="error-text">
            {error.message}{' '}
            {error.emailTaken && <Link to="/signin" state={{ from: state.from, email: form.email }}>Sign in instead</Link>}
          </p>
        )}
        <button type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
      <p className="auth-switch">
        Already registered? <Link to="/signin" state={{ from: state.from, message: state.message, hint: state.hint }}>Sign in</Link>
      </p>
    </section>
  );
}
