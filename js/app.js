// ============================================================
//  CRANIUM — App principal (vanilla JS, ES modules)
// ============================================================
import { authApi, fichasApi, videosApi, assistenteApi, ApiError } from "./api.js";
import { setToken, clearSession, getCurrentUser } from "./session.js";
import { getFavIds, isFav, toggleFav } from "./favorites.js";

// ---------- Estado em memória ----------
const state = {
  user: null,
  fichas: [],          // todas as fichas vindas da API
  videos: [],          // biblioteca de vídeos (para vincular aos exercícios)
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

  // Mostra as abas de administração só para ADMIN
  $$(".nav__link.is-admin").forEach((l) => l.classList.toggle("is-hidden", !state.user.isAdmin));

  switchView("fichas");
  loadFichas();
  if (state.user.isAdmin) loadVideos(); // biblioteca usada no form de fichas
}

function logout() {
  clearSession();
  state.user = null;
  state.fichas = [];
  state.videos = [];
  resetAssistant();
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
  if (view === "videos") renderVideosAdmin();
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
    <article class="card" data-id="${esc(ficha.id)}">
      <div class="card__stripe"></div>
      <div class="card__body">
        <div class="card__top">
          <span class="card__cat">${esc(ficha.categoria || "Geral")}</span>
        </div>
        <h3 class="card__title">${esc(ficha.titulo)}</h3>
        <p class="card__desc">${esc(ficha.descricao || "Sem descrição.")}</p>
        <div class="card__meta">
          <span>💪 <strong>${qtd}</strong> exercício${qtd === 1 ? "" : "s"}</span>
          ${ficha.data ? `<span>📅 ${esc(formatDate(ficha.data))}</span>` : ""}
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
      ${ficha.data ? `<span>📅 Criada em ${esc(formatDate(ficha.data))}</span>` : ""}
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
            ${ex.video ? `<button type="button" class="exrow__video" data-ex-idx="${i}">▶ Vídeo</button>` : ""}
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

  // Botões "▶ Vídeo" de cada exercício
  $$(".exrow__video", $("#ficha-modal-body")).forEach((btn) =>
    btn.addEventListener("click", () => {
      const video = exercicios[Number(btn.dataset.exIdx)]?.video;
      if (video) openVideoPlayer(video);
    })
  );

  openModal("#ficha-modal");
}

// ============================================================
//  PLAYER DE VÍDEO
// ============================================================
function openVideoPlayer(video) {
  $("#video-player-title").textContent = video.nome || "Vídeo";
  $("#video-player-body").innerHTML = videoEmbedHTML(video.videoUrl);
  openModal("#video-player-modal");
}

// Converte a URL do vídeo no HTML de player adequado (YouTube, Vimeo,
// arquivo direto) ou, por fim, um link para abrir em nova aba.
function videoEmbedHTML(url) {
  const safe = String(url || "").trim();
  if (!safe) return `<p class="video-fallback">Este vídeo não tem uma URL cadastrada.</p>`;

  const yt = safe.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) {
    return `<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}" title="Vídeo do exercício" referrerpolicy="no-referrer" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  }

  const vm = safe.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) {
    return `<div class="video-embed"><iframe src="https://player.vimeo.com/video/${vm[1]}" title="Vídeo do exercício" referrerpolicy="no-referrer" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
  }

  // Só tratamos como URL válida se for http(s) explícito — bloqueia esquemas
  // como javascript:, data: ou vbscript: mesmo que terminem em .mp4.
  const isHttp = /^https?:\/\//i.test(safe);

  // Vídeo embutido só via https (alinhado à CSP media-src); http cai no link abaixo.
  if (/^https:\/\//i.test(safe) && /\.(mp4|webm|ogg)(\?.*)?$/i.test(safe)) {
    return `<div class="video-embed"><video src="${esc(safe)}" controls preload="metadata"></video></div>`;
  }

  if (isHttp) {
    return `<p class="video-fallback">Não foi possível incorporar este vídeo. <a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">Abrir em nova aba ↗</a></p>`;
  }

  return `<p class="video-fallback">URL de vídeo inválida.</p>`;
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
    <div class="admin-row" data-id="${esc(f.id)}">
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
  const ok = await confirmDialog({
    title: "Excluir ficha",
    message: `Tem certeza que deseja excluir a ficha <strong>"${esc(ficha?.titulo || "")}"</strong>?<br>Esta ação não pode ser desfeita.`,
    confirmText: "Excluir",
    danger: true,
  });
  if (!ok) return;
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
    labels.innerHTML = `<span></span><span>Exercício</span><span>Séries</span><span>Reps</span><span>Vídeo</span><span></span>`;
    list.appendChild(labels);
  }
  const row = document.createElement("div");
  row.className = "ex-edit";
  const selectedVideoId = ex.video?.id ?? ex.videoId ?? "";
  const options = ['<option value="">— Nenhum —</option>']
    .concat(
      state.videos.map(
        (v) =>
          `<option value="${esc(v.id)}" ${String(v.id) === String(selectedVideoId) ? "selected" : ""}>${esc(v.nome)}</option>`
      )
    )
    .join("");
  row.innerHTML = `
    <span class="ex-edit__handle">≡</span>
    <input type="text" data-f="nome" placeholder="Nome do exercício" value="${esc(ex.nome || "")}" required />
    <input type="number" data-f="series" min="1" placeholder="3" value="${esc(ex.series ?? "")}" />
    <input type="number" data-f="repeticoes" min="1" placeholder="12" value="${esc(ex.repeticoes ?? "")}" />
    <select data-f="videoId" title="Vídeo de demonstração">${options}</select>
    <button type="button" class="ex-edit__remove" title="Remover">&times;</button>`;
  row.querySelector(".ex-edit__remove").addEventListener("click", () => row.remove());
  list.appendChild(row);
}

