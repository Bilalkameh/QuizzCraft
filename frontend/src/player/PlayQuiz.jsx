import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { player } from '../api.js';
import { SignInRequired } from '../maker/errors.jsx';

function submitErrorMessage(error) {
  switch (error?.status) {
    case 410:
      return 'This quiz was removed while you were playing. Your answers were not saved.';
    case 401:
      return 'Your session has ended. Sign in again to submit.';
    case 422:
      return 'Some answers did not match this quiz, so nothing was saved. Reload the quiz and try again.';
    default:
      return 'Could not submit your answers. Try again.';
  }
}

export default function PlayQuiz() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const [load, setLoad] = useState({ quiz: null, error: null });
  const [answers, setAnswers] = useState({}); // questionId -> choiceId; a missing key means blank
  const [current, setCurrent] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    const request = new AbortController();
    setLoad({ quiz: null, error: null });
    setAnswers({});
    setCurrent(0);
    player.getPlay(quizId, request.signal)
      .then((quiz) => setLoad({ quiz, error: null }))
      .catch((error) => {
        if (!request.signal.aborted) setLoad({ quiz: null, error });
      });
    return () => request.abort();
  }, [quizId]);

  if (load.error?.status === 401) {
    return <SignInRequired message="Sign in to play quizzes." hint="Playing a quiz and saving your score needs an account." />;
  }
  if (load.error) {
    return (
      <div role="alert" className="notice">
        <p>{load.error.status === 404 ? 'This quiz is not available.' : 'Could not load this quiz. Try again.'}</p>
        <Link to="/">Back to the catalog</Link>
      </div>
    );
  }
  if (!load.quiz) return <p role="status">Loading quiz…</p>;

  const { quiz } = load;
  const questions = [...quiz.questions].sort((a, b) => a.position - b.position);
  const total = questions.length;
  const question = questions[current];
  const chosen = answers[question.questionId];
  const answeredCount = questions.filter((q) => answers[q.questionId] != null).length;
  const removed = submitError?.status === 410;

  const choose = (choiceId) => {
    setAnswers((previous) => ({ ...previous, [question.questionId]: choiceId }));
    setConfirming(false);
  };
  const clear = () => {
    setAnswers((previous) => {
      const next = { ...previous };
      delete next[question.questionId];
      return next;
    });
  };
  const goTo = (index) => {
    setCurrent(index);
    setConfirming(false);
  };

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    setConfirming(false);
    // Every question is sent once with its final choice, or null when it was skipped or cleared (QC-25 step 2).
    const body = questions.map((q) => ({ questionId: q.questionId, choiceId: answers[q.questionId] ?? null }));
    try {
      const result = await player.submit(quiz.revisionId, body);
      navigate(`/attempts/${result.attemptId}`, { state: { result } });
    } catch (error) {
      setSubmitError(error);
      setSubmitting(false);
    }
  }

  const requestSubmit = () => (answeredCount < total ? setConfirming(true) : submit());

  return (
    <section className="player" aria-labelledby="player-title">
      <div className="page-heading">
        <h1 id="player-title">{quiz.title}</h1>
        <p className="player-meta">
          Question {current + 1} of {total} · No time limit
        </p>
      </div>

      <nav className="question-jump" aria-label="Jump to question">
        {questions.map((q, index) => {
          const answered = answers[q.questionId] != null;
          return (
            <button
              key={q.questionId}
              type="button"
              className={answered ? 'answered' : ''}
              aria-current={index === current ? 'step' : undefined}
              aria-label={`Question ${index + 1}, ${answered ? 'answered' : 'not answered'}`}
              onClick={() => goTo(index)}
            >
              {index + 1}
            </button>
          );
        })}
      </nav>

      <fieldset className="play-question">
        <legend>{question.text}</legend>
        {question.choices.map((choice) => (
          <label key={choice.choiceId} className="play-choice">
            <input
              type="radio"
              name={`question-${question.questionId}`}
              checked={chosen === choice.choiceId}
              onChange={() => choose(choice.choiceId)}
              disabled={removed}
            />
            {choice.text}
          </label>
        ))}
        <button type="button" className="link-button" onClick={clear} disabled={chosen == null || removed}>
          Clear answer
        </button>
      </fieldset>

      <div className="player-nav">
        <button type="button" className="secondary" onClick={() => goTo(current - 1)} disabled={current === 0}>
          ◀ Previous
        </button>
        <button type="button" className="secondary" onClick={() => goTo(current + 1)} disabled={current === total - 1}>
          {chosen == null ? 'Skip ▶' : 'Next ▶'}
        </button>
      </div>

      <div className="player-submit" aria-live="polite">
        <p className="hint-text">{answeredCount} of {total} answered</p>
        {submitError && (
          <div role="alert" className="error-summary">
            <p>{submitErrorMessage(submitError)}</p>
            {removed && <Link to="/">Back to the catalog</Link>}
          </div>
        )}
        {confirming ? (
          <div className="confirm-box" role="alertdialog" aria-labelledby="confirm-text">
            <p id="confirm-text">
              {answeredCount} of {total} answered. Unanswered questions score 0. Submit anyway?
            </p>
            <button type="button" onClick={submit} disabled={submitting}>Submit anyway</button>
            <button type="button" className="secondary" onClick={() => setConfirming(false)}>Keep playing</button>
          </div>
        ) : (
          <button type="button" onClick={requestSubmit} disabled={submitting || removed}>
            {submitting ? 'Submitting…' : 'Submit quiz'}
          </button>
        )}
      </div>
    </section>
  );
}
