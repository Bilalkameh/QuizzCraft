import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';

const NO_FILTERS = { categoryId: '', difficulty: '', format: '' };

const DIFFICULTIES = [
  { value: 'EASY', label: 'Easy' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HARD', label: 'Hard' },
];

// The format filter takes one value. The server also matches MIXED quizzes (contract §4).
const FORMAT_FILTERS = [
  { value: 'MULTIPLE_CHOICE', label: 'Multiple choice' },
  { value: 'TRUE_FALSE', label: 'True / false' },
];

const DIFFICULTY_LABELS = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };
const FORMAT_LABELS = {
  MULTIPLE_CHOICE: 'Multiple choice',
  TRUE_FALSE: 'True / false',
  MIXED: 'Mixed: multiple choice + true / false',
};

function catalogUrl(filters) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(filters)) {
    if (value) params.set(name, value);
  }
  const query = params.toString();
  return query ? `/api/quizzes?${query}` : '/api/quizzes';
}

async function getJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function useCategories() {
  const [state, setState] = useState({ categories: [], failed: false });

  useEffect(() => {
    const request = new AbortController();
    getJson('/api/categories', request.signal)
      .then((categories) => setState({ categories, failed: false }))
      .catch(() => {
        if (!request.signal.aborted) setState({ categories: [], failed: true });
      });
    return () => request.abort();
  }, []);

  return state;
}

function useCatalog(filters, reloadKey) {
  const [state, setState] = useState({ items: null, failed: false });

  useEffect(() => {
    const request = new AbortController();
    setState((previous) => ({ items: previous.items, failed: false, loading: true }));
    getJson(catalogUrl(filters), request.signal)
      .then(({ items }) => setState({ items, failed: false, loading: false }))
      .catch(() => {
        if (!request.signal.aborted) setState({ items: null, failed: true, loading: false });
      });
    return () => request.abort();
  }, [filters, reloadKey]);

  return state;
}

function RadioGroup({ legend, name, options, value, onChange }) {
  return (
    <fieldset className="filter-group">
      <legend>{legend}</legend>
      {[{ value: '', label: 'Any' }, ...options].map((option) => (
        <label key={option.value || 'any'} className="choice">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

function Filters({ filters, onChange, onClear, categories, categoriesFailed }) {
  const active = Object.values(filters).some(Boolean);

  return (
    <aside className="filters" aria-label="Filters">
      <h2>Filters</h2>
      <div className="filter-group">
        <label htmlFor="category-filter">Category</label>
        <select
          id="category-filter"
          value={filters.categoryId}
          onChange={(event) => onChange({ categoryId: event.target.value })}
          disabled={categoriesFailed}
        >
          <option value="">All categories</option>
          {categories.map(({ id, name, status }) => (
            <option key={id} value={String(id)}>
              {status === 'RETIRED' ? `${name} (retired)` : name}
            </option>
          ))}
        </select>
        {categoriesFailed && <p className="hint">Categories could not be loaded.</p>}
      </div>
      <RadioGroup
        legend="Difficulty"
        name="difficulty"
        options={DIFFICULTIES}
        value={filters.difficulty}
        onChange={(difficulty) => onChange({ difficulty })}
      />
      <RadioGroup
        legend="Format"
        name="format"
        options={FORMAT_FILTERS}
        value={filters.format}
        onChange={(format) => onChange({ format })}
      />
      <button type="button" onClick={onClear} disabled={!active}>
        Clear filters
      </button>
    </aside>
  );
}

function QuizCard({ quiz }) {
  return (
    <li className="quiz-card">
      <h3>{quiz.title}</h3>
      <p className="description">{quiz.description}</p>
      <dl>
        <div><dt>Category</dt><dd>{quiz.category.name}</dd></div>
        <div><dt>Difficulty</dt><dd>{DIFFICULTY_LABELS[quiz.difficulty] ?? quiz.difficulty}</dd></div>
        <div><dt>Format</dt><dd>{FORMAT_LABELS[quiz.format] ?? quiz.format}</dd></div>
        <div>
          <dt>Questions</dt>
          <dd>{quiz.questionCount}</dd>
        </div>
      </dl>
      <Link className="start-link" to={`/quizzes/${quiz.quizId}/play`}>Start quiz</Link>
    </li>
  );
}

function Results({ catalog, onClear, onRetry }) {
  if (catalog.failed) {
    return (
      <div role="alert" className="notice">
        <p>Could not load quizzes.</p>
        <button type="button" onClick={onRetry}>Try again</button>
      </div>
    );
  }
  if (!catalog.items) return <p role="status">Loading quizzes…</p>;
  if (!catalog.items.length) {
    return (
      <div role="status" className="notice">
        <p>No quizzes match these filters.</p>
        <button type="button" onClick={onClear}>Clear filters</button>
      </div>
    );
  }

  const count = catalog.items.length;
  return (
    <>
      <p role="status" className="count">{count === 1 ? '1 quiz' : `${count} quizzes`}</p>
      <ul className="quiz-grid" aria-busy={catalog.loading}>
        {catalog.items.map((quiz) => <QuizCard key={quiz.quizId} quiz={quiz} />)}
      </ul>
    </>
  );
}

export default function Catalog() {
  const [filters, setFilters] = useState(NO_FILTERS);
  const [reloadKey, setReloadKey] = useState(0);
  const { categories, failed: categoriesFailed } = useCategories();
  const catalog = useCatalog(filters, reloadKey);

  const changeFilters = (change) => setFilters((current) => ({ ...current, ...change }));
  const clearFilters = () => setFilters(NO_FILTERS);

  return (
    <div className="catalog">
      <Filters
        filters={filters}
        onChange={changeFilters}
        onClear={clearFilters}
        categories={categories}
        categoriesFailed={categoriesFailed}
      />
      <section className="results" aria-labelledby="catalog-heading">
        <h2 id="catalog-heading">Published quizzes</h2>
        <Results catalog={catalog} onClear={clearFilters} onRetry={() => setReloadKey((key) => key + 1)} />
      </section>
    </div>
  );
}