function collectExercises() {
  return $$(".ex-edit", $("#exercises-list"))
    .map((row, i) => {
      const videoId = $("[data-f=videoId]", row).value;
      return {
        nome: $("[data-f=nome]", row).value.trim(),
        series: parseInt($("[data-f=series]", row).value, 10) || 0,
        repeticoes: parseInt($("[data-f=repeticoes]", row).value, 10) || 0,
        ordem: i + 1,
        videoId: videoId ? Number(videoId) : null,
      };
    })
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
//  ADMIN — Biblioteca de vídeos
// ============================================================
async function loadVideos() {
  try {
    state.videos = (await videosApi.listarTodos()) || [];
  } catch (err) {
    state.videos = [];
    if (err.status !== 401 && err.status !== 403) toast(err.message, "err");
  }
  if (state.view === "videos") renderVideosAdmin();
}

function renderVideosAdmin() {
  const wrap = $("#videos-list");
  $("#videos-empty").classList.toggle("is-hidden", state.videos.length > 0);
  wrap.innerHTML = state.videos
    .map(
      (v) => `
    <div class="admin-row" data-id="${esc(v.id)}">
      <div class="admin-row__info">
        <div class="admin-row__title">${esc(v.nome)}</div>
        <div class="admin-row__sub">${esc(v.categoria || "Sem categoria")}</div>
      </div>
      <div class="admin-row__actions">
        <button class="btn btn--ghost btn--sm" data-play>Assistir</button>
        <button class="btn btn--ghost btn--sm" data-edit>Editar</button>
        <button class="btn btn--danger btn--sm" data-del>Excluir</button>
      </div>
    </div>`
    )
    .join("");

  $$(".admin-row", wrap).forEach((row) => {
    const id = Number(row.dataset.id);
    const video = state.videos.find((v) => Number(v.id) === id);
    $("[data-play]", row).addEventListener("click", () => openVideoPlayer(video));
    $("[data-edit]", row).addEventListener("click", () => openVideoForm(id));
    $("[data-del]", row).addEventListener("click", () => handleDeleteVideo(id));
  });
}

function openVideoForm(id = null) {
  const form = $("#video-form");
  form.reset();
  clearErrors();
  refreshVideoCategoriaDatalist();

  const editing = id !== null;
  $("#video-form-title").textContent = editing ? "Editar vídeo" : "Novo vídeo";
  form.id.value = editing ? id : "";

  if (editing) {
    const v = state.videos.find((x) => Number(x.id) === id);
    if (v) {
      form.nome.value = v.nome || "";
      form.categoria.value = v.categoria || "";
      form.videoUrl.value = v.videoUrl || "";
    }
  }

  openModal("#video-form-modal");
}

function initVideoForm() {
  $("#new-video-btn").addEventListener("click", () => openVideoForm(null));

  $("#video-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const payload = {
      nome: f.nome.value.trim(),
      categoria: f.categoria.value.trim(),
      videoUrl: f.videoUrl.value.trim(),
    };
    if (!payload.nome || !payload.categoria || !payload.videoUrl) {
      return showFormError(f, "Preencha nome, categoria e URL do vídeo.");
    }
    const id = f.id.value;
    const btn = f.querySelector("button[type=submit]");
    await withButton(btn, "Salvando...", async () => {
      try {
        if (id) await videosApi.atualizar(Number(id), payload);
        else await videosApi.criar(payload);
        closeModal("#video-form-modal");
        toast(id ? "Vídeo atualizado!" : "Vídeo criado!");
        await loadVideos();
      } catch (err) {
        showFormError(f, err.message);
      }
    });
  });
}

async function handleDeleteVideo(id) {
  const video = state.videos.find((v) => Number(v.id) === id);
  const ok = await confirmDialog({
    title: "Excluir vídeo",
    message: `Tem certeza que deseja excluir o vídeo <strong>"${esc(video?.nome || "")}"</strong>?<br>Esta ação não pode ser desfeita.`,
    confirmText: "Excluir",
    danger: true,
  });
  if (!ok) return;
  try {
    await videosApi.deletar(id);
    state.videos = state.videos.filter((v) => Number(v.id) !== id);
    toast("Vídeo excluído.");
    renderVideosAdmin();
  } catch (err) {
    toast(err.message, "err");
  }
}

