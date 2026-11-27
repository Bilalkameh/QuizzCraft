import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError, getCategories, maker } from '../api.js';
import { SignInRequired, describeError } from './errors.jsx';

const DIFFICULTIES = [
  { value: 'EASY', label: 'Easy' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HARD', label: 'Hard' },
];
const MIN_CHOICES = 2;
const MAX_CHOICES = 6; // Requirements §7 item 8 proposes 2–6 choices per multiple-choice question.

const trueFalseChoices = () => [
  { text: 'True', isCorrect: false },
  { text: 'False', isCorrect: false },
];
const newQuestion = (type) => ({
  type,
  text: '',
  choices: type === 'TRUE_FALSE'
    ? trueFalseChoices()
    : [{ text: '', isCorrect: false }, { text: '', isCorrect: false }],
});

// Keep only the fields the draft body carries, with safe defaults for a new, empty draft.
function toForm(draft) {
  return {
    title: draft.title ?? '',
    description: draft.description ?? '',
    categoryId: draft.categoryId == null ? '' : String(draft.categoryId),
    difficulty: draft.difficulty ?? '',
    questions: (draft.questions ?? []).map((question) => ({
      type: question.type,
      text: question.text ?? '',
      choices: question.type === 'TRUE_FALSE'
        ? trueFalseChoices().map((choice, index) => ({ ...choice, isCorrect: Boolean(question.choices?.[index]?.isCorrect) }))
        : (question.choices ?? []).map((choice) => ({ text: choice.text ?? '', isCorrect: Boolean(choice.isCorrect) })),
    })),
  };
}

function toDraftBody(form) {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    categoryId: form.categoryId === '' ? null : Number(form.categoryId),
    difficulty: form.difficulty || null,
    questions: form.questions.map((question) => ({
      type: question.type,
      text: question.text.trim(),
      choices: question.choices.map((choice) => ({ text: choice.text.trim(), isCorrect: choice.isCorrect })),
    })),
  };
}

const FIELD_LABELS = {
  title: 'Title',
  description: 'Description',
  categoryId: 'Category',
  difficulty: 'Difficulty',
  questions: 'Questions',
};

function describeField(field) {
  const match = /^questions\[(\d+)\]/.exec(field);
  if (match) return `Question ${Number(match[1]) + 1}`;
  return FIELD_LABELS[field] ?? field;
}

function FieldError({ errors, id }) {
  if (!errors?.length) return null;
  return (
    <ul className="field-errors" id={id}>
      {errors.map((error, index) => <li key={index}>{error.message}</li>)}
    </ul>
  );
}

