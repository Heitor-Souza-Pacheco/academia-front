// ============================================================
//  CRANIUM — App principal (vanilla JS, ES modules)
// ============================================================
import { authApi, fichasApi, ApiError } from "./api.js";
import { setToken, clearSession, getCurrentUser } from "./session.js";
import { getFavIds, isFav, toggleFav } from "./favorites.js";

// ---------- Estado em memória ----------
const state = {
  user: null,
  fichas: [],          // todas as fichas vindas da API
  categoria: "Todas",  // filtro de categoria ativo
  busca: "",           // texto de busca
  view: "fichas",
};

// ---------- Helpers de DOM ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

// ============================================================
//  TOASTS
// ============================================================
function toast(message, type = "ok") {
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.textContent = message;
  $("#toasts").appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(30px)";
    el.style.transition = "0.25s";
    setTimeout(() => el.remove(), 250);
  }, 3200);
}

// ============================================================
//  AUTENTICAÇÃO (telas de login / cadastro)
// ============================================================
function initAuthScreen() {
  $("#year").textContent = new Date().getFullYear();

  // Troca de abas
  $$(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.authTab;
      $$(".auth-tab").forEach((t) => t.classList.toggle("is-active", t === tab));
      $("#login-form").classList.toggle("is-hidden", target !== "login");
      $("#register-form").classList.toggle("is-hidden", target !== "register");
      clearErrors();
    });
  });

  // Login
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const email = f.email.value.trim();
    const senha = f.senha.value;
    const btn = f.querySelector("button[type=submit]");
    await withButton(btn, "Entrando...", async () => {
      try {
        const token = await authApi.login(email, senha);
        setToken(token);
        toast("Bem-vindo de volta!");
        enterApp();
      } catch (err) {
        showFormError(f, err.message);
      }
    });
  });

  // Cadastro
  $("#register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const nome = f.nome.value.trim();
    const email = f.email.value.trim();
    const senha = f.senha.value;
    const btn = f.querySelector("button[type=submit]");
    await withButton(btn, "Criando conta...", async () => {
      try {
        const token = await authApi.register(nome, email, senha);
        setToken(token, nome);
        toast("Conta criada com sucesso!");
        enterApp();
      } catch (err) {
        showFormError(f, err.message);
      }
    });
  });
}

function showFormError(form, msg) {
  const el = $("[data-error]", form);
  if (el) el.textContent = msg;
}
function clearErrors() {
  $$("[data-error]").forEach((el) => (el.textContent = ""));
}

// Desabilita o botão e troca o texto enquanto a ação roda.
async function withButton(btn, loadingText, fn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = loadingText;
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ============================================================
//  ENTRAR / SAIR DA APLICAÇÃO
// ============================================================
function enterApp() {
  state.user = getCurrentUser();
  if (!state.user) return showAuth();

  $("#auth-screen").classList.add("is-hidden");
  $("#app-screen").classList.remove("is-hidden");

  // Cabeçalho do usuário
  $("#user-name").textContent = state.user.nome;
  $("#user-role").textContent = state.user.isAdmin ? "Administrador" : "Aluno";
  $("#user-avatar").textContent = state.user.nome.charAt(0).toUpperCase();

  // Mostra a aba de administração só para ADMIN
  $(".nav__link.is-admin").classList.toggle("is-hidden", !state.user.isAdmin);

  switchView("fichas");
  loadFichas();
}

function logout() {
  clearSession();
  state.user = null;
  state.fichas = [];
  showAuth();
  toast("Você saiu da sua conta.");
}

function showAuth() {
  $("#app-screen").classList.add("is-hidden");
  $("#auth-screen").classList.remove("is-hidden");
  clearErrors();
  $$(".auth-form").forEach((f) => f.reset());
}

// ============================================================
//  NAVEGAÇÃO ENTRE VIEWS
// ============================================================
function initNav() {
  $("#main-nav").addEventListener("click", (e) => {
    const link = e.target.closest(".nav__link");
    if (link) switchView(link.dataset.view);
  });

  $("#logout-btn").addEventListener("click", logout);

  // Botões "ir para" dentro de estados vazios
  document.addEventListener("click", (e) => {
    const goto = e.target.closest("[data-goto]");
    if (goto) switchView(goto.dataset.goto);
  });
}

function switchView(view) {
  state.view = view;
  $$(".nav__link").forEach((l) => l.classList.toggle("is-active", l.dataset.view === view));
  $$(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === view));

  if (view === "salvos") renderSalvos();
  if (view === "gerenciar") renderAdmin();
}

