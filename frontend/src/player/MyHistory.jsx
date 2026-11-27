import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { player } from '../api.js';
import { SignInRequired } from '../maker/errors.jsx';
import { formatDateTime } from './format.js';

export default function MyHistory() {
  const [state, setState] = useState({ items: null, error: null });

  useEffect(() => {
    const request = new AbortController();
    player.myAttempts(request.signal)
      .then(({ items }) => setState({ items, error: null }))
      .catch((error) => {
        if (!request.signal.aborted) setState({ items: null, error });
      });
    return () => request.abort();
  }, []);

  if (state.error?.status === 401) {
    return <SignInRequired message="Sign in to see your history." hint="Your attempts are private to your account." />;
  }

  return (
    <section aria-labelledby="history-heading">
      <h1 id="history-heading">My history</h1>
      {state.error && <p role="alert" className="error-text">Could not load your history. Try again.</p>}
      {!state.error && !state.items && <p role="status">Loading your history…</p>}
      {state.items && !state.items.length && (
        <div className="notice">
          <p>You have not played any quizzes yet.</p>
          <Link to="/">Browse the catalog</Link>
        </div>
      )}
      {state.items && state.items.length > 0 && (
        <table className="my-quizzes">
          <thead>
            <tr>
              <th scope="col">Quiz</th>
              <th scope="col">Score</th>
              <th scope="col">Submitted</th>
              <th scope="col"><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {state.items.map((attempt) => (
              <tr key={attempt.attemptId}>
                <td>
                  {attempt.title}
                  {attempt.quizRemoved && <span className="tag">Removed</span>}
                </td>
                <td>{attempt.score}/{attempt.maxScore}</td>
                <td>{formatDateTime(attempt.submittedAt)}</td>
                <td><Link to={`/attempts/${attempt.attemptId}`}>Open result</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