function QuestionEditor({ index, question, errors, onChange, onRemove }) {
  const number = index + 1;
  const isTrueFalse = question.type === 'TRUE_FALSE';
  const errorId = errors.length ? `question-${index}-errors` : undefined;

  const update = (change) => onChange({ ...question, ...change });
  const updateChoice = (choiceIndex, change) => update({
    choices: question.choices.map((choice, i) => (i === choiceIndex ? { ...choice, ...change } : choice)),
  });
  const markCorrect = (choiceIndex) => update({
    choices: question.choices.map((choice, i) => ({ ...choice, isCorrect: i === choiceIndex })),
  });
  const changeType = (type) => {
    if (type !== question.type) onChange({ ...newQuestion(type), text: question.text });
  };

  return (
    <fieldset className={`question${errors.length ? ' has-error' : ''}`} aria-describedby={errorId}>
      <legend>Question {number}</legend>
      <FieldError errors={errors} id={errorId} />
      <div className="question-row">
        <label>
          Type
          <select value={question.type} onChange={(event) => changeType(event.target.value)}>
            <option value="MULTIPLE_CHOICE">Multiple choice</option>
            <option value="TRUE_FALSE">True / false</option>
          </select>
        </label>
        <button type="button" className="secondary" onClick={onRemove}>Remove question {number}</button>
      </div>
      <label className="stacked">
        Question text
        <input type="text" value={question.text} onChange={(event) => update({ text: event.target.value })} />
      </label>

      <div role="radiogroup" aria-label={`Choices for question ${number}. Select the correct answer.`} className="choices">
        <p className="hint-text">Select the one correct answer.</p>
        {question.choices.map((choice, choiceIndex) => (
          <div className="choice-row" key={choiceIndex}>
            <input
              type="radio"
              name={`question-${index}-correct`}
              checked={choice.isCorrect}
              onChange={() => markCorrect(choiceIndex)}
              aria-label={`Choice ${choiceIndex + 1} is correct`}
            />
            {isTrueFalse ? (
              <span className="fixed-choice">{choice.text}</span>
            ) : (
              <>
                <input
                  type="text"
                  value={choice.text}
                  onChange={(event) => updateChoice(choiceIndex, { text: event.target.value })}
                  aria-label={`Choice ${choiceIndex + 1} text`}
                />
                <button
                  type="button"
                  className="link-button"
                  onClick={() => update({ choices: question.choices.filter((_, i) => i !== choiceIndex) })}
                  disabled={question.choices.length <= MIN_CHOICES}
                >
                  Remove
                </button>
              </>
            )}
          </div>
        ))}
        {!isTrueFalse && (
          <button
            type="button"
            className="secondary"
            onClick={() => update({ choices: [...question.choices, { text: '', isCorrect: false }] })}
            disabled={question.choices.length >= MAX_CHOICES}
          >
            Add choice
          </button>
        )}
      </div>
    </fieldset>
  );
}