// ============================================================
//  CARREGAR E RENDERIZAR FICHAS
// ============================================================
async function loadFichas() {
  const grid = $("#fichas-grid");
  grid.innerHTML = Array(3).fill('<div class="skeleton"></div>').join("");
  try {
    state.fichas = (await fichasApi.listarTodas()) || [];
    renderCategoryFilters();
    renderFichas();
    updateSalvosCount();
  } catch (err) {
    grid.innerHTML = "";
    if (err.status !== 401 && err.status !== 403) toast(err.message, "err");
  }
}

function getCategories() {
  const set = new Set(state.fichas.map((f) => f.categoria).filter(Boolean));
  return ["Todas", ...[...set].sort((a, b) => a.localeCompare(b))];
}

function renderCategoryFilters() {
  const wrap = $("#category-filters");
  wrap.innerHTML = getCategories()
    .map(
      (cat) =>
        `<button class="chip ${cat === state.categoria ? "is-active" : ""}" data-cat="${esc(cat)}">${esc(cat)}</button>`
    )
    .join("");
  $$(".chip", wrap).forEach((chip) =>
    chip.addEventListener("click", () => {
      state.categoria = chip.dataset.cat;
      renderCategoryFilters();
      renderFichas();
    })
  );
}

function filteredFichas() {
  return state.fichas.filter((f) => {
    const okCat = state.categoria === "Todas" || f.categoria === state.categoria;
    const okBusca = !state.busca || (f.titulo || "").toLowerCase().includes(state.busca.toLowerCase());
    return okCat && okBusca;
  });
}

function renderFichas() {
  const grid = $("#fichas-grid");
  const list = filteredFichas();
  $("#fichas-empty").classList.toggle("is-hidden", list.length > 0);
  grid.innerHTML = list.map((f) => cardHTML(f)).join("");
  bindCards(grid);
}

// ---------- HTML de um card ----------
function cardHTML(ficha) {
  const saved = isFav(state.user.email, ficha.id);
  const qtd = (ficha.exercicios || []).length;
  return `
    <article class="card" data-id="${ficha.id}">
      <div class="card__stripe"></div>
      <div class="card__body">
        <div class="card__top">
          <span class="card__cat">${esc(ficha.categoria || "Geral")}</span>
        </div>
        <h3 class="card__title">${esc(ficha.titulo)}</h3>
        <p class="card__desc">${esc(ficha.descricao || "Sem descrição.")}</p>
        <div class="card__meta">
          <span>💪 <strong>${qtd}</strong> exercício${qtd === 1 ? "" : "s"}</span>
          ${ficha.data ? `<span>📅 ${formatDate(ficha.data)}</span>` : ""}
        </div>
      </div>
      <div class="card__actions">
        <button class="btn btn--ghost btn--sm" data-action="ver">Ver treino</button>
        <button class="fav-btn ${saved ? "is-saved" : ""}" data-action="fav" title="${saved ? "Remover dos salvos" : "Salvar no perfil"}">
          ${saved ? "★" : "☆"}
        </button>
      </div>
    </article>`;
}

function bindCards(root) {
  $$(".card", root).forEach((card) => {
    const id = Number(card.dataset.id);
    card.addEventListener("click", (e) => {
      const action = e.target.closest("[data-action]")?.dataset.action;
      if (action === "fav") {
        e.stopPropagation();
        handleToggleFav(id);
      } else {
        openFichaDetail(id);
      }
    });
  });
}

function handleToggleFav(id) {
  const saved = toggleFav(state.user.email, id);
  toast(saved ? "Ficha salva no seu perfil." : "Removida dos salvos.");
  // Re-renderiza a view atual
  if (state.view === "salvos") renderSalvos();
  else renderFichas();
  updateSalvosCount();
}

function updateSalvosCount() {
  $("#salvos-count").textContent = getFavIds(state.user.email).length;
}

// ============================================================
//  VIEW: SALVOS
// ============================================================
function renderSalvos() {
  const ids = getFavIds(state.user.email);
  const list = state.fichas.filter((f) => ids.includes(Number(f.id)));
  const grid = $("#salvos-grid");
  $("#salvos-empty").classList.toggle("is-hidden", list.length > 0);
  grid.innerHTML = list.map((f) => cardHTML(f)).join("");
  bindCards(grid);
}