function refreshVideoCategoriaDatalist() {
  const dl = $("#video-categoria-list");
  const cats = [...new Set(state.videos.map((v) => v.categoria).filter(Boolean))];
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
  // Limpa o player para o vídeo parar de tocar ao fechar.
  if (sel === "#video-player-modal") $("#video-player-body").innerHTML = "";
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

// Modal de confirmação reutilizável — substitui o confirm() do navegador.
// Retorna uma Promise que resolve para true (confirmou) ou false (cancelou).
function confirmDialog({
  title = "Confirmar",
  message = "",
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  danger = true,
} = {}) {
  return new Promise((resolve) => {
    const modal = $("#confirm-modal");
    const okBtn = $("[data-confirm-ok]", modal);
    const cancelBtn = $("[data-confirm-cancel]", modal);

    $("#confirm-title").textContent = title;
    $("#confirm-message").innerHTML = message; // conteúdo já escapado pelo chamador
    okBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    okBtn.className = `btn ${danger ? "btn--danger" : "btn--primary"}`;

    const cleanup = (result) => {
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
      closeModal("#confirm-modal");
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = (e) => {
      if (e.target.closest("[data-close-modal]")) cleanup(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") cleanup(false);
    };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);

    openModal("#confirm-modal");
    okBtn.focus();
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
//  ASSISTENTE VIRTUAL
// ============================================================
const assistant = {
  open: false,
  loading: false,
  greeted: false,
  history: [], // [{ role: "user"|"assistant", conteudo }] — só trocas reais
};

function initAssistant() {
  $("#assistant-fab").addEventListener("click", toggleAssistant);
  $("#assistant-close").addEventListener("click", () => setAssistantOpen(false));
  $("#assistant-form").addEventListener("submit", handleAssistantSend);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && assistant.open) setAssistantOpen(false);
  });
}

function toggleAssistant() {
  setAssistantOpen(!assistant.open);
}

function setAssistantOpen(open) {
  assistant.open = open;
  $("#assistant-panel").classList.toggle("is-hidden", !open);
  $("#assistant-fab").classList.toggle("is-hidden", open);
  if (open) {
    if (!assistant.greeted) {
      assistant.greeted = true;
      const nome = state.user?.nome ? state.user.nome.split(" ")[0] : "";
      appendAssistantMsg(
        "assistant",
        `E aí${nome ? ", " + nome : ""}! 💪 Sou o assistente da Cranium. Posso ajudar com dúvidas sobre treino, dieta e como usar o app. O que você quer saber?`
      );
    }
    setTimeout(() => $("#assistant-input").focus(), 50);
  }
}

function resetAssistant() {
  assistant.history = [];
  assistant.greeted = false;
  assistant.loading = false;
  setAssistantOpen(false);
  $("#assistant-messages").innerHTML = "";
}

async function handleAssistantSend(e) {
  e.preventDefault();
  const input = $("#assistant-input");
  const texto = input.value.trim();
  if (!texto || assistant.loading) return;

  input.value = "";
  appendAssistantMsg("user", texto);
  assistant.history.push({ role: "user", conteudo: texto });
  setAssistantLoading(true);

  try {
    const res = await assistenteApi.perguntar(assistant.history);
    const resposta = res?.resposta || "Desculpe, não consegui responder agora.";
    appendAssistantMsg("assistant", resposta);
    assistant.history.push({ role: "assistant", conteudo: resposta });
  } catch (err) {
    // Não entra no histórico enviado ao modelo; só informa o usuário.
    appendAssistantMsg("assistant", err.message || "Não consegui falar com o assistente agora. Tente novamente.");
  } finally {
    setAssistantLoading(false);
  }
}

function setAssistantLoading(loading) {
  assistant.loading = loading;
  $("#assistant-input").disabled = loading;
  $("#assistant-send").disabled = loading;
  const list = $("#assistant-messages");
  const existente = $("#assistant-typing", list);
  if (loading && !existente) {
    const el = document.createElement("div");
    el.className = "amsg amsg--bot amsg--typing";
    el.id = "assistant-typing";
    el.innerHTML = "<span></span><span></span><span></span>";
    list.appendChild(el);
    list.scrollTop = list.scrollHeight;
  } else if (!loading && existente) {
    existente.remove();
  }
  if (!loading) setTimeout(() => $("#assistant-input").focus(), 30);
}

function appendAssistantMsg(role, texto) {
  const list = $("#assistant-messages");
  const el = document.createElement("div");
  el.className = `amsg amsg--${role === "user" ? "user" : "bot"}`;
  // Escapa o conteúdo, converte **negrito** e quebras de linha.
  const html = esc(texto)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
  el.innerHTML = html;
  const typing = $("#assistant-typing", list);
  if (typing) list.insertBefore(el, typing);
  else list.appendChild(el);
  list.scrollTop = list.scrollHeight;
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
  initVideoForm();
  initAssistant();

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
