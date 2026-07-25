/* ===== 📦 Code Archive Analyzer - Project Structure & Context Management Module ===== */

// Global State
let caActiveProject = null;
let caPinnedPaths = new Set(); // Stores paths of files that are manually pinned
let caChatHistory = []; // Local chat history for code analyzer

/* ===== Initialization & Modal Toggles ===== */
function openCodeAnalyzer() {
  document.getElementById('codeAnalyzerPanel').classList.add('show');
  document.getElementById('actionMenu').classList.remove('show');
  
  // Initialize dropdown and project list
  refreshCaProjects();
  
  // Set up mobile drawer toggler
  setupCaMobileSidebar();
}

function closeCodeAnalyzer() {
  document.getElementById('codeAnalyzerPanel').classList.remove('show');
}

// Add sidebar toggle button to header for mobile view
function setupCaMobileSidebar() {
  const header = document.querySelector('#codeAnalyzerPanel .cf-header');
  if (header && !document.getElementById('caSidebarToggleBtn')) {
    const leftContainer = header.querySelector('div') || header;
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'caSidebarToggleBtn';
    toggleBtn.className = 'icon-btn mobile-only';
    toggleBtn.style.marginRight = '8px';
    toggleBtn.innerHTML = '📁';
    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      const sidebar = document.getElementById('caSidebar');
      if (sidebar) sidebar.classList.toggle('show-drawer');
    };
    header.insertBefore(toggleBtn, header.firstChild);
    
    // Close sidebar drawer when clicking outside on mobile
    const mainWorkspace = document.querySelector('#codeAnalyzerPanel .ca-workspace');
    if (mainWorkspace) {
      mainWorkspace.onclick = () => {
        const sidebar = document.getElementById('caSidebar');
        if (sidebar && sidebar.classList.contains('show-drawer')) {
          sidebar.classList.remove('show-drawer');
        }
      };
    }
  }
}

