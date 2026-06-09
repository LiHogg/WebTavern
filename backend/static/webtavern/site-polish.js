(function () {
  const venuePhotoBySlug = {
    'pyatkin-nn': '/media/venues/demo/pyatkin-nn-1.svg',
    'mitrich-steakhouse-nn': '/media/venues/demo/mitrich-steakhouse-nn-1.svg',
    'neva-loft': '/media/venues/demo/neva-loft-1.svg',
    'ural-yard': '/media/venues/demo/ural-yard-1.svg',
    'siberia-station': '/media/venues/demo/siberia-station-1.svg',
    'black-sea-table': '/media/venues/demo/black-sea-table-1.svg',
    'amber-port': '/media/venues/demo/amber-port-1.svg'
  };

  const demoPhotos = [
    ...Object.values(venuePhotoBySlug),
    '/static/webtavern/demo-photos/cafe-hall-1.svg',
    '/static/webtavern/demo-photos/cafe-hall-2.svg',
    '/static/webtavern/demo-photos/cafe-hall-3.svg',
    '/static/webtavern/demo-photos/cafe-hall-4.svg'
  ];

  function hashString(value) {
    return String(value || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  }

  function extractVenueSlug(href) {
    const match = String(href || '').match(/\/venues\/([^/?#]+)\/?/);
    if (!match) return '';
    try { return decodeURIComponent(match[1]); } catch { return match[1]; }
  }

  function pickPhoto(seed, slug) {
    if (slug && venuePhotoBySlug[slug]) return venuePhotoBySlug[slug];
    return demoPhotos[Math.abs(hashString(seed)) % demoPhotos.length];
  }

  function enhanceVenueCards(root) {
    const cards = Array.from((root || document).querySelectorAll('.venue-card'));
    cards.forEach((card, index) => {
      if (card.querySelector('.venue-card-cover')) return;
      const link = card.querySelector('a[href*="/venues/"]');
      const href = link ? link.getAttribute('href') : '';
      const slug = extractVenueSlug(href);
      const title = card.querySelector('h1, h2, h3')?.textContent?.trim() || 'Заведение WebTavern';
      const slugSeed = href || `${title}-${index}`;
      const body = card.querySelector('.venue-card-body') || card.firstElementChild;
      const cover = document.createElement('div');
      cover.className = 'venue-card-cover venue-card-cover-fallback';
      cover.innerHTML = `<img src="${pickPhoto(slugSeed, slug)}" alt="${title.replace(/"/g, '&quot;')}" loading="lazy">`;
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
