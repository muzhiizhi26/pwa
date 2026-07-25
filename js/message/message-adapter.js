/* ===== Message Adapter ===== */
const MessageAdapter = {
  /**
   * Normalize text input into StandardMessage
   */
  normalizeText(role = 'user', text = '', source = 'text') {
    return createStandardMessage({
      role,
      type: 'text',
      content: text,
      source
    });
  },

  /**
   * Normalize audio input into StandardMessage
   */
  normalizeAudio(role = 'user', transcript = '', audioData = null, emotion = null) {
    let audioUrl = null;
    let mimeType = 'audio/webm';

    if (audioData) {
      if (typeof audioData === 'string') {
        audioUrl = audioData.startsWith('data:') ? audioData : `data:audio/webm;base64,${audioData}`;
      } else if (audioData.dataUrl) {
        audioUrl = audioData.dataUrl;
      } else if (audioData.base64) {
        mimeType = audioData.mimeType || 'audio/webm';
        audioUrl = `data:${mimeType};base64,${audioData.base64}`;
      }
    }

    return createStandardMessage({
      role,
      type: 'audio',
      content: transcript ? transcript.trim() : '语音消息',
      source: 'voice',
      emotion,
      audioUrl,
      originalType: mimeType
    });
  },

  /**
   * Normalize image input into StandardMessage
   */
  normalizeImage(role = 'user', imageUrl = '', description = '') {
    return createStandardMessage({
      role,
      type: 'image',
      content: description || '[图片]',
      source: 'camera',
      audioUrl: imageUrl,
      originalType: 'image/webp'
    });
  }
};

if (typeof window !== 'undefined') {
  window.MessageAdapter = MessageAdapter;
}
