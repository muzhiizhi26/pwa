/* ===== Multimodal Runtime ===== */
const MultimodalRuntime = {
  enabled: true,

  dispatchInput(inputObj) {
    if (!this.enabled || !inputObj) return null;

    let standardMsg = null;
    const role = inputObj.role || 'user';

    if (inputObj.type === 'audio') {
      standardMsg = MessageAdapter.normalizeAudio(
        role,
        inputObj.transcript || inputObj.content,
        inputObj.audioData || inputObj.base64,
        inputObj.emotion
      );
    } else if (inputObj.type === 'image') {
      standardMsg = MessageAdapter.normalizeImage(
        role,
        inputObj.imageUrl || inputObj.image,
        inputObj.description || inputObj.content
      );
    } else {
      standardMsg = MessageAdapter.normalizeText(
        role,
        inputObj.content || inputObj.text || '',
        inputObj.source || 'text'
      );
    }

    return standardMsg;
  }
};

if (typeof window !== 'undefined') {
  window.MultimodalRuntime = MultimodalRuntime;
}
