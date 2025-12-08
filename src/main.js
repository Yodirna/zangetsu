import './style.css';

// ===== Configuration =====
// Backend API URL - uses same hostname as frontend but port 3001
const API_BASE = `http://${window.location.hostname}:3001`;
console.log(`🔗 API Base URL: ${API_BASE}`);
console.log(`📍 Accessing from: ${window.location.href}`);

// ===== DOM Elements =====
const dropZone = document.getElementById('drop-zone');
const addFolderBtn = document.getElementById('add-folder-btn');
const refreshBtn = document.getElementById('refresh-btn');
const foldersBar = document.getElementById('folders-bar');
const foldersList = document.getElementById('folders-list');
const mediaGrid = document.getElementById('media-grid');
const mediaCountEl = document.getElementById('media-count');
const lightbox = document.getElementById('lightbox');
const lightboxContent = document.getElementById('lightbox-content');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxPrev = document.getElementById('lightbox-prev');
const lightboxNext = document.getElementById('lightbox-next');
const lightboxFilename = document.getElementById('lightbox-filename');
const lightboxCounter = document.getElementById('lightbox-counter');
const toolbar = document.getElementById('toolbar');
const deleteSelectedBtn = document.getElementById('delete-selected-btn');
const deleteCountSpan = document.getElementById('delete-count');
const sortBtn = document.getElementById('sort-btn');
const sortLabel = document.getElementById('sort-label');
const deleteModal = document.getElementById('delete-modal');
const deleteModalTitle = document.getElementById('delete-modal-title');
const deleteModalText = document.getElementById('delete-modal-text');
const deleteCancelBtn = document.getElementById('delete-cancel');
const deleteConfirmBtn = document.getElementById('delete-confirm');
const filterTabs = document.querySelectorAll('.filter-tab');

// Browser modal elements
const browserModal = document.getElementById('browser-modal');
const browserClose = document.getElementById('browser-close');
const browserUp = document.getElementById('browser-up');
const browserPathInput = document.getElementById('browser-path-input');
const browserGo = document.getElementById('browser-go');
const browserList = document.getElementById('browser-list');
const browserCancel = document.getElementById('browser-cancel');
const browserSelect = document.getElementById('browser-select');

// ===== State =====
let linkedFolders = [];
let allMediaFiles = [];
let mediaFiles = [];
let selectedItems = new Set();
let currentIndex = 0;
let currentFilter = 'all';
let currentSort = 'name-asc';
let currentBrowsePath = '/';

