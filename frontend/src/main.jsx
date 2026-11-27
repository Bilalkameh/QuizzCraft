import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

function Categories() {
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const request = new AbortController();

    async function loadCategories() {
      try {
        const response = await fetch('/api/categories', { signal: request.signal });
        if (!response.ok) {
          throw new Error('Could not load categories');
        }
        setCategories(await response.json());
      } catch {
        if (!request.signal.aborted) {
          setError(true);
        }
      }
    }

    loadCategories();
    return () => request.abort();
  }, []);

  if (error) return <p role="alert">Could not load categories. Reload to try again.</p>;
  if (!categories) return <p role="status">Loading categories…</p>;
  if (!categories.length) return <p>No categories yet.</p>;

  return (
    <table>
      <thead>
        <tr><th scope="col">Database ID</th><th scope="col">Name</th></tr>
      </thead>
      <tbody>
        {categories.map(({ id, name }) => (
          <tr key={id}><td>{id}</td><td>{name}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

createRoot(document.getElementById('root')).render(
  <main>
    <h1>QuizzCraft</h1>
    <h2>Categories</h2>
    <Categories />
  </main>,
);
