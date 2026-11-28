// TEMPORARY stand-in for the QC-27 maker API, used only to check the QC-32 screens before QC-27 exists.
// Follows contract §2–§4 and §5.6 plus the request/response shapes proposed in docs/qc-32-evidence.md.
import http from 'node:http';

const PORT = Number(process.argv[2] ?? 8080);
const users = { 'playerA-token': 10, 'playerB-token': 11 };
const categories = [
  { id: 1, name: 'Geography', status: 'ACTIVE' },
  { id: 2, name: 'Science', status: 'ACTIVE' },
  { id: 3, name: 'Mathematics', status: 'ACTIVE' },
  { id: 4, name: 'History', status: 'RETIRED' },
];
const quizzes = new Map();
let nextQuizId = 105;
let nextRevisionId = 1002;
const log = [];

const emptyDraft = () => ({ title: '', description: '', categoryId: null, difficulty: null, questions: [] });
const clone = (value) => JSON.parse(JSON.stringify(value));

function formatOf(questions) {
  const types = new Set(questions.map((q) => q.type));
  return types.size > 1 ? 'MIXED' : [...types][0];
}

function validate(draft) {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  if (!draft.title?.trim()) add('title', 'Title is required');
  const category = categories.find((c) => c.id === draft.categoryId);
  if (!category) add('categoryId', 'Category is required');
  else if (category.status !== 'ACTIVE') add('categoryId', 'Category is retired');
  if (!['EASY', 'MEDIUM', 'HARD'].includes(draft.difficulty)) add('difficulty', 'Difficulty is required');
  if (!draft.questions?.length) add('questions', 'Add at least one question');
  (draft.questions ?? []).forEach((q, i) => {
    if (!q.text?.trim()) add(`questions[${i}].text`, 'Question text is required');
    if (q.type === 'TRUE_FALSE' && q.choices.length !== 2) add(`questions[${i}].choices`, 'A true/false question needs exactly two choices');
    if (q.type === 'MULTIPLE_CHOICE' && (q.choices.length < 2 || q.choices.length > 6)) add(`questions[${i}].choices`, 'Use 2 to 6 choices');
    if (q.choices.some((c) => !c.text?.trim())) add(`questions[${i}].choices`, 'Every choice needs text');
    if (q.choices.filter((c) => c.isCorrect).length !== 1) add(`questions[${i}].choices`, 'Exactly one choice must be correct');
  });
  return errors;
}

function send(res, status, body) {
  res.writeHead(status, body === undefined ? {} : { 'Content-Type': 'application/json' });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}
const fail = (res, status, error, message, fieldErrors) => send(res, status, { error, message, ...(fieldErrors ? { fieldErrors } : {}) });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let body = '';
  for await (const chunk of req) body += chunk;
  const json = body ? JSON.parse(body) : undefined;
  const userId = users[(req.headers.authorization ?? '').replace(/^Bearer /, '')];
  log.push(`${req.method} ${url.pathname}${url.search} as ${userId ?? 'visitor'}`);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/api/categories') return send(res, 200, categories);
  if (req.method === 'GET' && path === '/api/quizzes') {
    const items = [...quizzes.entries()]
      .filter(([, q]) => q.status === 'ACTIVE' && q.published)
      .map(([quizId, q]) => ({
        quizId, revisionId: q.published.revisionId, title: q.published.title, description: q.published.description,
        category: categories.find((c) => c.id === q.published.categoryId), difficulty: q.published.difficulty,
        format: formatOf(q.published.questions), questionCount: q.published.questions.length,
      }));
    return send(res, 200, { items });
  }
  if (req.method === 'GET' && path === '/__log') return send(res, 200, log);

  if (!path.startsWith('/api/my/quizzes')) return fail(res, 404, 'NOT_FOUND', 'Not found');
  if (!userId) return fail(res, 401, 'UNAUTHENTICATED', 'Sign in required');

  if (path === '/api/my/quizzes' && req.method === 'GET') {
    const items = [...quizzes.entries()].filter(([, q]) => q.ownerId === userId).map(([quizId, q]) => ({
      quizId, title: q.draft?.title || q.published?.title || '', status: q.status, hasDraft: Boolean(q.draft),
      published: q.published ? { revisionId: q.published.revisionId, number: q.published.number, publishedAt: q.published.publishedAt } : null,
    }));
    return send(res, 200, { items });
  }
  if (path === '/api/my/quizzes' && req.method === 'POST') {
    const quizId = nextQuizId++;
    quizzes.set(quizId, { ownerId: userId, status: 'ACTIVE', draft: emptyDraft(), published: null });
    return send(res, 201, { quizId });
  }

  const match = /^\/api\/my\/quizzes\/(\d+)\/(draft|publish)$/.exec(path);
  if (!match) return fail(res, 404, 'NOT_FOUND', 'Not found');
  const quizId = Number(match[1]);
  const quiz = quizzes.get(quizId);
  if (!quiz) return fail(res, 404, 'NOT_FOUND', 'Quiz not found');
  if (quiz.ownerId !== userId) return fail(res, 403, 'FORBIDDEN', 'Only the owner can edit this quiz');

  if (match[2] === 'draft' && req.method === 'GET') {
    if (!quiz.draft) quiz.draft = clone(quiz.published);
    return send(res, 200, { quizId, ...pickDraft(quiz.draft) });
  }
  if (match[2] === 'draft' && req.method === 'PUT') {
    const category = categories.find((c) => c.id === json.categoryId);
    if (category?.status === 'RETIRED' && category.id !== quiz.published?.categoryId) {
      return fail(res, 422, 'VALIDATION_FAILED', 'Draft cannot be saved', [{ field: 'categoryId', message: 'Category is retired' }]);
    }
    quiz.draft = pickDraft(json);
    return send(res, 200, { quizId, ...quiz.draft });
  }
  if (match[2] === 'publish' && req.method === 'POST') {
    const draft = quiz.draft ?? emptyDraft();
    const errors = validate(draft);
    if (errors.length) return fail(res, 422, 'VALIDATION_FAILED', 'Quiz cannot be published', errors);
    const number = (quiz.published?.number ?? 0) + 1;
    quiz.published = { ...clone(draft), revisionId: nextRevisionId++, number, publishedAt: new Date().toISOString() };
    quiz.draft = null;
    return send(res, 201, { quizId, revisionId: quiz.published.revisionId, number });
  }
  return fail(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
});

function pickDraft(d) {
  return {
    title: d.title ?? '', description: d.description ?? '', categoryId: d.categoryId ?? null, difficulty: d.difficulty ?? null,
    questions: (d.questions ?? []).map((q) => ({ type: q.type, text: q.text, choices: q.choices.map((c) => ({ text: c.text, isCorrect: c.isCorrect })) })),
  };
}

server.listen(PORT, '127.0.0.1', () => console.log(`QC-32 mock API on http://127.0.0.1:${PORT}`));
