import React from 'react';

export function SignInRequired({
  message = 'Sign in to make quizzes.',
  hint = 'Making and editing quizzes needs an account.',
}) {
  return (
    <div role="alert" className="notice">
      <p>{message}</p>
      <p className="hint-text">{hint}</p>
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