export default function QuizEditor() {
  const { quizId } = useParams();
  const [load, setLoad] = useState({ form: null, error: null });
  const [categories, setCategories] = useState([]);
  const [busy, setBusy] = useState(null); // 'save' | 'publish' | null
  const [outcome, setOutcome] = useState(null); // { kind: 'saved' | 'published' | 'error', ... }

  useEffect(() => {
    const request = new AbortController();
    setLoad({ form: null, error: null });
    maker.getDraft(quizId, request.signal)
      .then((draft) => setLoad({ form: toForm(draft), error: null }))
      .catch((error) => {
        if (!request.signal.aborted) setLoad({ form: null, error });
      });
    getCategories(request.signal).then(setCategories).catch(() => {});
    return () => request.abort();
  }, [quizId]);

  if (load.error?.status === 401) return <SignInRequired />;
  if (load.error) {
    return (
      <div role="alert" className="notice">
        <p>{describeError(load.error, 'open this quiz')}</p>
        <Link to="/my/quizzes">Back to my quizzes</Link>
      </div>
    );
  }
  if (!load.form) return <p role="status">Loading quiz…</p>;

  const form = load.form;
  const setForm = (change) => setLoad((current) => ({ ...current, form: { ...current.form, ...change } }));
  const setQuestion = (index, question) => setForm({ questions: form.questions.map((q, i) => (i === index ? question : q)) });

  const fieldErrors = outcome?.kind === 'error' ? outcome.fieldErrors : [];
  const errorsFor = (field) => fieldErrors.filter((error) => error.field === field);
  const errorsForQuestion = (index) => fieldErrors.filter((error) => error.field.startsWith(`questions[${index}]`));

  // Retired categories stay listed only when this draft already uses one, so its 422 is visible (D5).
  const categoryOptions = categories.filter(
    (category) => category.status === 'ACTIVE' || String(category.id) === form.categoryId,
  );

  async function run(kind) {
    setBusy(kind);
    setOutcome(null);
    try {
      await maker.saveDraft(quizId, toDraftBody(form));
      if (kind === 'save') {
        setOutcome({ kind: 'saved' });
      } else {
        const result = await maker.publish(quizId);
        setOutcome({ kind: 'published', number: result?.number });
      }
    } catch (error) {
      setOutcome({
        kind: 'error',
        status: error instanceof ApiError ? error.status : null,
        message: error instanceof ApiError && error.status === 422
          ? error.body.message || 'Fix the highlighted fields.'
          : describeError(error, kind === 'save' ? 'save the draft' : 'publish the quiz'),
        fieldErrors: error instanceof ApiError ? error.fieldErrors : [],
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <form className="quiz-editor" onSubmit={(event) => { event.preventDefault(); run('save'); }} noValidate>
      <div className="page-heading">
        <h1>{form.title.trim() || 'Untitled quiz'}</h1>
        <Link to="/my/quizzes">Back to my quizzes</Link>
      </div>

      <div aria-live="polite">
        {outcome?.kind === 'saved' && <p className="success-text" role="status">Draft saved. It stays private until you publish it.</p>}
        {outcome?.kind === 'published' && (
          <p className="success-text" role="status">
            Published{outcome.number ? ` as revision ${outcome.number}` : ''}. It is now in the <Link to="/">catalog</Link>.
          </p>
        )}
        {outcome?.kind === 'error' && (
          <div role="alert" className="error-summary">
            <p>{outcome.message}</p>
            {fieldErrors.length > 0 && (
              <ul>
                {fieldErrors.map((error, index) => (
                  <li key={index}>{describeField(error.field)}: {error.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <fieldset className="details">
        <legend>Quiz details</legend>
        <label className="stacked">
          Title
          <input
            type="text"
            value={form.title}
            onChange={(event) => setForm({ title: event.target.value })}
            aria-invalid={errorsFor('title').length > 0}
          />
        </label>
        <FieldError errors={errorsFor('title')} />
        <label className="stacked">
          Description
          <textarea rows={3} value={form.description} onChange={(event) => setForm({ description: event.target.value })} />
        </label>
        <FieldError errors={errorsFor('description')} />
        <div className="details-row">
          <div>
            <label className="stacked">
              Category
              <select
                value={form.categoryId}
                onChange={(event) => setForm({ categoryId: event.target.value })}
                aria-invalid={errorsFor('categoryId').length > 0}
              >
                <option value="">Choose a category</option>
                {categoryOptions.map(({ id, name, status }) => (
                  <option key={id} value={String(id)}>{status === 'RETIRED' ? `${name} (retired)` : name}</option>
                ))}
              </select>
            </label>
            <FieldError errors={errorsFor('categoryId')} />
          </div>
          <div>
            <label className="stacked">
              Difficulty
              <select
                value={form.difficulty}
                onChange={(event) => setForm({ difficulty: event.target.value })}
                aria-invalid={errorsFor('difficulty').length > 0}
              >
                <option value="">Choose a difficulty</option>
                {DIFFICULTIES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <FieldError errors={errorsFor('difficulty')} />
          </div>
        </div>
      </fieldset>

      <h2>Questions</h2>
      <FieldError errors={errorsFor('questions')} />
      {form.questions.length === 0 && <p className="hint-text">Add at least one question before publishing.</p>}
      {form.questions.map((question, index) => (
        <QuestionEditor
          key={index}
          index={index}
          question={question}
          errors={errorsForQuestion(index)}
          onChange={(updated) => setQuestion(index, updated)}
          onRemove={() => setForm({ questions: form.questions.filter((_, i) => i !== index) })}
        />
      ))}
      <div className="add-question">
        <button type="button" className="secondary" onClick={() => setForm({ questions: [...form.questions, newQuestion('MULTIPLE_CHOICE')] })}>
          Add multiple-choice question
        </button>
        <button type="button" className="secondary" onClick={() => setForm({ questions: [...form.questions, newQuestion('TRUE_FALSE')] })}>
          Add true / false question
        </button>
      </div>

      <div className="editor-actions">
        <button type="submit" className="secondary" disabled={busy !== null}>
          {busy === 'save' ? 'Saving…' : 'Save draft'}
        </button>
        <button type="button" onClick={() => run('publish')} disabled={busy !== null}>
          {busy === 'publish' ? 'Publishing…' : 'Publish'}
        </button>
      </div>
    </form>
  );
}
