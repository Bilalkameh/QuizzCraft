import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { account } from '../api.js';
import { endSession, useSession } from '../auth.js';

// Top-bar account area (QC-24): sign-in links when signed out, name and Sign out when signed in.
export default function AccountMenu() {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  if (!session) {
    const onAccountPage = location.pathname === '/signin' || location.pathname === '/register';
    const linkState = onAccountPage ? location.state : { from: `${location.pathname}${location.search}` };
    return (
      <div className="account-menu">
        <NavLink to="/signin" state={linkState}>Sign in</NavLink>
        <NavLink to="/register" state={linkState}>Register</NavLink>
      </div>
    );
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await account.logout();
    } catch {
      // The token is discarded either way. The server keeps no session.
    }
    endSession();
    setSigningOut(false);
    navigate('/');
  }

  return (
    <div className="account-menu">
      <span>Signed in as <strong>{session.user.displayName}</strong></span>
      <button type="button" onClick={signOut} disabled={signingOut}>Sign out</button>
    </div>
  );
}
