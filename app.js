/* =============================================================
   HUMANIZE — App Logic
   ============================================================= */

/* Supabase config */
const SUPABASE_URL = 'https://sydvsywqbwmeqoccfkya.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5ZHZzeXdxYndtZXFvY2Nma3lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NzkzMzksImV4cCI6MjA5ODI1NTMzOX0.DJOy3TD0g2rNiY3Itdx7Un1OA71UXHZvyEx2VeF2sL8';
// Client is initialized inside init() to ensure CDN has loaded
let _supabase = null;

let DATA = { enhancement_options: [], presets: [] };

// App state
let state = {
  activeTab: 'image',
  activeSubcategory: null,
  selectedOptions: new Set(),
  selectedPreset: null,
  showAll: false,
  editMode: false,
};

const MAX_OPTIONS_VISIBLE = 8;

/* =============================================================
   INIT — Load data from Supabase (fallback to data.json)
   ============================================================= */
async function init() {
  showLoadingState(true);

  // Initialize Supabase client safely (CDN must be loaded first)
  try {
    if (window.supabase) {
      _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
  } catch(e) {
    console.warn('Supabase client init failed:', e);
  }

  try {
    if (!_supabase) throw new Error('Supabase not available');

    const [optionsRes, presetsRes] = await Promise.all([
      _supabase
        .from('enhancement_options')
        .select('*')
        .eq('is_enabled', true)
        .order('order_index', { ascending: true }),
      _supabase
        .from('presets')
        .select('*')
        .eq('is_enabled', true)
        .order('order_index', { ascending: true }),
    ]);

    if (optionsRes.error) throw optionsRes.error;
    if (presetsRes.error) throw presetsRes.error;

    DATA.enhancement_options = optionsRes.data;
    DATA.presets = presetsRes.data;

  } catch (err) {
    console.warn('Supabase unavailable, falling back to data.json:', err.message);
    try {
      const res = await fetch('data.json');
      DATA = await res.json();
    } catch (e2) {
      console.error('data.json also failed:', e2);
      DATA = { enhancement_options: [], presets: [] };
    }
  }

  showLoadingState(false);
  setupComparator();
  setupTabs();
  render();
}

function showLoadingState(loading) {
  const track = document.getElementById('presets-track');
  const list  = document.getElementById('options-list');
  if (loading) {
    if (track) track.innerHTML = '<div class="empty-msg">Carregando...</div>';
    if (list)  list.innerHTML  = '<div class="empty-msg">Carregando...</div>';
  }
}


/* =============================================================
   TABS
   ============================================================= */
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === state.activeTab) return;

      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      state.activeTab = tab;
      state.selectedOptions = new Set();
      state.selectedPreset = null;
      state.activeSubcategory = null;
      state.showAll = false;

      render();
    });
  });
}

/* =============================================================
   RENDER
   ============================================================= */
function render() {
  renderPresets();
  renderSubcategories();
  renderOptions();
  updatePrompt();
}

/* =============================================================
   PRESETS
   ============================================================= */
function renderPresets() {
  const container = document.getElementById('presets-track');
  const filtered = DATA.presets.filter(p => p.category === state.activeTab && p.is_enabled);

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-msg">Nenhum preset disponível</div>`;
    return;
  }

  container.innerHTML = filtered.map(preset => {
    const isActive = state.selectedPreset === preset.id;
    const isVideo = preset.category === 'video' || (preset.image_url || '').endsWith('.webm');
    const tagClass = isVideo ? 'tag-video' : 'tag-foto';
    const tagLabel = isVideo ? 'Vídeo' : 'Foto';
    const cleanLabel = preset.label.replace(/^\[(Foto|Vídeo|Video)\]\s*/i, '');

    let thumbHtml;
    if (preset.image_url && !preset.image_url.endsWith('.webm')) {
      thumbHtml = `<img class="preset-thumb" src="${preset.image_url}" alt="${cleanLabel}" loading="lazy"
        onerror="this.parentElement.innerHTML='<div class=preset-thumb-empty>📷</div>'">`;
    } else if (preset.image_url && preset.image_url.endsWith('.webm')) {
      thumbHtml = `<div class="preset-thumb-empty">🎥</div>`;
    } else {
      thumbHtml = `<div class="preset-thumb-empty">📷</div>`;
    }

    return `
      <div class="preset-card ${isActive ? 'active' : ''}" onclick="selectPreset('${preset.id}')">
        <span class="preset-type-tag ${tagClass}">${tagLabel}</span>
        <div class="preset-thumb-wrap">${thumbHtml}</div>
        <div class="preset-check">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M20 6 9 17l-5-5"/></svg>
        </div>
        <div class="preset-info">
          <div class="preset-name">${cleanLabel}</div>
          <div class="preset-desc">${preset.description || ''}</div>
        </div>
      </div>
    `;
  }).join('');

  updateScrollbar();
}

