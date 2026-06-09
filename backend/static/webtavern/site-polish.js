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

  function buildCoverImage(url, title) {
    return `<img src="${url}" alt="${String(title || 'Заведение WebTavern').replace(/"/g, '&quot;')}" loading="lazy">`;
  }

  function enhanceVenueCards(root) {
    const cards = Array.from((root || document).querySelectorAll('.venue-card'));
    cards.forEach((card, index) => {
      const link = card.querySelector('a[href*="/venues/"]');
      const href = link ? link.getAttribute('href') : '';
      const slug = extractVenueSlug(href);
      const title = card.querySelector('h1, h2, h3')?.textContent?.trim() || 'Заведение WebTavern';
      const slugSeed = href || `${title}-${index}`;
      const photoUrl = pickPhoto(slugSeed, slug);
      const existingCover = card.querySelector('.venue-card-cover');

      if (existingCover) {
        const existingImage = existingCover.querySelector('img[src]');
        const isEmptyCover = existingCover.classList.contains('venue-card-cover-empty') || !existingImage;
        if (!isEmptyCover) return;
        existingCover.classList.remove('venue-card-cover-empty');
        existingCover.classList.add('venue-card-cover-fallback');
        existingCover.innerHTML = buildCoverImage(photoUrl, title);
        return;
      }

      const body = card.querySelector('.venue-card-body') || card.firstElementChild;
      const cover = document.createElement('div');
      cover.className = 'venue-card-cover venue-card-cover-fallback';
      cover.innerHTML = buildCoverImage(photoUrl, title);
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
