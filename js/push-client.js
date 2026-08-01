// ── PWA Push Notification Client ──
// Handles push subscription for PWA proactive care notifications on iOS/Android

const PUSH_SERVER_URL = '/api/push';

// ── Check if the environment supports push ──
function isPushSupported() {
  return 'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;
}

// ── Get VAPID public key from server ──
async function fetchVapidPublicKey() {
  try {
    const res = await fetch(`${PUSH_SERVER_URL}/vapid-public-key`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.publicKey;
  } catch (err) {
    console.warn('[PushClient] Failed to fetch VAPID public key:', err);
    return null;
  }
}

// ── Get current push subscription from Service Worker ──
async function getCurrentSubscription() {
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch (err) {
    console.warn('[PushClient] Failed to get subscription:', err);
    return null;
  }
}

// ── Subscribe to push notifications ──
async function subscribeToPush() {
  if (!isPushSupported()) {
    console.log('[PushClient] Push notifications not supported in this browser');
    return false;
  }

  // Check permission
  if (Notification.permission === 'denied') {
    console.log('[PushClient] Notification permission denied');
    return false;
  }

  // Request permission if not yet decided
  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[PushClient] Notification permission not granted');
      return false;
    }
  }

  // 权限已授权 → 标记为已订阅（如后端VAPID不存在则静默降级，不再重复请求）
  localStorage.setItem('push_subscribed', 'true');

  try {
    const registration = await navigator.serviceWorker.ready;
    const publicKey = await fetchVapidPublicKey();
    if (!publicKey) {
      console.log('[PushClient] VAPID backend not available, using local Notification API only');
      return true;
    }

    // Unsubscribe existing subscription first if any
    const existingSub = await registration.pushManager.getSubscription();
    if (existingSub) {
      await existingSub.unsubscribe();
    }

    // Convert base64 VAPID key to Uint8Array
    const keyBuffer = urlBase64ToUint8Array(publicKey);

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBuffer
    });

    // Send subscription to server
    const res = await fetch(`${PUSH_SERVER_URL}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON())
    });

    if (!res.ok) throw new Error(`Server subscribe failed: ${res.status}`);
    console.log('[PushClient] Successfully subscribed to push notifications');
    return true;
  } catch (err) {
    console.warn('[PushClient] VAPID subscription failed (non-critical):', err.message);
    return true; // 权限已授权，视为成功
  }
}

// ── Unsubscribe from push notifications ──
async function unsubscribeFromPush() {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      // Tell server to remove subscription
      await fetch(`${PUSH_SERVER_URL}/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      }).catch(() => {});

      await subscription.unsubscribe();
    }
    localStorage.setItem('push_subscribed', 'false');
    console.log('[PushClient] Unsubscribed from push notifications');
    return true;
  } catch (err) {
    console.error('[PushClient] Unsubscribe failed:', err);
    return false;
  }
}

// ── Check subscription status and auto-subscribe if needed ──
async function ensurePushSubscription() {
  if (!isPushSupported()) return false;

  const alreadySubscribed = localStorage.getItem('push_subscribed') === 'true';
  if (alreadySubscribed) {
    // Verify subscription is still valid on the server side
    const sub = await getCurrentSubscription();
    if (sub) return true;
    // Subscription was lost, re-subscribe
  }

  return await subscribeToPush();
}

// ── Request push send for proactive care (called by proactive.js) ──
async function sendProactivePushNotification(title, body) {
  try {
    const res = await fetch(`${PUSH_SERVER_URL}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title || 'AI 陪伴',
        body: body || '💌 AI 主动发来一条消息',
        tag: 'proactive-care',
        url: '/'
      })
    });
    if (!res.ok) throw new Error(`Push send failed: ${res.status}`);
    return true;
  } catch (err) {
    console.warn('[PushClient] Failed to send push notification:', err);
    return false;
  }
}

// ── Utility: Convert URL-safe base64 string to Uint8Array ──
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

// ── Listen for notification click messages from Service Worker ──
if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
      const url = event.data.url || '/';
      // If the app has a tab system, navigate to the right tab
      if (typeof switchMainTab === 'function') {
        const hash = url.replace(/^.*#/, '');
        if (hash) switchMainTab(hash);
      }
    }
  });
}

// ── Expose globally for other modules ──
window.pushClient = {
  isSupported: isPushSupported,
  subscribe: subscribeToPush,
  unsubscribe: unsubscribeFromPush,
  ensureSubscription: ensurePushSubscription,
  sendProactive: sendProactivePushNotification,
  getSubscription: getCurrentSubscription
};
