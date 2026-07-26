/* ===== Memory Module ===== */

// VDB — 向量数据库封装
const VDB = (() => {
  async function put(rec) {
    if (window.MemoryGraph) {
      const node = window.MemoryGraph.fromVDBRecord(rec);
      await window.MemoryGraph.addNode(node);
    }
  }
  async function del(id) {
    if (window.MemoryGraph) { try { await window.MemoryGraph.deleteNode(id); } catch (e) {} }
  }
  async function all() {
    if (window.MemoryGraph) {
      try { return await window.MemoryGraph.getAllNodes(); } catch (e) {}
    }
    return [];
  }
  async function get(id) {
    if (window.MemoryGraph) {
      try { return await window.MemoryGraph.getNode(id); } catch (e) {}
    }
    return null;
  }
  return { put, del, all, get };
})();

if (typeof window !== 'undefined') window.VDB = VDB;
export default VDB;
export { VDB };
