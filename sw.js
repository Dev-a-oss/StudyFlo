// ============================================================
// StudyFlow Service Worker — sw.js
// Place this file at the ROOT of your project (same as index.html)
// Version: bump this string to force cache refresh on redeploy
// ============================================================

const CACHE_NAME    = 'studyflow-v1';
const OFFLINE_PAGE  = '/index.html';

// Files to pre-cache on install (app shell)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/resources.html',
  '/upload.html',
  '/community.html',
  '/chat.html',
  '/assistant.html',
  '/premium.html',
  '/profile.html',
  '/settings.html',
  '/faq.html',
  '/terms.html',
  '/auth.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── INSTALL: pre-cache the app shell ──
self.addEventListener('install', event => {
  console.log('[SW] Installing StudyFlow service worker…');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching app shell');
        // addAll fails if ANY request fails, so we cache individually
        return Promise.allSettled(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(err =>
              console.warn('[SW] Could not cache:', url, err)
            )
          )
        );
      })
      .then(() => self.skipWaiting())  // activate immediately
  );
});

// ── ACTIVATE: delete old caches ──
self.addEventListener('activate', event => {
  console.log('[SW] Activating StudyFlow service worker…');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())  // take control immediately
  );
});

// ── FETCH: network-first for API/Firebase, cache-first for assets ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if(request.method !== 'GET') return;

  // Skip cross-origin requests we don't control
  // (Firebase, Cloudinary, Google APIs, Fonts — let them handle themselves)
  const skipHosts = [
    'firebaseapp.com',
    'googleapis.com',
    'gstatic.com',
    'cloudinary.com',
    'unpkg.com',
    'fonts.gstatic.com',
    'api.groq.com',
    'buy.stripe.com',
  ];
  if(skipHosts.some(h => url.hostname.includes(h))) return;

  // ── Strategy: Network First with Cache Fallback ──
  // Try network, serve fresh content; fall back to cache if offline
  event.respondWith(
    fetch(request)
      .then(response => {
        // Only cache successful same-origin responses
        if(
          response.ok &&
          response.status === 200 &&
          url.origin === self.location.origin
        ){
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, cloned));
        }
        return response;
      })
      .catch(() => {
        // Network failed — try cache
        return caches.match(request).then(cached => {
          if(cached) return cached;
          // If it's a navigation (page load), show offline fallback
          if(request.mode === 'navigate'){
            return caches.match(OFFLINE_PAGE);
          }
          // Otherwise just fail silently
          return new Response('', { status: 408, statusText: 'Offline' });
        });
      })
  );
});

// ── PUSH NOTIFICATIONS (works with firebase-messaging-sw.js too) ──
self.addEventListener('push', event => {
  if(!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title:'StudyFlow', body: event.data.text() }; }

  const options = {
    body:    data.body    || 'You have a new notification',
    icon:    data.icon    || '/icons/icon-192.png',
    badge:   data.badge   || '/icons/icon-72.png',
    image:   data.image   || undefined,
    data:    data.url     ? { url: data.url } : {},
    actions: data.actions || [],
    vibrate: [100, 50, 100],
    tag:     data.tag     || 'studyflow-notification',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'StudyFlow', options)
  );
});

// ── NOTIFICATION CLICK: open the app ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/index.html';
  event.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true })
      .then(clientList => {
        // If app is already open, focus it
        for(const client of clientList){
          if(client.url.includes(self.location.origin) && 'focus' in client){
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // Otherwise open a new window
        return clients.openWindow(targetUrl);
      })
  );
});

// ── BACKGROUND SYNC (optional, for offline uploads) ──
self.addEventListener('sync', event => {
  if(event.tag === 'sync-uploads'){
    console.log('[SW] Background sync: retrying pending uploads…');
    // You can implement offline upload queue here in future
  }
});

console.log('[SW] StudyFlow service worker loaded ✓');