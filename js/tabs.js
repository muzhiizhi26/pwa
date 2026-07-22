/* ===== PWA Companion Four-Tab Navigation Engine (Tabs System) ===== */

// 当前激活的主 Tab
let _currentMainTab = 'chat';
// Memory Tab 内部的子 Tab (profile, midterm, vectors)
let _currentMemorySubTab = 'profile';

// 在页面加载后绑定切换功能
if (document.readyState !== 'loading') {
  initTabsEngine();
} else {
  window.addEventListener('DOMContentLoaded', () => {
    initTabsEngine();
  });
}

// 如果 DOMContentLoaded 已经过了，主入口加载也会调用此初始化
function initTabsEngine() {
  if (document.getElementById('memoryTabContent')) return; // 防止重复初始化
  
  const chatApp = document.querySelector('.chat-app');
  if (!chatApp) return;

  // 2. 创建四个非聊天页面的内容面板，并塞入 .chat-app 中 (插在 .chat-messages 后面)
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    const momentsTabContent = document.createElement('div');
    momentsTabContent.id = 'momentsTabContent';
    momentsTabContent.className = 'tab-content-view';
    chatMessages.parentNode.insertBefore(momentsTabContent, chatMessages.nextSibling);

    const memoryTabContent = document.createElement('div');
    memoryTabContent.id = 'memoryTabContent';
    memoryTabContent.className = 'tab-content-view';
    momentsTabContent.parentNode.insertBefore(memoryTabContent, momentsTabContent.nextSibling);

    const createTabContent = document.createElement('div');
    createTabContent.id = 'createTabContent';
    createTabContent.className = 'tab-content-view';
    memoryTabContent.parentNode.insertBefore(createTabContent, memoryTabContent.nextSibling);

    const relationTabContent = document.createElement('div');
    relationTabContent.id = 'relationTabContent';
    relationTabContent.className = 'tab-content-view';
    createTabContent.parentNode.insertBefore(relationTabContent, createTabContent.nextSibling);
  }

  // 默认切换到 chat Tab
  switchMainTab('chat');
}

// 主 Tab 切换函数
function switchMainTab(tabId) {
  if (typeof triggerHaptic === 'function') triggerHaptic('light');
  _currentMainTab = tabId;

  // 获取所有导航项与视图
  const navChat = document.getElementById('navChat');
  const navMemory = document.getElementById('navMemory');
  const navCreate = document.getElementById('navCreate');
  const navRelation = document.getElementById('navRelation');

  const chatMessages = document.getElementById('chatMessages');
  const quotePreview = document.getElementById('quotePreview');
  const inputWrapper = document.querySelector('.input-wrapper');

  const momentsTabContent = document.getElementById('momentsTabContent');
  const memoryTabContent = document.getElementById('memoryTabContent');
  const createTabContent = document.getElementById('createTabContent');
  const relationTabContent = document.getElementById('relationTabContent');

  // 移除所有激活状态
  [navChat, navMemory, navCreate, navRelation].forEach(el => {
    if (el) el.classList.remove('active');
  });

  // 隐藏所有视图
  if (chatMessages) chatMessages.style.display = 'none';
  if (quotePreview) quotePreview.style.display = 'none';
  if (inputWrapper) inputWrapper.style.display = 'none';
  if (momentsTabContent) momentsTabContent.classList.remove('active');
  if (memoryTabContent) memoryTabContent.classList.remove('active');
  if (createTabContent) createTabContent.classList.remove('active');
  if (relationTabContent) relationTabContent.classList.remove('active');

  // 根据选择的 Tab 显示对应的内容，并激活导航项
  switch (tabId) {
    case 'chat':
      if (navChat) navChat.classList.add('active');
      if (chatMessages) chatMessages.style.display = 'flex';
      if (inputWrapper) inputWrapper.style.display = 'flex';
      // 如果有正在引用的消息，需要把引用预览显示出来
      if (quotePreview && document.getElementById('quoteText')?.textContent) {
        quotePreview.style.display = 'flex';
      }
      // 回到聊天时，自动滚动到底部
      setTimeout(() => {
        if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
      }, 50);
      break;

    case 'moments':
      if (momentsTabContent) {
        momentsTabContent.classList.add('active');
        if (typeof MomentsEngine !== 'undefined') {
          MomentsEngine.renderMomentsTab();
        }
      }
      break;

    case 'memory':
      if (navMemory) navMemory.classList.add('active');
      if (memoryTabContent) {
        memoryTabContent.classList.add('active');
        renderMemoryTab();
      }
      break;

    case 'create':
      if (navCreate) navCreate.classList.add('active');
      if (createTabContent) {
        createTabContent.classList.add('active');
        renderCreateTab();
      }
      break;

    case 'relation':
      if (navRelation) navRelation.classList.add('active');
      if (relationTabContent) {
        relationTabContent.classList.add('active');
        renderRelationTab();
      }
      break;
  }
}

// 切换 Memory 内部的子 Tab
function switchMemorySubTab(subTabId) {
  _currentMemorySubTab = subTabId;
  renderMemoryTab();
}

/* =========================================
   1. 记忆 Tab 渲染逻辑 (The Memory Realm)
   ========================================= */
