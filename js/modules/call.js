/* ===== 通话 Module ===== */

import { showToast, unlockAudioOnGesture } from '../utils.js';

/* 状态变量 */
export let callActive = false, callMuted = false, callStream = null, callMime = '';
export let callAudioCtx = null, micSource = null, vadNode = null, analyserFallback = null, fallbackRAF = null;
export let callRecorder = null, callChunks = [], recStopReason = '';
export let ttsSource = null, callStartTime = 0, callTimerInt = null;

/* VoiceSession 状态机 */
export const VoiceSession = {
  state: 'IDLE',
  transitionTo(newState, reason = '') {
    console.log(`[VoiceSession] ${this.state} -> ${newState} (${reason})`);
    this.state = newState;
    const av = document.getElementById('callAvatar');
    if (newState === 'SPEAKING') av?.classList.add('speaking');
    else av?.classList.remove('speaking');
    const statusMap = {
      IDLE: '通话结束', LISTENING: '正在聆听...', PROCESSING: '识别与思考中...',
      SPEAKING: 'AI 正在说话...', INTERRUPTED: '已打断，重置中...', RECOVERING: '正在恢复聆听...'
    };
    if (typeof setCallStatus === 'function') setCallStatus(statusMap[newState] || '', '');
  },
  bargeIn() {
    if (this.state !== 'SPEAKING') return;
    this.transitionTo('INTERRUPTED', 'user barge-in');
    if (ttsSource) { try { ttsSource.stop(); } catch (e) {} ttsSource = null; }
    showToast('🎙️ 已打断');
    this.transitionTo('LISTENING', 'seamless recovery');
  }
};

/* 关键导出函数 */
export function startCall() {
  if (typeof window._origStartCall === 'function') window._origStartCall();
}
export function endCall() {
  if (typeof window._origEndCall === 'function') window._origEndCall();
}
export function toggleCallMute() {
  if (typeof window._origToggleCallMute === 'function') window._origToggleCallMute();
}
export function confirmStartCall() {
  unlockAudioOnGesture();
  const gate = document.getElementById('callGate');
  if (gate) gate.classList.remove('show');
  if (typeof window._origConfirmStartCall === 'function') window._origConfirmStartCall();
}

// 导出到 window
if (typeof window !== 'undefined') {
  window.VoiceSession = VoiceSession;
  window.callActive = callActive;
  window.callMuted = callMuted;
  window.startCall = startCall;
  window.endCall = endCall;
  window.toggleCallMute = toggleCallMute;
  window.confirmStartCall = confirmStartCall;
}

export default { VoiceSession };
