/**
 * GitView 2.0 — GitHub Developer Analytics Platform
 * Complete client-side application using GitHub Public REST API + Fetch API
 *
 * Features:
 *  - Profile search with caching (5 min)
 *  - Repository explorer with filters + sort
 *  - Language analytics with Chart.js
 *  - Contribution heatmap (ghchart.rshah.org)
 *  - Pinned repos (top-starred fallback)
 *  - User comparison (side-by-side stats)
 *  - Favorites (localStorage)
 *  - Search history (localStorage)
 *  - Dark/Light theme (localStorage + system preference)
 *  - PDF report export (jsPDF)
 *  - Share/Copy profile link
 *  - Toast notifications
 *  - Back-to-top button
 *  - Ctrl+K keyboard shortcut
 *  - Progress bar
 *  - Stat counter animations
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS & CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

const GITHUB_API_BASE  = 'https://api.github.com';
const REPOS_PER_PAGE   = 12;
const CACHE_TTL_MS     = 5 * 60 * 1000; // 5 minutes
const MAX_HISTORY      = 8;
const MAX_FAVORITES    = 20;

const LS_KEYS = {
  THEME:     'gitview_theme',
  HISTORY:   'gitview_history',
  FAVORITES: 'gitview_favorites',
  CACHE:     'gitview_cache_',
  TOKEN:     'gitview_gh_token',
};

// Linguist language colors
const LANG_COLORS = {
  JavaScript:'#f1e05a', TypeScript:'#3178c6', Python:'#3572A5',
  Java:'#b07219', 'C++':'#f34b7d', C:'#555555', 'C#':'#178600',
  Go:'#00ADD8', Rust:'#dea584', Ruby:'#701516', PHP:'#4F5D95',
  Swift:'#F05138', Kotlin:'#A97BFF', HTML:'#e34c26', CSS:'#563d7c',
  Shell:'#89e051', Vue:'#41b883', Svelte:'#ff3e00', Dart:'#00B4AB',
  Scala:'#c22d40', Elixir:'#6e4a7e', Haskell:'#5e5086', R:'#198CE7',
  MATLAB:'#e16737', Perl:'#0298c3', Lua:'#000080', Vim:'#199f4b',
  Dockerfile:'#384d54', Makefile:'#427819', Markdown:'#083fa1',
  YAML:'#cb171e', JSON:'#292929', Groovy:'#e69f56', Nix:'#7e7eff',
  Jupyter:'#DA5B0B', Objective:'#438eff', CoffeeScript:'#244776',
  default:'#8b5cf6',
};

// ═══════════════════════════════════════════════════════════════════════════════
// APPLICATION STATE
// ═══════════════════════════════════════════════════════════════════════════════

const state = {
  currentUser:    null,     // current GitHub user object
  allRepos:       [],       // all fetched repos
  filteredRepos:  [],       // after applying filters
  displayedCount: 0,        // for pagination
  sortBy:         'updated',
  filterSearch:   '',
  filterLanguage: '',
  filterType:     '',
  filterStars:    0,
  langChart:      null,     // Chart.js instance
  repoSearchDebounce: null,
};

// ═══════════════════════════════════════════════════════════════════════════════
// DOM REFERENCES
// ═══════════════════════════════════════════════════════════════════════════════

const DOM = {
  // Search
  form:              document.getElementById('search-form'),
  input:             document.getElementById('username-input'),
  searchBtn:         document.getElementById('search-btn'),
  dataSourceBadge:   document.getElementById('data-source-badge'),

  // Sections
  welcomeSection:    document.getElementById('welcome-section'),
  loadingSection:    document.getElementById('loading-section'),
  errorSection:      document.getElementById('error-section'),
  profileSection:    document.getElementById('profile-section'),
  loaderText:        document.getElementById('loader-text'),

  // Error & Rate Limit
  errorTitle:        document.getElementById('error-title'),
  errorMessage:      document.getElementById('error-message'),
  retryBtn:          document.getElementById('retry-btn'),
  rateLimitBox:      document.getElementById('rate-limit-box'),
  errorTokenInput:   document.getElementById('error-token-input'),
  errorTokenSaveBtn: document.getElementById('error-token-save-btn'),

  // Token Modal & Nav
  tokenBtn:          document.getElementById('token-btn'),
  navRateLimit:      document.getElementById('nav-rate-limit'),
  tokenModal:        document.getElementById('token-modal'),
  closeTokenModal:   document.getElementById('close-token-modal'),
  rateStatusText:    document.getElementById('rate-status-text'),
  rateBarFill:       document.getElementById('rate-bar-fill'),
  rateResetText:     document.getElementById('rate-reset-text'),
  modalTokenInput:   document.getElementById('modal-token-input'),
  modalTokenSave:    document.getElementById('modal-token-save'),
  modalTokenRemove:  document.getElementById('modal-token-remove'),
  tokenStatusMsg:    document.getElementById('token-status-msg'),

  // Profile
  avatar:            document.getElementById('profile-avatar'),
  profileLink:       document.getElementById('profile-link'),
  profileName:       document.getElementById('profile-name'),
  profileLogin:      document.getElementById('profile-login'),
  profileBio:        document.getElementById('profile-bio'),
  profileMeta:       document.getElementById('profile-meta'),

  // Stats
  statRepos:         document.getElementById('stat-repos'),
  statFollowers:     document.getElementById('stat-followers'),
  statFollowing:     document.getElementById('stat-following'),
  statGists:         document.getElementById('stat-gists'),
  statStars:         document.getElementById('stat-stars'),
  statForks:         document.getElementById('stat-forks'),
  statLangs:         document.getElementById('stat-langs'),
  statTopRepo:       document.getElementById('stat-top-repo'),

  // Action buttons
  favoriteBtn:       document.getElementById('favorite-btn'),
  copyLinkBtn:       document.getElementById('copy-link-btn'),
  refreshBtn:        document.getElementById('refresh-btn'),
  exportPdfBtn:      document.getElementById('export-pdf-btn'),

  // Pinned
  pinnedSection:     document.getElementById('pinned-section'),
  pinnedGrid:        document.getElementById('pinned-grid'),
  pinnedNote:        document.getElementById('pinned-note'),

  // Heatmap
  heatmapSection:    document.getElementById('heatmap-section'),
  heatmapImg:        document.getElementById('heatmap-img'),
  heatmapFallback:   document.getElementById('heatmap-fallback'),

  // Repos
  repoFilters:       document.getElementById('repo-filters'),
  repoSearch:        document.getElementById('repo-search'),
  filterLanguage:    document.getElementById('filter-language'),
  filterType:        document.getElementById('filter-type'),
  filterStars:       document.getElementById('filter-stars'),
  sortSelect:        document.getElementById('sort-select'),
  resetFiltersBtn:   document.getElementById('reset-filters-btn'),
  filterResultsInfo: document.getElementById('filter-results-info'),
  reposGrid:         document.getElementById('repos-grid'),
  reposSkeleton:     document.getElementById('repos-skeleton'),
  reposEmpty:        document.getElementById('repos-empty'),
  reposEmptyMsg:     document.getElementById('repos-empty-msg'),
  loadMoreBtn:       document.getElementById('load-more-btn'),

  // Analytics
  analyticsSection:  document.getElementById('analytics-section'),
  langChart:         document.getElementById('lang-chart'),
  langBars:          document.getElementById('lang-bars'),
  analyticsSummary:  document.getElementById('analytics-summary'),

  // Favorites
  favoritesGrid:     document.getElementById('favorites-grid'),
  favoritesEmpty:    document.getElementById('favorites-empty'),

  // Compare
  compareUser1:      document.getElementById('compare-user1'),
  compareUser2:      document.getElementById('compare-user2'),
  compareBtn:        document.getElementById('compare-btn'),
  compareLoading:    document.getElementById('compare-loading'),
  compareResult:     document.getElementById('compare-result'),

  // Recent searches
  recentSearchesBar: document.getElementById('recent-searches-bar'),
  recentChips:       document.getElementById('recent-chips'),
  clearHistoryBtn:   document.getElementById('clear-history-btn'),

  // UI chrome
  progressBar:       document.getElementById('progress-bar'),
  progressFill:      document.querySelector('.progress-fill'),
  toastContainer:    document.getElementById('toast-container'),
  backToTop:         document.getElementById('back-to-top'),
  themeToggle:       document.getElementById('theme-toggle'),
  navHamburger:      document.getElementById('nav-hamburger'),
  navLinks:          document.querySelector('.nav-links'),

  // Static chips
  chips:             document.querySelectorAll('.chip'),
};

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** Format number to compact form: 1500 → 1.5k */
function formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return n.toString();
}