// ===== API Functions =====
async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  console.log(`🌐 API Request: ${options.method || 'GET'} ${url}`);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    console.log(`📡 API Response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const error = await response.json();
      console.error(`❌ API Error:`, error);
      throw new Error(error.error || 'API request failed');
    }
    return response.json();
  } catch (error) {
    console.error(`❌ API Fetch Error:`, error.message);
    throw error;
  }
}

async function apiGetFolders() {
  return apiFetch('/api/folders');
}

async function apiAddFolder(path) {
  return apiFetch('/api/folders', {
    method: 'POST',
    body: JSON.stringify({ path })
  });
}

async function apiRemoveFolder(id) {
  return apiFetch(`/api/folders/${id}`, { method: 'DELETE' });
}

async function apiBrowse(path) {
  return apiFetch(`/api/browse?path=${encodeURIComponent(path)}`);
}

async function apiScanFolder(path) {
  return apiFetch(`/api/scan?path=${encodeURIComponent(path)}`);
}

function getMediaUrl(filePath) {
  return `${API_BASE}/api/media?path=${encodeURIComponent(filePath)}`;
}

// ===== Lazy Loading Observer =====
const lazyLoadObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const card = entry.target;
      loadMediaContent(card);
      lazyLoadObserver.unobserve(card);
    }
  });
}, {
  root: null,
  rootMargin: '200px',
  threshold: 0
});

const videoObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const video = entry.target;
    const card = video.closest('.media-card');
    if (entry.isIntersecting) {
      video.play().catch(() => { });
      card?.classList.add('playing');
    } else {
      video.pause();
      card?.classList.remove('playing');
    }
  });
}, { threshold: 0.5 });

function loadMediaContent(card) {
  const mediaId = parseInt(card.dataset.id);
  const media = allMediaFiles.find(m => m.id === mediaId);
  if (!media) return;

  const placeholder = card.querySelector('.media-placeholder');
  if (!placeholder) return;

  if (media.type === 'video') {
    const video = document.createElement('video');
    video.src = getMediaUrl(media.path);
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'metadata';
    placeholder.replaceWith(video);
    videoObserver.observe(video);
  } else {
    const img = document.createElement('img');
    img.src = getMediaUrl(media.path);
    img.alt = media.name;
    img.loading = 'lazy';
    placeholder.replaceWith(img);
  }
  card.classList.remove('loading');
}

// ===== File Browser Modal =====
function openBrowserModal() {
  browserModal.classList.add('active');
  browseTo(currentBrowsePath);
}

function closeBrowserModal() {
  browserModal.classList.remove('active');
}

async function browseTo(path) {
  browserPathInput.value = path;
  browserList.innerHTML = '<div class="browser-loading">Loading...</div>';

  try {
    const data = await apiBrowse(path);
    currentBrowsePath = data.path;
    browserPathInput.value = data.path;
    renderBrowserList(data);
  } catch (error) {
    browserList.innerHTML = `<div class="browser-error">Error: ${error.message}</div>`;
  }
}

function renderBrowserList(data) {
  browserList.innerHTML = '';

  if (data.items.length === 0) {
    browserList.innerHTML = '<div class="browser-loading">Empty folder</div>';
    return;
  }

  data.items.forEach(item => {
    const div = document.createElement('div');
    div.className = `browser-item ${item.isDirectory ? 'directory' : 'file'}`;

    div.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        ${item.isDirectory
        ? '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'
        : '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'
      }
      </svg>
      <span class="browser-item-name">${item.name}</span>
      ${!item.isDirectory ? `<span class="browser-item-size">${formatSize(item.size)}</span>` : ''}
    `;

    if (item.isDirectory) {
      div.addEventListener('click', () => browseTo(item.path));
    }

    browserList.appendChild(div);
  });
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function selectCurrentFolder() {
  try {
    const folder = await apiAddFolder(currentBrowsePath);
    linkedFolders.push(folder);
    renderFolderChips();
    await scanFolder(folder);
    updateUI();
    closeBrowserModal();
  } catch (error) {
    alert(`Error: ${error.message}`);
  }
}

// ===== Folder Management =====
async function unlinkFolder(id) {
  try {
    await apiRemoveFolder(id);
    linkedFolders = linkedFolders.filter(f => f.id !== id);
    allMediaFiles = allMediaFiles.filter(m => m.folderId !== id);
    applyFilterAndSort();
    renderFolderChips();
    updateUI();
  } catch (error) {
    console.error('Error removing folder:', error);
  }
}

function renderFolderChips() {
  foldersList.innerHTML = '';

  linkedFolders.forEach(folder => {
    const chip = document.createElement('div');
    chip.className = 'folder-chip';
    chip.dataset.id = folder.id;
    if (folder.scanning) chip.classList.add('scanning');

    chip.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <span class="folder-name">${folder.name}</span>
      ${folder.scanning ? `<span class="scan-count">${folder.scanCount || 0}</span>` : ''}
      <button class="remove-folder" title="Remove folder">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    chip.querySelector('.remove-folder').addEventListener('click', (e) => {
      e.stopPropagation();
      unlinkFolder(folder.id);
    });

    foldersList.appendChild(chip);
  });

  foldersBar.classList.toggle('hidden', linkedFolders.length === 0);
}

