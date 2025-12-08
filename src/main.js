import './style.css';

// ===== DOM Elements =====
const dropZone = document.getElementById('drop-zone');
const addFolderBtn = document.getElementById('add-folder-btn');
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

// ===== State =====
let linkedFolders = [];
let allMediaFiles = []; // Stores metadata + fileEntry (not loaded blob)
let mediaFiles = []; // Filtered/sorted view
let selectedItems = new Set();
let currentIndex = 0;
let currentFilter = 'all';
let currentSort = 'name-asc';
let isScanning = false;
let scanProgress = { scanned: 0, total: 0 };

// ===== IndexedDB Setup =====
const DB_NAME = 'MediaGalleryDB';
const DB_VERSION = 1;
const STORE_NAME = 'folders';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function saveFolder(name, handle) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add({ name, handle });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllFolders() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function removeFolder(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ===== Supported Formats =====
const SUPPORTED_FORMATS = {
  video: ['mp4', 'webm', 'ogg', 'mov'],
  gif: ['gif'],
  image: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'bmp', 'svg']
};

function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

function getMediaType(filename) {
  const ext = getFileExtension(filename);
  if (SUPPORTED_FORMATS.video.includes(ext)) return 'video';
  if (SUPPORTED_FORMATS.gif.includes(ext)) return 'gif';
  if (SUPPORTED_FORMATS.image.includes(ext)) return 'image';
  return null;
}

function isSupported(filename) {
  return getMediaType(filename) !== null;
}

// ===== Lazy Loading Observer =====
// Only create blob URLs when cards become visible
const lazyLoadObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const card = entry.target;
      const mediaId = parseInt(card.dataset.id);
      loadMediaContent(mediaId, card);
      lazyLoadObserver.unobserve(card);
    }
  });
}, {
  root: null,
  rootMargin: '200px', // Pre-load slightly before visible
  threshold: 0
});

// Video autoplay observer
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

// ===== Lazy Load Media Content =====
async function loadMediaContent(mediaId, card) {
  const media = allMediaFiles.find(m => m.id === mediaId);
  if (!media || media.url) return; // Already loaded

  try {
    // Get the actual file from the file entry
    const file = await media.fileEntry.getFile();
    media.url = URL.createObjectURL(file);
    media.size = file.size;
    media.lastModified = file.lastModified;

    // Update the card content
    const placeholder = card.querySelector('.media-placeholder');
    if (placeholder) {
      if (media.type === 'video') {
        const video = document.createElement('video');
        video.src = media.url;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'metadata';
        placeholder.replaceWith(video);
        videoObserver.observe(video);
      } else {
        const img = document.createElement('img');
        img.src = media.url;
        img.alt = media.name;
        img.loading = 'lazy';
        placeholder.replaceWith(img);
      }
      card.classList.remove('loading');
    }
  } catch (error) {
    console.error(`Error loading ${media.name}:`, error);
    card.classList.add('error');
  }
}

// ===== Folder Management =====
async function addFolder() {
  try {
    if (!('showDirectoryPicker' in window)) {
      alert('Your browser does not support the File System Access API. Please use Chrome, Edge, or another Chromium-based browser.');
      return;
    }

    const handle = await window.showDirectoryPicker({ mode: 'read' });

    if (linkedFolders.find(f => f.name === handle.name)) {
      alert(`Folder "${handle.name}" is already linked.`);
      return;
    }

    const id = await saveFolder(handle.name, handle);
    const folder = { id, name: handle.name, handle };
    linkedFolders.push(folder);

    renderFolderChips();
    await scanFolder(folder);
    updateUI();

  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Error adding folder:', error);
    }
  }
}

async function unlinkFolder(id) {
  await removeFolder(id);
  linkedFolders = linkedFolders.filter(f => f.id !== id);

  // Remove media from this folder
  allMediaFiles = allMediaFiles.filter(m => m.folderId !== id);
  applyFilterAndSort();

  renderFolderChips();
  updateUI();
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

// ===== Progressive Scanning =====
async function scanAllFolders() {
  allMediaFiles = [];

  for (const folder of linkedFolders) {
    await scanFolder(folder);
  }
}

async function scanFolder(folder) {
  folder.scanning = true;
  folder.scanCount = 0;
  renderFolderChips();

  try {
    const permission = await folder.handle.queryPermission({ mode: 'read' });
    if (permission !== 'granted') {
      const newPermission = await folder.handle.requestPermission({ mode: 'read' });
      if (newPermission !== 'granted') {
        console.warn(`Permission denied for folder: ${folder.name}`);
        folder.scanning = false;
        renderFolderChips();
        return;
      }
    }

    // Scan progressively
    await scanDirectoryProgressive(folder.handle, folder);

  } catch (error) {
    console.error(`Error scanning folder ${folder.name}:`, error);
  } finally {
    folder.scanning = false;
    renderFolderChips();
  }
}

async function scanDirectoryProgressive(dirHandle, folder) {
  const batchSize = 50; // Process in batches for better UI responsiveness
  let batch = [];

  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      if (isSupported(entry.name)) {
        const mediaItem = {
          id: allMediaFiles.length,
          folderId: folder.id,
          fileEntry: entry, // Store file entry, not file itself
          name: entry.name,
          type: getMediaType(entry.name),
          url: null, // Will be created lazily
          size: 0,
          lastModified: 0
        };

        allMediaFiles.push(mediaItem);
        batch.push(mediaItem);
        folder.scanCount = (folder.scanCount || 0) + 1;

        // Update UI in batches
        if (batch.length >= batchSize) {
          applyFilterAndSort();
          renderGridIncremental(batch);
          updateMediaCount();
          updateFolderScanCount(folder);
          batch = [];

          // Yield to allow UI to update
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    } else if (entry.kind === 'directory') {
      await scanDirectoryProgressive(entry, folder);
    }
  }

  // Process remaining items
  if (batch.length > 0) {
    applyFilterAndSort();
    renderGridIncremental(batch);
    updateMediaCount();
    updateFolderScanCount(folder);
  }
}

function updateFolderScanCount(folder) {
  const chip = document.querySelector(`.folder-chip[data-id="${folder.id}"]`);
  if (chip) {
    const countEl = chip.querySelector('.scan-count');
    if (countEl) {
      countEl.textContent = folder.scanCount;
    }
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
      mediaGrid.innerHTML = `<div class="empty-state"><p>No media files found in linked folders</p></div>`;
    }
    return;
  }

  mediaFiles.forEach(media => {
    const card = createMediaCard(media);
    mediaGrid.appendChild(card);
    lazyLoadObserver.observe(card);
  });
}

