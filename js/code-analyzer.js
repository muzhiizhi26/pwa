/* ===== 📦 Code Archive Analyzer - Code Extraction & Indexing Module ===== */

// Define standard exclusions and inclusions
const EXCLUDE_DIRS = ['node_modules', '.git', '.github', 'dist', 'build', '.next', '.vuepress', 'out', '.idea', '.vscode', 'coverage', '.cache', 'temp', 'tmp'];
const BINARY_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'pdf', 'zip', 'tar', 'gz', 'mp3', 'wav', 'mp4', 'mov', 'avi', 'exe', 'dll', 'so', 'dylib', 'class', 'jar', 'pyc', 'db', 'sqlite', 'sqlite3', 'woff', 'woff2', 'ttf', 'eot'];
const CODE_EXTS = [
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts', 'vue', 'html', 'htm', 'css', 'scss', 'sass', 'less',
  'py', 'java', 'cpp', 'c', 'h', 'hpp', 'cc', 'cs', 'go', 'rs', 'php', 'rb', 'pl', 'sh', 'bat', 'ps1', 'sql',
  'json', 'xml', 'yaml', 'yml', 'md', 'toml', 'ini', 'env', 'config'
];

/* ===== IndexedDB Database Helper (CodeAnalyzerDB) ===== */
const CodeAnalyzerDB = (() => {
  const DB_NAME = 'MorandiCodeAnalyzerDB';
  const DB_VERSION = 1;
  let dbInstance = null;

  function open() {
    if (dbInstance) return Promise.resolve(dbInstance);
    return new Promise((resolve, reject) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('projects')) {
            db.createObjectStore('projects', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('files')) {
            const fileStore = db.createObjectStore('files', { keyPath: 'id' });
            fileStore.createIndex('projectId', 'projectId', { unique: false });
          }
          if (!db.objectStoreNames.contains('caches')) {
            db.createObjectStore('caches', { keyPath: 'id' });
          }
        };
        request.onsuccess = (e) => {
          dbInstance = e.target.result;
          resolve(dbInstance);
        };
        request.onerror = (e) => reject(e.target.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async function saveProject(project) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put(project);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getProject(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly');
      const request = tx.objectStore('projects').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(tx.error);
    });
  }

  async function listProjects() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly');
      const store = tx.objectStore('projects');
      const request = store.openCursor();
      const list = [];
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          list.push(cursor.value);
          cursor.continue();
        } else {
          // Sort descending by timestamp
          list.sort((a, b) => b.timestamp - a.timestamp);
          resolve(list);
        }
      };
      request.onerror = () => reject(tx.error);
    });
  }

  async function deleteProject(id) {
    const db = await open();
    
    // Attempt to get project metadata to extract filePaths
    let filePaths = [];
    try {
      const project = await getProject(id);
      if (project && Array.isArray(project.filePaths)) {
        filePaths = project.filePaths;
      }
    } catch (e) {
      console.warn('获取项目元数据以删除文件失败', e);
    }

    // 1. Delete project metadata
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('projects', 'readwrite');
        tx.objectStore('projects').delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('删除项目元数据失败', e);
    }

    // 2. Delete files associated with the project
    // Strategy A: delete by filePaths if available
    if (filePaths.length > 0) {
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction('files', 'readwrite');
          const store = tx.objectStore('files');
          filePaths.forEach(path => {
            store.delete(`${id}:${path}`);
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (e) {
        console.warn('通过文件路径列表删除文件失败，转用游标删除', e);
        filePaths = []; // Fallback to Strategy B
      }
    }

    // Strategy B: delete via index or full scan if Strategy A wasn't possible/successful
    if (filePaths.length === 0) {
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction('files', 'readwrite');
          const store = tx.objectStore('files');
          let hasIndex = false;
          try {
            hasIndex = store.indexNames.contains('projectId');
          } catch (err) {}

          if (hasIndex) {
            const index = store.index('projectId');
            const request = index.openCursor(IDBKeyRange.only(id));
            request.onsuccess = (e) => {
              const cursor = e.target.result;
              if (cursor) {
                cursor.delete();
                cursor.continue();
              } else {
                resolve();
              }
            };
            request.onerror = () => reject(tx.error);
          } else {
            // Full scan fallback
            const request = store.openCursor();
            request.onsuccess = (e) => {
              const cursor = e.target.result;
              if (cursor) {
                if (cursor.value.projectId === id || (typeof cursor.key === 'string' && cursor.key.startsWith(id + ':'))) {
                  cursor.delete();
                }
                cursor.continue();
              } else {
                resolve();
              }
            };
            request.onerror = () => reject(tx.error);
          }
        });
      } catch (e) {
        console.warn('使用游标清理关联文件失败', e);
      }
    }

    // 3. Delete any caches
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('caches', 'readwrite');
        const store = tx.objectStore('caches');
        const request = store.openCursor();
        request.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            if (cursor.value.projectId === id || (typeof cursor.key === 'string' && cursor.key.startsWith(id + ':'))) {
              cursor.delete();
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('删除项目缓存失败', e);
    }
  }

  async function saveFile(file) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(file);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getProjectFilesMetadata(projectId) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const index = tx.objectStore('files').index('projectId');
      const request = index.openCursor(IDBKeyRange.only(projectId));
      const files = [];
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          // Exclude massive full text content for list metadata
          const { id, projectId, path, size, isBinary } = cursor.value;
          files.push({ id, projectId, path, size, isBinary });
          cursor.continue();
        } else {
          resolve(files);
        }
      };
      request.onerror = () => reject(tx.error);
    });
  }

  async function getFile(projectId, path) {
    const db = await open();
    const id = `${projectId}:${path}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const request = tx.objectStore('files').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(tx.error);
    });
  }

  async function getProjectFilesFull(projectId) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const index = tx.objectStore('files').index('projectId');
      const request = index.openCursor(IDBKeyRange.only(projectId));
      const files = [];
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          files.push(cursor.value);
          cursor.continue();
        } else {
          resolve(files);
        }
      };
      request.onerror = () => reject(tx.error);
    });
  }

  async function saveCache(projectId, query, response) {
    const db = await open();
    const id = `${projectId}:${query}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('caches', 'readwrite');
      tx.objectStore('caches').put({ id, projectId, query, response, timestamp: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getCache(projectId, query) {
    const db = await open();
    const id = `${projectId}:${query}`;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('caches', 'readonly');
      const request = tx.objectStore('caches').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(tx.error);
    });
  }

  async function clearCaches(projectId) {
    const db = await open();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('caches', 'readwrite');
        const store = tx.objectStore('caches');
        const request = store.openCursor();
        request.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            if (cursor.value.projectId === projectId || (typeof cursor.key === 'string' && cursor.key.startsWith(projectId + ':'))) {
              cursor.delete();
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('清除缓存失败', e);
    }
  }

  return {
    saveProject,
    getProject,
    listProjects,
    deleteProject,
    saveFile,
    getProjectFilesMetadata,
    getFile,
    getProjectFilesFull,
    saveCache,
    getCache,
    clearCaches
  };
})();

