/* ===== Gemini Multimodal Service Helper ===== */
const GeminiMultimodalService = {
  /**
   * Build payload parts for Gemini multimodal requests (audio/image)
   */
  buildPayloadParts(promptText, currentAudio, currentImage) {
    const parts = [];
    const textPrompt = promptText || '请处理并理解消息';

    parts.push({ type: 'text', text: textPrompt });

    if (currentAudio && currentAudio.base64) {
      const mimeType = currentAudio.mimeType || 'audio/webm';
      parts.push({
        type: 'inline_data',
        mime_type: mimeType,
        data: currentAudio.base64
      });
    }

    if (currentImage) {
      parts.push({
        type: 'image_url',
        image_url: { url: currentImage }
      });
    }

    return parts;
  }
};

if (typeof window !== 'undefined') {
  window.GeminiMultimodalService = GeminiMultimodalService;
}
