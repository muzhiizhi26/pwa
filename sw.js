const CACHE_NAME = 'morandi-ai-v17';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/manifest.json',
  '/js/config.js',
  '/js/utils.js',
  '/js/memory.js',
  '/js/memory-tiers.js',
  '/js/attention-manager.js',
  '/js/rhythm-engine.js',
  '/js/narrative.js',
  '/js/memory-bridge.js',
  '/js/relationship.js',
  '/js/evolution.js',
  '/js/runtime/memory/memory-node.js',
  '/js/runtime/memory/memory-graph.js',
  '/js/runtime/runtime.js',
  '/js/runtime/context.js',
  '/js/runtime/prompt-builder.js',
  '/js/runtime/models/user-model.js',
  '/js/runtime/models/relationship-model.js',
  '/js/runtime/models/ai-model.js',
  '/js/runtime/models/group-model.js',
  '/js/runtime/models/world-model.js',
  '/js/emotion.js',
  '/js/voice.js',
  '/js/call.js',
  '/js/imagegen.js',
  '/js/music.js',
  '/js/songcraft.js',
  '/js/ebook.js',
  '/js/group.js',
  '/js/diary.js',
  '/js/code-analyzer.js',
  '/js/project-context.js',
  '/js/proactive.js',
  '/js/launcher.js',
  '/js/settings.js',
  '/js/orchestrator.js',
  '/js/chat.js',
  '/js/moments.js',
  '/js/tabs.js',
  '/js/main.js',
  '/emotions/angry.webp',
  '/emotions/anxious.webp',
  '/emotions/calm.webp',
  '/emotions/excited.webp',
  '/emotions/gentle.webp',
  '/emotions/happy.webp',
  '/emotions/love.webp',
  '/emotions/sad.webp',
  '/emotions/thinking.webp'
];

// Install Service Worker and cache essential assets safely using Promise.allSettled
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline assets securely');
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) => {
          return cache.add(url).catch((err) => {
            console.warn(`[Service Worker] Failed to cache asset: ${url}`, err);
          });
        })
      );
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate and clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting obsolete cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch with Stale-While-Revalidate strategy for static resources
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Avoid intercepting third-party API or external domains (e.g. pollinations, vectorengine API)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Avoid caching dynamic API requests, range requests, or non-GET requests
  if (url.pathname.startsWith('/api/') || 
      event.request.method !== 'GET' || 
      event.request.headers.get('Range') || 
      event.request.headers.get('range')) {
    return;
  }

  // SPA navigation fallback handler
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/index.html').then((cachedResponse) => {
          return cachedResponse || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/html' } });
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Only cache valid GET responses from our origin for standard static assets
        if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
          const path = url.pathname.toLowerCase();
          const isStatic = ASSETS_TO_CACHE.includes(path) || 
                           path.endsWith('/') || 
                           /\.(js|css|webp|png|jpg|jpeg|gif|svg|json|ico|woff2|txt|html)$/.test(path);
          
          if (isStatic) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
        }
        return networkResponse;
      }).catch((err) => {
        console.warn('[Service Worker] Fetch failed, serving cached fallback:', err);
        // Fallback response instead of resolving to undefined
        if (cachedResponse) {
          return cachedResponse;
        }
        return caches.match('/index.html').then((fallbackResponse) => {
          return fallbackResponse || new Response('Offline', { status: 503 });
        });
      });

      if (cachedResponse) {
        // On iOS Safari, we MUST pass background tasks to event.waitUntil 
        // to prevent the OS from killing the Service Worker thread prematurely.
        event.waitUntil(fetchPromise);
        return cachedResponse;
      }

      return fetchPromise;
    })
  );
});
