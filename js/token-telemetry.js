/* ===== Token 遥测（从 memory-tiers.js 拆分） ===== */
function estimateLovestoryTokens(value) {
  if (!value) return 0;
  let text = '';
  if (Array.isArray(value)) text = value.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join('\n');
  else if (typeof value === 'object') text = JSON.stringify(value);
  else text = String(value);
  let total = 0;
  for (const ch of text) total += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 1 : 0.3;
  return Math.ceil(total);
}

function getTokenTelemetryLog() {
  try {
    const parsed = JSON.parse(localStorage.getItem('lovestory_token_telemetry') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch(e) {
    return [];
  }
}

function recordTokenTelemetry(entry) {
  try {
    const log = getTokenTelemetryLog();
    const inputTokens = entry.inputTokens != null ? entry.inputTokens : estimateLovestoryTokens(entry.input || entry.messages || '');
    const outputTokens = entry.outputTokens != null ? entry.outputTokens : estimateLovestoryTokens(entry.output || '');
    log.unshift({
      ts: Date.now(),
      caller: entry.caller || 'unknown',
      provider: entry.provider || '',
      model: entry.model || '',
      promptChars: entry.promptChars || 0,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      meta: entry.meta || {}
    });
    localStorage.setItem('lovestory_token_telemetry', JSON.stringify(log.slice(0, 80)));
  } catch(e) {
    console.warn('[TokenTelemetry] record failed:', e);
  }
}

window.estimateLovestoryTokens = estimateLovestoryTokens;
window.getTokenTelemetryLog = getTokenTelemetryLog;
window.recordTokenTelemetry = recordTokenTelemetry;