// ===== Scanning =====
async function scanAllFolders() {
  for (const folder of linkedFolders) {
    await scanFolder(folder);
  }
}

async function scanFolder(folder) {
  folder.scanning = true;
  folder.scanCount = 0;
  renderFolderChips();

  try {
    const files = await apiScanFolder(folder.path);

    files.forEach((file, index) => {
      const mediaItem = {
        id: allMediaFiles.length + index,
        folderId: folder.id,
        name: file.name,
        path: file.path,
        type: file.type,
        size: file.size,
        lastModified: file.modified
      };
      allMediaFiles.push(mediaItem);
    });

    folder.scanCount = files.length;
    applyFilterAndSort();
    renderGrid();
    updateMediaCount();

  } catch (error) {
    console.error(`Error scanning folder ${folder.name}:`, error);
  } finally {
    folder.scanning = false;
    renderFolderChips();
  }
}

// ===== Filtering & Sorting =====
function applyFilterAndSort() {
  if (currentFilter === 'all') {
    mediaFiles = [...allMediaFiles];
  } else {
    mediaFiles = allMediaFiles.filter(m => m.type === currentFilter);
  }
  sortMediaFiles();
}

function sortMediaFiles() {
  switch (currentSort) {
    case 'name-asc':
      mediaFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      break;
    case 'name-desc':
      mediaFiles.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
      break;
    case 'date-newest':
      mediaFiles.sort((a, b) => b.lastModified - a.lastModified);
      break;
    case 'date-oldest':
      mediaFiles.sort((a, b) => a.lastModified - b.lastModified);
      break;
    case 'size-largest':
      mediaFiles.sort((a, b) => b.size - a.size);
      break;
    case 'size-smallest':
      mediaFiles.sort((a, b) => a.size - b.size);
      break;
    case 'type':
      mediaFiles.sort((a, b) => a.type.localeCompare(b.type));
      break;
  }
}

function updateUI() {
  updateMediaCount();

  if (linkedFolders.length > 0) {
    dropZone.classList.add('hidden');
    mediaGrid.classList.remove('hidden');
    toolbar.classList.remove('hidden');
  } else {
    dropZone.classList.remove('hidden');
    mediaGrid.classList.add('hidden');
    toolbar.classList.add('hidden');
  }
}

function updateMediaCount() {
  const videos = allMediaFiles.filter(m => m.type === 'video').length;
  const gifs = allMediaFiles.filter(m => m.type === 'gif').length;
  const images = allMediaFiles.filter(m => m.type === 'image').length;

  const parts = [];
  if (videos) parts.push(`${videos} video${videos > 1 ? 's' : ''}`);
  if (gifs) parts.push(`${gifs} GIF${gifs > 1 ? 's' : ''}`);
  if (images) parts.push(`${images} image${images > 1 ? 's' : ''}`);

  mediaCountEl.textContent = parts.join(' • ');
}

// ===== Selection =====
function toggleSelection(mediaId, event) {
  event.stopPropagation();

  if (selectedItems.has(mediaId)) {
    selectedItems.delete(mediaId);
  } else {
    selectedItems.add(mediaId);
  }

  updateCardSelection(mediaId);
  updateDeleteButton();
}

function updateCardSelection(mediaId) {
  const card = document.querySelector(`.media-card[data-id="${mediaId}"]`);
  if (card) {
    card.classList.toggle('selected', selectedItems.has(mediaId));
  }
}

function updateDeleteButton() {
  const count = selectedItems.size;
  if (count > 0) {
    deleteSelectedBtn.classList.remove('hidden');
    deleteCountSpan.textContent = `Delete (${count})`;
  } else {
    deleteSelectedBtn.classList.add('hidden');
  }
}

function clearSelection() {
  selectedItems.clear();
  document.querySelectorAll('.media-card.selected').forEach(card => {
    card.classList.remove('selected');
  });
  updateDeleteButton();
}

