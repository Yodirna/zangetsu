import express from 'express';
import cors from 'cors';
import { readdir, stat, readFile, writeFile, access } from 'fs/promises';
import { join, basename, extname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Data file for storing linked folders
const DATA_FILE = join(__dirname, 'data', 'folders.json');

// Supported media formats
const SUPPORTED_FORMATS = {
    video: ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'],
    gif: ['.gif'],
    image: ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.bmp', '.svg']
};

function getMediaType(filename) {
    const ext = extname(filename).toLowerCase();
    if (SUPPORTED_FORMATS.video.includes(ext)) return 'video';
    if (SUPPORTED_FORMATS.gif.includes(ext)) return 'gif';
    if (SUPPORTED_FORMATS.image.includes(ext)) return 'image';
    return null;
}

function isSupported(filename) {
    return getMediaType(filename) !== null;
}

// Ensure data directory exists
async function ensureDataDir() {
    const dataDir = join(__dirname, 'data');
    try {
        await access(dataDir);
    } catch {
        const { mkdir } = await import('fs/promises');
        await mkdir(dataDir, { recursive: true });
    }
}

// Load linked folders from file
async function loadFolders() {
    try {
        await ensureDataDir();
        const data = await readFile(DATA_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

// Save linked folders to file
async function saveFolders(folders) {
    await ensureDataDir();
    await writeFile(DATA_FILE, JSON.stringify(folders, null, 2));
}

// ===== API Routes =====

// Browse a directory on the server
app.get('/api/browse', async (req, res) => {
    try {
        const requestedPath = req.query.path || '/';
        const absolutePath = resolve(requestedPath);

        // Security: prevent path traversal attacks
        if (!absolutePath.startsWith('/')) {
            return res.status(400).json({ error: 'Invalid path' });
        }

        const stats = await stat(absolutePath);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Not a directory' });
        }

        const entries = await readdir(absolutePath, { withFileTypes: true });
        const items = [];

        for (const entry of entries) {
            // Skip hidden files
            if (entry.name.startsWith('.')) continue;

            const itemPath = join(absolutePath, entry.name);
            try {
                const itemStats = await stat(itemPath);
                items.push({
                    name: entry.name,
                    path: itemPath,
                    isDirectory: entry.isDirectory(),
                    size: entry.isFile() ? itemStats.size : 0,
                    modified: itemStats.mtimeMs
                });
            } catch {
                // Skip inaccessible files
            }
        }

        // Sort: directories first, then by name
        items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });

        res.json({
            path: absolutePath,
            parent: dirname(absolutePath),
            items
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all linked folders
app.get('/api/folders', async (req, res) => {
    try {
        const folders = await loadFolders();
        res.json(folders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add a linked folder
app.post('/api/folders', async (req, res) => {
    try {
        const { path } = req.body;
        if (!path) {
            return res.status(400).json({ error: 'Path is required' });
        }

        const absolutePath = resolve(path);

        // Verify it's a valid directory
        const stats = await stat(absolutePath);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Not a directory' });
        }

        const folders = await loadFolders();

        // Check if already linked
        if (folders.find(f => f.path === absolutePath)) {
            return res.status(400).json({ error: 'Folder already linked' });
        }

        const newFolder = {
            id: Date.now(),
            name: basename(absolutePath),
            path: absolutePath
        };

        folders.push(newFolder);
        await saveFolders(folders);

        res.json(newFolder);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Remove a linked folder
app.delete('/api/folders/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        let folders = await loadFolders();
        folders = folders.filter(f => f.id !== id);
        await saveFolders(folders);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Scan a folder for media files
app.get('/api/scan', async (req, res) => {
    try {
        const folderPath = req.query.path;
        if (!folderPath) {
            return res.status(400).json({ error: 'Path is required' });
        }

        const absolutePath = resolve(folderPath);
        const mediaFiles = [];

        async function scanDir(dirPath) {
            try {
                const entries = await readdir(dirPath, { withFileTypes: true });

                for (const entry of entries) {
                    if (entry.name.startsWith('.')) continue;

                    const fullPath = join(dirPath, entry.name);

                    if (entry.isDirectory()) {
                        await scanDir(fullPath);
                    } else if (entry.isFile() && isSupported(entry.name)) {
                        try {
                            const fileStats = await stat(fullPath);
                            mediaFiles.push({
                                name: entry.name,
                                path: fullPath,
                                type: getMediaType(entry.name),
                                size: fileStats.size,
                                modified: fileStats.mtimeMs
                            });
                        } catch {
                            // Skip inaccessible files
                        }
                    }
                }
            } catch (error) {
                console.error(`Error scanning ${dirPath}:`, error.message);
            }
        }

        await scanDir(absolutePath);
        res.json(mediaFiles);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve a media file
app.get('/api/media', async (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath) {
            return res.status(400).json({ error: 'Path is required' });
        }

        const absolutePath = resolve(filePath);

        // Security check
        if (!absolutePath.startsWith('/')) {
            return res.status(400).json({ error: 'Invalid path' });
        }

        const stats = await stat(absolutePath);
        if (!stats.isFile()) {
            return res.status(400).json({ error: 'Not a file' });
        }

        // Set content type based on extension
        const ext = extname(absolutePath).toLowerCase();
        const mimeTypes = {
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.ogg': 'video/ogg',
            '.mov': 'video/quicktime',
            '.avi': 'video/x-msvideo',
            '.mkv': 'video/x-matroska',
            '.gif': 'image/gif',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.avif': 'image/avif',
            '.bmp': 'image/bmp',
            '.svg': 'image/svg+xml'
        };

        const contentType = mimeTypes[ext] || 'application/octet-stream';

        // Support range requests for video streaming
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
            const chunkSize = end - start + 1;

            const { createReadStream } = await import('fs');
            const stream = createReadStream(absolutePath, { start, end });

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': contentType
            });

            stream.pipe(res);
        } else {
            res.set({
                'Content-Type': contentType,
                'Content-Length': stats.size,
                'Accept-Ranges': 'bytes'
            });

            const { createReadStream } = await import('fs');
            createReadStream(absolutePath).pipe(res);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🖼️  Media Gallery Server running at:`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Network: http://0.0.0.0:${PORT}\n`);
});
