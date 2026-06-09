(function () {
  const demoPhotos = [
    '/static/webtavern/demo-photos/cafe-hall-1.svg',
    '/static/webtavern/demo-photos/cafe-hall-2.svg',
    '/static/webtavern/demo-photos/cafe-hall-3.svg',
    '/static/webtavern/demo-photos/cafe-hall-4.svg'
  ];

  function hashString(value) {
    return String(value || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  }

  function pickPhoto(seed) {
    return demoPhotos[Math.abs(hashString(seed)) % demoPhotos.length];
  }

  function enhanceVenueCards(root) {
    const cards = Array.from((root || document).querySelectorAll('.venue-card'));
    cards.forEach((card, index) => {
      if (card.querySelector('.venue-card-cover')) return;
      const link = card.querySelector('a[href*="/venues/"]');
      const title = card.querySelector('h1, h2, h3')?.textContent?.trim() || 'Заведение WebTavern';
      const slugSeed = link ? link.getAttribute('href') : `${title}-${index}`;
      const body = card.querySelector('.venue-card-body') || card.firstElementChild;
      const cover = document.createElement('div');
      cover.className = 'venue-card-cover venue-card-cover-fallback';
      cover.innerHTML = `<img src="${pickPhoto(slugSeed)}" alt="${title.replace(/"/g, '&quot;')}" loading="lazy">`;
      if (body) card.insertBefore(cover, body);
      else card.prepend(cover);
    });
  }

  function boot() {
    enhanceVenueCards(document);
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes && mutation.addedNodes.length)) {
        enhanceVenueCards(document);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
