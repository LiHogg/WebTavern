(function () {
  const API_BASE = '/api/v1';
  const MAX_REVIEW_PHOTOS = 24;

  function qs(selector, root) { return (root || document).querySelector(selector); }
  function qsa(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function resolveImageUrl(image) {
    if (!image) return '';
    const raw = typeof image === 'string' ? image : (image.image_url || image.image || '');
    const value = String(raw || '').trim();
    if (!value) return '';
    if (value.startsWith('http://') || value.startsWith('https://')) {
      try {
        const url = new URL(value);
        if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.pathname.startsWith('/media/')) {
          return `${url.pathname}${url.search || ''}`;
        }
      } catch (error) {
        return value;
      }
      return value;
    }
    return value.startsWith('/') ? value : `/${value.replace(/^\/+/, '')}`;
  }

  async function apiGet(path) {
    const response = await fetch(`${API_BASE}${path}`, { headers: { 'Accept': 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function uniqueByUrl(items) {
    const seen = new Set();
    return items.filter((item) => {
      const url = resolveImageUrl(item);
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }

  function collectExistingVenuePhotos(panel) {
    if (!panel) return [];
    return qsa('.venue-slider-slide img[src]', panel).map((img, index) => ({
      image_url: img.getAttribute('src'),
      alt_text: img.getAttribute('alt') || 'Фото заведения',
      is_cover: index === 0,
      source: 'venue',
    }));
  }

  function collectReviewPhotos(reviews) {
    const photos = [];
    (Array.isArray(reviews) ? reviews : []).forEach((review) => {
      (Array.isArray(review.images) ? review.images : []).forEach((image) => {
        photos.push({
          image_url: resolveImageUrl(image),
          alt_text: image.alt_text || `${review.venue_name || 'Заведение'}: фото из отзыва`,
          is_cover: false,
          source: 'review',
          author_name: review.author_name || '',
          review_id: review.id,
        });
      });
    });
    return uniqueByUrl(photos).slice(0, MAX_REVIEW_PHOTOS);
  }

  function buildGalleryHtml(images, reviewCount) {
    const list = uniqueByUrl(images);
    const reviewText = reviewCount > 0
      ? `В галерею автоматически добавлены фото из отзывов: ${reviewCount}.`
      : 'Фотографии помогают заранее оценить интерьер, атмосферу и расположение залов.';

    if (!list.length) {
      return `
        <div class="section-topline"><span class="section-kicker">Галерея</span><h2>Фотографии заведения</h2></div>
        <p class="muted-block">Фотографии пока не добавлены. После отзывов с изображениями они появятся здесь автоматически.</p>
      `;
    }

    return `
      <div class="section-topline"><span class="section-kicker">Галерея</span><h2>Фотографии заведения</h2></div>
      <p class="muted-block">${escapeHtml(reviewText)}</p>
      <div class="venue-slider-shell top-gap">
        <button class="venue-slider-control venue-slider-control-prev" type="button" data-review-gallery-prev aria-label="Предыдущее фото">‹</button>
        <div class="venue-slider-viewport">
          <div class="venue-slider-track" data-review-gallery-track>
            ${list.map((image, index) => {
              const url = resolveImageUrl(image);
              const caption = image.source === 'review'
                ? `Фото из отзыва${image.author_name ? ` · ${image.author_name}` : ''}`
                : (image.is_cover || index === 0 ? 'Обложка' : `Фото ${index + 1}`);
              return `<figure class="venue-slider-slide" data-review-gallery-slide><img src="${escapeHtml(url)}" alt="${escapeHtml(image.alt_text || 'Фото заведения')}" loading="lazy"><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
            }).join('')}
          </div>
        </div>
        <button class="venue-slider-control venue-slider-control-next" type="button" data-review-gallery-next aria-label="Следующее фото">›</button>
      </div>
      <div class="venue-slider-footer">
        <div class="venue-slider-thumbs" data-review-gallery-dots>
          ${list.map((image, index) => {
            const url = resolveImageUrl(image);
            return `<button class="venue-slider-thumb" type="button" data-review-gallery-dot="${index}" aria-label="Показать фото ${index + 1}"><img src="${escapeHtml(url)}" alt="${escapeHtml(image.alt_text || 'Фото заведения')}" loading="lazy"></button>`;
          }).join('')}
        </div>
        <span class="venue-slider-counter" data-review-gallery-counter>1 / ${list.length}</span>
      </div>
    `;
  }

  function bindGallery(panel) {
    const track = qs('[data-review-gallery-track]', panel);
    const slides = qsa('[data-review-gallery-slide]', panel);
    const prevButton = qs('[data-review-gallery-prev]', panel);
    const nextButton = qs('[data-review-gallery-next]', panel);
    const counter = qs('[data-review-gallery-counter]', panel);
    const dots = qsa('[data-review-gallery-dot]', panel);
    const viewport = qs('.venue-slider-viewport', panel);
    if (!track || !slides.length) return;

    let index = 0;
    let touchStartX = null;

    function update(nextIndex) {
      index = (Number(nextIndex) + slides.length) % slides.length;
      track.style.transform = `translateX(-${index * 100}%)`;
      dots.forEach((dot) => dot.classList.toggle('is-active', Number(dot.getAttribute('data-review-gallery-dot')) === index));
      if (counter) counter.textContent = `${index + 1} / ${slides.length}`;
      const disabled = slides.length <= 1;
      if (prevButton) prevButton.disabled = disabled;
      if (nextButton) nextButton.disabled = disabled;
    }

    if (prevButton) prevButton.addEventListener('click', () => update(index - 1));
    if (nextButton) nextButton.addEventListener('click', () => update(index + 1));
    dots.forEach((dot) => dot.addEventListener('click', () => update(Number(dot.getAttribute('data-review-gallery-dot')) || 0)));
    if (viewport) {
      viewport.addEventListener('touchstart', (event) => {
        touchStartX = event.touches && event.touches.length ? event.touches[0].clientX : null;
      }, { passive: true });
      viewport.addEventListener('touchend', (event) => {
        if (touchStartX === null || !event.changedTouches || !event.changedTouches.length) return;
        const delta = event.changedTouches[0].clientX - touchStartX;
        touchStartX = null;
        if (Math.abs(delta) > 45) update(index + (delta < 0 ? 1 : -1));
      }, { passive: true });
    }
    update(0);
  }

  function ensureGalleryPanel() {
    const existing = qs('.venue-photo-library');
    if (existing) return existing;
    const stack = qs('.venue-detail-left-stack');
    if (!stack) return null;
    const panel = document.createElement('article');
    panel.className = 'panel venue-photo-library';
    stack.appendChild(panel);
    return panel;
  }

  async function enrichVenueGallery() {
    const slug = String(document.body.getAttribute('data-venue-slug') || '').trim();
    if (!slug || document.body.getAttribute('data-page') !== 'venue-detail') return;

    const panel = ensureGalleryPanel();
    if (!panel || panel.dataset.reviewGalleryMerged === 'true') return;

    let reviews = [];
    try {
      reviews = await apiGet(`/reviews/?venue_slug=${encodeURIComponent(slug)}&with_photos=1&sort=new`);
    } catch (error) {
      return;
    }

    const venuePhotos = collectExistingVenuePhotos(panel);
    const reviewPhotos = collectReviewPhotos(reviews);
    if (!reviewPhotos.length && panel.querySelector('[data-venue-photo-slider]')) return;

    const merged = uniqueByUrl([...venuePhotos, ...reviewPhotos]);
    panel.dataset.reviewGalleryMerged = 'true';
    panel.classList.remove('venue-photo-library-empty');
    panel.classList.add('venue-photo-library-with-reviews');
    panel.innerHTML = buildGalleryHtml(merged, reviewPhotos.length);
    bindGallery(panel);
  }

  function scheduleEnrichment(attempt) {
    const currentAttempt = attempt || 0;
    window.setTimeout(async () => {
      await enrichVenueGallery();
      if (!qs('.venue-photo-library[data-review-gallery-merged="true"]') && currentAttempt < 20) {
        scheduleEnrichment(currentAttempt + 1);
      }
    }, currentAttempt === 0 ? 250 : 350);
  }

  document.addEventListener('DOMContentLoaded', () => scheduleEnrichment(0));
})();