// ===== Deletion =====
function showDeleteModal() {
  const count = selectedItems.size;
  deleteModalTitle.textContent = `Remove ${count} item${count > 1 ? 's' : ''} from view?`;
  deleteModalText.textContent = `This will hide the selected item${count > 1 ? 's' : ''} from the gallery. Files on disk will not be deleted.`;
  deleteModal.classList.add('active');
}

function hideDeleteModal() {
  deleteModal.classList.remove('active');
}

function deleteSelectedItems() {
  allMediaFiles = allMediaFiles.filter(m => !selectedItems.has(m.id));
  selectedItems.clear();
  updateDeleteButton();
  applyFilterAndSort();
  renderGrid();
  updateMediaCount();
  hideDeleteModal();
}

// ===== Grid Rendering =====
function renderGrid() {
  mediaGrid.innerHTML = '';
  selectedItems.clear();
  updateDeleteButton();

  if (mediaFiles.length === 0 && linkedFolders.length > 0) {
    const anyScanning = linkedFolders.some(f => f.scanning);
    if (!anyScanning) {
      mediaGrid.innerHTML = '<div class="empty-state"><p>No media files found in linked folders</p></div>';
    }
    return;
  }

  mediaFiles.forEach(media => {
    const card = createMediaCard(media);
    mediaGrid.appendChild(card);
    lazyLoadObserver.observe(card);
  });
}

