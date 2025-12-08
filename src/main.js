import './style.css';

// ===== DOM Elements =====
const dropZone = document.getElementById('drop-zone');
const folderInput = document.getElementById('folder-input');
const selectFolderBtn = document.getElementById('select-folder-btn');
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
let allMediaFiles = []; // Original list
let mediaFiles = []; // Filtered/sorted list
let selectedItems = new Set(); // Set of selected indices (from allMediaFiles)
let currentIndex = 0;
let currentFilter = 'all';
let currentSort = 'name-asc';

// ===== Supported Formats =====
const SUPPORTED_FORMATS = {
  video: ['mp4', 'webm', 'ogg', 'mov'],
  gif: ['gif'],
  image: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'bmp', 'svg']
};

// ===== Utility Functions =====
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

// ===== File Handling =====
async function handleFiles(files) {
  const fileList = Array.from(files);

  // Filter supported media files
  allMediaFiles = fileList
    .filter(file => isSupported(file.name))
    .map((file, idx) => ({
      id: idx, // Unique ID for selection tracking
      file,
      name: file.name,
      type: getMediaType(file.name),
      size: file.size,
      lastModified: file.lastModified,
      url: URL.createObjectURL(file)
    }));

  if (allMediaFiles.length === 0) {
    alert('No supported media files found in the selected folder.');
    return;
  }

  // Reset selection
  selectedItems.clear();
  updateDeleteButton();

  // Apply filter and sort
  applyFilterAndSort();

  // Update UI
  updateMediaCount();
  renderGrid();

  // Hide drop zone, show grid and toolbar
  dropZone.classList.add('hidden');
  mediaGrid.classList.remove('hidden');
  toolbar.classList.remove('hidden');
}

// ===== Filtering & Sorting =====
function applyFilterAndSort() {
  // Filter
  if (currentFilter === 'all') {
    mediaFiles = [...allMediaFiles];
  } else {
    mediaFiles = allMediaFiles.filter(m => m.type === currentFilter);
  }

  // Sort
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
    if (selectedItems.has(mediaId)) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
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
  deleteModalTitle.textContent = `Remove ${count} item${count > 1 ? 's' : ''} from gallery?`;
  deleteModalText.textContent = `This will remove the selected item${count > 1 ? 's' : ''} from view.`;
  deleteModal.classList.add('active');
}

function hideDeleteModal() {
  deleteModal.classList.remove('active');
}

function deleteSelectedItems() {
  // Remove selected items from allMediaFiles
  allMediaFiles = allMediaFiles.filter(m => !selectedItems.has(m.id));

  // Clear selection
  selectedItems.clear();
  updateDeleteButton();

  // Re-apply filter and sort
  applyFilterAndSort();

  // Update UI
  updateMediaCount();
  renderGrid();

  // Hide modal
  hideDeleteModal();

  // If no files left, show drop zone
  if (allMediaFiles.length === 0) {
    dropZone.classList.remove('hidden');
    mediaGrid.classList.add('hidden');
    toolbar.classList.add('hidden');
  }
}

// ===== Grid Rendering =====
function renderGrid() {
  mediaGrid.innerHTML = '';

  mediaFiles.forEach((media) => {
    const card = createMediaCard(media);
    mediaGrid.appendChild(card);
  });
}