/* ===== Project Dropdown & Metadata Loader ===== */
async function refreshCaProjects() {
  try {
    const select = document.getElementById('caProjectSelect');
    if (!select) return;
    
    const projects = await CodeAnalyzerDB.listProjects();
    select.innerHTML = '<option value="">-- 选择已解析项目 --</option>';
    
    projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.fileCount}个文件)`;
      select.appendChild(opt);
    });

    if (caActiveProject) {
      select.value = caActiveProject.id;
    } else if (projects.length > 0) {
      // Auto-load latest project
      select.value = projects[0].id;
      loadCaProject(projects[0].id);
    } else {
      resetCaWorkspace();
    }
  } catch (err) {
    console.error('刷新项目列表失败', err);
  }
}

async function onCaProjectChange(projectId) {
  if (!projectId) {
    resetCaWorkspace();
    return;
  }
  await loadCaProject(projectId);
}

async function loadCaProject(projectId) {
  try {
    const proj = await CodeAnalyzerDB.getProject(projectId);
    if (!proj) return;
    
    caActiveProject = proj;
    caPinnedPaths.clear();
    
    // Reset conversation history for the new project
    caChatHistory = [];
    renderCaChat();
    
    // Render file tree
    renderCaFileTree(proj.fileTree);
    
    // Show stats
    document.getElementById('caStatFiles').textContent = proj.fileCount;
    updateCaPinStats();
    
    document.getElementById('caProjectSelect').value = projectId;
    document.getElementById('caSuggestionChips').style.display = 'flex';
  } catch (err) {
    showToast('❌ 加载项目失败: ' + err.message);
  }
}

function resetCaWorkspace() {
  caActiveProject = null;
  caPinnedPaths.clear();
  caChatHistory = [];
  
  document.getElementById('caFileTree').innerHTML = `
    <div class="ca-empty-tree-tip">请在顶部点击 📤 上传一个 ZIP 压缩包项目，或选择已解析项目。</div>
  `;
  document.getElementById('caStatFiles').textContent = '0';
  document.getElementById('caStatPinned').textContent = '0';
  document.getElementById('caStatTokens').textContent = '0';
  document.getElementById('caSuggestionChips').style.display = 'none';
  
  const chatMessages = document.getElementById('caChatMessages');
  chatMessages.innerHTML = `
    <div class="ca-welcome-msg">
        <h3>👋 欢迎使用代码压缩包分析助手</h3>
        <p>上传 ZIP 代码压缩包后，我会在前端解析所有的源文件结构，并基于您的提问<b>动态、智能地检索相关代码段</b>进行精确分析。这样既能理解大型项目的架构，又不会超出 AI 的上下文限制。</p>
        <ul>
            <li><b>纯前端解压：</b> 您的代码绝不会上传到任何文件存储服务器，完全安全私密。</li>
            <li><b>智能上下文聚焦：</b> 结合“目录结构 RAG 索引”与“关联性检索”，自动抓取关键模块。</li>
            <li><b>手动钉选支持：</b> 展开左侧文件树，点击 📌 确保该文件常驻上下文。</li>
        </ul>
    </div>
  `;
}

async function deleteCurrentCaProject() {
  if (!caActiveProject) {
    showToast('未选择任何项目');
    return;
  }
  
  if (!confirm(`确定要彻底删除项目「${caActiveProject.name}」吗？所有的文件索引和分析缓存将被清空。`)) {
    return;
  }
  
  try {
    const pid = caActiveProject.id;
    await CodeAnalyzerDB.deleteProject(pid);
    caActiveProject = null;
    showToast('🗑️ 项目已成功删除');
    await refreshCaProjects();
  } catch (err) {
    showToast('删除项目失败: ' + err.message);
  }
}

/* ===== File Tree Renderer ===== */
function renderCaFileTree(fileTree) {
  const container = document.getElementById('caFileTree');
  if (!container) return;
  container.innerHTML = '';
  
  function createTreeHTML(nodes) {
    const ul = document.createElement('ul');
    ul.className = 'ca-tree-node';
    ul.style.listStyle = 'none';
    ul.style.paddingLeft = '10px';
    
    nodes.forEach(node => {
      const li = document.createElement('li');
      const itemDiv = document.createElement('div');
      itemDiv.className = 'ca-tree-item';
      
      const icon = node.type === 'dir' ? '📁' : '📄';
      const label = document.createElement('span');
      label.textContent = `${icon} ${node.name}`;
      itemDiv.appendChild(label);
      
      if (node.type === 'file') {
        const pinSpan = document.createElement('span');
        pinSpan.className = 'node-pin';
        pinSpan.textContent = '📌';
        pinSpan.title = '钉选该文件到 AI 分析上下文';
        
        if (caPinnedPaths.has(node.path)) {
          pinSpan.classList.add('pinned');
        }
        
        pinSpan.onclick = (e) => {
          e.stopPropagation();
          toggleCaPin(node.path, pinSpan);
        };
        
        itemDiv.appendChild(pinSpan);
        
        // Clicking the item triggers file preview
        itemDiv.onclick = () => {
          previewCodeFile(node.path);
        };
      } else {
        // Directory toggle expansion
        let expanded = true;
        const subTreeContainer = document.createElement('div');
        
        // Folder pin button to recursively select/deselect all files inside
        const folderPin = document.createElement('span');
        folderPin.className = 'node-pin folder-pin';
        folderPin.textContent = '📌';
        folderPin.title = '全选/取消全选 该目录下所有文件';
        
        const childPaths = getAllFilePathsUnderDir(node);
        const allPinned = childPaths.length > 0 && childPaths.every(p => caPinnedPaths.has(p));
        if (allPinned) {
          folderPin.classList.add('pinned');
        }
        
        folderPin.onclick = (e) => {
          e.stopPropagation();
          toggleFolderCaPins(node, folderPin);
        };
        
        itemDiv.appendChild(folderPin);
        
        itemDiv.onclick = () => {
          expanded = !expanded;
          subTreeContainer.style.display = expanded ? 'block' : 'none';
          label.textContent = `${expanded ? '📁' : '📁'} ${node.name}`; // Keep folder icon clean
        };
        
        li.appendChild(itemDiv);
        
        const subTree = createTreeHTML(node.children);
        subTreeContainer.appendChild(subTree);
        li.appendChild(subTreeContainer);
        ul.appendChild(li);
        return;
      }
      
      li.appendChild(itemDiv);
      ul.appendChild(li);
    });
    
    return ul;
  }
  
  const treeDOM = createTreeHTML(fileTree);
  container.appendChild(treeDOM);
}

function toggleCaPin(path, el) {
  if (caPinnedPaths.has(path)) {
    caPinnedPaths.delete(path);
    el.classList.remove('pinned');
    showToast('📌 取消钉选文件: ' + path.split('/').pop());
  } else {
    caPinnedPaths.add(path);
    el.classList.add('pinned');
    showToast('📌 钉选文件到上下文: ' + path.split('/').pop());
  }
  updateCaPinStats();
}

function getAllFilePathsUnderDir(node) {
  let paths = [];
  if (!node) return paths;
  if (node.type === 'file') {
    paths.push(node.path);
  } else if (node.type === 'dir' && node.children) {
    node.children.forEach(child => {
      paths = paths.concat(getAllFilePathsUnderDir(child));
    });
  }
  return paths;
}

function toggleFolderCaPins(node, el) {
  const paths = getAllFilePathsUnderDir(node);
  if (paths.length === 0) return;
  
  const allPinned = paths.every(p => caPinnedPaths.has(p));
  if (allPinned) {
    paths.forEach(p => caPinnedPaths.delete(p));
    showToast(`📌 已取消全选目录【${node.name}】下的所有文件`);
  } else {
    paths.forEach(p => caPinnedPaths.add(p));
    showToast(`📌 已全选目录【${node.name}】下的所有文件 (${paths.length}个)`);
  }
  
  if (caActiveProject) {
    renderCaFileTree(caActiveProject.fileTree);
  }
  updateCaPinStats();
}

function toggleAllCaPins(pinAll) {
  if (!caActiveProject) {
    showToast('请先选择或上传一个项目');
    return;
  }
  
  const allPaths = getAllFilePathsUnderDir({ type: 'dir', children: caActiveProject.fileTree });
  if (allPaths.length === 0) return;
  
  if (pinAll) {
    allPaths.forEach(p => caPinnedPaths.add(p));
    showToast(`📌 已全选项目中所有文件 (${allPaths.length}个)`);
  } else {
    caPinnedPaths.clear();
    showToast(`📌 已清除所有钉选文件`);
  }
  
  renderCaFileTree(caActiveProject.fileTree);
  updateCaPinStats();
}

window.getAllFilePathsUnderDir = getAllFilePathsUnderDir;
window.toggleFolderCaPins = toggleFolderCaPins;
window.toggleAllCaPins = toggleAllCaPins;

async function updateCaPinStats() {
  document.getElementById('caStatPinned').textContent = caPinnedPaths.size;
  
  // Estimate tokens based on pinned files + directory tree
  let totalChars = 0;
  if (caActiveProject) {
    // Complete file tree is always ~1000 characters
    totalChars += JSON.stringify(caActiveProject.fileTree).length / 2; 
    
    for (const path of caPinnedPaths) {
      const file = await CodeAnalyzerDB.getFile(caActiveProject.id, path);
      if (file && file.content) {
        totalChars += file.content.length;
      }
    }
  }
  // Roughly 1 token ≈ 4 characters for English / 2 characters for mixed code
  const estTokens = Math.round(totalChars / 3);
  document.getElementById('caStatTokens').textContent = estTokens.toLocaleString();
}

/* ===== File Upload Handler ===== */
async function handleCaZipUpload(input) {
  const file = input.files[0];
  if (!file) return;
  
  // Show progress modal
  const overlay = document.createElement('div');
  overlay.id = 'caUploadOverlay';
  overlay.className = 'memo-panel show';
  overlay.style.zIndex = '2000';
  overlay.innerHTML = `
    <div class="memo-container" style="max-width:320px;text-align:center;padding:24px;">
      <h3 id="caUploadTitle" style="color:var(--text-main);font-size:14px;margin-bottom:12px;">📤 正在上传并解压...</h3>
      <div style="background:var(--border);height:8px;border-radius:4px;overflow:hidden;margin:12px 0;">
        <div id="caUploadProgress" style="background:var(--text-sub);width:0%;height:100%;transition:width 0.2s;"></div>
      </div>
      <span id="caUploadPercent" style="font-size:11px;color:var(--text-light);">0%</span>
      <p id="caUploadStatus" style="font-size:11px;color:var(--text-sub);margin-top:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></p>
      <div style="margin-top:16px;display:flex;justify-content:center;">
        <button class="footer-btn footer-btn-secondary" onclick="cancelCaUpload()">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  let cancelUpload = false;
  window.cancelCaUpload = () => {
    cancelUpload = true;
    overlay.remove();
    input.value = '';
    showToast('解析已被取消');
  };
  
  try {
    const meta = await unzipAndIndexProject(
      file,
      (percent) => {
        if (cancelUpload) return;
        document.getElementById('caUploadProgress').style.width = percent + '%';
        document.getElementById('caUploadPercent').textContent = percent + '%';
      },
      (status, percent) => {
        if (cancelUpload) return;
        document.getElementById('caUploadStatus').textContent = status;
      }
    );
    
    if (cancelUpload) return;
    
    overlay.remove();
    showToast('🎉 解压并索引成功！');
    
    // Refresh list and load newly uploaded project
    await refreshCaProjects();
    await loadCaProject(meta.id);
    
  } catch (err) {
    if (cancelUpload) return;
    overlay.remove();
    alert('错误: ' + err.message);
  } finally {
    input.value = '';
  }
}

