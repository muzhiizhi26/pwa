/* ===== Multimodal Audio Utilities ===== */
const MultimodalAudio = {
  /**
   * Convert Audio Blob to Base64 String and Data URL
   */
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result || '';
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
        resolve({ dataUrl, base64 });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  /**
   * Rule-based lightweight emotion detector from text transcript
   */
  detectEmotion(transcript) {
    if (!transcript) return { mood: 'neutral', confidence: 0.5 };
    const text = transcript.toLowerCase();
    if (/累|疲|撑不住|崩溃|病|痛苦|绝望|难受/.test(text)) {
      return { mood: 'tired', confidence: 0.90 };
    }
    if (/开心|高兴|太棒了|哈哈|爱|期待|喜欢|好棒/.test(text)) {
      return { mood: 'happy', confidence: 0.92 };
    }
    if (/难过|伤心|哭|委屈|难受|遗憾|失落/.test(text)) {
      return { mood: 'sad', confidence: 0.88 };
    }
    if (/生气|烦|滚|讨厌|发火|凭什么|疯了/.test(text)) {
      return { mood: 'angry', confidence: 0.88 };
    }
    return { mood: 'calm', confidence: 0.80 };
  }
};

if (typeof window !== 'undefined') {
  window.MultimodalAudio = MultimodalAudio;
}
