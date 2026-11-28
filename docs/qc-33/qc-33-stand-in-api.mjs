// TEMPORARY stand-in for the QC-29 (play, submit, grading) and QC-31 (attempt history) APIs, used only to
// check the QC-33 screens before those tickets exist. Bodies follow contract §5.2–5.5, and grading and
// validation follow the approved QC-25 specification. Quiz 101 reuses the contract's worked-example ids.
// Test-only controls: POST /__republish/101 publishes revision 1002 with a changed key, and
// POST /__remove/{quizId} soft-removes a quiz.
// Usage: node qc-33-stand-in-api.mjs [port]
import http from 'node:http';

const PORT = Number(process.argv[2] ?? 8080);
const users = { 'playerA-token': 10, 'playerB-token': 11 };
const categories = [
  { id: 1, name: 'Geography', status: 'ACTIVE' },
  { id: 2, name: 'Science', status: 'ACTIVE' },
  { id: 3, name: 'Mathematics', status: 'ACTIVE' },
];

const mc = (questionId, position, text, choices, correct) => ({ questionId, position, type: 'MULTIPLE_CHOICE', text, choices, correct });
const tf = (questionId, position, text, trueId, falseId, answer) => ({
  questionId, position, type: 'TRUE_FALSE', text,
  choices: [{ choiceId: trueId, text: 'True' }, { choiceId: falseId, text: 'False' }],
  correct: answer ? trueId : falseId,
});

const revisions = new Map([
  [1001, {
    revisionId: 1001, quizId: 101, title: 'Planets Warm-Up', description: 'Three quick questions about our solar system.',
    categoryId: 2, difficulty: 'EASY',
    questions: [
      mc(5001, 1, 'Which planet is closest to the Sun?', [{ choiceId: 9001, text: 'Venus' }, { choiceId: 9002, text: 'Mercury' }, { choiceId: 9003, text: 'Mars' }], 9002),
      tf(5002, 2, 'Jupiter is a rocky planet.', 9004, 9005, false),
      mc(5003, 3, 'How many planets orbit the Sun?', [{ choiceId: 9006, text: '7' }, { choiceId: 9007, text: '8' }, { choiceId: 9008, text: '9' }], 9007),
    ],
  }],
  [1101, {
    revisionId: 1101, quizId: 106, title: 'Stand-in True/False Quiz', description: 'Two true/false statements for testing.',
    categoryId: 1, difficulty: 'MEDIUM',
    questions: [
      tf(6001, 1, 'The Nile flows north.', 9101, 9102, true),
      tf(6002, 2, 'Mount Everest is in the Andes.', 9103, 9104, false),
    ],
  }],
]);
const quizzes = new Map([
  [101, { status: 'ACTIVE', latest: 1001 }],
  [106, { status: 'ACTIVE', latest: 1101 }],
]);
const attempts = [];
let nextAttemptId = 7001;

const formatOf = (questions) => {
  const types = new Set(questions.map((q) => q.type));
  return types.size > 1 ? 'MIXED' : [...types][0];
};

function playable(revision) {
  // No answer key: drop `correct` from every question (contract §5.2, QC-25 case 01).
  return {
    quizId: revision.quizId, revisionId: revision.revisionId, title: revision.title,
    questions: revision.questions.map(({ questionId, position, type, text, choices }) => ({ questionId, position, type, text, choices })),
  };
}

function resultOf(attempt) {
  const revision = revisions.get(attempt.revisionId);
  const choices = {};
  revision.questions.forEach((q) => q.choices.forEach((c) => { choices[c.choiceId] = c.text; }));
  return {
    attemptId: attempt.attemptId, quizId: revision.quizId, revisionId: revision.revisionId, title: revision.title,
    submittedAt: attempt.submittedAt, score: attempt.score, maxScore: attempt.maxScore,
    questions: revision.questions.map((q) => {
      const chosen = attempt.answers.get(q.questionId) ?? null;
      const correct = chosen === q.correct;
      return { questionId: q.questionId, text: q.text, chosenChoiceId: chosen, correctChoiceId: q.correct, correct, points: correct ? 1 : 0 };
    }),
    choices,
  };
}

function send(res, status, body) {
  res.writeHead(status, body === undefined ? {} : { 'Content-Type': 'application/json' });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}