function createMediaCard(media) {
  const card = document.createElement('div');
  card.className = 'media-card';
  card.dataset.id = media.id;

  // Check if this item is selected
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

    // Play indicator
    const playIndicator = document.createElement('div');
    playIndicator.className = 'play-indicator';
    playIndicator.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
    `;
    card.appendChild(playIndicator);

    // Observe for autoplay
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

  // Click handler (opens lightbox)
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

  // Pause any video in lightbox
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
  // Pause current video if any
  const video = lightboxContent.querySelector('video');
  if (video) video.pause();

  currentIndex = (currentIndex + direction + mediaFiles.length) % mediaFiles.length;
  updateLightboxContent();
}

// ===== Sort Dropdown =====
function toggleSortMenu() {
  const dropdown = sortBtn.closest('.sort-dropdown');
  dropdown.classList.toggle('open');
}

function closeSortMenu() {
  const dropdown = sortBtn.closest('.sort-dropdown');
  dropdown.classList.remove('open');
}

function setSortOption(sortValue, label) {
  currentSort = sortValue;
  sortLabel.textContent = label;

  // Update active state
  document.querySelectorAll('.sort-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.sort === sortValue);
  });

  // Re-sort and render
  applyFilterAndSort();
  renderGrid();
  closeSortMenu();
}

// ===== Filter Tabs =====
function setFilter(filter) {
  currentFilter = filter;

  // Update active state
  filterTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === filter);
  });

  // Clear selection when changing filter
  clearSelection();

  // Re-filter and render
  applyFilterAndSort();
  renderGrid();
}

// ===== Event Listeners =====

// Folder selection
selectFolderBtn.addEventListener('click', () => folderInput.click());
folderInput.addEventListener('change', (e) => handleFiles(e.target.files));

// Drag and drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');

  const items = e.dataTransfer.items;
  const files = [];

  // Handle folder drops
  for (const item of items) {
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        if (entry.isDirectory) {
          const dirFiles = await readDirectory(entry);
          files.push(...dirFiles);
        } else {
          files.push(item.getAsFile());
        }
      }
    }
  }

  if (files.length > 0) {
    handleFiles(files);
  }
});

// Read directory recursively
async function readDirectory(dirEntry) {
  const files = [];
  const reader = dirEntry.createReader();

  const readEntries = () => new Promise((resolve) => {
    reader.readEntries((entries) => resolve(entries));
  });

  let entries;
  do {
    entries = await readEntries();
    for (const entry of entries) {
      if (entry.isFile) {
        const file = await new Promise((resolve) => entry.file(resolve));
        files.push(file);
      } else if (entry.isDirectory) {
        const subFiles = await readDirectory(entry);
        files.push(...subFiles);
      }
    }
  } while (entries.length > 0);

  return files;
}

// Lightbox controls
lightboxClose.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', () => navigateLightbox(-1));
lightboxNext.addEventListener('click', () => navigateLightbox(1));

lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});

// Sort dropdown
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

// Close sort menu when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.sort-dropdown')) {
    closeSortMenu();
  }
});

// Filter tabs
filterTabs.forEach(tab => {
  tab.addEventListener('click', () => setFilter(tab.dataset.filter));
});

// Delete button
deleteSelectedBtn.addEventListener('click', showDeleteModal);
deleteCancelBtn.addEventListener('click', hideDeleteModal);
deleteConfirmBtn.addEventListener('click', deleteSelectedItems);

// Close modal on backdrop click
deleteModal.addEventListener('click', (e) => {
  if (e.target === deleteModal) hideDeleteModal();
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  // Handle delete modal
  if (deleteModal.classList.contains('active')) {
    if (e.key === 'Escape') hideDeleteModal();
    return;
  }

  // Handle lightbox
  if (lightbox.classList.contains('active')) {
    switch (e.key) {
      case 'Escape':
        closeLightbox();
        break;
      case 'ArrowLeft':
        navigateLightbox(-1);
        break;
      case 'ArrowRight':
        navigateLightbox(1);
        break;
    }
    return;
  }

  // Handle general escapes
  if (e.key === 'Escape') {
    closeSortMenu();
    clearSelection();
  }
});

// Allow dropping on body when grid is visible
document.body.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.body.addEventListener('drop', async (e) => {
  if (!dropZone.classList.contains('hidden')) return;

  e.preventDefault();
  const items = e.dataTransfer.items;
  const files = [];

  for (const item of items) {
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        if (entry.isDirectory) {
          const dirFiles = await readDirectory(entry);
          files.push(...dirFiles);
        } else {
          files.push(item.getAsFile());
        }
      }
    }
  }

  if (files.length > 0) {
    handleFiles(files);
  }
});

// Initialize - hide media grid initially
mediaGrid.classList.add('hidden');
