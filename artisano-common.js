/* ===== ARTISANO COMMON JS ===== */

// Hamburger menu toggle
(function() {
  var hamburger = document.querySelector('.hamburger');
  var navLinks = document.querySelector('.nav-links');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', function() {
      navLinks.classList.toggle('open');
      hamburger.classList.toggle('active');
    });
  }
})();

// PWA — Manifest + Service Worker
(function() {
  // Add manifest link if not already present
  if (!document.querySelector('link[rel="manifest"]')) {
    var manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = 'manifest.json';
    document.head.appendChild(manifestLink);
  }

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function(err) {
      console.log('SW registration failed:', err);
    });
  }
})();