/* ===== File Viewer Popup / Code Editor ===== */
async function previewCodeFile(path) {
  if (!caActiveProject) return;
  try {
    const file = await CodeAnalyzerDB.getFile(caActiveProject.id, path);
    if (!file) {
      showToast('无法加载该文件');
      return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'memo-panel show';
    modal.style.zIndex = '1500';
    
    modal.innerHTML = `
      <div class="memo-container" style="max-width:850px;width:95%;height:85vh;display:flex;flex-direction:column;">
        <div class="memo-header" style="flex-shrink:0;">
          <h3 style="font-size:13.5px;color:var(--text-main);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:6px;">
            <span style="background:var(--accent);color:white;font-size:11px;padding:2px 6px;border-radius:4px;font-family:sans-serif;">Code Studio</span>
            <span>📄 编辑器：${path}</span>
          </h3>
          <button class="icon-btn" style="width:30px;height:30px;font-size:14px;" onclick="this.closest('.memo-panel').remove()">✕</button>
        </div>
        
        <div class="memo-body" style="padding:0;background:#1E1E1E;overflow:hidden;flex:1;display:flex;position:relative;">
          <!-- Line Gutter -->
          <div id="caGutter" style="width:45px;background:#1E1E1E;color:#858585;text-align:right;padding-right:8px;font-family:Consolas, Monaco, monospace;font-size:12px;line-height:20px;padding-top:12px;border-right:1px solid #2d2d2d;user-select:none;overflow:hidden;white-space:pre;"></div>
          <!-- Text Area Editor -->
          <textarea id="caFileEditorTextarea" spellcheck="false" style="flex:1;height:100%;border:none;resize:none;font-family:Consolas, Monaco, monospace;font-size:12px;line-height:20px;background:#1E1E1E;color:#D4D4D4;padding:12px 12px 12px 6px;outline:none;white-space:pre;overflow:auto;tab-size:4;-moz-tab-size:4;"></textarea>
        </div>
        
        <div class="memo-footer" style="flex-shrink:0;justify-content:space-between;background:var(--bg-white);border-top:1px solid var(--border);padding:10px 16px;">
          <span id="editorStatusText" style="color:#8C6239;font-size:11.5px;font-weight:bold;">✨ 双击或输入编辑，支持 [Tab] 缩进</span>
          <div style="display:flex;gap:8px;">
            <button class="footer-btn footer-btn-secondary" id="btnCopyEditor" style="padding:6px 12px;font-size:12px;">📋 复制代码</button>
            <button class="footer-btn footer-btn-primary" id="btnSaveEditor" style="padding:6px 16px;font-size:12px;background:#8C6239;border-color:#8C6239;color:white;">💾 保存修改</button>
            <button class="footer-btn footer-btn-secondary" style="padding:6px 12px;font-size:12px;" onclick="this.closest('.memo-panel').remove()">关闭</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const textarea = modal.querySelector('#caFileEditorTextarea');
    const gutter = modal.querySelector('#caGutter');
    const statusText = modal.querySelector('#editorStatusText');
    const btnCopy = modal.querySelector('#btnCopyEditor');
    const btnSave = modal.querySelector('#btnSaveEditor');
    
    textarea.value = file.content;
    
    // Function to calculate and update line numbers
    function updateLineNumbers() {
      const lines = textarea.value.split('\n');
      const count = lines.length;
      let gutterText = '';
      for (let i = 1; i <= count; i++) {
        gutterText += i + '\n';
      }
      gutter.textContent = gutterText;
    }
    
    // Initial render
    updateLineNumbers();
    
    // Sync scrolling
    textarea.addEventListener('scroll', () => {
      gutter.scrollTop = textarea.scrollTop;
    });
    
    // Handle content updates
    textarea.addEventListener('input', () => {
      updateLineNumbers();
      statusText.textContent = '✏️ 文件已被修改，未保存';
      statusText.style.color = '#B45309';
    });
    
    // Professional indent support (Tab Key)
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + "  " + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        updateLineNumbers();
        statusText.textContent = '✏️ 文件已被修改，未保存';
        statusText.style.color = '#B45309';
      }
    });
    
    // Handle copy action
    btnCopy.onclick = () => {
      navigator.clipboard.writeText(textarea.value).then(() => {
        showToast('✅ 复制成功');
      });
    };
    
    // Handle save action
    btnSave.onclick = async () => {
      btnSave.disabled = true;
      btnSave.textContent = '保存中...';
      try {
        const updatedContent = textarea.value;
        const updatedFile = {
          id: `${caActiveProject.id}:${path}`,
          projectId: caActiveProject.id,
          path: path,
          content: updatedContent,
          size: updatedContent.length,
          isBinary: false
        };
        
        await CodeAnalyzerDB.saveFile(updatedFile);
        
        // Clear caches so future analysis parses the newest version of the file!
        await CodeAnalyzerDB.clearCaches(caActiveProject.id);
        
        statusText.textContent = '💾 修改已成功保存到项目数据库，缓存已清除';
        statusText.style.color = '#047857';
        showToast('💾 文件保存成功！已自动清理该项目缓存');
      } catch (err) {
        statusText.textContent = '❌ 保存失败：' + err.message;
        statusText.style.color = '#DC2626';
        showToast('❌ 保存文件失败：' + err.message);
      } finally {
        btnSave.disabled = false;
        btnSave.textContent = '💾 保存修改';
      }
    };
    
  } catch (err) {
    showToast('预览文件失败: ' + err.message);
  }
}

/* ===== Smart Context Query (RAG Retrieval) ===== */
async function buildRAGContext(query) {
  if (!caActiveProject) return '';
  
  // 1. Convert directory tree to clean serialized text representation
  function serializeTree(nodes, indent = '') {
    let text = '';
    nodes.forEach(node => {
      text += `${indent}${node.type === 'dir' ? '📁' : '📄'} ${node.name}\n`;
      if (node.type === 'dir' && node.children) {
        text += serializeTree(node.children, indent + '  ');
      }
    });
    return text;
  }
  
  const treeText = serializeTree(caActiveProject.fileTree);
  
  // 2. Gather keywords from query
  const stopWords = new Set(['请', '帮我', '解释', '分析', '什么', '怎么', '如何', '代码', '文件', '里', '的', '是', '有', '在', '和', '了', '下', '中', '其', '此', '这', '那', '该', '项目', '实现', '逻辑', '结构', '架构', '关系', '依赖', '潜在', '存在', '哪些', '怎么用', '如何使用', 'how', 'to', 'the', 'in', 'of', 'and', 'for', 'a', 'an', 'is', 'it']);
  
  // Split query by common boundary symbols and spaces, then filter terms
  const terms = query.toLowerCase()
    .split(/[\s,./\\()_+\-=[\]{};:'"!?~<>|&@#%^*，。！？；：（）【】、]/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !stopWords.has(t));
    
  // 3. Load all code files metadata from IndexedDB to rank relevance
  const filesMeta = await CodeAnalyzerDB.getProjectFilesMetadata(caActiveProject.id);
  const fileScores = [];
  
  function getFileBaseImportance(p) {
    const name = p.toLowerCase().split('/').pop();
    const full = p.toLowerCase();
    if (name === 'readme.md') return 30;
    if (name === 'package.json') return 25;
    if (name === 'index.html') return 20;
    if (name === 'server.js' || name === 'app.js' || name === 'index.js' || name === 'main.js') return 18;
    if (full === 'src/app.tsx' || full === 'src/main.tsx' || full === 'src/index.js' || full === 'src/app.js' || full === 'src/main.js') return 18;
    if (full.endsWith('.ts') || full.endsWith('.tsx') || full.endsWith('.js') || full.endsWith('.jsx') || full.endsWith('.py') || full.endsWith('.go') || full.endsWith('.rs') || full.endsWith('.java') || full.endsWith('.cpp')) {
      return 5;
    }
    return 1;
  }
  
  for (const meta of filesMeta) {
    let score = getFileBaseImportance(meta.path);
    const pathLower = meta.path.toLowerCase();
    
    // Add immense score if path is pinned
    if (caPinnedPaths.has(meta.path)) {
      score += 10000;
    }
    
    // Match against query terms
    terms.forEach(term => {
      // High score if path contains search keyword
      if (pathLower.includes(term)) {
        score += 150;
        // Even higher if exact file name matches
        const filename = pathLower.split('/').pop();
        if (filename.includes(term)) score += 100;
      }
    });
    
    fileScores.push({ path: meta.path, score });
  }
  
  // 4. Load full files of non-zero scores to score based on internal content
  // To optimize, only fetch top metadata files for content analysis
  const potentialFiles = fileScores.filter(f => f.score > 0).sort((a, b) => b.score - a.score);
  
  // Fetch contents of top files (max 25 files) to run quick regex keyword counts
  const contentScores = [];
  const filesToLoadContent = potentialFiles.slice(0, 25);
  
  for (const item of filesToLoadContent) {
    const file = await CodeAnalyzerDB.getFile(caActiveProject.id, item.path);
    if (file && file.content) {
      let contentScore = item.score;
      const contentLower = file.content.toLowerCase();
      
      terms.forEach(term => {
        // Count occurrences up to a cap of 10 to prevent large files with repeating terms from dominating
        const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        const matches = contentLower.match(regex);
        if (matches) {
          contentScore += Math.min(50, matches.length * 5);
        }
      });
      contentScores.push({ path: item.path, score: contentScore, content: file.content });
    }
  }
  
  // Re-sort files based on complete path + content score
  contentScores.sort((a, b) => b.score - a.score);
  
  // Always include pinned files even if content score is 0
  for (const path of caPinnedPaths) {
    if (!contentScores.find(f => f.path === path)) {
      const file = await CodeAnalyzerDB.getFile(caActiveProject.id, path);
      if (file && file.content) {
        contentScores.unshift({ path, score: 10000, content: file.content });
      }
    }
  }
  
  // 5. Build context payload within limits (max character budget: ~24,000 chars)
  let charBudget = 24000;
  let includedFilesText = '';
  let includedPaths = [];
  
  for (const item of contentScores) {
    if (charBudget <= 0) break;
    
    let textToInclude = item.content;
    let isTruncated = false;
    
    // If single file is extremely large, slice/truncate it to 6,000 chars max
    if (textToInclude.length > 6000) {
      textToInclude = textToInclude.slice(0, 6000);
      isTruncated = true;
    }
    
    const fileHeader = `\n\n--- FILE: ${item.path} ---\n`;
    const fileContent = textToInclude + (isTruncated ? '\n[由于文件过长，该部分已截断]' : '');
    
    if (charBudget >= (fileHeader.length + fileContent.length)) {
      includedFilesText += fileHeader + fileContent;
      charBudget -= (fileHeader.length + fileContent.length);
      includedPaths.push(item.path);
    }
  }
  
  console.log(`RAG Indexed ${includedPaths.length} files:`, includedPaths);
  
  // 6. Return combined payload
  return `【项目目录树结构】
${treeText}

【检索出的关键代码内容】
${includedFilesText || '（未检索到匹配的源代码，请先在左侧展开目录查看或钉选关键文件）'}
`;
}

/* ===== Chat Core Interaction ===== */
async function sendCaQuery() {
  if (!caActiveProject) {
    showToast('请先上传或选择项目');
    return;
  }
  
  const input = document.getElementById('caMessageInput');
  const query = input.value.trim();
  if (!query) return;
  
  input.value = '';
  
  // Add user message to UI
  caChatHistory.push({ role: 'user', content: query });
  renderCaChat();
  
  // Scroll to bottom
  scrollCaChatBottom();
  
  // Trigger RAG indexing
  const loadingId = 'loading_' + Date.now();
  appendCaLoading(loadingId);
  
  try {
    // 1. Try Cache First to speed up identical repeats
    const cached = await CodeAnalyzerDB.getCache(caActiveProject.id, query);
    if (cached) {
      removeCaLoading(loadingId);
      caChatHistory.push({ role: 'assistant', content: cached.response });
      renderCaChat();
      scrollCaChatBottom();
      return;
    }
    
    // 2. Index project RAG context
    const contextText = await buildRAGContext(query);
    
    // 3. Compile prompt
    const systemPrompt = `你是一个非常专业且具有极高代码理解能力的【代码压缩包分析专家 (Code Archive Analyzer)】。
当前用户上传了一个代码压缩包（项目名称: ${caActiveProject.name}），以下是前端在本地解压、解析出的项目整体树状结构，以及根据用户的问题动态检索到的核心关联代码。

请你：
1. 深入理解这些代码，并以高度逻辑性、条理清晰的中文回答用户的提问。
2. 作答时，如果引用了具体代码，请用标准的 Markdown 代码块渲染并指定对应语言。
3. 保持回答客观、精准、深入浅出，不要胡编乱造，不要复述无意义的话。
4. 在回答最后，如果有涉及到的相关文件没有完全提供，可以友情提示用户可以通过“钉选”左侧目录树中的文件（📌图标）来补充完整上下文。

${contextText}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...caChatHistory.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: query }
    ];
    
    // 4. Request AI via the global llmComplete
    const reply = await llmComplete(messages, { temperature: 0.3 });
    
    removeCaLoading(loadingId);
    
    // 5. Append assistant reply and cache it
    caChatHistory.push({ role: 'assistant', content: reply });
    await CodeAnalyzerDB.saveCache(caActiveProject.id, query, reply);
    
    renderCaChat();
    scrollCaChatBottom();
    
  } catch (err) {
    removeCaLoading(loadingId);
    caChatHistory.push({ role: 'assistant', content: `❌ 分析出错: ${err.message}` });
    renderCaChat();
    scrollCaChatBottom();
  }
}