async function renderMemoryTab() {
  const container = document.getElementById('memoryTabContent');
  if (!container) return;

  // Safe parameters with fallbacks
  let healthScore = 95;
  let vdbCount = 0;
  let maxMem = '无限制';

  try {
    healthScore = typeof calculateCognitiveHealthScore === 'function' ? calculateCognitiveHealthScore() : 95;
  } catch (e) {
    console.warn('Error calculating cognitive health score, using fallback:', e);
  }

  try {
    if (typeof VDB !== 'undefined' && typeof VDB.count === 'function') {
      vdbCount = await VDB.count();
    }
  } catch (e) {
    console.warn('Error fetching VDB count, using fallback:', e);
  }

  try {
    if (typeof currentMemMax === 'function') {
      maxMem = currentMemMax() || '无限制';
    }
  } catch (e) {
    console.warn('Error fetching currentMemMax, using fallback:', e);
  }

  let subTabContentHtml = '';

  if (_currentMemorySubTab === 'profile') {
    // 渲染 A: 长期核心档案 (Letta style permanent memory)
    let profileText = '';
    try {
      if (typeof getLongTermProfile === 'function') {
        profileText = getLongTermProfile();
      } else {
        profileText = localStorage.getItem('longterm_profile') || '';
      }
    } catch (e) {
      console.warn('Error getting long term profile:', e);
    }

    subTabContentHtml = `
      <div class="m-profile-section">
        <div class="m-section-header-title">✍️ 长期核心档案 (Letta Style Core facts)</div>
        <p class="m-section-desc">这里记载了伙伴在多次长谈中为你梳理出的稳定个人特质、背景或习惯。这些记忆权重最高，永不磨灭。</p>
        <textarea id="tabProfileText" class="m-textarea" rows="8" placeholder="例如：\n- 用户非常喜欢在深夜与我畅聊科幻小说\n- 讨厌在开发代码时被催促\n- 生日是 7月16日，喜欢温馨宁静的设计气氛" oninput="localStorage.setItem('longterm_profile', this.value)">${profileText}</textarea>
        <div class="m-btn-group" style="margin-top: 10px;">
          <button class="btn btn-success" onclick="saveTabProfile()">💾 保存修改</button>
          <button class="btn btn-info" onclick="openChangelog()">⏳ 历史修改日志</button>
        </div>
      </div>
    `;
  } else if (_currentMemorySubTab === 'midterm') {
    // 渲染 B: 中期对话轨迹
    let mid = '';
    try {
      if (typeof getMidTerm === 'function') {
        mid = getMidTerm();
      } else {
        mid = localStorage.getItem('midterm_history') || '';
      }
    } catch (e) {
      console.warn('Error getting midterm:', e);
    }

    const midAt = parseInt(localStorage.getItem('midterm_updated_at') || '0');
    const midStr = midAt ? new Date(midAt).toLocaleString('zh-CN') : '尚未生成';
    const midIv = localStorage.getItem('midterm_interval') || '6';

    subTabContentHtml = `
      <div class="m-midterm-section">
        <div class="m-section-header-title">🗓️ 中期岁月轨迹（近7天自动摘要）</div>
        <p class="m-section-desc">这是伙伴每隔几小时自动为你写下的对话摘要片段，让陪伴拥有完整的时间轴和事件连续性。</p>
        <textarea class="m-textarea" id="tabMidtermText" rows="6" readonly placeholder="（尚未生成，聊天满6小时后会自动生成，或点击下方立即生成）">${mid}</textarea>
        <div class="m-meta-hint">上次自然沉淀：${midStr}</div>
        
        <div class="form-group" style="margin-top: 14px;">
          <label class="form-label">摘要沉淀间隔（小时）</label>
          <input type="number" class="form-input" id="tabMidtermInterval" min="1" step="0.5" value="${midIv}" onchange="localStorage.setItem('midterm_interval', this.value)">
        </div>

        <div class="m-btn-group">
          <button class="btn btn-info" onclick="triggerRegenMidterm()">♻️ 立即提炼中期记忆</button>
        </div>
      </div>
    `;
  } else if (_currentMemorySubTab === 'vectors') {
    // 渲染 C: 散落意识节点
    let latestNodes = [];
    try {
      if (typeof VDB !== 'undefined' && typeof VDB.latest === 'function') {
        latestNodes = (await VDB.latest(50)) || [];
      }
    } catch (e) {
      console.warn('Error fetching latest VDB nodes:', e);
    }

    let nodesListHtml = '';

    if (!latestNodes || latestNodes.length === 0) {
      nodesListHtml = `
        <div class="m-empty-nodes">
          😴 忆海中暂时没有散落的即时记忆节点。<br>
          与伙伴正常开始聊天，伙伴便会自动将对话散落在向量库中！
        </div>
      `;
    } else {
      nodesListHtml = latestNodes.filter(Boolean).map(node => {
        const dateStr = new Date(node.ts || Date.now()).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const importance = node.importance_score || node.importance || 50;
        const emotionMap = { happy: '😊', sad: '😢', excited: '⚡', love: '💖', angry: '娇嗔', gentle: '🌸', calm: '🍃', tired: '🥱', anxious: '😟', thinking: '💭' };
        const emoIcon = emotionMap[node.emotion] || '🍃';
        const tierLabels = { 1: '即时', 2: '事件', 3: '核心' };
        const tierClass = `tier-${node.tier || 1}`;

        return `
          <div class="m-node-card">
            <div class="m-node-header">
              <span class="m-node-tag ${tierClass}">${tierLabels[node.tier || 1]}记忆</span>
              <span class="m-node-emo" title="触发情绪">${emoIcon}</span>
              <span class="m-node-time">${dateStr}</span>
              <button class="m-node-delete" onclick="deleteMemoryNode('${node.id}')" title="让AI遗忘这件小事">✕</button>
            </div>
            <div class="m-node-text">${node.text || ''}</div>
            <div class="m-node-footer">
              <span>重要度: <b>${importance}</b></span>
              <span>检索热度: <b>${node.recall_count || 0}</b></span>
            </div>
          </div>
        `;
      }).join('');
    }

    subTabContentHtml = `
      <div class="m-vectors-section">
        <div class="m-section-header-title">✨ 散落意识节点 (Vector Memory Database)</div>
        <p class="m-section-desc">这是散落在伙伴潜意识里的语义向量节点。伙伴说话时会根据你的话题动态在这些节点中瞬时“闪回”进行共鸣。</p>
        
        <div class="m-nodes-grid">
          ${nodesListHtml}
        </div>

        <div class="m-action-box" style="margin-top: 16px;">
          <div class="m-section-header-title" style="font-size: 13px;">⚙️ 意识池底层调谐</div>
          <div class="m-btn-group" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
            <button class="btn btn-info" style="font-size:11px; padding: 4px 8px; flex: 1; min-width: 100px;" onclick="triggerRebuildIndex()">♻️ 重建向量索引</button>
            <button class="btn btn-success" style="font-size:11px; padding: 4px 8px; flex: 1; min-width: 100px;" onclick="exportMemory()">📤 导出记忆文本</button>
            <button class="btn btn-warning" style="font-size:11px; padding: 4px 8px; flex: 1; min-width: 100px;" onclick="applyMemTrim().then(()=>renderMemoryTab())">✂️ 强制上限清理</button>
            <button class="btn btn-danger" style="font-size:11px; padding: 4px 8px; flex: 1; min-width: 100px;" onclick="triggerClearVectorMemory()">🧹 清空意识向量池</button>
          </div>
        </div>
      </div>
    `;
  } else if (_currentMemorySubTab === 'timeline') {
    // 渲染 D: Memory Graph 2.0 关系时间轴
    let allNodes = [];
    try {
      if (typeof VDB !== 'undefined' && typeof VDB.all === 'function') {
        allNodes = (await VDB.all()) || [];
      }
    } catch (e) {
      console.warn('Error fetching all VDB nodes:', e);
    }

    // Sort by timestamp descending
    allNodes.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    // Get active tag filter (default to 'all')
    const activeFilter = localStorage.getItem('m_timeline_filter') || 'all';
    
    // Topic tags we support:
    const filterTags = ['all', '喜好习惯', '情感羁绊', '日常生活', '工作学业', '休闲娱乐', '未来期许', '日常杂记'];
    const filterLabels = {
      'all': '✨ 全部节点',
      '喜好习惯': '🍳 喜好习惯',
      '情感羁绊': '💖 情感羁绊',
      '日常生活': '🍃 日常生活',
      '工作学业': '💻 工作学业',
      '休闲娱乐': '🎮 休闲娱乐',
      '未来期许': '🚀 未来期许',
      '日常杂记': '📝 日常杂记'
    };

    const filteredNodes = allNodes.filter(node => {
      if (activeFilter === 'all') return true;
      const tags = node.topicTags || (node.metadata && node.metadata.topicTags) || [];
      if (tags.length === 0 && activeFilter === '日常杂记') return true;
      return tags.includes(activeFilter);
    });

    // Generate Filter Bar
    let filterBarHtml = `
      <div class="m-timeline-filters" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px;">
    `;
    for (const tag of filterTags) {
      const activeClass = activeFilter === tag ? 'active' : '';
      filterBarHtml += `
        <button class="m-filter-btn ${activeClass}" onclick="setMemoryTimelineFilter('${tag}')" style="font-size: 11px; padding: 4px 10px; border-radius: 12px; border: 1px solid var(--border-color); background: ${activeFilter === tag ? 'var(--btn-bg-info)' : 'transparent'}; color: ${activeFilter === tag ? '#fff' : 'inherit'}; cursor: pointer;">
          ${filterLabels[tag]}
        </button>
      `;
    }
    filterBarHtml += `</div>`;

    // Render interactive SVG Relation Map (limited to top 16 latest nodes to keep it clean and interactive)
    let svgGraphHtml = '';
    const mapNodes = allNodes.slice(0, 16); // Top 16 latest records
    if (mapNodes.length > 1) {
      const width = 600;
      const height = 150;
      const cx = width / 2;
      const cy = height / 2;
      const rx = width * 0.42;
      const ry = height * 0.35;
      
      const nodePos = {};
      mapNodes.forEach((node, idx) => {
        const angle = (idx / mapNodes.length) * 2 * Math.PI - Math.PI / 2;
        nodePos[node.id] = {
          x: cx + rx * Math.cos(angle),
          y: cy + ry * Math.sin(angle),
          node
        };
      });

      let svgLines = '';
      let svgCircles = '';
      
      // Draw relationship lines
      mapNodes.forEach(node => {
        const p1 = nodePos[node.id];
        if (!p1) return;
        const related = node.relatedIds || (node.metadata && node.metadata.relatedIds) || [];
        related.forEach(rId => {
          const p2 = nodePos[rId];
          if (p2) {
            svgLines += `
              <line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="#BA68C8" stroke-width="1.2" stroke-dasharray="3,3" opacity="0.6" />
            `;
          }
        });
      });

      // Draw node circles
      mapNodes.forEach((node, idx) => {
        const pos = nodePos[node.id];
        const tags = node.topicTags || (node.metadata && node.metadata.topicTags) || [];
        const imp = node.importance_score || node.importance || 50;
        
        const colors = {
          '喜好习惯': '#FFB74D',
          '情感羁绊': '#F06292',
          '日常生活': '#81C784',
          '工作学业': '#64B5F6',
          '休闲娱乐': '#BA68C8',
          '未来期许': '#4DB6AC',
          '日常杂记': '#A1887F'
        };
        const color = colors[tags[0]] || '#90A4AE';
        const r = 10 + (imp / 100) * 8; // Size proportional to importance score!

        svgCircles += `
          <g class="m-svg-node" cursor="pointer" onclick="scrollToMemoryNode('${node.id}')" style="transition: transform 0.2s;">
            <circle cx="${pos.x}" cy="${pos.y}" r="${r}" fill="${color}" stroke="#fff" stroke-width="1.5" opacity="0.9" />
            <text x="${pos.x}" y="${pos.y + 3}" font-size="9" text-anchor="middle" fill="#fff" style="pointer-events: none; font-weight: bold;">${idx + 1}</text>
            <title>${idx + 1}. [${tags.join(',')}] ${node.text.slice(0, 30)}... (重要度: ${imp})</title>
          </g>
        `;
      });

      svgGraphHtml = `
        <div class="m-graph-panel" style="background: rgba(0,0,0,0.02); border-radius: 12px; padding: 12px; margin-bottom: 16px; border: 1px solid var(--border-color);">
          <div class="m-section-header-title" style="font-size: 12px; display: flex; justify-content: space-between; align-items: center;">
            <span>🌌 意识共鸣网络图谱 (Associative Web)</span>
            <span style="font-size: 10px; opacity: 0.6;">数字1为最新，虚线代表关联共鸣</span>
          </div>
          <div style="overflow-x: auto; width: 100%; text-align: center; margin-top: 8px;">
            <svg width="100%" height="150" viewBox="0 0 600 150" style="max-width: 600px; display: inline-block;">
              ${svgLines}
              ${svgCircles}
            </svg>
          </div>
        </div>
      `;
    }

    // Generate list of timeline cards
    let timelineListHtml = '';
    if (filteredNodes.length === 0) {
      timelineListHtml = `
        <div class="m-empty-nodes">
          🍂 当前分类下暂时没有记忆节点。<br>
          与伙伴正常开始聊天，伙伴便会自动在此编织关系网络！
        </div>
      `;
    } else {
      timelineListHtml = filteredNodes.map((node) => {
        const dateStr = new Date(node.ts || Date.now()).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const importance = node.importance_score || node.importance || 50;
        const emoMap = { happy: '😊', sad: '😢', excited: '⚡', love: '💖', angry: '娇嗔', gentle: '🌸', calm: '🍃', tired: '🥱', anxious: '😟', thinking: '💭' };
        const emoIcon = emoMap[node.emotion] || '🍃';
        const tierLabels = { 1: '即时', 2: '事件', 3: '核心' };
        const tierClass = `tier-${node.tier || 1}`;
        const tags = node.topicTags || (node.metadata && node.metadata.topicTags) || [];
        const timeWin = node.timeWindowTag || (node.metadata && node.metadata.timeWindowTag) || '未知时刻';
        const related = node.relatedIds || (node.metadata && node.metadata.relatedIds) || [];
        
        // Colors for tags
        const tagBadges = tags.map(t => {
          const colors = {
            '喜好习惯': 'background: rgba(255,183,77,0.12); color: #E65100; border: 1px solid rgba(255,183,77,0.25);',
            '情感羁绊': 'background: rgba(240,98,146,0.12); color: #C2185B; border: 1px solid rgba(240,98,146,0.25);',
            '日常生活': 'background: rgba(129,199,132,0.12); color: #2E7D32; border: 1px solid rgba(129,199,132,0.25);',
            '工作学业': 'background: rgba(100,181,246,0.12); color: #1565C0; border: 1px solid rgba(100,181,246,0.25);',
            '休闲娱乐': 'background: rgba(186,104,200,0.12); color: #6A1B9A; border: 1px solid rgba(186,104,200,0.25);',
            '未来期许': 'background: rgba(77,182,172,0.12); color: #00695C; border: 1px solid rgba(77,182,172,0.25);'
          };
          const style = colors[t] || 'background: rgba(0,0,0,0.04); color: #666; border: 1px solid rgba(0,0,0,0.08);';
          return `<span style="font-size: 10px; padding: 2px 6px; border-radius: 10px; margin-right: 4px; ${style}">${t}</span>`;
        }).join('');

        // Generate related nodes markup
        let relatedHtml = '';
        if (related.length > 0) {
          const relatedItems = allNodes.filter(n => related.includes(n.id));
          if (relatedItems.length > 0) {
            relatedHtml = `
              <div class="m-node-relations" style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border-color); display: flex; flex-direction: column; gap: 4px;">
                <span style="font-size: 10px; opacity: 0.6; display: flex; align-items: center; gap: 4px;">🔗 意识连通网络:</span>
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                  ${relatedItems.map(item => `
                    <button onclick="scrollToMemoryNode('${item.id}')" style="font-size: 10px; padding: 2px 6px; background: rgba(186,104,200,0.06); border: 1px solid rgba(186,104,200,0.15); color: #6A1B9A; border-radius: 4px; cursor: pointer; text-align: left; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      🔮 ${item.text.slice(0, 18)}...
                    </button>
                  `).join('')}
                </div>
              </div>
            `;
          }
        }

        return `
          <div class="m-node-card" id="node-card-${node.id}" style="border-left: 4px solid var(--btn-bg-info); transition: all 0.3s; margin-bottom: 4px;">
            <div class="m-node-header">
              <span class="m-node-tag ${tierClass}">${tierLabels[node.tier || 1]}记忆</span>
              <span class="m-node-emo" title="触发情绪">${emoIcon}</span>
              <span class="m-node-time">${timeWin}</span>
              <button class="m-node-delete" onclick="deleteMemoryNode('${node.id}')" title="让AI遗忘这件小事">✕</button>
            </div>
            <div class="m-node-text" style="font-size: 12.5px; line-height: 1.6; color: var(--text-color);">${node.text || ''}</div>
            <div style="margin-top: 8px; display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
              ${tagBadges}
            </div>
            <div class="m-node-footer" style="margin-top: 8px; font-size: 10px; display: flex; justify-content: space-between; opacity: 0.8;">
              <span>重要度: <b>${importance}</b></span>
              <span>检索热度: <b>${node.recall_count || 0}</b></span>
            </div>
            ${relatedHtml}
          </div>
        `;
      }).join('');
    }

    subTabContentHtml = `
      <div class="m-timeline-section">
        <div class="m-section-header-title">🗓️ 共同岁月编织 (Memory Timeline & Graph)</div>
        <p class="m-section-desc">每个深刻的相处时刻都会自动生成独特的话题标签，并在时空中与相似或邻近的事物形成自组织的关系网。</p>
        
        ${svgGraphHtml}
        ${filterBarHtml}
        
        <div class="m-nodes-grid" style="display: flex; flex-direction: column; gap: 12px; margin-top: 10px;">
          ${timelineListHtml}
        </div>
      </div>
    `;
  }

  const isRag = typeof ragEnabled === 'function' ? ragEnabled() : true;

  // 渲染整体 Memory Tab 框架
  container.innerHTML = `
    <header class="tab-view-header">
      <div class="tab-view-title-area" style="display: flex; align-items: center; gap: 8px;">
        <button class="icon-btn" onclick="switchMainTab('chat')" title="返回聊天" style="margin-right: 4px; width: 30px; height: 30px; font-size: 14px;">‹</button>
        <span class="tab-view-emoji">🧠</span>
        <h2 class="tab-view-title">忆海 · 伙伴的长期记忆</h2>
      </div>
    </header>

    <!-- 顶置大脑状态卡片 -->
    <div class="m-cognitive-dashboard">
      <div class="m-dashboard-item">
        <div class="m-dashboard-label">🧠 认知契合指数 (Cognitive Health)</div>
        <div class="m-dashboard-value-row">
          <span class="m-dashboard-val">${healthScore}%</span>
          <span class="m-dashboard-desc">${healthScore >= 90 ? '灵犀互通 · 灵魂深度共振' : '稳健感知 · 记录真实温存'}</span>
        </div>
        <div class="m-progress-bg"><div class="m-progress-bar" style="width: ${healthScore}%; background: #BA68C8;"></div></div>
      </div>

      <div class="m-dashboard-stats-grid">
        <div class="m-stat-mini-card">
          <span class="m-mini-label">意识节点</span>
          <span class="m-mini-val">${vdbCount} / <small>${maxMem}</small></span>
        </div>
        <div class="m-stat-mini-card">
          <span class="m-mini-label">RAG 召回机制</span>
          <span class="m-mini-val" style="color: ${isRag ? '#4CAF50' : '#8F7A6B'}">${isRag ? '🟢 已开启' : '🔴 暂停'}</span>
        </div>
      </div>
    </div>

    <!-- Sub tab buttons -->
    <div class="rel-tabs m-subtabs">
      <button class="rel-tab-btn ${_currentMemorySubTab === 'profile' ? 'active' : ''}" onclick="switchMemorySubTab('profile')">📋 长期核心档案</button>
      <button class="rel-tab-btn ${_currentMemorySubTab === 'midterm' ? 'active' : ''}" onclick="switchMemorySubTab('midterm')">🗓️ 共同岁月摘要</button>
      <button class="rel-tab-btn ${_currentMemorySubTab === 'vectors' ? 'active' : ''}" onclick="switchMemorySubTab('vectors')">🌸 闪回记忆碎片</button>
      <button class="rel-tab-btn ${_currentMemorySubTab === 'timeline' ? 'active' : ''}" onclick="switchMemorySubTab('timeline')">🗓️ 共同岁月编织</button>
    </div>

    <!-- Active Sub-tab Content -->
    <div class="m-subtab-content">
      ${subTabContentHtml}
    </div>
  `;
}

