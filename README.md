# 🖼️ Zangetsu Media Gallery

A fast, modern web-based media gallery for browsing videos, GIFs, and images from your filesystem. Perfect for managing large media collections on a home server.

![Dark Theme](https://img.shields.io/badge/theme-dark-1a1a24)
![Node.js](https://img.shields.io/badge/node-%3E%3D18-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Features

- **🗂️ Link Folders** - Browse and permanently link folders from your server's filesystem
- **🎬 Auto-play Videos** - Videos play automatically when scrolled into view
- **🔍 Filter & Sort** - Filter by type (images, GIFs, videos) and sort by name, date, size
- **✅ Multi-select** - Select multiple items and remove them from view
- **🖥️ Remote Access** - Access your media from any device on your network
- **⚡ Lazy Loading** - Only loads media when visible for fast performance
- **🎨 Modern UI** - Beautiful dark theme with glassmorphism effects

## 📦 Installation

### Prerequisites
- Node.js 18 or higher
- npm

### Quick Start

```bash
# Clone the repository
git clone https://github.com/Yodirna/zangetsu.git
cd zangetsu

# Install dependencies
npm install

# Start the servers
npm run server &          # Backend API (port 3001)
npm run dev -- --host     # Frontend (port 5173)
```

Then open `http://YOUR_IP:5173` in your browser.

## 🚀 Usage

### Adding Folders

1. Click **"Add Folder"** in the header
2. Navigate to a folder using the file browser
3. Type a path directly (e.g., `/home/user/videos`) or click through directories
4. Click **"Select This Folder"** to link it

### Viewing Media

- **Filter** - Use the tabs (All, Pictures, GIFs, Videos) to filter by type
- **Sort** - Click "Sort by" to reorder (name, date, size, type)
- **Lightbox** - Click any item to view it fullscreen
- **Navigate** - Use arrow keys or buttons to move between items

### Managing Media

- **Select** - Click the checkbox on any item to select it
- **Multi-select** - Select multiple items
- **Remove** - Click "Delete" to remove selected items from view (doesn't delete files)
- **Refresh** - Click the 🔄 button to rescan all folders

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` `→` | Navigate in lightbox |
| `Esc` | Close lightbox/modal |
| `Esc` | Clear selection |

## 🔧 Configuration

### Ports

By default:
- Frontend: `5173`
- Backend API: `3001`

To change the backend port:
```bash
PORT=8080 node server.js
```

### Firewall

If accessing remotely, ensure ports 5173 and 3001 are open:
```bash
# UFW (Ubuntu)
sudo ufw allow 5173
sudo ufw allow 3001
```

## 📁 Project Structure

```
zangetsu/
├── server.js          # Express backend API
├── src/
│   ├── main.js        # Frontend JavaScript
│   └── style.css      # Styles
├── index.html         # Main HTML
├── data/              # Stored folder links (auto-created)
│   └── folders.json
└── package.json
```

## 🛠️ API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/browse?path=` | GET | List directory contents |
| `/api/folders` | GET | Get linked folders |
| `/api/folders` | POST | Add a linked folder |
| `/api/folders/:id` | DELETE | Remove a linked folder |
| `/api/scan?path=` | GET | Scan folder for media |
| `/api/media?path=` | GET | Serve a media file |

## 📜 License

MIT