const fail = (res, status, error, message) => send(res, status, { error, message });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : undefined;
  const userId = users[(req.headers.authorization ?? '').replace(/^Bearer /, '')];
  let m;

  if (req.method === 'POST' && (m = /^\/__republish\/(\d+)$/.exec(path))) {
    const quiz = quizzes.get(Number(m[1]));
    const old = revisions.get(quiz.latest);
    const revisionId = 1002;
    revisions.set(revisionId, {
      ...old, revisionId,
      questions: old.questions.map((q) => (q.questionId === 5002
        ? tf(5102, 2, 'Saturn is a gas giant.', 9301, 9302, true)
        : { ...q, questionId: q.questionId + 100, choices: q.choices.map((c) => ({ ...c, choiceId: c.choiceId + 200 })), correct: q.correct + 200 })),
    });
    quiz.latest = revisionId;
    return send(res, 200, { revisionId });
  }
  if (req.method === 'POST' && (m = /^\/__remove\/(\d+)$/.exec(path))) {
    quizzes.get(Number(m[1])).status = 'REMOVED';
    return send(res, 204);
  }

  if (req.method === 'GET' && path === '/api/categories') return send(res, 200, categories);
  if (req.method === 'GET' && path === '/api/quizzes') {
    const items = [...quizzes.entries()].filter(([, q]) => q.status === 'ACTIVE').map(([quizId, q]) => {
      const r = revisions.get(q.latest);
      return {
        quizId, revisionId: r.revisionId, title: r.title, description: r.description,
        category: categories.find((c) => c.id === r.categoryId), difficulty: r.difficulty,
        format: formatOf(r.questions), questionCount: r.questions.length,
      };
    });
    return send(res, 200, { items });
  }

  const protectedRoute = /^\/api\/(quizzes\/\d+\/play|revisions\/\d+\/attempts|me\/attempts|attempts\/\d+)$/.test(path);
  if (protectedRoute && !userId) return fail(res, 401, 'UNAUTHENTICATED', 'Sign in required');

  if (req.method === 'GET' && (m = /^\/api\/quizzes\/(\d+)\/play$/.exec(path))) {
    const quiz = quizzes.get(Number(m[1]));
    if (!quiz || quiz.status !== 'ACTIVE') return fail(res, 404, 'NOT_FOUND', 'Quiz not found');
    return send(res, 200, playable(revisions.get(quiz.latest)));
  }

  if (req.method === 'POST' && (m = /^\/api\/revisions\/(\d+)\/attempts$/.exec(path))) {
    const revision = revisions.get(Number(m[1]));
    if (!revision) return fail(res, 404, 'NOT_FOUND', 'Revision not found');
    if (quizzes.get(revision.quizId).status !== 'ACTIVE') return fail(res, 410, 'QUIZ_REMOVED', 'This quiz was removed');
    const answers = new Map();
    for (const { questionId, choiceId } of body?.answers ?? []) {
      const question = revision.questions.find((q) => q.questionId === questionId);
      if (!question || answers.has(questionId)) return fail(res, 422, 'VALIDATION_FAILED', 'Invalid question');
      if (choiceId != null && !question.choices.some((c) => c.choiceId === choiceId)) return fail(res, 422, 'VALIDATION_FAILED', 'Invalid choice');
      answers.set(questionId, choiceId ?? null);
    }
    const score = revision.questions.filter((q) => answers.get(q.questionId) === q.correct).length;
    const attempt = {
      attemptId: nextAttemptId++, userId, revisionId: revision.revisionId, answers,
      score, maxScore: revision.questions.length, submittedAt: new Date().toISOString(),
    };
    attempts.push(attempt);
    return send(res, 201, resultOf(attempt));
  }

  if (req.method === 'GET' && path === '/api/me/attempts') {
    const items = attempts.filter((a) => a.userId === userId).reverse().map((a) => {
      const revision = revisions.get(a.revisionId);
      return {
        attemptId: a.attemptId, quizId: revision.quizId, revisionId: a.revisionId, title: revision.title,
        score: a.score, maxScore: a.maxScore, submittedAt: a.submittedAt,
        quizRemoved: quizzes.get(revision.quizId).status === 'REMOVED',
      };
    });
    return send(res, 200, { items });
  }

  if (req.method === 'GET' && (m = /^\/api\/attempts\/(\d+)$/.exec(path))) {
    const attempt = attempts.find((a) => a.attemptId === Number(m[1]));
    if (!attempt) return fail(res, 404, 'NOT_FOUND', 'Attempt not found');
    if (attempt.userId !== userId) return fail(res, 403, 'FORBIDDEN', 'Not your attempt');
    return send(res, 200, resultOf(attempt));
  }

  return fail(res, 404, 'NOT_FOUND', 'Not found');
});

server.listen(PORT, '127.0.0.1', () => console.log(`QC-33 stand-in API on http://127.0.0.1:${PORT}`));
