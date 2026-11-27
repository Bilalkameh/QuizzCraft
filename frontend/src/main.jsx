import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router';
import Catalog from './catalog/Catalog.jsx';
import MyQuizzes from './maker/MyQuizzes.jsx';
import QuizEditor from './maker/QuizEditor.jsx';
import AttemptResult from './player/AttemptResult.jsx';
import MyHistory from './player/MyHistory.jsx';
import PlayQuiz from './player/PlayQuiz.jsx';
import './styles.css';

function CatalogPage() {
  return (
    <>
      <h1>Quiz catalog</h1>
      <Catalog />
    </>
  );
}

function NotFound() {
  return <p role="alert">This page does not exist.</p>;
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <header className="top-bar">
      <span className="brand">QuizzCraft</span>
      <nav aria-label="Main">
        <NavLink to="/" end>Catalog</NavLink>
        <NavLink to="/my/quizzes">My quizzes</NavLink>
        <NavLink to="/me/attempts">My history</NavLink>
      </nav>
    </header>
    <main>
      <Routes>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/my/quizzes" element={<MyQuizzes />} />
        <Route path="/my/quizzes/:quizId/edit" element={<QuizEditor />} />
        <Route path="/quizzes/:quizId/play" element={<PlayQuiz />} />
        <Route path="/attempts/:attemptId" element={<AttemptResult />} />
        <Route path="/me/attempts" element={<MyHistory />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </main>
  </BrowserRouter>,
);
