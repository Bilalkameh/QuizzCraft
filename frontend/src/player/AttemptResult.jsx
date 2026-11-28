import React, { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { player } from '../api.js';
import { useSession } from '../auth.js';
import { SignInRequired } from '../maker/errors.jsx';
import { formatDateTime } from './format.js';

export default function AttemptResult() {
  const { attemptId } = useParams();
  const location = useLocation();
  const session = useSession();
  // Right after submitting, the 201 body is passed along so the result shows without a second request.
  // The browser keeps that state across reloads, so it is used only while signed in. Otherwise the result
  // is loaded from the server, which asks for sign-in.
  const fresh = location.state?.result;
  const initial = session && fresh && String(fresh.attemptId) === attemptId ? fresh : null;
  const [load, setLoad] = useState({ result: initial, error: null });

  useEffect(() => {
    if (initial) {
      setLoad({ result: initial, error: null });
      return undefined;
    }
    const request = new AbortController();
    setLoad({ result: null, error: null });
    player.getAttempt(attemptId, request.signal)
      .then((result) => setLoad({ result, error: null }))
      .catch((error) => {
        if (!request.signal.aborted) setLoad({ result: null, error });
      });
    return () => request.abort();
  }, [attemptId, initial]);

  if (load.error?.status === 401) {
    return <SignInRequired message="Sign in to see your results." hint="Results are saved to your account." />;
  }
  if (load.error) {
    const message = load.error.status === 403
      ? 'This result belongs to another player.'
      : load.error.status === 404 ? 'This result does not exist.' : 'Could not load this result. Try again.';
    return (
      <div role="alert" className="notice">
        <p>{message}</p>
        <Link to="/me/attempts">Go to my history</Link>
      </div>
    );
  }
  if (!load.result) return <p role="status">Loading result…</p>;

  const result = load.result;
  const choiceText = (choiceId) => result.choices?.[String(choiceId)] ?? `Choice ${choiceId}`;

  return (
    <section className="result" aria-labelledby="result-title">
      <div className="page-heading">
        <h1 id="result-title">{result.title}</h1>
        <p className="score" aria-label={`Score ${result.score} out of ${result.maxScore}`}>
          Score {result.score}/{result.maxScore}
        </p>
      </div>
      <p className="hint-text">Submitted {formatDateTime(result.submittedAt)} · Attempt {result.attemptId}</p>

      <ol className="feedback">
        {result.questions.map((question, index) => (
          <li key={question.questionId} className={question.correct ? 'is-correct' : 'is-wrong'}>
            <span className="mark" aria-hidden="true">{question.correct ? '✓' : '✗'}</span>
            <div>
              <p className="feedback-question">
                <span className="visually-hidden">{question.correct ? 'Correct. ' : 'Incorrect. '}</span>
                Q{index + 1}. {question.text}
              </p>
              <p className="feedback-detail">
                {question.chosenChoiceId == null ? 'Your answer: blank' : `Your answer: ${choiceText(question.chosenChoiceId)}`}
                {!question.correct && ` · Correct answer: ${choiceText(question.correctChoiceId)}`}
                {` · ${question.points} ${question.points === 1 ? 'point' : 'points'}`}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="editor-actions">
        <Link className="button-link" to={`/quizzes/${result.quizId}/play`}>Retake</Link>
        <Link className="button-link secondary" to="/me/attempts">My history</Link>
      </div>
    </section>
  );
}
