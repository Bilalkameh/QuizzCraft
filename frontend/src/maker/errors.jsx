import React from 'react';
import { Navigate, useLocation } from 'react-router';

// Protected screens render this after a 401. It sends the visitor to sign-in (QC-24, ACC-03),
// shows this message there, and returns to the same page after sign-in.
export function SignInRequired({
  message = 'Sign in to make quizzes.',
  hint = 'Making and editing quizzes needs an account.',
}) {
  const location = useLocation();
  return (
    <Navigate
      to="/signin"
      replace
      state={{ from: `${location.pathname}${location.search}`, message, hint }}
    />
  );
}

export function describeError(error, action) {
  switch (error?.status) {
    case 401:
      return `Sign in to ${action}.`;
    case 403:
      return 'Only the quiz owner can edit or publish this quiz.';
    case 404:
      return 'This quiz does not exist or is no longer available.';
    default:
      return `Could not ${action}. Try again.`;
  }
}
