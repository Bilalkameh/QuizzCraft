// Placeholder until QC-21 (token expiry and storage) and QC-24 (sign-in screen) land.
// The maker screens only need the JWT that sign-in will provide. Hady decides where it is kept,
// and this module is the one place to change when that decision is made.
const TOKEN_KEY = 'quizzcraft.token';

export function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