/** Convert ISO date to relative time string */
function timeAgo(isoDate) {
  if (!isoDate) return '';
  const diff    = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours   = Math.floor(minutes / 60);
  const days    = Math.floor(hours / 24);
  const weeks   = Math.floor(days / 7);
  const months  = Math.floor(days / 30);
  const years   = Math.floor(days / 365);
  if (years  >= 1) return `${years}y ago`;
  if (months >= 1) return `${months}mo ago`;
  if (weeks  >= 1) return `${weeks}w ago`;
  if (days   >= 1) return `${days}d ago`;
  if (hours  >= 1) return `${hours}h ago`;
  if (minutes >= 1) return `${minutes}m ago`;
  return 'just now';
}

/** Safely escape HTML to prevent XSS */
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Validate GitHub username format */
function isValidUsername(username) {
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(username);
}

/** Get language color from map */
function getLangColor(lang) {
  if (!lang) return LANG_COLORS.default;
  return LANG_COLORS[lang] || LANG_COLORS.default;
}

/** Create a safe text node element */
function createTextEl(tag, text, cls) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (cls) el.className = cls;
  return el;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS BAR
// ═══════════════════════════════════════════════════════════════════════════════

function startProgress() {
  DOM.progressBar.classList.add('active');
  DOM.progressFill.style.width = '0%';
  setTimeout(() => { DOM.progressFill.style.width = '70%'; }, 50);
}
function finishProgress() {
  DOM.progressFill.style.width = '100%';
  setTimeout(() => {
    DOM.progressBar.classList.remove('active');
    DOM.progressFill.style.width = '0%';
  }, 400);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Show a toast notification
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {number} duration ms
 */
function showToast(message, type = 'info', duration = 3500) {
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'alert');

  const iconEl = document.createElement('span');
  iconEl.textContent = icons[type] || icons.info;
  iconEl.style.cssText = 'font-weight:700; font-size:1rem; flex-shrink:0;';

  const msgEl = document.createElement('span');
  msgEl.textContent = message;

  toast.appendChild(iconEl);
  toast.appendChild(msgEl);
  DOM.toastContainer.appendChild(toast);

  const remove = () => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  };
  const t = setTimeout(remove, duration);
  toast.addEventListener('click', () => { clearTimeout(t); remove(); });
}

// ═══════════════════════════════════════════════════════════════════════════════
// THEME MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

function getCurrentTheme() {
  return localStorage.getItem(LS_KEYS.THEME) || null;
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(LS_KEYS.THEME, theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next    = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  showToast(`${next === 'dark' ? '🌙 Dark' : '☀️ Light'} mode enabled`, 'info', 2000);
  // Re-render chart with new theme colors if it exists
  if (state.langChart) {
    renderLanguageAnalytics(state.allRepos);
  }
}

function initTheme() {
  const saved = getCurrentTheme();
  if (saved) {
    applyTheme(saved);
  } else {
    // Respect system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH HISTORY
// ═══════════════════════════════════════════════════════════════════════════════

function loadSearchHistory() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEYS.HISTORY)) || [];
  } catch { return []; }
}

function saveSearchHistory(username) {
  const history = loadSearchHistory().filter(u => u.toLowerCase() !== username.toLowerCase());
  history.unshift(username);
  localStorage.setItem(LS_KEYS.HISTORY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  renderSearchHistory();
}

function clearHistory() {
  localStorage.removeItem(LS_KEYS.HISTORY);
  renderSearchHistory();
  showToast('Search history cleared', 'info', 2000);
}

function renderSearchHistory() {
  const history = loadSearchHistory();
  if (history.length === 0) {
    DOM.recentSearchesBar.classList.add('hidden');
    return;
  }
  DOM.recentSearchesBar.classList.remove('hidden');
  DOM.recentChips.innerHTML = '';
  history.forEach(username => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = username;
    btn.setAttribute('aria-label', `Load ${username}'s profile`);
    btn.addEventListener('click', () => {
      DOM.input.value = username;
      searchUser(username);
    });
    DOM.recentChips.appendChild(btn);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FAVORITES
// ═══════════════════════════════════════════════════════════════════════════════

function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEYS.FAVORITES)) || [];
  } catch { return []; }
}

function saveFavorites(favorites) {
  localStorage.setItem(LS_KEYS.FAVORITES, JSON.stringify(favorites));
}

function isFavorited(username) {
  return loadFavorites().some(f => f.login.toLowerCase() === username.toLowerCase());
}

function toggleFavorite(user) {
  let favorites = loadFavorites();
  const idx = favorites.findIndex(f => f.login.toLowerCase() === user.login.toLowerCase());
  if (idx >= 0) {
    favorites.splice(idx, 1);
    showToast(`${user.login} removed from favorites`, 'warning', 2500);
  } else {
    if (favorites.length >= MAX_FAVORITES) {
      showToast('Maximum favorites reached (20)', 'warning');
      return;
    }
    favorites.unshift({
      login:      user.login,
      name:       user.name || user.login,
      avatar_url: user.avatar_url,
      followers:  user.followers,
    });
    showToast(`${user.login} added to favorites ★`, 'success', 2500);
  }
  saveFavorites(favorites);
  updateFavoriteButton(user.login);
  renderFavorites();
}

function updateFavoriteButton(username) {
  const fav = isFavorited(username);
  DOM.favoriteBtn.classList.toggle('favorited', fav);
  const emptyIcon  = DOM.favoriteBtn.querySelector('.fav-icon-empty');
  const filledIcon = DOM.favoriteBtn.querySelector('.fav-icon-filled');
  const label      = DOM.favoriteBtn.querySelector('.fav-label');
  if (fav) {
    emptyIcon.classList.add('hidden');
    filledIcon.classList.remove('hidden');
    label.textContent = 'Favorited';
  } else {
    emptyIcon.classList.remove('hidden');
    filledIcon.classList.add('hidden');
    label.textContent = 'Add to Favorites';
  }
}

