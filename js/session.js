// ============================================================
//  Sessão — armazena o token JWT e expõe o usuário atual.
//  O login "fica salvo" no navegador via localStorage, então o
//  usuário não precisa entrar de novo a cada visita.
// ============================================================

const TOKEN_KEY = "cranium_token";
const NAME_KEY = "cranium_nome";

// ---------- Token ----------
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token, nome) {
  localStorage.setItem(TOKEN_KEY, token);
  if (nome) localStorage.setItem(NAME_KEY, nome);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
}

// ---------- Decodificação do JWT ----------
// O payload do token guarda { sub: email, role: "USER"|"ADMIN", exp }.
function decodeToken(token) {
  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

// ---------- Usuário atual ----------
// Retorna { email, role, nome, isAdmin } ou null se não logado / token expirado.
export function getCurrentUser() {
  const token = getToken();
  if (!token) return null;

  const claims = decodeToken(token);
  if (!claims || !claims.sub) return null;

  // Token expirado? exp vem em segundos.
  if (claims.exp && claims.exp * 1000 < Date.now()) {
    clearSession();
    return null;
  }

  const email = claims.sub;
  const nome = localStorage.getItem(NAME_KEY) || nameFromEmail(email);
  return {
    email,
    nome,
    role: claims.role || "USER",
    isAdmin: claims.role === "ADMIN",
  };
}

export function isLoggedIn() {
  return getCurrentUser() !== null;
}

function nameFromEmail(email) {
  const local = email.split("@")[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}