// ============================================================
//  MODAL: DETALHE DA FICHA
// ============================================================
async function openFichaDetail(id) {
  let ficha = state.fichas.find((f) => Number(f.id) === Number(id));
  // Garante exercícios atualizados direto da API
  try {
    ficha = (await fichasApi.buscarPorId(id)) || ficha;
  } catch (_) {
    /* usa o que já temos em memória */
  }
  if (!ficha) return;

  const saved = isFav(state.user.email, ficha.id);
  const exercicios = [...(ficha.exercicios || [])].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  $("#ficha-modal-body").innerHTML = `
    <span class="card__cat detail__cat">${esc(ficha.categoria || "Geral")}</span>
    <h2 class="detail__title">${esc(ficha.titulo)}</h2>
    <div class="detail__meta">
      <span>💪 ${exercicios.length} exercício${exercicios.length === 1 ? "" : "s"}</span>
      ${ficha.data ? `<span>📅 Criada em ${formatDate(ficha.data)}</span>` : ""}
    </div>
    ${ficha.descricao ? `<p class="detail__desc">${esc(ficha.descricao)}</p>` : ""}
    <h3 class="detail__section-title">Exercícios</h3>
    <div class="exlist">
      ${
        exercicios.length
          ? exercicios
              .map(
                (ex, i) => `
        <div class="exrow">
          <span class="exrow__num">${i + 1}</span>
          <span class="exrow__name">${esc(ex.nome)}</span>
          <span class="exrow__sets">
            <span class="exrow__tag"><strong>${ex.series}</strong> séries</span>
            <span class="exrow__tag"><strong>${ex.repeticoes}</strong> reps</span>
          </span>
        </div>`
              )
              .join("")
          : `<p style="color:var(--muted)">Esta ficha ainda não tem exercícios cadastrados.</p>`
      }
    </div>
    <div class="detail__footer">
      <button class="btn ${saved ? "btn--ghost" : "btn--primary"}" id="detail-fav-btn">
        ${saved ? "★ Salvo no perfil" : "☆ Salvar no meu perfil"}
      </button>
    </div>`;

  $("#detail-fav-btn").addEventListener("click", () => {
    handleToggleFav(ficha.id);
    openFichaDetail(ficha.id); // atualiza o botão do modal
  });

  openModal("#ficha-modal");
}

// ============================================================
//  ADMIN — Lista + formulário
// ============================================================
function renderAdmin() {
  const wrap = $("#admin-list");
  $("#admin-empty").classList.toggle("is-hidden", state.fichas.length > 0);
  wrap.innerHTML = state.fichas
    .map(
      (f) => `
    <div class="admin-row" data-id="${f.id}">
      <div class="admin-row__info">
        <div class="admin-row__title">${esc(f.titulo)}</div>
        <div class="admin-row__sub">${esc(f.categoria || "Geral")} · ${(f.exercicios || []).length} exercícios</div>
      </div>
      <div class="admin-row__actions">
        <button class="btn btn--ghost btn--sm" data-edit>Editar</button>
        <button class="btn btn--danger btn--sm" data-del>Excluir</button>
      </div>
    </div>`
    )
    .join("");

  $$(".admin-row", wrap).forEach((row) => {
    const id = Number(row.dataset.id);
    $("[data-edit]", row).addEventListener("click", () => openFichaForm(id));
    $("[data-del]", row).addEventListener("click", () => handleDelete(id));
  });
}