// 辅助事件触发与封装
function saveTabProfile() {
  const txt = document.getElementById('tabProfileText')?.value;
  if (txt !== undefined) {
    setLongTermProfile(txt);
    showToast('🗂️ 长期核心记忆档案已手动更新');
    renderMemoryTab();
  }
}

async function triggerRegenMidterm() {
  await regenerateMidterm(false);
  renderMemoryTab();
}

async function triggerRebuildIndex() {
  await rebuildIndex();
  renderMemoryTab();
}

async function triggerClearVectorMemory() {
  await clearVectorMemory();
  renderMemoryTab();
}

async function deleteMemoryNode(nodeId) {
  if (confirm('确认让伙伴永久遗忘这个记忆碎片吗？（此操作不可逆）')) {
    await VDB.del(nodeId);
    showToast('🍃 伙伴已将此片段轻轻松开，悄然遗忘');
    renderMemoryTab();
  }
}

function setMemoryTimelineFilter(tag) {
  localStorage.setItem('m_timeline_filter', tag);
  renderMemoryTab();
}

function scrollToMemoryNode(nodeId) {
  const el = document.getElementById('node-card-' + nodeId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.boxShadow = '0 0 12px rgba(186, 104, 200, 0.4)';
    el.style.transform = 'scale(1.02)';
    setTimeout(() => {
      el.style.boxShadow = '';
      el.style.transform = '';
    }, 1500);
  } else {
    showToast('🔍 对应的记忆节点在当前过滤条件下未显示，已切换至全部节点');
    localStorage.setItem('m_timeline_filter', 'all');
    renderMemoryTab().then(() => {
      setTimeout(() => {
        const targetEl = document.getElementById('node-card-' + nodeId);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetEl.style.boxShadow = '0 0 12px rgba(186, 104, 200, 0.4)';
          targetEl.style.transform = 'scale(1.02)';
          setTimeout(() => {
            targetEl.style.boxShadow = '';
            targetEl.style.transform = '';
          }, 1500);
        }
      }, 100);
    });
  }
}