function renderGridIncremental(newItems) {
  // On first items, ensure grid is visible
  if (mediaGrid.classList.contains('hidden') && linkedFolders.length > 0) {
    dropZone.classList.add('hidden');
    mediaGrid.classList.remove('hidden');
    toolbar.classList.remove('hidden');
  }

  // Only add cards for items that match current filter
  const filteredNewItems = currentFilter === 'all'
    ? newItems
    : newItems.filter(m => m.type === currentFilter);

  filteredNewItems.forEach(media => {
    // Check if card already exists
    if (!document.querySelector(`.media-card[data-id="${media.id}"]`)) {
      const card = createMediaCard(media);
      mediaGrid.appendChild(card);
      lazyLoadObserver.observe(card);
    }
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

  // Placeholder (will be replaced when loaded)
  if (media.url) {
    // Already loaded
    card.classList.remove('loading');
    if (media.type === 'video') {
      const video = document.createElement('video');
      video.src = media.url;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'metadata';
      card.appendChild(video);

      const playIndicator = document.createElement('div');
      playIndicator.className = 'play-indicator';
      playIndicator.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
      card.appendChild(playIndicator);
      videoObserver.observe(video);
    } else {
      const img = document.createElement('img');
      img.src = media.url;
      img.alt = media.name;
      img.loading = 'lazy';
      card.appendChild(img);
    }
  } else {
    // Placeholder - content will be loaded lazily
    const placeholder = document.createElement('div');
    placeholder.className = 'media-placeholder';
    card.appendChild(placeholder);

    if (media.type === 'video') {
      const playIndicator = document.createElement('div');
      playIndicator.className = 'play-indicator';
      playIndicator.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
      card.appendChild(playIndicator);
    }
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
async function openLightbox(index) {
  currentIndex = index;
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
  await updateLightboxContent();
}

function closeLightbox() {
  lightbox.classList.remove('active');
  document.body.style.overflow = '';
  const video = lightboxContent.querySelector('video');
  if (video) video.pause();
}

async function updateLightboxContent() {
  const media = mediaFiles[currentIndex];
  if (!media) return;

  // Load if not already loaded
  if (!media.url) {
    try {
      const file = await media.fileEntry.getFile();
      media.url = URL.createObjectURL(file);
      media.size = file.size;
      media.lastModified = file.lastModified;
    } catch (error) {
      console.error('Error loading for lightbox:', error);
      return;
    }
  }

  lightboxContent.innerHTML = '';

  if (media.type === 'video') {
    const video = document.createElement('video');
    video.src = media.url;
    video.controls = true;
    video.autoplay = true;
    video.loop = true;
    lightboxContent.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.src = media.url;
    img.alt = media.name;
    lightboxContent.appendChild(img);
  }

  lightboxFilename.textContent = media.name;
  lightboxCounter.textContent = `${currentIndex + 1} / ${mediaFiles.length}`;
}

async function navigateLightbox(direction) {
  const video = lightboxContent.querySelector('video');
  if (video) video.pause();
  currentIndex = (currentIndex + direction + mediaFiles.length) % mediaFiles.length;
  await updateLightboxContent();
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
addFolderBtn.addEventListener('click', addFolder);

lightboxClose.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', () => navigateLightbox(-1));
lightboxNext.addEventListener('click', () => navigateLightbox(1));
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});

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

filterTabs.forEach(tab => {
  tab.addEventListener('click', () => setFilter(tab.dataset.filter));
});

deleteSelectedBtn.addEventListener('click', showDeleteModal);
deleteCancelBtn.addEventListener('click', hideDeleteModal);
deleteConfirmBtn.addEventListener('click', deleteSelectedItems);
deleteModal.addEventListener('click', (e) => {
  if (e.target === deleteModal) hideDeleteModal();
});

document.addEventListener('keydown', (e) => {
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
    linkedFolders = await getAllFolders();

    if (linkedFolders.length > 0) {
      renderFolderChips();
      updateUI();
      await scanAllFolders();
    }
  } catch (error) {
    console.error('Error initializing:', error);
  }

  if (linkedFolders.length === 0) {
    mediaGrid.classList.add('hidden');
  }
}

init();