async function handleDelete(id) {
  const ficha = state.fichas.find((f) => Number(f.id) === id);
  if (!confirm(`Excluir a ficha "${ficha?.titulo}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await fichasApi.deletar(id);
    state.fichas = state.fichas.filter((f) => Number(f.id) !== id);
    toast("Ficha excluída.");
    renderAdmin();
    renderFichas();
    renderCategoryFilters();
    updateSalvosCount();
  } catch (err) {
    toast(err.message, "err");
  }
}

// ---------- Formulário (criar / editar) ----------
function openFichaForm(id = null) {
  const form = $("#ficha-form");
  form.reset();
  clearErrors();
  $("#exercises-list").innerHTML = "";
  refreshCategoriaDatalist();

  const editing = id !== null;
  $("#form-modal-title").textContent = editing ? "Editar ficha" : "Nova ficha";
  form.id.value = editing ? id : "";

  if (editing) {
    const ficha = state.fichas.find((f) => Number(f.id) === id);
    if (ficha) {
      form.titulo.value = ficha.titulo || "";
      form.categoria.value = ficha.categoria || "";
      form.descricao.value = ficha.descricao || "";
      const exs = [...(ficha.exercicios || [])].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
      if (exs.length) exs.forEach(addExerciseRow);
      else addExerciseRow();
    }
  } else {
    addExerciseRow();
  }

  openModal("#form-modal");
}

function addExerciseRow(ex = {}) {
  const list = $("#exercises-list");
  // Cabeçalho de colunas (só uma vez)
  if (!list.querySelector(".ex-edit__labels")) {
    const labels = document.createElement("div");
    labels.className = "ex-edit__labels";
    labels.innerHTML = `<span></span><span>Exercício</span><span>Séries</span><span>Reps</span><span></span>`;
    list.appendChild(labels);
  }
  const row = document.createElement("div");
  row.className = "ex-edit";
  row.innerHTML = `
    <span class="ex-edit__handle">≡</span>
    <input type="text" data-f="nome" placeholder="Nome do exercício" value="${esc(ex.nome || "")}" required />
    <input type="number" data-f="series" min="1" placeholder="3" value="${ex.series ?? ""}" />
    <input type="number" data-f="repeticoes" min="1" placeholder="12" value="${ex.repeticoes ?? ""}" />
    <button type="button" class="ex-edit__remove" title="Remover">&times;</button>`;
  row.querySelector(".ex-edit__remove").addEventListener("click", () => row.remove());
  list.appendChild(row);
}

function collectExercises() {
  return $$(".ex-edit", $("#exercises-list"))
    .map((row, i) => ({
      nome: $("[data-f=nome]", row).value.trim(),
      series: parseInt($("[data-f=series]", row).value, 10) || 0,
      repeticoes: parseInt($("[data-f=repeticoes]", row).value, 10) || 0,
      ordem: i + 1,
    }))
    .filter((ex) => ex.nome);
}

function initFichaForm() {
  $("#new-ficha-btn").addEventListener("click", () => openFichaForm(null));
  $("#add-exercise-btn").addEventListener("click", () => addExerciseRow());

  $("#ficha-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const payload = {
      titulo: f.titulo.value.trim(),
      descricao: f.descricao.value.trim(),
      categoria: f.categoria.value.trim(),
      exercicios: collectExercises(),
    };
    if (!payload.titulo || !payload.categoria) {
      return showFormError(f, "Preencha o título e a categoria.");
    }
    const id = f.id.value;
    const btn = f.querySelector("button[type=submit]");
    await withButton(btn, "Salvando...", async () => {
      try {
        if (id) await fichasApi.atualizar(Number(id), payload);
        else await fichasApi.criar(payload);
        closeModal("#form-modal");
        toast(id ? "Ficha atualizada!" : "Ficha criada!");
        await loadFichas();
        renderAdmin();
      } catch (err) {
        showFormError(f, err.message);
      }
    });
  });
}

function refreshCategoriaDatalist() {
  const dl = $("#categoria-list");
  const cats = [...new Set(state.fichas.map((f) => f.categoria).filter(Boolean))];
  dl.innerHTML = cats.map((c) => `<option value="${esc(c)}"></option>`).join("");
}

// ============================================================
//  MODAIS (genérico)
// ============================================================
function openModal(sel) {
  $(sel).classList.remove("is-hidden");
  document.body.style.overflow = "hidden";
}
function closeModal(sel) {
  $(sel).classList.add("is-hidden");
  document.body.style.overflow = "";
}
function initModals() {
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-modal]")) {
      const modal = e.target.closest(".modal");
      if (modal) closeModal("#" + modal.id);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") $$(".modal:not(.is-hidden)").forEach((m) => closeModal("#" + m.id));
  });
}

// ============================================================
//  BUSCA
// ============================================================
function initSearch() {
  let t;
  $("#search-input").addEventListener("input", (e) => {
    clearTimeout(t);
    const val = e.target.value;
    t = setTimeout(() => {
      state.busca = val;
      renderFichas();
    }, 180);
  });
}

// ============================================================
//  UTIL
// ============================================================
function formatDate(iso) {
  // iso vem como "YYYY-MM-DD"
  const [y, m, d] = String(iso).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

// ============================================================
//  BOOT
// ============================================================
function init() {
  initAuthScreen();
  initNav();
  initSearch();
  initModals();
  initFichaForm();

  // Logout automático quando o token é rejeitado pela API
  window.addEventListener("cranium:unauthorized", () => {
    if (state.user) {
      logout();
      toast("Sua sessão expirou. Entre novamente.", "err");
    }
  });

  // Sessão salva no navegador → entra direto
  if (getCurrentUser()) enterApp();
  else showAuth();
}

init();