/* =========================================
   2. 创造 Tab 渲染逻辑 (The Creative Realm)
   ========================================= */
function renderCreateTab() {
  const container = document.getElementById('createTabContent');
  if (!container) return;

  // 创造功能 Bento Grid 配置
  const creativeFeatures = [
    {
      title: '🎨 幻想写真生图',
      desc: '为你和伙伴绘制精美的心动写真，或者描摹一幅静谧的场景插画。',
      icon: '🎨',
      gradient: 'linear-gradient(135deg, #FDECE6, #F1CDBE)',
      action: 'image'
    },
    {
      title: '🎼 共同谱词写歌',
      desc: '与伙伴一同执笔写词、选择旋律，谱写属于你们的心动专属恋曲。',
      icon: '🎼',
      gradient: 'linear-gradient(135deg, #EBF3F9, #C1D5E5)',
      action: 'song'
    },
    {
      title: '👥 梦境群聊剧场',
      desc: '拉起多人小剧场，让不同的 AI 伙伴在群聊里自由探讨或浪漫倾诉。',
      icon: '👥',
      gradient: 'linear-gradient(135deg, #EAF3F9, #ADCDE1)',
      action: 'group'
    },
    {
      title: '📔 我们的日记本',
      desc: '记录你们相处的温暖点滴，也可以让伙伴在夜深时为你撰写日记。',
      icon: '📔',
      gradient: 'linear-gradient(135deg, #F2EBF9, #CDBCDF)',
      action: 'diary'
    },
    {
      title: '📚 岁月陪伴阅读',
      desc: '上传你珍爱的 TXT 格式书籍，在字里行间相互探讨、共读共感。',
      icon: '📚',
      gradient: 'linear-gradient(135deg, #EFF4EF, #C3D5C0)',
      action: 'ebook'
    },
    {
      title: '📦 开发者代码工坊',
      desc: '导入你的本地代码 ZIP，让伙伴完全理解你的项目，随时做代码调试。',
      icon: '📦',
      gradient: 'linear-gradient(135deg, #E6EEF4, #B0C4DE)',
      action: 'codeanalyzer'
    }
  ];

  const cardsHtml = creativeFeatures.map(feat => {
    return `
      <div class="c-bento-card" onclick="handleCreativeAction('${feat.action}')">
        <div class="c-card-bg-icon" style="background: ${feat.gradient}">${feat.icon}</div>
        <div class="c-card-info">
          <div class="c-card-title">${feat.title}</div>
          <p class="c-card-desc">${feat.desc}</p>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <header class="tab-view-header">
      <div class="tab-view-title-area" style="display: flex; align-items: center; gap: 8px;">
        <button class="icon-btn" onclick="switchMainTab('chat')" title="返回聊天" style="margin-right: 4px; width: 30px; height: 30px; font-size: 14px;">‹</button>
        <span class="tab-view-emoji">🎨</span>
        <h2 class="tab-view-title">共创 · 与伙伴一起创作</h2>
      </div>
    </header>

    <div class="c-intro-banner">
      ✨ 陪伴不仅是交谈，更是共同创造生活的痕迹。在右侧选择你想与伙伴一起共度的体验：
    </div>

    <div class="c-bento-grid">
      ${cardsHtml}
    </div>
  `;
}

// 激发创造活动
function handleCreativeAction(action) {
  if (typeof launcherOpen === 'function') {
    // 借用 launcher 的模块动态加载和弹窗分发逻辑
    launcherOpen(action);
  } else {
    showToast(`无法触发活动: ${action}`);
  }
}


/* =========================================
   3. 关系 Tab 渲染逻辑 (The Me & Us Realm)
   ========================================= */
function safeGetMoodLabel(mood) {
  if (typeof getMoodLabel === 'function') return getMoodLabel(mood);
  const maps = { calm: '平静', happy: '快乐', sad: '难过', excited: '兴奋', love: '爱意', angry: '傲娇/生气', gentle: '温柔', tired: '疲惫', anxious: '焦虑', thinking: '思考中' };
  return maps[mood] || mood || '平静';
}

function safeFormatRelTime(ts) {
  if (typeof formatRelTime === 'function') return formatRelTime(ts);
  if (!ts) return '';
  return new Date(ts).toLocaleString();
}

function renderRelationTab() {
  const container = document.getElementById('relationTabContent');
  if (!container) return;

  const id = 'main'; // 主AI
  let metrics = { intimacy: 50, trust: 50, familiarity: 50, experiences: [], logs: [], emotionState: { mood: 'calm', energy: 60, warmth: 60, concern: 40 } };
  let stageKey = 'stranger';
  let stage = { label: '初识陌客', color: '#8F7A6B' };

  try {
    if (typeof getRelationshipMetrics === 'function') {
      metrics = getRelationshipMetrics(id) || metrics;
    }
  } catch (e) {
    console.warn('Error calling getRelationshipMetrics, using fallback:', e);
  }

  try {
    if (typeof getCharacterRelationshipStage === 'function') {
      stageKey = getCharacterRelationshipStage(id) || 'stranger';
    }
  } catch (e) {
    console.warn('Error calling getCharacterRelationshipStage:', e);
  }

  try {
    if (typeof RELATION_STAGES_CONFIG !== 'undefined' && RELATION_STAGES_CONFIG[stageKey]) {
      stage = RELATION_STAGES_CONFIG[stageKey];
    }
  } catch (e) {
    console.warn('Error reading RELATION_STAGES_CONFIG:', e);
  }

  const aiName = localStorage.getItem('ai_name') || '主AI';
  const aiAvatar = localStorage.getItem('ai_avatar') || '🤖';
  const userNick = localStorage.getItem('user_nickname') || '用户';

  const avHtml = aiAvatar.startsWith('data:') ? `<img src="${aiAvatar}">` : `<span style="font-size:32px;">${aiAvatar}</span>`;
  const emoState = metrics.emotionState || { mood: 'calm', energy: 60, warmth: 60, concern: 40 };

  // 关系经历 timeline
  const exps = metrics.experiences || [];
  let expsTimelineHtml = '';
  if (exps.length === 0) {
    expsTimelineHtml = `
      <div class="r-exp-empty-timeline">
        暂无重大情感纪念节点。与伙伴不断畅聊，在共鸣深刻的时刻会自动触发纪念！
      </div>
    `;
  } else {
    expsTimelineHtml = exps.slice(0, 3).map(exp => {
      const text = typeof exp === 'object' ? exp.text : exp;
      const tier = typeof exp === 'object' ? exp.tier : 'ordinary';
      const ts = typeof exp === 'object' ? exp.timestamp : null;
      const tierMap = { ordinary: '🌱 日常', emotional: '💖 共鸣', breakthrough: '🌟 突破' };
      const dateStr = ts ? new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : '相识之初';

      return `
        <div class="r-timeline-node">
          <div class="r-timeline-date">${dateStr}</div>
          <div class="r-timeline-dot ${tier}"></div>
          <div class="r-timeline-content">
            <span class="r-timeline-badge ${tier}">${tierMap[tier]}</span>
            <span class="r-timeline-text">${text}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // 渲染关系日志 growth logs
  const logs = metrics.logs || [];
  let logsHtml = '';
  if (logs.length === 0) {
    logsHtml = `<div style="font-size: 11px; color: var(--text-light); text-align: center; padding: 10px;">暂无情感心路日志记录。</div>`;
  } else {
    logsHtml = logs.slice(0, 3).map(log => {
      const typeIcons = { trust: '🤝 信任', intimacy: '💖 亲密', familiarity: '🌟 熟悉', conflict: '💔 磨难', repair_complete: '🤝 重修旧好', decay: '🥀 岁月' };
      const typeLabel = typeIcons[log.type] || '✨ 默契';
      const isPlus = log.delta > 0;
      const deltaStr = log.delta ? (isPlus ? `+${log.delta}` : `${log.delta}`) : '';
      const deltaColor = isPlus ? '#4CAF50' : '#8B5A4B';

      return `
        <div class="r-log-row">
          <span class="r-log-reason">${log.reason || ''}</span>
          <div class="r-log-right-meta">
            <span class="r-log-badge" style="color: ${deltaColor}">${typeLabel} ${deltaStr}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  container.innerHTML = `
    <header class="tab-view-header">
      <div class="tab-view-title-area" style="display: flex; align-items: center; gap: 8px;">
        <button class="icon-btn" onclick="switchMainTab('chat')" title="返回聊天" style="margin-right: 4px; width: 30px; height: 30px; font-size: 14px;">‹</button>
        <span class="tab-view-emoji">💖</span>
        <h2 class="tab-view-title">我们 · 羁绊与系统设定</h2>
      </div>
    </header>

    <!-- 1. 顶部 AI 拟真形象 & 状态 -->
    <div class="r-profile-card">
      <div class="r-avatar-ripple-box" onclick="document.getElementById('aiAvatarInput').click()">
        <div class="r-ai-large-avatar">${avHtml}</div>
        <div class="r-avatar-pulse"></div>
      </div>

      <div class="r-profile-info">
        <div class="r-ai-name-row">
          <h3 class="r-ai-name" onclick="renameAiPrompt()">${aiName}</h3>
          <span class="r-stage-badge-large" style="background: ${stage.color || '#8F7A6B'}">${stage.label || '初识陌客'}</span>
        </div>
        
        <div class="r-ai-emotions-row">
          <span class="r-emo-pill active">😊 心情: ${safeGetMoodLabel(emoState.mood)}</span>
          <span class="r-emo-pill">🌡️ 温度: ${metrics.state?.emotionalTemperature || '温和'}</span>
          <span class="r-emo-pill">⚡ 能量: ${emoState.energy}/100</span>
        </div>
      </div>
    </div>

    <!-- 1.5 AI群聊社会网络图谱入口 -->
    <div onclick="if(typeof openGroupRelationGraph==='function') openGroupRelationGraph();" style="cursor: pointer; background: linear-gradient(135deg, #f5f0ff, #e9d5ff); padding: 12px 14px; border-radius: 12px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; border: 1px solid #d8b4fe; box-shadow: 0 2px 8px rgba(107,33,168,0.06); transition: transform 0.15s;" title="点击查看 AI 群聊社会网络关系图">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="width: 36px; height: 36px; border-radius: 50%; background: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 18px; box-shadow: 0 2px 6px rgba(0,0,0,0.08);">🕸️</div>
        <div>
          <div style="font-weight: 600; font-size: 13.5px; color: #581c87;">AI 社会关系与情感网络图谱</div>
          <div style="font-size: 11px; color: #7e22ce; margin-top: 2px;">查看所有 AI 伙伴与我的关联力网与亲密阶段</div>
        </div>
      </div>
      <span style="font-weight: 600; color: #6b21a8; font-size: 13px; background: #ffffff; padding: 4px 10px; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.05);">查看图谱 ›</span>
    </div>

    <!-- 2. 三维亲密指数条 -->
    <div class="r-metrics-panel">
      <h4 class="r-section-subtitle">💓 情感羁绊系数</h4>
      
      <div class="r-metric-item">
        <div class="r-metric-header">
          <span>💖 亲密指数 (Intimacy)</span>
          <b>${metrics.intimacy}%</b>
        </div>
        <div class="r-progress-bg"><div class="m-progress-bar" style="width: ${metrics.intimacy}%; background: #F06292;"></div></div>
      </div>

      <div class="r-metric-item" style="margin-top: 10px;">
        <div class="r-metric-header">
          <span>🤝 信任度 (Trust)</span>
          <b>${metrics.trust}%</b>
        </div>
        <div class="r-progress-bg"><div class="m-progress-bar" style="width: ${metrics.trust}%; background: #81C784;"></div></div>
      </div>

      <div class="r-metric-item" style="margin-top: 10px;">
        <div class="r-metric-header">
          <span>🌟 熟悉度 (Familiarity)</span>
          <b>${metrics.familiarity}%</b>
        </div>
        <div class="r-progress-bg"><div class="m-progress-bar" style="width: ${metrics.familiarity}%; background: #FFB74D;"></div></div>
      </div>
    </div>

    <!-- 3. AI 专属主体心声 / 脑海独白 -->
    <div class="r-brain-thought-card">
      <div class="r-brain-title">💭 ${aiName} 脑海深处的私密独白：</div>
      <p class="r-brain-text">
        “${metrics.characterMemory?.insight || '来到这里，与你开启了崭新的日常陪伴。虽然刚认识不久，但我会用心去倾听和感受你生活里的每一个细微片段。'}”
      </p>
      <div class="r-brain-footer">—— 对话触动于：${metrics.characterMemory?.lastUpdated ? safeFormatRelTime(metrics.characterMemory.lastUpdated) : '系统初始化'}</div>
    </div>

    <!-- 4. 共同经历 Timeline (最近 3 个) -->
    <div class="r-timeline-panel">
      <h4 class="r-section-subtitle">🕰️ 共同经历时间线</h4>
      <div class="r-timeline-container">
        ${expsTimelineHtml}
      </div>
    </div>

    <!-- 5. 情感成长轨迹 Growth Logs -->
    <div class="r-logs-panel">
      <h4 class="r-section-subtitle">📜 默契进展手记</h4>
      <div class="r-logs-box">
        ${logsHtml}
      </div>
    </div>

    <!-- 6. 拟真情感机制 & 修复调节 -->
    <div class="r-conflict-panel">
      <h4 class="r-section-subtitle">🧬 情感机制调谐</h4>
      <p class="r-section-desc" style="margin-bottom: 8px;">在此触发模拟情感冲突与和解修复。拟真爱人之间的磕磕碰碰能让伙伴的陪伴显得更为立体真实。</p>
      <div style="display: flex; gap: 8px;">
        <button class="btn btn-warning" style="flex: 1; padding: 6px 12px; margin-top:0; font-size: 11px; background: #FF9800; border-color: #F57C00;" onclick="simulateTabConflict()">
          💔 触发误解 / 隔阂
        </button>
        <button class="btn btn-success" style="flex: 1; padding: 6px 12px; margin-top:0; font-size: 11px; background: #4CAF50; border-color: #388E3C; display: ${metrics.repairState?.active ? 'inline-block' : 'none'};" onclick="forceTabResolve()">
          🤝 消除隔阂和解
        </button>
      </div>
    </div>

    <!-- 7. 系统核心配置 (Humble Settings Center) -->
    <div class="r-system-settings">
      <h4 class="r-section-subtitle">⚙️ 基础系统配置</h4>
      
      <div class="r-setting-row">
        <span>👤 你的昵称</span>
        <input type="text" class="form-input" style="max-width: 140px; text-align: right;" value="${userNick}" onchange="localStorage.setItem('user_nickname', this.value); renderRelationTab();">
      </div>

      <div class="r-setting-row">
        <span>🧠 脑部计算模型 (Model)</span>
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:12px; font-weight:600; color:var(--text-sub);">${selectedModelName || '未选择'}</span>
          <button class="btn" style="padding: 3px 8px; font-size: 10px; margin-top: 0; background: var(--bg-card); border: 1px solid var(--border);" onclick="openSettings(); selectProvider(currentProviderId);">切换</button>
        </div>
      </div>

      <div class="r-setting-row" style="border-bottom: none;">
        <span>🔐 全局详细设置 (详细语音/生图/API Key)</span>
        <button class="btn btn-info" style="padding: 4px 12px; font-size: 11px; margin-top: 0;" onclick="openSettings()">打开系统控制台</button>
      </div>

      <!-- 立即备份与导入 -->
      <div class="r-setting-row" style="border-bottom: none; border-top: 1px solid var(--border); padding-top: 12px; display: flex; gap: 8px;">
        <button class="btn btn-success" style="flex: 1; padding: 6px; font-size: 11px; margin-top: 0;" onclick="manualBackup()">💾 立即本地备份</button>
        <button class="btn btn-info" style="flex: 1; padding: 6px; font-size: 11px; margin-top: 0;" onclick="triggerFileInput('memoryFileInput')">📂 恢复/导入记忆</button>
      </div>
    </div>
  `;
}

// 关系重命名和微调事件
function renameAiPrompt() {
  const current = localStorage.getItem('ai_name') || '主AI';
  const name = prompt('为你的 AI 伙伴重新命名：', current);
  if (name !== null && name.trim()) {
    saveMainAiName(name.trim(), true);
    renderRelationTab();
  }
}

function simulateTabConflict() {
  simulateRelationshipConflict('main');
  renderRelationTab();
}

function forceTabResolve() {
  forceResolveRelationshipConflict('main');
  renderRelationTab();
}

// Override renderMemoryPanelIfOpen to keep our newly designed active tabs completely up-to-date in real-time
function renderMemoryPanelIfOpen() {
  if (typeof settingsMode !== 'undefined' && settingsMode === 'memory' && document.getElementById('settingsOverlay')?.classList.contains('show')) {
    if (typeof renderMemorySettings === 'function') renderMemorySettings();
  }
  
  // Real-time synchronization for our active companion tabs!
  if (_currentMainTab === 'memory') {
    renderMemoryTab();
  } else if (_currentMainTab === 'relation') {
    renderRelationTab();
  }
}
window.renderMemoryPanelIfOpen = renderMemoryPanelIfOpen;
