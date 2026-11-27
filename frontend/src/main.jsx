import React from 'react';
import { createRoot } from 'react-dom/client';
import Catalog from './catalog/Catalog.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <>
    <header className="top-bar">
      <span className="brand">QuizzCraft</span>
      <nav aria-label="Main">
        <a href="/" aria-current="page">Catalog</a>
      </nav>
    </header>
    <main>
      <h1>Quiz catalog</h1>
      <Catalog />
    </main>
  </>,
);
