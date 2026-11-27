import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { maker } from '../api.js';
import { SignInRequired, describeError } from './errors.jsx';

function stateLabel(quiz) {
  if (quiz.status === 'REMOVED') return 'Removed by an admin';
  if (!quiz.published) return 'Draft, not published';
  const published = `Published, revision ${quiz.published.number}`;
  return quiz.hasDraft ? `${published} · unpublished changes` : published;
}

export default function MyQuizzes() {
  const navigate = useNavigate();
  const [state, setState] = useState({ items: null, error: null });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  useEffect(() => {
    const request = new AbortController();
    maker.listMine(request.signal)
      .then(({ items }) => setState({ items, error: null }))
      .catch((error) => {
        if (!request.signal.aborted) setState({ items: null, error });
      });
    return () => request.abort();
  }, []);

  async function createQuiz() {
    setCreating(true);
    setCreateError(null);
    try {
      const { quizId } = await maker.create();
      navigate(`/my/quizzes/${quizId}/edit`);
    } catch (error) {
      setCreateError(error);
      setCreating(false);
    }
  }

  if (state.error?.status === 401) return <SignInRequired />;

  return (
    <section aria-labelledby="my-quizzes-heading">
      <div className="page-heading">
        <h1 id="my-quizzes-heading">My quizzes</h1>
        <button type="button" onClick={createQuiz} disabled={creating}>
          {creating ? 'Creating…' : 'New quiz'}
        </button>
      </div>
      {createError && <p role="alert" className="error-text">{describeError(createError, 'create the quiz')}</p>}

      {state.error && <p role="alert" className="error-text">{describeError(state.error, 'load your quizzes')}</p>}
      {!state.error && !state.items && <p role="status">Loading your quizzes…</p>}
      {state.items && !state.items.length && (
        <div className="notice">
          <p>You have not made any quizzes yet.</p>
        </div>
      )}
      {state.items && state.items.length > 0 && (
        <table className="my-quizzes">
          <thead>
            <tr><th scope="col">Title</th><th scope="col">State</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr>
          </thead>
          <tbody>
            {state.items.map((quiz) => (
              <tr key={quiz.quizId}>
                <td>{quiz.title || <em>Untitled quiz</em>}</td>
                <td>{stateLabel(quiz)}</td>
                <td>
                  {quiz.status !== 'REMOVED' && <Link to={`/my/quizzes/${quiz.quizId}/edit`}>Edit</Link>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
