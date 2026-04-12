// ═══════════════════════════════════════════════
// English Master — Service Worker
// Gère le cache pour fonctionner hors connexion
// ═══════════════════════════════════════════════

const CACHE_NAME = 'english-master-v1';

// Fichiers à mettre en cache au premier lancement
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // Google Fonts (optionnel — cachées après premier chargement)
  'https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Literata:ital,wght@0,300;0,400;0,600;1,400&display=swap'
];

// ── INSTALL : mise en cache des ressources statiques ──
self.addEventListener('install', (event) => {
  console.log('[SW] Installation en cours...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Mise en cache des ressources statiques');
      // On ignore les erreurs pour les ressources externes (fonts)
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Impossible de cacher:', url, err))
        )
      );
    }).then(() => {
      console.log('[SW] Installation terminée');
      return self.skipWaiting(); // Active immédiatement le nouveau SW
    })
  );
});

// ── ACTIVATE : nettoyage des vieux caches ──
self.addEventListener('activate', (event) => {
  console.log('[SW] Activation...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Suppression vieux cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Activé — contrôle de tous les clients');
      return self.clients.claim();
    })
  );
});

// ── FETCH : stratégie Cache First avec fallback réseau ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignorer les requêtes non-GET et les extensions de navigateur
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Stratégie spéciale pour le TTS Google Translate — réseau uniquement
  // (le TTS ne doit pas être caché, il génère l'audio à la volée)
  if (url.hostname === 'translate.google.com') {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Si hors ligne, retourner une réponse vide — l'app bascule sur Web Speech
        return new Response('', { status: 503, statusText: 'Offline - TTS unavailable' });
      })
    );
    return;
  }

  // Pour Google Fonts — Network First (essaie le réseau, puis le cache)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Met en cache la réponse fraîche
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Pour tout le reste — Cache First (cache, sinon réseau)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Ressource en cache trouvée
        return cachedResponse;
      }
      // Pas en cache — on va sur le réseau
      return fetch(event.request).then((networkResponse) => {
        // On cache la nouvelle ressource pour la prochaine fois
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        // Hors ligne et pas en cache — page d'erreur offline
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── MESSAGE : force la mise à jour depuis l'app ──
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
