// Where to go after signing in: the in-app page that sent the visitor to sign-in, or the catalog.
export function returnPath(from) {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return '/';
  if (/^\/(signin|register)(?=[/?#]|$)/.test(from)) return '/';
  return from;
}
