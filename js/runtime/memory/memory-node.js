/**
 * 💾 MemoryNode: The unified memory structure of the Cognitive OS.
 * Represents any node inside the MemoryGraph.
 */
class MemoryNode {
  constructor(data = {}) {
    this.id = data.id || 'mem_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    this.owner = data.owner || 'user'; // 'user' | 'main' | specific AI member ID
    this.scope = data.scope || 'relationship'; // 'private' | 'relationship' | 'group' | 'global'
    this.type = data.type || 'episodic'; // 'working' | 'episodic' | 'semantic' | 'reflection' | 'relationship' | 'story'
    this.importance = typeof data.importance === 'number' ? data.importance : 3; // 1 to 5
    this.confidence = typeof data.confidence === 'number' ? data.confidence : 1.0; // 0.0 to 1.0
    this.summary = (data.summary || '').trim();
    this.timestamp = data.timestamp || Date.now();
    this.metadata = data.metadata || {}; // e.g. { emotion: '', tags: [], threadId: '', stage: '' }
  }

  /**
   * Serializes node into plain JSON
   */
  toJSON() {
    return {
      id: this.id,
      owner: this.owner,
      scope: this.scope,
      type: this.type,
      importance: this.importance,
      confidence: this.confidence,
      summary: this.summary,
      timestamp: this.timestamp,
      metadata: this.metadata
    };
  }

  /**
   * Helper to format the node nicely for prompt contexts
   */
  toPromptString() {
    const timeStr = new Date(this.timestamp).toLocaleDateString('zh-CN');
    let metaStr = '';
    if (this.metadata.emotion) metaStr += `，情绪：${this.metadata.emotion}`;
    if (this.metadata.stage) metaStr += `，关系：${this.metadata.stage}`;
    
    return `· [${this.type.toUpperCase()} | ${timeStr}${metaStr}] ${this.summary}`;
  }
}

if (typeof window !== 'undefined') {
  window.MemoryNode = MemoryNode;
} else if (typeof module !== 'undefined') {
  module.exports = MemoryNode;
}
