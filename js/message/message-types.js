/* ===== Standard Message Object Types ===== */
/**
 * @typedef {Object} StandardMessage
 * @property {string} id
 * @property {"user" | "assistant" | "system"} role
 * @property {"text" | "audio" | "image" | "video" | "file"} type
 * @property {string} content
 * @property {Object} metadata
 * @property {"text" | "voice" | "camera" | "file"} metadata.source
 * @property {{mood: "happy" | "sad" | "tired" | "angry" | "calm" | "neutral", confidence: number}} [metadata.emotion]
 * @property {string} [metadata.audioUrl]
 * @property {string} [metadata.originalType]
 * @property {number} timestamp
 */

function createStandardMessage({
  id = null,
  role = 'user',
  type = 'text',
  content = '',
  source = 'text',
  emotion = null,
  audioUrl = null,
  originalType = null,
  timestamp = null
}) {
  return {
    id: id || (typeof genUid === 'function' ? genUid() : 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
    role,
    type,
    content: content || '',
    metadata: {
      source: source || 'text',
      ...(emotion ? { emotion } : {}),
      ...(audioUrl ? { audioUrl } : {}),
      ...(originalType ? { originalType } : {})
    },
    timestamp: timestamp || Date.now()
  };
}

if (typeof window !== 'undefined') {
  window.createStandardMessage = createStandardMessage;
}
