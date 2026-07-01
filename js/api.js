// ============================================================
//  Cliente da API — fala com o backend Spring (academia).
// ============================================================
import { API_BASE } from "./config.js";
import { getToken, clearSession } from "./session.js";

// Erro de API com mensagem amigável e status.
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Disparado quando o token é rejeitado (401/403) — a aplicação escuta
// para deslogar o usuário automaticamente.
function notifyUnauthorized() {
  window.dispatchEvent(new CustomEvent("cranium:unauthorized"));
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = "Bearer " + token;
  }

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new ApiError(
      "Não foi possível conectar ao servidor. O backend está rodando em " + API_BASE + "?",
      0
    );
  }

  if (res.status === 401 || res.status === 403) {
    // Token inválido/expirado ou sem permissão.
    if (getToken()) {
      clearSession();
      notifyUnauthorized();
    }
    throw new ApiError(
      res.status === 403 ? "Você não tem permissão para esta ação." : "Sessão expirada. Faça login novamente.",
      res.status
    );
  }

  // Lê o corpo como texto (o backend retorna o token como texto puro no auth).
  const text = await res.text();

  if (!res.ok) {
    throw new ApiError(text || `Erro ${res.status}`, res.status);
  }

  if (!text) return null;
  // Tenta JSON; se falhar, devolve o texto (caso do token).
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------------- Autenticação ----------------
export const authApi = {
  // Retorna o token (texto puro).
  login: (email, senha) =>
    request("/auth/login", { method: "POST", body: { email, senha }, auth: false }),
  register: (nome, email, senha) =>
    request("/auth/register", { method: "POST", body: { nome, email, senha }, auth: false }),
};

// ---------------- Fichas ----------------
export const fichasApi = {
  listarTodas: () => request("/api/fichas"),
  buscarPorId: (id) => request(`/api/fichas/${id}`),
  buscarPorTitulo: (titulo) => request(`/api/fichas/busca?titulo=${encodeURIComponent(titulo)}`),
  listarPorCategoria: (categoria) => request(`/api/fichas/categoria/${encodeURIComponent(categoria)}`),
  criar: (ficha) => request("/api/fichas", { method: "POST", body: ficha }),
  atualizar: (id, ficha) => request(`/api/fichas/${id}`, { method: "PUT", body: ficha }),
  deletar: (id) => request(`/api/fichas/${id}`, { method: "DELETE" }),
};
