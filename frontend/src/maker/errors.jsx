import React from 'react';

export function SignInRequired() {
  return (
    <div role="alert" className="notice">
      <p>Sign in to make quizzes.</p>
      <p className="hint-text">Making and editing quizzes needs an account.</p>
    </div>
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