function renderFavorites() {
  const favorites = loadFavorites();
  if (favorites.length === 0) {
    DOM.favoritesEmpty.style.display = '';
    DOM.favoritesGrid.innerHTML = '';
    return;
  }
  DOM.favoritesEmpty.style.display = 'none';
  DOM.favoritesGrid.innerHTML = '';
  favorites.forEach(fav => {
    const card = document.createElement('div');
    card.className = 'favorite-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Load ${fav.login}'s profile`);

    const img = document.createElement('img');
    img.className = 'fav-avatar';
    img.src   = fav.avatar_url || '';
    img.alt   = `${escapeHTML(fav.login)}'s avatar`;
    img.loading = 'lazy';

    const name     = createTextEl('div', fav.name || fav.login, 'fav-name');
    const login    = createTextEl('div', `@${fav.login}`, 'fav-login');
    const followers = createTextEl('div', `${formatNumber(fav.followers)} followers`, 'fav-followers');

    const removeBtn = document.createElement('button');
    removeBtn.className = 'fav-remove';
    removeBtn.textContent = '✕';
    removeBtn.setAttribute('aria-label', `Remove ${fav.login} from favorites`);
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      let favs = loadFavorites();
      favs = favs.filter(f => f.login !== fav.login);
      saveFavorites(favs);
      renderFavorites();
      if (state.currentUser && state.currentUser.login === fav.login) {
        updateFavoriteButton(fav.login);
      }
      showToast(`${fav.login} removed`, 'warning', 2000);
    });

    card.appendChild(img);
    card.appendChild(name);
    card.appendChild(login);
    card.appendChild(followers);
    card.appendChild(removeBtn);

    const clickHandler = () => {
      DOM.input.value = fav.login;
      searchUser(fav.login);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    card.addEventListener('click', clickHandler);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') clickHandler(); });

    DOM.favoritesGrid.appendChild(card);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART CACHING
// ═══════════════════════════════════════════════════════════════════════════════

function getCacheKey(username) {
  return LS_KEYS.CACHE + username.toLowerCase();
}

function loadCache(username) {
  try {
    const raw = localStorage.getItem(getCacheKey(username));
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(getCacheKey(username));
      return null;
    }
    return cached;
  } catch { return null; }
}

function saveCache(username, user, repos) {
  try {
    const data = { user, repos, timestamp: Date.now() };
    localStorage.setItem(getCacheKey(username), JSON.stringify(data));
  } catch (e) {
    // Storage full — silently skip caching
    console.warn('[GitView] Could not cache data:', e.message);
  }
}

function clearCache(username) {
  localStorage.removeItem(getCacheKey(username));
}

function showDataSourceBadge(fromCache) {
  DOM.dataSourceBadge.classList.remove('hidden', 'cached', 'fresh');
  if (fromCache) {
    DOM.dataSourceBadge.classList.add('cached');
    DOM.dataSourceBadge.textContent = '⚡ Loaded from cache';
  } else {
    DOM.dataSourceBadge.classList.add('fresh');
    DOM.dataSourceBadge.textContent = '🌐 Fresh data from GitHub';
  }
  setTimeout(() => DOM.dataSourceBadge.classList.add('hidden'), 5000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GITHUB API — FETCH FUNCTIONS & TOKEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/** Build request headers including GitHub token if configured */
function getAuthHeaders() {
  const headers = { 'Accept': 'application/vnd.github+json' };
  const token = localStorage.getItem(LS_KEYS.TOKEN);
  if (token && token.trim()) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }
  return headers;
}

/** Update rate limit indicator from GitHub response headers */
function updateRateLimitFromHeaders(res) {
  const remaining = res.headers.get('x-ratelimit-remaining');
  const limit     = res.headers.get('x-ratelimit-limit');
  const resetSec  = res.headers.get('x-ratelimit-reset');
  if (remaining !== null && limit !== null) {
    updateRateLimitUI(parseInt(remaining, 10), parseInt(limit, 10), resetSec ? parseInt(resetSec, 10) : null);
  }
}

/** Update the rate limit badge in navbar and modal */
function updateRateLimitUI(remaining, limit, resetEpochSec = null) {
  const hasToken = !!localStorage.getItem(LS_KEYS.TOKEN);
  DOM.tokenBtn.classList.toggle('has-token', hasToken);

  if (DOM.navRateLimit) {
    DOM.navRateLimit.textContent = `${formatNumber(remaining)}/${formatNumber(limit)}`;
  }

  if (DOM.rateStatusText) {
    DOM.rateStatusText.textContent = `${remaining.toLocaleString()} / ${limit.toLocaleString()} remaining`;
  }

  if (DOM.rateBarFill) {
    const pct = Math.max(0, Math.min(100, Math.round((remaining / limit) * 100)));
    DOM.rateBarFill.style.width = `${pct}%`;
    DOM.rateBarFill.style.background = pct > 20
      ? 'linear-gradient(90deg, #10b981, #06b6d4)'
      : 'linear-gradient(90deg, #ef4444, #f59e0b)';
  }

  if (DOM.rateResetText && resetEpochSec) {
    const resetDate = new Date(resetEpochSec * 1000);
    const resetTimeStr = resetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    DOM.rateResetText.textContent = `Quota resets at ${resetTimeStr}`;
  }
}

/** Check rate limit using GitHub /rate_limit endpoint */
async function checkRateLimit() {
  try {
    const res = await fetch(`${GITHUB_API_BASE}/rate_limit`, { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (data.resources && data.resources.core) {
      const { remaining, limit, reset } = data.resources.core;
      updateRateLimitUI(remaining, limit, reset);
    }
  } catch (e) {
    console.warn('[GitView] Could not fetch rate limit status:', e.message);
  }
}

/**
 * Fetch a GitHub user's public profile
 * @param {string} username
 */
async function fetchGitHubUser(username) {
  const res = await fetch(`${GITHUB_API_BASE}/users/${encodeURIComponent(username)}`, {
    headers: getAuthHeaders(),
  });
  updateRateLimitFromHeaders(res);
  if (res.status === 404) throw new Error('USER_NOT_FOUND');
  if (res.status === 403) throw new Error('RATE_LIMIT');
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.json();
}

/**
 * Fetch all public repos for a user, handling pagination
 * @param {string} username
 */
async function fetchRepositories(username) {
  const allRepos = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const url = `${GITHUB_API_BASE}/users/${encodeURIComponent(username)}/repos?per_page=${perPage}&page=${page}&type=public`;
    const res = await fetch(url, {
      headers: getAuthHeaders(),
    });
    updateRateLimitFromHeaders(res);
    if (!res.ok) break;
    const repos = await res.json();
    allRepos.push(...repos);
    if (repos.length < perPage) break;
    page++;
  }
  return allRepos;
}

/**
 * Handle API errors and convert to user-friendly messages
 * @param {Error} err
 * @param {string} username
 */
function handleAPIError(err, username = '') {
  console.error('[GitView] API Error:', err);
  let title   = 'Something Went Wrong';
  let message = 'An unexpected error occurred. Please try again later.';

  if (DOM.rateLimitBox) DOM.rateLimitBox.classList.add('hidden');

  switch (err.message) {
    case 'USER_NOT_FOUND':
      title   = '404 — User Not Found';
      message = `GitHub user "${escapeHTML(username)}" does not exist. Please check the spelling and try again.`;
      break;
    case 'RATE_LIMIT':
      title   = '403 — API Rate Limit Reached';
      message = 'You have hit GitHub\'s unauthenticated limit (60 requests/hour). Unlock 5,000 requests/hour instantly below:';
      if (DOM.rateLimitBox) {
        DOM.rateLimitBox.classList.remove('hidden');
        setTimeout(() => DOM.errorTokenInput?.focus(), 100);
      }
      break;
    case 'UNAUTHORIZED':
      title   = '401 — Invalid GitHub Token';
      message = 'The saved GitHub token is invalid or expired. Please check or remove your token in API settings.';
      break;
    default:
      if (!navigator.onLine) {
        title   = 'No Internet Connection';
        message = 'Unable to connect to GitHub. Please check your internet connection and try again.';
      } else if (err.message.startsWith('HTTP_')) {
        title   = `API Error (${err.message.replace('HTTP_', '')})`;
        message = 'GitHub API returned an unexpected error. Please try again later.';
      }
  }

  DOM.errorTitle.textContent   = title;
  DOM.errorMessage.textContent = message;
  showSection('errorSection');
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

function showSection(name) {
  ['welcomeSection','loadingSection','errorSection','profileSection'].forEach(key => {
    if (DOM[key]) DOM[key].classList.toggle('hidden', key !== name);
  });
}

function setSearchLoading(isLoading) {
  DOM.searchBtn.disabled = isLoading;
  DOM.input.disabled     = isLoading;
  DOM.searchBtn.style.opacity = isLoading ? '0.6' : '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER: PROFILE
// ═══════════════════════════════════════════════════════════════════════════════

function renderProfile(user) {
  // Avatar
  DOM.avatar.src = user.avatar_url || '';
  DOM.avatar.alt = `${user.login}'s profile picture`;

  // Links & identity
  DOM.profileLink.href = user.html_url || '#';
  DOM.profileName.textContent  = user.name || user.login;
  DOM.profileLogin.textContent = `@${user.login}`;

  // Bio
  DOM.profileBio.textContent    = user.bio || '';
  DOM.profileBio.style.display  = user.bio ? '' : 'none';

  // Meta information — built safely using DOM (not innerHTML)
  DOM.profileMeta.innerHTML = '';
  const metaDefs = [
    { check: user.location,         icon: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>',           text: user.location },
    { check: user.company,          icon: '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>', text: user.company },
    { check: user.twitter_username, icon: '<path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/>', text: `@${user.twitter_username}`, href: `https://twitter.com/${user.twitter_username}` },
    { check: user.created_at,       icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', text: `Joined ${new Date(user.created_at).toLocaleDateString('en-US', { year:'numeric', month:'long' })}` },
  ];
  if (user.blog) {
    const blogUrl = user.blog.startsWith('http') ? user.blog : `https://${user.blog}`;
    metaDefs.splice(2, 0, { check: true, icon: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>', text: user.blog, href: blogUrl });
  }

  metaDefs.forEach(({ check, icon, text, href }) => {
    if (!check || !text) return;
    const span = document.createElement('span');
    span.className = 'meta-item';
    span.innerHTML = `<svg viewBox="0 0 24 24" fill="${href && icon.includes('path d="M23 3') ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" aria-hidden="true" width="14" height="14">${icon}</svg>`;
    if (href) {
      const a = document.createElement('a');
      a.href   = href;
      a.target = '_blank';
      a.rel    = 'noopener noreferrer';
      a.textContent = text;
      span.appendChild(a);
    } else {
      span.appendChild(document.createTextNode(text));
    }
    DOM.profileMeta.appendChild(span);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER: STATS with animated counter
// ═══════════════════════════════════════════════════════════════════════════════

function renderStats(user, repos) {
  const totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
  const totalForks = repos.reduce((sum, r) => sum + (r.forks_count || 0), 0);
  const languages  = new Set(repos.map(r => r.language).filter(Boolean));
  const topRepo    = repos.length
    ? repos.reduce((best, r) => r.stargazers_count > (best?.stargazers_count || 0) ? r : best, null)
    : null;

  animateCounter(DOM.statRepos,      user.public_repos  || 0);
  animateCounter(DOM.statFollowers,  user.followers     || 0);
  animateCounter(DOM.statFollowing,  user.following     || 0);
  animateCounter(DOM.statGists,      user.public_gists  || 0);
  animateCounter(DOM.statStars,      totalStars);
  animateCounter(DOM.statForks,      totalForks);
  animateCounter(DOM.statLangs,      languages.size);

  if (topRepo) {
    DOM.statTopRepo.textContent = topRepo.name;
    DOM.statTopRepo.title       = `${topRepo.name} (${formatNumber(topRepo.stargazers_count)} ★)`;
  } else {
    DOM.statTopRepo.textContent = '—';
  }
}

/** Animate a numeric counter from 0 to target */
function animateCounter(el, target) {
  if (!el) return;
  const duration = 900;
  const start    = performance.now();
  const startVal = 0;
  const update   = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3);
    const current  = Math.round(startVal + (target - startVal) * eased);
    el.textContent = formatNumber(current);
    if (progress < 1) requestAnimationFrame(update);
    else el.textContent = formatNumber(target);
  };
  requestAnimationFrame(update);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER: PINNED REPOSITORIES (top starred fallback)
// ═══════════════════════════════════════════════════════════════════════════════

function renderPinnedRepositories(repos) {
  DOM.pinnedSection.classList.remove('hidden');
  DOM.pinnedGrid.innerHTML = '';

  // Show note explaining REST API limitation
  DOM.pinnedNote.classList.remove('hidden');

  // Fallback: show top 6 by stars
  const top6 = [...repos]
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 6);

  if (top6.length === 0) {
    DOM.pinnedSection.classList.add('hidden');
    return;
  }

  top6.forEach(repo => {
    const card = document.createElement('a');
    card.href   = repo.html_url;
    card.target = '_blank';
    card.rel    = 'noopener noreferrer';
    card.className = 'pinned-card';

    const label = document.createElement('div');
    label.className = 'pinned-label';
    label.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24z"/></svg>';
    label.appendChild(document.createTextNode('Top Starred'));

    const nameEl = createTextEl('div', repo.name, 'repo-name');
    const descEl = createTextEl('p', repo.description || 'No description.', 'repo-desc');

    const footer = document.createElement('div');
    footer.className = 'repo-footer';

    if (repo.language) {
      const langEl = document.createElement('span');
      langEl.className = 'repo-lang';
      const dot = document.createElement('span');
      dot.className = 'lang-dot';
      dot.style.background = getLangColor(repo.language);
      langEl.appendChild(dot);
      langEl.appendChild(document.createTextNode(repo.language));
      footer.appendChild(langEl);
    }

    const starEl = document.createElement('span');
    starEl.className = 'repo-stat';
    starEl.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
    starEl.appendChild(document.createTextNode(formatNumber(repo.stargazers_count)));

    const forkEl = document.createElement('span');
    forkEl.className = 'repo-stat';
    forkEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>';
    forkEl.appendChild(document.createTextNode(formatNumber(repo.forks_count)));

    footer.appendChild(starEl);
    footer.appendChild(forkEl);

    card.appendChild(label);
    card.appendChild(nameEl);
    card.appendChild(descEl);
    card.appendChild(footer);
    DOM.pinnedGrid.appendChild(card);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER: CONTRIBUTION HEATMAP
// ═══════════════════════════════════════════════════════════════════════════════

function renderContributionHeatmap(username) {
  DOM.heatmapSection.classList.remove('hidden');
  DOM.heatmapImg.classList.remove('hidden');
  DOM.heatmapFallback.classList.add('hidden');

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  // ghchart.rshah.org provides a GitHub-style SVG contribution chart
  const heatmapUrl = isDark
    ? `https://ghchart.rshah.org/8b5cf6/${encodeURIComponent(username)}`
    : `https://ghchart.rshah.org/6d28d9/${encodeURIComponent(username)}`;

  DOM.heatmapImg.src = '';
  DOM.heatmapImg.alt = `${username}'s GitHub contribution heatmap`;

  DOM.heatmapImg.onload  = () => {
    DOM.heatmapImg.classList.remove('hidden');
    DOM.heatmapFallback.classList.add('hidden');
  };
  DOM.heatmapImg.onerror = () => {
    DOM.heatmapImg.classList.add('hidden');
    DOM.heatmapFallback.classList.remove('hidden');
  };

  DOM.heatmapImg.src = heatmapUrl;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPO FILTERING & SORTING
// ═══════════════════════════════════════════════════════════════════════════════

function populateLanguageFilter(repos) {
  const languages = [...new Set(repos.map(r => r.language).filter(Boolean))].sort();
  DOM.filterLanguage.innerHTML = '<option value="">All Languages</option>';
  languages.forEach(lang => {
    const opt = document.createElement('option');
    opt.value       = lang;
    opt.textContent = lang;
    DOM.filterLanguage.appendChild(opt);
  });
}

function filterRepositories(repos) {
  const search   = state.filterSearch.toLowerCase();
  const language = state.filterLanguage.toLowerCase();
  const type     = state.filterType;
  const minStars = state.filterStars;

  return repos.filter(repo => {
    if (search && !repo.name.toLowerCase().includes(search) && !(repo.description || '').toLowerCase().includes(search)) return false;
    if (language && (repo.language || '').toLowerCase() !== language) return false;
    if (type === 'fork'     && !repo.fork)  return false;
    if (type === 'original' &&  repo.fork)  return false;
    if (minStars > 0 && (repo.stargazers_count || 0) < minStars) return false;
    return true;
  });
}

function sortRepositories(repos) {
  const copy = [...repos];
  switch (state.sortBy) {
    case 'stars':     return copy.sort((a, b) => b.stargazers_count - a.stargazers_count);
    case 'forks':     return copy.sort((a, b) => b.forks_count - a.forks_count);
    case 'name':      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc': return copy.sort((a, b) => b.name.localeCompare(a.name));
    default:          return copy.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }
}

function applyFiltersAndSort(reset = true) {
  state.filteredRepos = sortRepositories(filterRepositories(state.allRepos));

  const total    = state.allRepos.length;
  const filtered = state.filteredRepos.length;
  DOM.filterResultsInfo.textContent = (filtered < total)
    ? `Showing ${filtered} of ${total} repositories`
    : `${total} repositories`;

  renderRepositories(reset);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER: REPOSITORY CARDS
// ═══════════════════════════════════════════════════════════════════════════════

function buildRepoCard(repo) {
  const card = document.createElement('a');
  card.href      = repo.html_url;
  card.target    = '_blank';
  card.rel       = 'noopener noreferrer';
  card.className = 'repo-card';
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', `${repo.name} repository`);

  // Top row: name + visibility badge
  const topDiv  = document.createElement('div');
  topDiv.className = 'repo-top';
  const nameEl  = createTextEl('span', repo.name, 'repo-name');
  const visBadge = createTextEl('span', repo.private ? 'Private' : 'Public', `repo-visibility ${repo.private ? 'private' : 'public'}`);
  if (repo.fork) {
    const forkBadge = createTextEl('span', 'Fork', 'repo-visibility private');
    forkBadge.style.cssText = 'background:rgba(6,182,212,0.1);color:#67e8f9;border-color:rgba(6,182,212,0.2)';
    topDiv.appendChild(nameEl);
    topDiv.appendChild(forkBadge);
  } else {
    topDiv.appendChild(nameEl);
    topDiv.appendChild(visBadge);
  }

  // Description
  const descEl = createTextEl('p', repo.description || 'No description provided.', 'repo-desc');

  // Topics
  let topicsEl = null;
  if (repo.topics && repo.topics.length > 0) {
    topicsEl = document.createElement('div');
    topicsEl.className = 'repo-topics';
    repo.topics.slice(0, 5).forEach(topic => {
      const tag = createTextEl('span', topic, 'topic-tag');
      topicsEl.appendChild(tag);
    });
  }

  // Footer: lang, stars, forks, updated
  const footer = document.createElement('div');
  footer.className = 'repo-footer';

  if (repo.language) {
    const langEl = document.createElement('span');
    langEl.className = 'repo-lang';
    const dot = document.createElement('span');
    dot.className = 'lang-dot';
    dot.style.background = getLangColor(repo.language);
    dot.setAttribute('aria-hidden', 'true');
    langEl.appendChild(dot);
    langEl.appendChild(document.createTextNode(repo.language));
    footer.appendChild(langEl);
  }

  const starEl = document.createElement('span');
  starEl.className = 'repo-stat';
  starEl.title = `${repo.stargazers_count} stars`;
  starEl.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  starEl.appendChild(document.createTextNode(formatNumber(repo.stargazers_count)));
  footer.appendChild(starEl);

  if (repo.forks_count > 0) {
    const forkEl = document.createElement('span');
    forkEl.className = 'repo-stat';
    forkEl.title = `${repo.forks_count} forks`;
    forkEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>';
    forkEl.appendChild(document.createTextNode(formatNumber(repo.forks_count)));
    footer.appendChild(forkEl);
  }

  const updEl = createTextEl('span', `Updated ${timeAgo(repo.updated_at)}`, 'repo-updated');
  updEl.title = `Last updated: ${new Date(repo.updated_at).toLocaleDateString()}`;
  footer.appendChild(updEl);

  card.appendChild(topDiv);
  card.appendChild(descEl);
  if (topicsEl) card.appendChild(topicsEl);
  card.appendChild(footer);

  return card;
}

function renderRepositories(reset = true) {
  if (reset) {
    DOM.reposGrid.innerHTML = '';
    state.displayedCount    = 0;
  }

  const total = state.filteredRepos.length;
  const slice = state.filteredRepos.slice(state.displayedCount, state.displayedCount + REPOS_PER_PAGE);

  if (total === 0) {
    DOM.reposEmpty.classList.remove('hidden');
    DOM.loadMoreBtn.classList.add('hidden');
    DOM.reposEmptyMsg.textContent = state.allRepos.length === 0
      ? 'This user has no public repositories.'
      : 'No repositories match your current filters.';
    return;
  }

  DOM.reposEmpty.classList.add('hidden');

  slice.forEach((repo, i) => {
    const card = buildRepoCard(repo);
    card.style.animationDelay = `${i * 0.04}s`;
    DOM.reposGrid.appendChild(card);
  });

  state.displayedCount += slice.length;

  if (state.displayedCount < total) {
    DOM.loadMoreBtn.classList.remove('hidden');
    DOM.loadMoreBtn.textContent = `Load More (${total - state.displayedCount} remaining)`;
  } else {
    DOM.loadMoreBtn.classList.add('hidden');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER: LANGUAGE ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════════

function calculateAnalytics(repos) {
  const langCounts = {};
  repos.forEach(repo => {
    if (repo.language) {
      langCounts[repo.language] = (langCounts[repo.language] || 0) + 1;
    }
  });
  const total  = Object.values(langCounts).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(langCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => ({
      lang,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
      color: getLangColor(lang),
    }));
  return { sorted, total };
}

function renderLanguageAnalytics(repos) {
  const { sorted, total } = calculateAnalytics(repos);

  if (sorted.length === 0) {
    DOM.analyticsSection.classList.add('hidden');
    return;
  }
  DOM.analyticsSection.classList.remove('hidden');

  // ── Chart.js Doughnut ──
  if (state.langChart) {
    state.langChart.destroy();
    state.langChart = null;
  }
  const top8    = sorted.slice(0, 8);
  const isDark  = document.documentElement.getAttribute('data-theme') !== 'light';
  const textClr = isDark ? '#94a3b8' : '#475569';
  const ctx     = DOM.langChart.getContext('2d');

  state.langChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels:   top8.map(d => d.lang),
      datasets: [{
        data:            top8.map(d => d.count),
        backgroundColor: top8.map(d => d.color),
        borderColor:     isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
        borderWidth:     2,
        hoverBorderWidth:3,
        hoverOffset:     6,
      }],
    },
    options: {
      responsive:  true,
      cutout:      '65%',
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.raw} repos (${Math.round((ctx.raw/total)*100)}%)`,
          },
          backgroundColor: isDark ? 'rgba(13,20,36,0.95)' : 'rgba(255,255,255,0.95)',
          titleColor:      isDark ? '#f1f5f9' : '#0f172a',
          bodyColor:       isDark ? '#94a3b8'  : '#475569',
          borderColor:     isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          borderWidth:     1,
          padding:         10,
          cornerRadius:    8,
        },
      },
      animation: { duration: 800, easing: 'easeOutQuart' },
    },
  });

  // ── Bar chart ──
  DOM.langBars.innerHTML = '';
  sorted.slice(0, 10).forEach(({ lang, count, pct, color }) => {
    const item = document.createElement('div');
    item.className = 'lang-bar-item';

    const header = document.createElement('div');
    header.className = 'lang-bar-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'lang-bar-name';
    const dot = document.createElement('span');
    dot.className = 'lang-dot';
    dot.style.background = color;
    nameSpan.appendChild(dot);
    nameSpan.appendChild(document.createTextNode(lang));

    const countSpan = createTextEl('span', `${count} repo${count !== 1 ? 's' : ''} · ${pct}%`, 'lang-bar-count');

    header.appendChild(nameSpan);
    header.appendChild(countSpan);

    const track = document.createElement('div');
    track.className = 'lang-bar-track';
    const fill = document.createElement('div');
    fill.className = 'lang-bar-fill';
    fill.style.background = color;
    fill.style.width = '0%';
    track.appendChild(fill);

    item.appendChild(header);
    item.appendChild(track);
    DOM.langBars.appendChild(item);

    // Animate bar after paint
    requestAnimationFrame(() => {
      setTimeout(() => { fill.style.width = `${pct}%`; }, 50);
    });
  });

  // ── Summary stats ──
  DOM.analyticsSummary.innerHTML = '';
  const totalStars = repos.reduce((s, r) => s + (r.stargazers_count || 0), 0);
  const totalForks = repos.reduce((s, r) => s + (r.forks_count || 0), 0);
  const forkedCount   = repos.filter(r =>  r.fork).length;
  const originalCount = repos.filter(r => !r.fork).length;
  const avgStars = repos.length ? (totalStars / repos.length).toFixed(1) : '0';

  const summaryItems = [
    { value: sorted.length,   label: 'Languages Used' },
    { value: formatNumber(totalStars), label: 'Total Stars' },
    { value: formatNumber(totalForks), label: 'Total Forks' },
    { value: originalCount,   label: 'Original Repos' },
    { value: forkedCount,     label: 'Forked Repos' },
    { value: avgStars,        label: 'Avg Stars / Repo' },
  ];

  summaryItems.forEach(({ value, label }) => {
    const div = document.createElement('div');
    div.className = 'summary-stat';
    const valEl = createTextEl('div', value, 'summary-stat-value gradient-text');
    const lblEl = createTextEl('div', label, 'summary-stat-label');
    div.appendChild(valEl);
    div.appendChild(lblEl);
    DOM.analyticsSummary.appendChild(div);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER: USER COMPARISON
// ═══════════════════════════════════════════════════════════════════════════════

async function compareUsers() {
  const u1 = DOM.compareUser1.value.trim();
  const u2 = DOM.compareUser2.value.trim();

  if (!u1 || !u2) { showToast('Please enter both usernames to compare', 'warning'); return; }
  if (u1.toLowerCase() === u2.toLowerCase()) { showToast('Please enter two different usernames', 'warning'); return; }

  DOM.compareLoading.classList.remove('hidden');
  DOM.compareResult.classList.add('hidden');
  DOM.compareResult.innerHTML = '';

  try {
    const [
      [user1, repos1Res],
      [user2, repos2Res],
    ] = await Promise.all([
      Promise.all([ fetchGitHubUser(u1), fetchRepositories(u1) ]).catch(e => [null, [], e]),
      Promise.all([ fetchGitHubUser(u2), fetchRepositories(u2) ]).catch(e => [null, [], e]),
    ]);

    DOM.compareLoading.classList.add('hidden');
    DOM.compareResult.classList.remove('hidden');

    if (!user1 && !user2) {
      DOM.compareResult.innerHTML = '<p class="compare-error">Both users could not be found. Please check the usernames.</p>';
      return;
    }

    renderComparison(
      user1, Array.isArray(repos1Res) ? repos1Res : [],
      user2, Array.isArray(repos2Res) ? repos2Res : [],
    );
  } catch (err) {
    DOM.compareLoading.classList.add('hidden');
    DOM.compareResult.classList.remove('hidden');
    DOM.compareResult.innerHTML = `<p class="compare-error">Error fetching comparison data: ${escapeHTML(err.message)}</p>`;
  }
}

function renderComparison(user1, repos1, user2, repos2) {
  const stars1  = repos1.reduce((s, r) => s + (r.stargazers_count || 0), 0);
  const stars2  = repos2.reduce((s, r) => s + (r.stargazers_count || 0), 0);
  const forks1  = repos1.reduce((s, r) => s + (r.forks_count || 0), 0);
  const forks2  = repos2.reduce((s, r) => s + (r.forks_count || 0), 0);
  const langs1  = new Set(repos1.map(r => r.language).filter(Boolean)).size;
  const langs2  = new Set(repos2.map(r => r.language).filter(Boolean)).size;
  const topRepo1 = repos1.length ? repos1.reduce((b, r) => r.stargazers_count > (b?.stargazers_count || 0) ? r : b, null) : null;
  const topRepo2 = repos2.length ? repos2.reduce((b, r) => r.stargazers_count > (b?.stargazers_count || 0) ? r : b, null) : null;
  const latestRepo1 = repos1.length ? repos1.reduce((b, r) => new Date(r.updated_at) > new Date(b?.updated_at || 0) ? r : b, null) : null;
  const latestRepo2 = repos2.length ? repos2.reduce((b, r) => new Date(r.updated_at) > new Date(b?.updated_at || 0) ? r : b, null) : null;

  /** Utility: returns 'compare-higher' class for the bigger value */
  const hi = (v1, v2, el) => el === 1 ? (v1 > v2 ? 'compare-higher' : '') : (v2 > v1 ? 'compare-higher' : '');

  const rows = [
    { label: 'Public Repos',      v1: user1 ? formatNumber(user1.public_repos) : '—', v2: user2 ? formatNumber(user2.public_repos) : '—', n1: user1?.public_repos, n2: user2?.public_repos },
    { label: 'Followers',         v1: user1 ? formatNumber(user1.followers)    : '—', v2: user2 ? formatNumber(user2.followers)    : '—', n1: user1?.followers,    n2: user2?.followers },
    { label: 'Following',         v1: user1 ? formatNumber(user1.following)    : '—', v2: user2 ? formatNumber(user2.following)    : '—', n1: user1?.following,    n2: user2?.following },
    { label: 'Public Gists',      v1: user1 ? formatNumber(user1.public_gists) : '—', v2: user2 ? formatNumber(user2.public_gists) : '—', n1: user1?.public_gists, n2: user2?.public_gists },
    { label: 'Total Stars',       v1: formatNumber(stars1), v2: formatNumber(stars2), n1: stars1, n2: stars2 },
    { label: 'Total Forks',       v1: formatNumber(forks1), v2: formatNumber(forks2), n1: forks1, n2: forks2 },
    { label: 'Languages',         v1: langs1, v2: langs2, n1: langs1, n2: langs2 },
    { label: 'Top Repo',          v1: topRepo1?.name    || '—', v2: topRepo2?.name    || '—' },
    { label: 'Most Recent Repo',  v1: latestRepo1?.name || '—', v2: latestRepo2?.name || '—' },
    { label: 'Member Since',      v1: user1 ? new Date(user1.created_at).getFullYear() : '—', v2: user2 ? new Date(user2.created_at).getFullYear() : '—' },
  ];

  const wrapper = document.createElement('div');
  wrapper.className = 'compare-table-wrapper';

  const table = document.createElement('table');
  table.className = 'compare-table';

  // Header row
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const thMetric = document.createElement('th');
  thMetric.textContent = 'Metric';

  // User 1 header
  const th1 = document.createElement('th');
  if (user1) {
    const cell = document.createElement('div');
    cell.className = 'compare-avatar-cell';
    const img1 = document.createElement('img');
    img1.src = user1.avatar_url;
    img1.alt = `${user1.login}'s avatar`;
    img1.style.cssText = 'width:52px;height:52px;border-radius:50%;border:2px solid rgba(139,92,246,0.3);display:block;margin:0 auto 6px';
    const nm1  = createTextEl('div', user1.name || user1.login, 'cmp-name');
    const lg1  = createTextEl('div', `@${user1.login}`, 'cmp-login');
    cell.appendChild(img1); cell.appendChild(nm1); cell.appendChild(lg1);
    th1.appendChild(cell);
  } else {
    th1.textContent = u1;
  }

  // User 2 header
  const th2 = document.createElement('th');
  if (user2) {
    const cell = document.createElement('div');
    cell.className = 'compare-avatar-cell';
    const img2 = document.createElement('img');
    img2.src = user2.avatar_url;
    img2.alt = `${user2.login}'s avatar`;
    img2.style.cssText = 'width:52px;height:52px;border-radius:50%;border:2px solid rgba(6,182,212,0.3);display:block;margin:0 auto 6px';
    const nm2  = createTextEl('div', user2.name || user2.login, 'cmp-name');
    const lg2  = createTextEl('div', `@${user2.login}`, 'cmp-login');
    cell.appendChild(img2); cell.appendChild(nm2); cell.appendChild(lg2);
    th2.appendChild(cell);
  } else {
    th2.textContent = u2;
  }

  headerRow.appendChild(thMetric);
  headerRow.appendChild(th1);
  headerRow.appendChild(th2);
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body rows
  const tbody = document.createElement('tbody');
  rows.forEach(row => {
    const tr  = document.createElement('tr');
    const tdL = createTextEl('td', row.label);
    const td1 = document.createElement('td');
    const td2 = document.createElement('td');
    td1.textContent = row.v1;
    td2.textContent = row.v2;
    if (row.n1 !== undefined && row.n2 !== undefined) {
      if (row.n1 > row.n2) td1.className = 'compare-higher';
      if (row.n2 > row.n1) td2.className = 'compare-higher';
    }
    tr.appendChild(tdL); tr.appendChild(td1); tr.appendChild(td2);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrapper.appendChild(table);
  DOM.compareResult.appendChild(wrapper);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARE / COPY LINK
// ═══════════════════════════════════════════════════════════════════════════════

function copyProfileLink() {
  if (!state.currentUser) { showToast('No profile loaded', 'warning'); return; }
  const url = `${location.origin}${location.pathname}#${state.currentUser.login}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url)
      .then(() => showToast('✓ Profile link copied!', 'success'))
      .catch(() => fallbackCopy(url));
  } else {
    fallbackCopy(url);
  }
}

function fallbackCopy(text) {
  const el = document.createElement('textarea');
  el.value = text;
  el.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
  document.body.appendChild(el);
  el.focus(); el.select();
  try {
    document.execCommand('copy');
    showToast('✓ Profile link copied!', 'success');
  } catch {
    showToast('Copy not supported in this browser. Copy the URL manually.', 'warning', 5000);
  }
  document.body.removeChild(el);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDF EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

async function exportPDF() {
  if (!state.currentUser) { showToast('No profile loaded to export', 'warning'); return; }
  if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
    showToast('PDF library not loaded. Check your internet connection.', 'error');
    return;
  }

  showToast('Generating PDF report...', 'info', 3000);
  const user  = state.currentUser;
  const repos  = state.allRepos;

  const { jsPDF } = window.jspdf || window;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW  = doc.internal.pageSize.getWidth();
  const margin = 18;
  const col    = pageW - margin * 2;
  let y        = margin;

  const clr = {
    purple: [139, 92, 246],
    cyan:   [6, 182, 212],
    dark:   [30, 27, 75],
    text:   [15, 23, 42],
    muted:  [100, 116, 139],
    border: [226, 232, 240],
    white:  [255, 255, 255],
  };

  const addPage = () => { doc.addPage(); y = margin; };
  const checkSpace = (needed) => { if (y + needed > doc.internal.pageSize.getHeight() - margin) addPage(); };

  // ── Header bar ──
  doc.setFillColor(...clr.dark);
  doc.rect(0, 0, pageW, 36, 'F');
  doc.setTextColor(...clr.white);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('GITHUB PROFILE REPORT', margin, 22);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.setTextColor(...clr.cyan);
  doc.text('Generated by GitView 2.0', pageW - margin, 22, { align: 'right' });
  y = 44;

  // ── Profile Identity ──
  doc.setTextColor(...clr.text);
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text(user.name || user.login, margin, y); y += 7;
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.setTextColor(...clr.purple);
  doc.text(`@${user.login}`, margin, y); y += 6;

  if (user.bio) {
    doc.setTextColor(...clr.text);
    doc.setFontSize(9.5);
    const bioLines = doc.splitTextToSize(user.bio, col);
    doc.text(bioLines, margin, y); y += bioLines.length * 5 + 3;
  }

  // ── Meta info ──
  const metaLines = [
    user.location        ? `📍 ${user.location}` : null,
    user.company         ? `🏢 ${user.company}` : null,
    user.blog            ? `🌐 ${user.blog}` : null,
    user.twitter_username? `🐦 @${user.twitter_username}` : null,
    user.created_at      ? `📅 Joined: ${new Date(user.created_at).toLocaleDateString('en-US', { year:'numeric', month:'long' })}` : null,
  ].filter(Boolean);

  if (metaLines.length) {
    doc.setFontSize(9); doc.setTextColor(...clr.muted);
    metaLines.forEach(line => { doc.text(line, margin, y); y += 5; });
  }
  y += 4;

  // ── Stats table ──
  doc.setDrawColor(...clr.border);
  doc.setFillColor(...clr.dark);
  doc.rect(margin, y, col, 8, 'F');
  doc.setTextColor(...clr.white);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('STATISTICS', margin + 3, y + 5.5);
  y += 11;

  const totalStars = repos.reduce((s, r) => s + (r.stargazers_count || 0), 0);
  const totalForks = repos.reduce((s, r) => s + (r.forks_count || 0), 0);
  const stats = [
    ['Public Repositories', user.public_repos], ['Followers', user.followers],
    ['Following', user.following], ['Public Gists', user.public_gists],
    ['Total Stars', totalStars], ['Total Forks', totalForks],
  ];
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...clr.text);
  stats.forEach(([label, val], i) => {
    const x = margin + (i % 2 === 0 ? 0 : col / 2 + 4);
    if (i % 2 === 0) { checkSpace(8); }
    doc.setFont('helvetica', 'bold');
    doc.text(label, x, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...clr.purple);
    doc.text(String(val ?? 0), x + col / 2 - 6, y, { align: 'right' });
    doc.setTextColor(...clr.text);
    if (i % 2 === 1 || i === stats.length - 1) y += 7;
  });
  y += 4;

  // ── Language Analytics ──
  const { sorted } = calculateAnalytics(repos);
  if (sorted.length > 0) {
    checkSpace(14);
    doc.setFillColor(...clr.dark);
    doc.rect(margin, y, col, 8, 'F');
    doc.setTextColor(...clr.white);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('LANGUAGE DISTRIBUTION', margin + 3, y + 5.5);
    y += 11;
    sorted.slice(0, 8).forEach(({ lang, count, pct }) => {
      checkSpace(8);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...clr.text); doc.setFontSize(9);
      doc.text(`${lang}`, margin, y);
      doc.setTextColor(...clr.purple);
      doc.text(`${count} repos · ${pct}%`, pageW - margin, y, { align: 'right' });
      doc.setTextColor(...clr.text); y += 6;
    });
    y += 4;
  }

  // ── Top Repositories ──
  const topRepos = [...repos].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 10);
  if (topRepos.length > 0) {
    checkSpace(14);
    doc.setFillColor(...clr.dark);
    doc.rect(margin, y, col, 8, 'F');
    doc.setTextColor(...clr.white);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('TOP REPOSITORIES', margin + 3, y + 5.5);
    y += 11;

    topRepos.forEach((repo) => {
      checkSpace(14);
      doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...clr.text);
      doc.text(repo.name, margin, y); y += 5;
      if (repo.description) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...clr.muted);
        const descLines = doc.splitTextToSize(repo.description, col - 8);
        doc.text(descLines, margin + 2, y); y += descLines.length * 4 + 1;
      }
      doc.setFontSize(8); doc.setTextColor(...clr.purple);
      const meta = [repo.language, `★ ${repo.stargazers_count}`, `⑂ ${repo.forks_count}`].filter(Boolean).join('  ·  ');
      doc.text(meta, margin + 2, y); y += 6;
    });
  }

  // ── Footer line ──
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pY = doc.internal.pageSize.getHeight() - 10;
    doc.setDrawColor(...clr.border);
    doc.line(margin, pY - 3, pageW - margin, pY - 3);
    doc.setFontSize(7.5); doc.setTextColor(...clr.muted);
    doc.text('Generated by GitView 2.0 · github.com', margin, pY);
    doc.text(`Page ${i} of ${pageCount}`, pageW - margin, pY, { align: 'right' });
  }

  doc.save(`github-${user.login}-report.pdf`);
  showToast('✓ PDF report downloaded!', 'success');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SEARCH FLOW
// ═══════════════════════════════════════════════════════════════════════════════

async function searchUser(username, forceRefresh = false) {
  if (!username || !username.trim()) {
    showToast('Please enter a GitHub username', 'warning');
    return;
  }
  username = username.trim();

  // Validate format
  if (!isValidUsername(username)) {
    showToast('Invalid GitHub username format', 'warning');
    return;
  }

  // Update URL hash
  history.replaceState(null, '', `#${username}`);

  setSearchLoading(true);
  startProgress();
  showSection('loadingSection');
  DOM.loaderText.textContent = `Fetching ${username}'s profile...`;

  try {
    let user, repos, fromCache = false;

    // Try cache first (unless forced refresh)
    if (!forceRefresh) {
      const cached = loadCache(username);
      if (cached) {
        user      = cached.user;
        repos     = cached.repos;
        fromCache = true;
      }
    }

    if (!user) {
      // Parallel fetch
      DOM.loaderText.textContent = 'Fetching profile & repositories...';
      [user, repos] = await Promise.all([
        fetchGitHubUser(username),
        fetchRepositories(username),
      ]);
      saveCache(username, user, repos);
    }

    // Update state
    state.currentUser = user;
    state.allRepos    = repos;
    state.sortBy      = DOM.sortSelect.value;
    state.filterSearch    = '';
    state.filterLanguage  = '';
    state.filterType      = '';
    state.filterStars     = 0;

    // Reset filter controls
    DOM.repoSearch.value    = '';
    DOM.filterLanguage.value = '';
    DOM.filterType.value    = '';
    DOM.filterStars.value   = '0';
    DOM.sortSelect.value    = 'updated';

    // Render all sections
    renderProfile(user);
    renderStats(user, repos);
    renderPinnedRepositories(repos);
    renderContributionHeatmap(user.login);

    // Populate language filter dropdown
    populateLanguageFilter(repos);

    // Show repo skeleton briefly
    DOM.reposSkeleton.classList.remove('hidden');
    DOM.reposGrid.innerHTML = '';
    await new Promise(r => setTimeout(r, 250));
    DOM.reposSkeleton.classList.add('hidden');

    applyFiltersAndSort(true);
    renderLanguageAnalytics(repos);

    // Update favorite button state
    updateFavoriteButton(user.login);

    // Save to history (only on successful load)
    saveSearchHistory(username);
    showDataSourceBadge(fromCache);

    showSection('profileSection');
    finishProgress();

  } catch (err) {
    finishProgress();
    handleAPIError(err, username);
  } finally {
    setSearchLoading(false);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BACK TO TOP
// ═══════════════════════════════════════════════════════════════════════════════

window.addEventListener('scroll', () => {
  DOM.backToTop.classList.toggle('hidden', window.scrollY < 400);
}, { passive: true });

DOM.backToTop.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════════

// Search form
DOM.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const username = DOM.input.value.trim();
  if (!username) { showToast('Please enter a GitHub username', 'warning'); return; }
  searchUser(username);
});

// Quick suggestion chips
DOM.chips.forEach(chip => {
  chip.addEventListener('click', () => {
    const username = chip.dataset.username;
    DOM.input.value = username;
    searchUser(username);
  });
});

// Retry button
DOM.retryBtn.addEventListener('click', () => {
  showSection('welcomeSection');
  DOM.input.focus();
  history.replaceState(null, '', location.pathname);
});

// Sort order
DOM.sortSelect.addEventListener('change', () => {
  state.sortBy = DOM.sortSelect.value;
  if (state.allRepos.length > 0) applyFiltersAndSort(true);
});

// Repo search (debounced)
DOM.repoSearch.addEventListener('input', () => {
  clearTimeout(state.repoSearchDebounce);
  state.repoSearchDebounce = setTimeout(() => {
    state.filterSearch = DOM.repoSearch.value;
    applyFiltersAndSort(true);
  }, 300);
});

// Language filter
DOM.filterLanguage.addEventListener('change', () => {
  state.filterLanguage = DOM.filterLanguage.value;
  applyFiltersAndSort(true);
});

// Type filter
DOM.filterType.addEventListener('change', () => {
  state.filterType = DOM.filterType.value;
  applyFiltersAndSort(true);
});

// Stars filter
DOM.filterStars.addEventListener('change', () => {
  state.filterStars = parseInt(DOM.filterStars.value, 10) || 0;
  applyFiltersAndSort(true);
});

// Reset filters
DOM.resetFiltersBtn.addEventListener('click', () => {
  state.filterSearch   = '';
  state.filterLanguage = '';
  state.filterType     = '';
  state.filterStars    = 0;
  state.sortBy         = 'updated';
  DOM.repoSearch.value     = '';
  DOM.filterLanguage.value = '';
  DOM.filterType.value     = '';
  DOM.filterStars.value    = '0';
  DOM.sortSelect.value     = 'updated';
  if (state.allRepos.length > 0) applyFiltersAndSort(true);
  showToast('Filters reset', 'info', 1500);
});

// Load more repos
DOM.loadMoreBtn.addEventListener('click', () => renderRepositories(false));

// Favorite button
DOM.favoriteBtn.addEventListener('click', () => {
  if (state.currentUser) toggleFavorite(state.currentUser);
});

// Copy link button
DOM.copyLinkBtn.addEventListener('click', copyProfileLink);

// Refresh data button
DOM.refreshBtn.addEventListener('click', () => {
  if (state.currentUser) {
    clearCache(state.currentUser.login);
    showToast('Cache cleared — refreshing...', 'info', 2000);
    searchUser(state.currentUser.login, true);
  }
});

// Export PDF button
DOM.exportPdfBtn.addEventListener('click', exportPDF);

// Compare button
DOM.compareBtn.addEventListener('click', compareUsers);

// Compare inputs: press Enter
[DOM.compareUser1, DOM.compareUser2].forEach(el => {
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') compareUsers(); });
});

// Clear history
DOM.clearHistoryBtn.addEventListener('click', clearHistory);

// Theme toggle
DOM.themeToggle.addEventListener('click', toggleTheme);

// Mobile hamburger
DOM.navHamburger.addEventListener('click', () => {
  DOM.navLinks.classList.toggle('mobile-open');
});

// Close nav on link click and smooth scroll without triggering username search
DOM.navLinks.addEventListener('click', (e) => {
  const link = e.target.closest('.nav-link');
  if (!link) return;

  DOM.navLinks.classList.remove('mobile-open');

  const targetId = (link.getAttribute('href') || '').replace('#', '');
  if (!targetId) return;

  const targetEl = document.getElementById(targetId);
  if (targetEl) {
    e.preventDefault();

    // Check if user is trying to view profile/repos/analytics before searching
    const requiresProfile = ['profile-section', 'repos-section', 'analytics-section'];
    if (requiresProfile.includes(targetId) && (!state.currentUser || DOM.profileSection.classList.contains('hidden'))) {
      showToast('Search for a GitHub user first to view this section', 'info', 3000);
      DOM.input.focus();
      return;
    }

    targetEl.scrollIntoView({ behavior: 'smooth' });
  }
});

// Ctrl+K shortcut to focus search
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    DOM.input.focus();
    DOM.input.select();
    showToast('Search focused (Ctrl+K)', 'info', 1500);
  }
  if (e.key === 'Escape') {
    DOM.navLinks.classList.remove('mobile-open');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INITIALISATION & HASH ROUTING
// ═══════════════════════════════════════════════════════════════════════════════

const INTERNAL_SECTION_IDS = new Set([
  'profile-section', 'repos-section', 'analytics-section',
  'compare-section', 'favorites-section', 'hero-section',
  'welcome-section', 'loading-section', 'error-section', 'pinned-section'
]);

function handleHashRoute() {
  const rawHash = decodeURIComponent(location.hash.slice(1)).trim();
  if (!rawHash) return;

  // Ignore internal section anchor IDs
  if (INTERNAL_SECTION_IDS.has(rawHash) || document.getElementById(rawHash)) {
    const el = document.getElementById(rawHash);
    if (el && !el.classList.contains('hidden')) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
    return;
  }

  // Auto-search user from hash: e.g. #torvalds or #u/torvalds
  let username = rawHash;
  if (username.startsWith('u/')) username = username.slice(2);
  else if (username.startsWith('user=')) username = username.slice(5);

  if (username && isValidUsername(username) && !INTERNAL_SECTION_IDS.has(username)) {
    DOM.input.value = username;
    searchUser(username);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOKEN MANAGEMENT & MODAL
// ═══════════════════════════════════════════════════════════════════════════════

function openTokenModal() {
  const currentToken = localStorage.getItem(LS_KEYS.TOKEN) || '';
  if (DOM.modalTokenInput) {
    DOM.modalTokenInput.value = currentToken ? currentToken : '';
  }
  if (DOM.modalTokenRemove) {
    DOM.modalTokenRemove.classList.toggle('hidden', !currentToken);
  }
  if (DOM.tokenStatusMsg) {
    DOM.tokenStatusMsg.textContent = currentToken
      ? '✓ Token active: 5,000 requests/hour limit unlocked'
      : 'Using unauthenticated rate limit (60 requests/hour)';
    DOM.tokenStatusMsg.className = `token-status-msg ${currentToken ? 'success' : ''}`;
  }
  DOM.tokenModal.classList.remove('hidden');
  checkRateLimit();
}

// Token button in navbar
DOM.tokenBtn.addEventListener('click', openTokenModal);

// Close modal buttons
DOM.closeTokenModal.addEventListener('click', () => {
  DOM.tokenModal.classList.add('hidden');
});
DOM.tokenModal.addEventListener('click', (e) => {
  if (e.target === DOM.tokenModal) DOM.tokenModal.classList.add('hidden');
});

// Save token from modal
DOM.modalTokenSave.addEventListener('click', () => {
  const token = DOM.modalTokenInput.value.trim();
  if (!token) {
    showToast('Please enter a GitHub token', 'warning');
    return;
  }
  localStorage.setItem(LS_KEYS.TOKEN, token);
  showToast('✓ Token saved! 5,000 requests/hour unlocked.', 'success');
  openTokenModal();
  checkRateLimit();
});

// Remove token from modal
DOM.modalTokenRemove.addEventListener('click', () => {
  localStorage.removeItem(LS_KEYS.TOKEN);
  DOM.modalTokenInput.value = '';
  showToast('Token removed. Switched to public rate limit.', 'info');
  openTokenModal();
  checkRateLimit();
});

// Quick token unlock directly from Error Section
DOM.errorTokenSaveBtn.addEventListener('click', () => {
  const token = DOM.errorTokenInput.value.trim();
  if (!token) {
    showToast('Please paste your GitHub Personal Access Token', 'warning');
    return;
  }
  localStorage.setItem(LS_KEYS.TOKEN, token);
  showToast('✓ Token activated! 5,000 requests/hour unlocked.', 'success', 3000);
  checkRateLimit();

  const userToRetry = DOM.input.value.trim() || 'rushikesh09-cod';
  DOM.input.value = userToRetry;
  searchUser(userToRetry, true);
});

// Allow pressing Enter in token inputs
DOM.errorTokenInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') DOM.errorTokenSaveBtn.click();
});
DOM.modalTokenInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') DOM.modalTokenSave.click();
});

function init() {
  // Apply saved or system theme
  initTheme();

  // Render existing favorites
  renderFavorites();

  // Render search history
  renderSearchHistory();

  // Check rate limit quota
  checkRateLimit();

  // Focus search input
  DOM.input.focus();

  // Process initial hash route if present
  handleHashRoute();
}

window.addEventListener('load', init);

// Handle hash changes (back/forward navigation)
window.addEventListener('hashchange', handleHashRoute);