function createMediaCard(media) {
  const card = document.createElement('div');
  card.className = 'media-card loading';
  card.dataset.id = media.id;

  if (selectedItems.has(media.id)) {
    card.classList.add('selected');
  }

  // Selection checkbox
  const checkbox = document.createElement('div');
  checkbox.className = 'select-checkbox';
  checkbox.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  `;
  checkbox.addEventListener('click', (e) => toggleSelection(media.id, e));
  card.appendChild(checkbox);

  // Type badge
  const badge = document.createElement('span');
  badge.className = `media-type-badge ${media.type}`;
  badge.textContent = media.type === 'gif' ? 'GIF' : media.type.toUpperCase();
  card.appendChild(badge);

  // Placeholder
  const placeholder = document.createElement('div');
  placeholder.className = 'media-placeholder';
  card.appendChild(placeholder);

  if (media.type === 'video') {
    const playIndicator = document.createElement('div');
    playIndicator.className = 'play-indicator';
    playIndicator.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    card.appendChild(playIndicator);
  }

  // Filename overlay
  const filename = document.createElement('span');
  filename.className = 'media-filename';
  filename.textContent = media.name;
  card.appendChild(filename);

  // Click handler
  card.addEventListener('click', () => {
    const idx = mediaFiles.findIndex(m => m.id === media.id);
    openLightbox(idx);
  });

  return card;
}

// ===== Lightbox =====
function openLightbox(index) {
  currentIndex = index;
  updateLightboxContent();
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.remove('active');
  document.body.style.overflow = '';
  const video = lightboxContent.querySelector('video');
  if (video) video.pause();
}

function updateLightboxContent() {
  const media = mediaFiles[currentIndex];
  if (!media) return;

  lightboxContent.innerHTML = '';

  if (media.type === 'video') {
    const video = document.createElement('video');
    video.src = getMediaUrl(media.path);
    video.controls = true;
    video.autoplay = true;
    video.loop = true;
    lightboxContent.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.src = getMediaUrl(media.path);
    img.alt = media.name;
    lightboxContent.appendChild(img);
  }

  lightboxFilename.textContent = media.name;
  lightboxCounter.textContent = `${currentIndex + 1} / ${mediaFiles.length}`;
}

function navigateLightbox(direction) {
  const video = lightboxContent.querySelector('video');
  if (video) video.pause();
  currentIndex = (currentIndex + direction + mediaFiles.length) % mediaFiles.length;
  updateLightboxContent();
}

// ===== Sort & Filter =====
function toggleSortMenu() {
  sortBtn.closest('.sort-dropdown').classList.toggle('open');
}

function closeSortMenu() {
  sortBtn.closest('.sort-dropdown').classList.remove('open');
}

function setSortOption(sortValue, label) {
  currentSort = sortValue;
  sortLabel.textContent = label;
  document.querySelectorAll('.sort-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.sort === sortValue);
  });
  applyFilterAndSort();
  renderGrid();
  closeSortMenu();
}

function setFilter(filter) {
  currentFilter = filter;
  filterTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === filter);
  });
  clearSelection();
  applyFilterAndSort();
  renderGrid();
}

// ===== Event Listeners =====
addFolderBtn.addEventListener('click', openBrowserModal);

// Browser modal
browserClose.addEventListener('click', closeBrowserModal);
browserCancel.addEventListener('click', closeBrowserModal);
browserSelect.addEventListener('click', selectCurrentFolder);
browserUp.addEventListener('click', () => {
  const parent = currentBrowsePath.split('/').slice(0, -1).join('/') || '/';
  browseTo(parent);
});
browserGo.addEventListener('click', () => browseTo(browserPathInput.value));
browserPathInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') browseTo(browserPathInput.value);
});
browserModal.addEventListener('click', (e) => {
  if (e.target === browserModal) closeBrowserModal();
});

// Refresh button
refreshBtn.addEventListener('click', async () => {
  if (linkedFolders.length === 0) return;

  refreshBtn.classList.add('spinning');
  console.log('🔄 Refreshing all folders...');

  // Clear existing media and rescan
  allMediaFiles = [];
  mediaFiles = [];
  renderGrid();

  await scanAllFolders();

  refreshBtn.classList.remove('spinning');
  console.log('✅ Refresh complete');
});

// Lightbox
lightboxClose.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', () => navigateLightbox(-1));
lightboxNext.addEventListener('click', () => navigateLightbox(1));
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});

// Sort
sortBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSortMenu();
});

document.querySelectorAll('.sort-option').forEach(option => {
  option.addEventListener('click', (e) => {
    e.stopPropagation();
    setSortOption(option.dataset.sort, option.textContent);
  });
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.sort-dropdown')) {
    closeSortMenu();
  }
});

// Filter
filterTabs.forEach(tab => {
  tab.addEventListener('click', () => setFilter(tab.dataset.filter));
});

// Delete
deleteSelectedBtn.addEventListener('click', showDeleteModal);
deleteCancelBtn.addEventListener('click', hideDeleteModal);
deleteConfirmBtn.addEventListener('click', deleteSelectedItems);
deleteModal.addEventListener('click', (e) => {
  if (e.target === deleteModal) hideDeleteModal();
});

// Keyboard
document.addEventListener('keydown', (e) => {
  if (browserModal.classList.contains('active')) {
    if (e.key === 'Escape') closeBrowserModal();
    return;
  }

  if (deleteModal.classList.contains('active')) {
    if (e.key === 'Escape') hideDeleteModal();
    return;
  }

  if (lightbox.classList.contains('active')) {
    switch (e.key) {
      case 'Escape': closeLightbox(); break;
      case 'ArrowLeft': navigateLightbox(-1); break;
      case 'ArrowRight': navigateLightbox(1); break;
    }
    return;
  }

  if (e.key === 'Escape') {
    closeSortMenu();
    clearSelection();
  }
});

// ===== Initialize =====
async function init() {
  try {
    linkedFolders = await apiGetFolders();

    if (linkedFolders.length > 0) {
      renderFolderChips();
      updateUI();
      await scanAllFolders();
    }
  } catch (error) {
    console.error('Error initializing:', error);
    // Show connection error
    dropZone.querySelector('h2').textContent = 'Cannot connect to server';
    dropZone.querySelector('p').textContent = `Make sure the server is running at ${API_BASE}`;
  }

  if (linkedFolders.length === 0) {
    mediaGrid.classList.add('hidden');
  }
}

init();