function selectPreset(id) {
  if (state.selectedPreset === id) {
    state.selectedPreset = null;
  } else {
    state.selectedPreset = id;
  }
  renderPresets();
  updatePrompt();
}

/* =============================================================
   SUBCATEGORIES
   ============================================================= */
function getSubcategories() {
  const options = DATA.enhancement_options.filter(o => o.category === state.activeTab && o.is_enabled);
  const subs = Array.from(new Set(options.map(o => o.subcategory)));

  return subs.sort((a, b) => {
    if (a === 'Rosto e pele') return -1;
    if (b === 'Rosto e pele') return 1;
    if (a === 'Outros') return 1;
    if (b === 'Outros') return -1;
    return a.localeCompare(b, 'pt-BR');
  });
}

function renderSubcategories() {
  const container = document.getElementById('subcategory-pills');
  const subs = getSubcategories();

  if (!state.activeSubcategory && subs.length > 0) {
    state.activeSubcategory = subs[0];
  }

  container.innerHTML = subs.map(sub => `
    <button
      class="pill ${state.activeSubcategory === sub ? 'active' : ''}"
      onclick="selectSubcategory('${sub}')"
    >${sub}</button>
  `).join('');
}

function selectSubcategory(sub) {
  state.activeSubcategory = sub;
  state.showAll = false;
  renderSubcategories();
  renderOptions();
}

/* =============================================================
   OPTIONS
   ============================================================= */
function renderOptions() {
  const container = document.getElementById('options-list');
  const showMoreBtn = document.getElementById('show-more-btn');

  const allForTab = DATA.enhancement_options.filter(o => o.category === state.activeTab && o.is_enabled);
  const filtered = state.activeSubcategory
    ? allForTab.filter(o => o.subcategory === state.activeSubcategory)
    : allForTab;

  if (!filtered.length) {
    container.innerHTML = `<div class="empty-msg">Nenhuma opção nesta subcategoria</div>`;
    showMoreBtn.style.display = 'none';
    return;
  }

  const visible = state.showAll ? filtered : filtered.slice(0, MAX_OPTIONS_VISIBLE);
  const hasMore = filtered.length > MAX_OPTIONS_VISIBLE;

  container.innerHTML = visible.map(opt => {
    const isSelected = state.selectedOptions.has(opt.id);
    return `
      <button
        class="option-row ${isSelected ? 'selected' : ''}"
        onclick="toggleOption('${opt.id}')"
      >
        <div class="opt-check">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M20 6 9 17l-5-5"/></svg>
        </div>
        <div class="opt-content">
          <div class="opt-label">${opt.label}</div>
          <div class="opt-desc">${opt.description || ''}</div>
        </div>
      </button>
    `;
  }).join('');

  if (hasMore) {
    showMoreBtn.style.display = 'flex';
    document.getElementById('show-more-text').textContent = state.showAll
      ? 'Ver menos'
      : `Ver mais (${filtered.length - MAX_OPTIONS_VISIBLE})`;
  } else {
    showMoreBtn.style.display = 'none';
  }
}

function toggleOption(id) {
  if (state.selectedOptions.has(id)) {
    state.selectedOptions.delete(id);
  } else {
    state.selectedOptions.add(id);
  }
  renderOptions();
  updatePrompt();
}

function toggleShowMore() {
  state.showAll = !state.showAll;
  renderOptions();
}

/* =============================================================
   PROMPT GENERATION
   ============================================================= */
function buildPrompt() {
  const parts = [];

  // Preset part
  if (state.selectedPreset) {
    const preset = DATA.presets.find(p => p.id === state.selectedPreset);
    if (preset) {
      const isImagePreset = preset.category === 'image';
      if (isImagePreset) {
        parts.push(`Recreate this image, making it more natural and applying: ${preset.prompt}`);
      } else {
        parts.push(preset.prompt);
      }
    }
  }

  // Options part
  if (state.selectedOptions.size > 0) {
    const optionPrompts = DATA.enhancement_options
      .filter(o => state.selectedOptions.has(o.id))
      .map(o => o.prompt);
    parts.push(...optionPrompts);
  }

  return parts.join('; ');
}