// Preset query handling (architecture, bugs, optimize, dependencies)
function sendCaPresetQuery(query) {
  document.getElementById('caMessageInput').value = query;
  sendCaQuery();
}

function handleCaInputKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendCaQuery();
  }
}

/* ===== UI Chat Renderers ===== */
function renderCaChat() {
  const container = document.getElementById('caChatMessages');
  if (!container) return;
  
  if (caChatHistory.length === 0) {
    container.innerHTML = `
      <div class="ca-welcome-msg">
          <h3>👋 欢迎使用代码压缩包分析助手</h3>
          <p>上传 ZIP 代码压缩包后，我会在前端解析所有的源文件结构，并基于您的提问<b>动态、智能地检索相关代码段</b>进行精确分析。这样既能理解大型项目的架构，又不会超出 AI 的上下文限制。</p>
          <ul>
              <li><b>纯前端解压：</b> 您的代码绝不会上传到任何文件存储服务器，完全安全私密。</li>
              <li><b>智能上下文聚焦：</b> 结合“目录结构 RAG 索引”与“关联性检索”，自动抓取关键模块。</li>
              <li><b>手动钉选支持：</b> 展开左侧文件树，点击 📌 确保该文件常驻上下文。</li>
          </ul>
      </div>
    `;
    return;
  }
  
  container.innerHTML = '';
  
  caChatHistory.forEach(msg => {
    const isU = msg.role === 'user';
    const msgDiv = document.createElement('div');
    msgDiv.className = `ca-message ${isU ? 'user' : 'assistant'}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'ca-msg-avatar';
    avatar.textContent = isU ? '🙂' : '🤖';
    
    const bubble = document.createElement('div');
    bubble.className = 'ca-msg-bubble';
    
    if (isU) {
      bubble.textContent = msg.content;
    } else {
      bubble.innerHTML = renderMarkdownToHtml(msg.content);
    }
    
    msgDiv.appendChild(avatar);
    msgDiv.appendChild(bubble);
    container.appendChild(msgDiv);
  });
}

function appendCaLoading(id) {
  const container = document.getElementById('caChatMessages');
  const msgDiv = document.createElement('div');
  msgDiv.className = 'ca-message assistant';
  msgDiv.id = id;
  
  const avatar = document.createElement('div');
  avatar.className = 'ca-msg-avatar';
  avatar.textContent = '🤖';
  
  const bubble = document.createElement('div');
  bubble.className = 'ca-msg-bubble';
  bubble.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
  
  msgDiv.appendChild(avatar);
  msgDiv.appendChild(bubble);
  container.appendChild(msgDiv);
  scrollCaChatBottom();
}

function removeCaLoading(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function scrollCaChatBottom() {
  const container = document.getElementById('caChatMessages');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

/* ===== Simple Robust Markdown-to-HTML Compiler ===== */
function renderMarkdownToHtml(md) {
  if (!md) return '';
  let html = md;
  
  // Escape HTML tags to prevent custom execution/XSS
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Render markdown code blocks: ```js ... ```
  html = html.replace(/```(\w*)\n([\s\S]*?)\n```/g, (match, lang, code) => {
    return `<pre class="code-block-container"><div class="code-block-header"><span>${lang || 'code'}</span><button class="code-copy-btn" onclick="copyCodeText(this)">复制</button></div><code class="code-block-body">${code}</code></pre>`;
  });

  // Render inline code tags: `code`
  html = html.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

  // Render markdown headers: ### h3, ## h2, # h1
  html = html.replace(/^###[ \t]+(.*$)/gim, '<h5 class="md-h3">$1</h5>');
  html = html.replace(/^##[ \t]+(.*$)/gim, '<h4 class="md-h2">$1</h4>');
  html = html.replace(/^#[ \t]+(.*$)/gim, '<h3 class="md-h1">$1</h3>');

  // Render bold text: **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Render bullet lists: - item or * item
  html = html.replace(/^\s*[-*+]\s+(.*$)/gim, '<li class="md-li">$1</li>');

  // Render ordered lists: 1. item
  html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li class="md-ol-li">$2</li>');

  // Split into double newline blocks and wrap standard paragraphs
  const blocks = html.split(/\n\n+/);
  html = blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<h') || trimmed.startsWith('<pre') || trimmed.startsWith('<li')) {
      return trimmed;
    }
    return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  return html;
}

// Code copy helper function
function copyCodeText(button) {
  const container = button.closest('.code-block-container');
  const code = container.querySelector('.code-block-body').innerText;
  navigator.clipboard.writeText(code).then(() => {
    button.textContent = '已复制';
    showToast('✅ 代码已复制到剪贴板');
    setTimeout(() => {
      button.textContent = '复制';
    }, 2000);
  });
}

// Export functions to global scope
window.openCodeAnalyzer = openCodeAnalyzer;
window.closeCodeAnalyzer = closeCodeAnalyzer;
window.handleCaZipUpload = handleCaZipUpload;
window.sendCaQuery = sendCaQuery;
window.sendCaPresetQuery = sendCaPresetQuery;
window.onCaProjectChange = onCaProjectChange;
window.deleteCurrentCaProject = deleteCurrentCaProject;
window.handleCaInputKeyDown = handleCaInputKeyDown;
window.copyCodeText = copyCodeText;