/* ===== File Filtering and Classification ===== */

function getFileExtension(filename) {
  const parts = filename.split('/');
  const name = parts[parts.length - 1];
  if (!name.includes('.')) return '';
  return name.split('.').pop().toLowerCase();
}

function isExcludedPath(filePath) {
  const segments = filePath.split('/');
  // Check if any segment is an excluded directory
  for (const seg of segments) {
    if (EXCLUDE_DIRS.includes(seg)) return true;
    if (seg.startsWith('.')) return true; // Ignore hidden directories like .git, .vscode, etc.
  }
  return false;
}

function isBinaryFile(filename) {
  const ext = getFileExtension(filename);
  return BINARY_EXTS.includes(ext);
}

function isSupportedCodeFile(filename) {
  const ext = getFileExtension(filename);
  if (CODE_EXTS.includes(ext)) return true;
  // Special matches for configs like .env, webpack.config.js, etc.
  const name = filename.split('/').pop().toLowerCase();
  if (name.startsWith('.env') || name.includes('config') || name === 'dockerfile' || name === 'gemini.md' || name === 'agents.md') return true;
  return false;
}

/* ===== File Tree Generation Helper ===== */
function buildFileTree(filePaths) {
  const tree = { name: 'root', type: 'dir', children: {} };

  filePaths.forEach(path => {
    const segments = path.split('/');
    let current = tree;

    segments.forEach((seg, index) => {
      const isLast = index === segments.length - 1;
      if (!seg) return;

      if (!current.children[seg]) {
        current.children[seg] = isLast
          ? { name: seg, type: 'file', path: path }
          : { name: seg, type: 'dir', children: {} };
      }
      current = current.children[seg];
    });
  });

  // Convert map children to sorted array
  function formatNode(node) {
    if (node.type === 'file') return node;
    const sortedChildren = Object.values(node.children)
      .map(child => formatNode(child))
      .sort((a, b) => {
        // Folders first, then alphabetically
        if (a.type !== b.type) {
          return a.type === 'dir' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    return { name: node.name, type: 'dir', children: sortedChildren };
  }

  return formatNode(tree).children || [];
}

/* ===== Browser ZIP Extraction Logic ===== */
async function unzipAndIndexProject(file, onProgress, onStatus) {
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip 库未加载。请检查网络或刷新页面。');
  }

  onStatus('读取压缩文件...', 5);
  const zip = new JSZip();
  let zipData;
  try {
    zipData = await zip.loadAsync(file);
  } catch (err) {
    throw new Error('解压 ZIP 文件失败：文件损坏或格式不正确。');
  }

  const entries = Object.keys(zipData.files);
  const totalEntries = entries.length;
  let processedCount = 0;
  let savedFileCount = 0;
  const filePaths = [];
  
  const projectId = 'proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const projectName = file.name.replace(/\.zip$/i, '');

  onStatus('正在解析项目文件...', 15);

  for (const path of entries) {
    processedCount++;
    const zipEntry = zipData.files[path];

    if (zipEntry.dir) {
      continue;
    }

    // Progress update
    const percent = Math.min(95, Math.round(15 + (processedCount / totalEntries) * 75));
    if (processedCount % 5 === 0 || processedCount === totalEntries) {
      onProgress(percent);
      onStatus(`正在读取：${path.split('/').pop()} (${processedCount}/${totalEntries})`, percent);
    }

    // Apply filter
    if (isExcludedPath(path)) {
      continue;
    }

    const isBinary = isBinaryFile(path);
    const isCode = isSupportedCodeFile(path);

    if (isBinary || !isCode) {
      continue; // Skip binaries and unsupported file types
    }

    // Extract file content
    try {
      const content = await zipEntry.async('string');
      const size = zipEntry._data?.uncompressedSize || content.length;

      // Save file to IndexedDB
      await CodeAnalyzerDB.saveFile({
        id: `${projectId}:${path}`,
        projectId,
        path,
        content,
        size,
        isBinary: false
      });

      filePaths.push(path);
      savedFileCount++;
    } catch (err) {
      console.warn(`读取文件失败: ${path}`, err);
    }
  }

  if (savedFileCount === 0) {
    throw new Error('解压成功，但是没有找到任何支持的代码文件！');
  }

  // Build tree structure
  const fileTree = buildFileTree(filePaths);

  // Save project metadata
  const projectMetadata = {
    id: projectId,
    name: projectName,
    timestamp: Date.now(),
    fileCount: savedFileCount,
    fileTree: fileTree,
    filePaths: filePaths
  };

  await CodeAnalyzerDB.saveProject(projectMetadata);
  onProgress(100);
  onStatus('文件解析并索引成功！', 100);

  return projectMetadata;
}

// Export functions to global scope
window.CodeAnalyzerDB = CodeAnalyzerDB;
window.unzipAndIndexProject = unzipAndIndexProject;
window.buildFileTree = buildFileTree;
window.isSupportedCodeFile = isSupportedCodeFile;