function updatePrompt() {
  const textarea = document.getElementById('prompt-textarea');
  const prompt = buildPrompt();
  textarea.value = prompt;
}

/* =============================================================
   SCROLLBAR HELPER
   ============================================================= */
function updateScrollbar() {
  const track = document.getElementById('presets-track');
  const thumb = document.getElementById('presets-scrollbar-thumb');
  if (!track || !thumb) return;
  const ratio = track.clientWidth / track.scrollWidth;
  thumb.style.width = (ratio * 100) + '%';
  track.addEventListener('scroll', () => {
    const scrollRatio = track.scrollLeft / (track.scrollWidth - track.clientWidth);
    thumb.style.left = (scrollRatio * (100 - ratio * 100)) + '%';
  }, { passive: true });
}

function scrollPresets(dir) {
  const track = document.getElementById('presets-track');
  if (!track) return;
  track.scrollBy({ left: dir * 170, behavior: 'smooth' });
}

/* =============================================================
   PROMPT ACTIONS
   ============================================================= */
function copyPrompt() {
  const textarea = document.getElementById('prompt-textarea');
  const text = textarea.value.trim();

  if (!text) {
    showToast('Nenhum prompt para copiar!', false);
    return;
  }

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btn-copy');
    btn.classList.add('copied');
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>
      Copiado!
    `;
    showToast('Prompt copiado!');
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        Copiar
      `;
    }, 2500);
  }).catch(() => {
    textarea.select();
    document.execCommand('copy');
    showToast('Prompt copiado!');
  });
}

function toggleEdit() {
  const textarea = document.getElementById('prompt-textarea');
  const btn = document.getElementById('btn-edit');
  state.editMode = !state.editMode;

  if (state.editMode) {
    textarea.removeAttribute('readonly');
    textarea.focus();
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v13a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
      Salvar
    `;
    btn.style.color = '#25F4EE';
    btn.style.borderColor = '#25F4EE';
  } else {
    textarea.setAttribute('readonly', '');
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      Editar
    `;
    btn.style.color = '';
    btn.style.borderColor = '';
    showToast('Prompt salvo!');
  }
}

function clearAll() {
  state.selectedOptions = new Set();
  state.selectedPreset = null;
  state.editMode = false;

  const textarea = document.getElementById('prompt-textarea');
  textarea.setAttribute('readonly', '');

  const editBtn = document.getElementById('btn-edit');
  editBtn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    Editar
  `;
  editBtn.style.color = '';
  editBtn.style.borderColor = '';

  render();
  showToast('Seleção limpa!');
}

/* =============================================================
   TOAST
   ============================================================= */
let toastTimeout;
function showToast(msg, success = true, color = '') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  toastMsg.textContent = msg;
  toast.style.color = color || (success ? '#25F4EE' : '#FE2C55');
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

/* =============================================================
   BEFORE / AFTER COMPARATOR
   ============================================================= */
function setupComparator() {
  const comp = document.getElementById('comparator');
  const divider = document.getElementById('comp-divider');
  const before = document.getElementById('comp-before');

  let isDragging = false;
  let startX = 0;

  function setPosition(x) {
    const rect = comp.getBoundingClientRect();
    let pct = ((x - rect.left) / rect.width) * 100;
    pct = Math.max(2, Math.min(98, pct));
    divider.style.left = pct + '%';
    before.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
  }

  // Mouse events
  comp.addEventListener('mousedown', (e) => {
    isDragging = true;
    setPosition(e.clientX);
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    setPosition(e.clientX);
  });

  window.addEventListener('mouseup', () => { isDragging = false; });

  // Touch events
  comp.addEventListener('touchstart', (e) => {
    isDragging = true;
    setPosition(e.touches[0].clientX);
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    setPosition(e.touches[0].clientX);
  }, { passive: true });

  window.addEventListener('touchend', () => { isDragging = false; });

  // Init at 40%
  setTimeout(() => {
    const rect = comp.getBoundingClientRect();
    if (rect.width > 0) {
      setPosition(rect.left + rect.width * 0.4);
    }
  }, 100);
}

/* =============================================================
   START
   ============================================================= */
document.addEventListener('DOMContentLoaded', init);
