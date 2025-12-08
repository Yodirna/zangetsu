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
const sortMenu = document.getElementById('sort-menu');
const sortLabel = document.getElementById('sort-label');
const deleteModal = document.getElementById('delete-modal');
const deleteModalTitle = document.getElementById('delete-modal-title');
const deleteModalText = document.getElementById('delete-modal-text');
const deleteCancelBtn = document.getElementById('delete-cancel');
const deleteConfirmBtn = document.getElementById('delete-confirm');
const filterTabs = document.querySelectorAll('.filter-tab');

// ===== State =====
let linkedFolders = []; // Array of { id, name, handle }
let allMediaFiles = []; // All media from all folders
let mediaFiles = []; // Filtered/sorted list
let selectedItems = new Set();
let currentIndex = 0;
let currentFilter = 'all';
let currentSort = 'name-asc';

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

// ===== Intersection Observer for Autoplay =====
const observerOptions = {
  root: null,
  rootMargin: '0px',
  threshold: 0.5
};

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
}, observerOptions);

// ===== Folder Management =====
async function addFolder() {
  try {
    // Check if File System Access API is supported
    if (!('showDirectoryPicker' in window)) {
      alert('Your browser does not support the File System Access API. Please use Chrome, Edge, or another Chromium-based browser.');
      return;
    }

    // Show directory picker
    const handle = await window.showDirectoryPicker({
      mode: 'read'
    });

    // Check if folder is already linked
    const existingFolder = linkedFolders.find(f => f.name === handle.name);
    if (existingFolder) {
      alert(`Folder "${handle.name}" is already linked.`);
      return;
    }

    // Save to IndexedDB
    const id = await saveFolder(handle.name, handle);

    // Add to state
    const folder = { id, name: handle.name, handle };
    linkedFolders.push(folder);

    // Update UI
    renderFolderChips();
    await scanAllFolders();
    updateUI();

  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Error adding folder:', error);
    }
  }
}

async function unlinkFolder(id) {
  // Remove from IndexedDB
  await removeFolder(id);

  // Remove from state
  linkedFolders = linkedFolders.filter(f => f.id !== id);

  // Clear media from this folder and rescan
  await scanAllFolders();

  // Update UI
  renderFolderChips();
  updateUI();
}

function renderFolderChips() {
  foldersList.innerHTML = '';

  linkedFolders.forEach(folder => {
    const chip = document.createElement('div');
    chip.className = 'folder-chip';
    chip.dataset.id = folder.id;
    chip.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <span class="folder-name">${folder.name}</span>
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

  // Show/hide folders bar
  if (linkedFolders.length > 0) {
    foldersBar.classList.remove('hidden');
  } else {
    foldersBar.classList.add('hidden');
  }
}

// ===== Scanning Folders =====
async function scanAllFolders() {
  allMediaFiles = [];
  let fileId = 0;

  for (const folder of linkedFolders) {
    const chip = document.querySelector(`.folder-chip[data-id="${folder.id}"]`);
    if (chip) chip.classList.add('scanning');

    try {
      // Request permission if needed
      const permission = await folder.handle.queryPermission({ mode: 'read' });
      if (permission !== 'granted') {
        const newPermission = await folder.handle.requestPermission({ mode: 'read' });
        if (newPermission !== 'granted') {
          console.warn(`Permission denied for folder: ${folder.name}`);
          continue;
        }
      }

      // Scan the directory
      const files = await scanDirectory(folder.handle, folder.id);
      files.forEach(file => {
        file.id = fileId++;
      });
      allMediaFiles.push(...files);

    } catch (error) {
      console.error(`Error scanning folder ${folder.name}:`, error);
    } finally {
      if (chip) chip.classList.remove('scanning');
    }
  }

  // Reset selection
  selectedItems.clear();
  updateDeleteButton();

  // Apply filter and sort
  applyFilterAndSort();
}

async function scanDirectory(dirHandle, folderId) {
  const files = [];

  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      if (isSupported(entry.name)) {
        try {
          const file = await entry.getFile();
          files.push({
            folderId,
            file,
            name: file.name,
            type: getMediaType(file.name),
            size: file.size,
            lastModified: file.lastModified,
            url: URL.createObjectURL(file)
          });
        } catch (error) {
          console.error(`Error reading file ${entry.name}:`, error);
        }
      }
    } else if (entry.kind === 'directory') {
      // Recursively scan subdirectories
      const subFiles = await scanDirectory(entry, folderId);
      files.push(...subFiles);
    }
  }

  return files;
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
  renderGrid();

  if (linkedFolders.length > 0 && allMediaFiles.length > 0) {
    dropZone.classList.add('hidden');
    mediaGrid.classList.remove('hidden');
    toolbar.classList.remove('hidden');
  } else if (linkedFolders.length > 0) {
    // Has folders but no media
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

// ===== Deletion (removes from view only) =====
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
  updateMediaCount();
  renderGrid();
  hideDeleteModal();
}

// ===== Grid Rendering =====
function renderGrid() {
  mediaGrid.innerHTML = '';

  if (mediaFiles.length === 0 && linkedFolders.length > 0) {
    mediaGrid.innerHTML = `
      <div class="empty-state">
        <p>No media files found in linked folders</p>
      </div>
    `;
    return;
  }

  mediaFiles.forEach((media) => {
    const card = createMediaCard(media);
    mediaGrid.appendChild(card);
  });
}

function createMediaCard(media) {
  const card = document.createElement('div');
  card.className = 'media-card';
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

  // Media element
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
    playIndicator.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
    `;
    card.appendChild(playIndicator);
    videoObserver.observe(video);
  } else {
    const img = document.createElement('img');
    img.src = media.url;
    img.alt = media.name;
    img.loading = 'lazy';
    card.appendChild(img);
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
addFolderBtn.addEventListener('click', addFolder);

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
  // Load linked folders from IndexedDB
  try {
    linkedFolders = await getAllFolders();

    if (linkedFolders.length > 0) {
      renderFolderChips();
      await scanAllFolders();
      updateUI();
    }
  } catch (error) {
    console.error('Error initializing:', error);
  }

  // Hide grid initially if no folders
  if (linkedFolders.length === 0) {
    mediaGrid.classList.add('hidden');
  }
}

init();
