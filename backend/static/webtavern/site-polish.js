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

  function elementBox(element, extraGap) {
    const gap = extraGap || 0;
    const left = element.offsetLeft - gap;
    const top = element.offsetTop - gap;
    const width = element.offsetWidth + gap * 2;
    const height = element.offsetHeight + gap * 2;
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height
    };
  }

  function boxesIntersect(a, b) {
    return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  }

  function boxAt(left, top, width, height, gap) {
    const safeGap = gap || 0;
    return {
      left: left - safeGap,
      top: top - safeGap,
      width: width + safeGap * 2,
      height: height + safeGap * 2,
      right: left + width + safeGap,
      bottom: top + height + safeGap
    };
  }

  function isObstacle(element) {
    return element.matches([
      '.layout-editor-item-window',
      '.layout-editor-item-bar',
      '.layout-editor-item-entrance',
      '.layout-editor-item-cashier',
      '.layout-editor-item-wc',
      '.layout-editor-item-column',
      '.layout-editor-item-plant',
      '.layout-editor-item-sofa',
      '.layout-editor-item-label'
    ].join(','));
  }

  function findFreePosition(stage, item, occupied) {
    const original = {
      left: item.offsetLeft,
      top: item.offsetTop,
      width: item.offsetWidth,
      height: item.offsetHeight
    };
    const padding = 42;
    const topPadding = 62;
    const step = 18;
    const maxLeft = Math.max(padding, stage.clientWidth - padding - original.width);
    const maxTop = Math.max(topPadding, stage.clientHeight - padding - original.height);
    const startLeft = Math.min(Math.max(original.left, padding), maxLeft);
    const startTop = Math.min(Math.max(original.top, topPadding), maxTop);

    let best = { left: startLeft, top: startTop, distance: Infinity };

    for (let top = topPadding; top <= maxTop; top += step) {
      for (let left = padding; left <= maxLeft; left += step) {
        const candidate = boxAt(left, top, original.width, original.height, 12);
        if (occupied.some((box) => boxesIntersect(candidate, box))) continue;
        const distance = Math.abs(left - startLeft) + Math.abs(top - startTop);
        if (distance < best.distance) {
          best = { left, top, distance };
        }
      }
    }

    return best.distance === Infinity ? { left: startLeft, top: startTop } : best;
  }

  function deconflictLayoutItems(stage) {
    if (!stage) return;
    const tables = Array.from(stage.querySelectorAll('.layout-viewer-table-button'));
    if (!tables.length) return;

    const obstacles = Array.from(stage.querySelectorAll('[class*="layout-editor-item-"]'))
      .filter((element) => !element.classList.contains('layout-editor-item-wall'))
      .filter(isObstacle)
      .map((element) => elementBox(element, 12));

    const occupied = [...obstacles];
    tables
      .sort((a, b) => (a.offsetTop - b.offsetTop) || (a.offsetLeft - b.offsetLeft))
      .forEach((table) => {
        const currentBox = elementBox(table, 12);
        const hasCollision = occupied.some((box) => boxesIntersect(currentBox, box));
        if (hasCollision) {
          const position = findFreePosition(stage, table, occupied);
          table.style.left = `${position.left}px`;
          table.style.top = `${position.top}px`;
          table.classList.add('layout-viewer-table-deconflicted');
        }
        occupied.push(elementBox(table, 14));
      });
  }

  function parseScale(value) {
    const raw = String(value || '');
    const match = raw.match(/scale\(([^)]+)\)/);
    if (!match) return 1;
    const parsed = Number.parseFloat(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  function fitVenueLayoutStage(stage) {
    if (!stage) return;
    const wrapper = stage.closest('.layout-stage-wrapper, .layout-preview-wrapper');
    const sizer = stage.closest('.layout-stage-sizer');
    if (!wrapper) return;

    const naturalWidth = stage.offsetWidth || Number.parseFloat(stage.style.width) || 0;
    const naturalHeight = stage.offsetHeight || Number.parseFloat(stage.style.height) || 0;
    const availableWidth = wrapper.clientWidth - 2;
    if (!naturalWidth || !naturalHeight || availableWidth <= 0) return;

    const inlineScale = parseScale(stage.style.transform || window.getComputedStyle(stage).transform);
    const previousApplied = Number.parseFloat(stage.dataset.webtavernAppliedScale || '');
    let requestedScale = Number.parseFloat(stage.dataset.webtavernRequestedScale || '');
    if (!Number.isFinite(requestedScale) || !Number.isFinite(previousApplied) || Math.abs(inlineScale - previousApplied) > 0.015) {
      requestedScale = inlineScale;
    }

    const fitScale = Math.min(1, Math.max(0.08, availableWidth / naturalWidth));
    const appliedScale = Math.min(requestedScale, fitScale);

    stage.dataset.webtavernRequestedScale = String(requestedScale);
    stage.dataset.webtavernAppliedScale = String(appliedScale);
    stage.style.transformOrigin = 'top left';
    stage.style.transform = `scale(${appliedScale})`;
    stage.classList.add('layout-stage-responsive-fit');
    wrapper.classList.add('layout-stage-wrapper-responsive-fit');

    const fittedWidth = Math.ceil(naturalWidth * appliedScale);
    const fittedHeight = Math.ceil(naturalHeight * appliedScale);
    if (sizer) {
      sizer.style.width = `${fittedWidth}px`;
      sizer.style.maxWidth = '100%';
      sizer.style.height = `${fittedHeight}px`;
    }
    wrapper.style.setProperty('--layout-fitted-width', `${fittedWidth}px`);
    wrapper.style.setProperty('--layout-fitted-height', `${fittedHeight}px`);
  }

  let fitFrame = 0;
  function scheduleResponsiveLayoutFit(root) {
    window.cancelAnimationFrame(fitFrame);
    fitFrame = window.requestAnimationFrame(() => {
      const scope = root || document;
      scope.querySelectorAll('.venue-layout-viewer .layout-stage').forEach(fitVenueLayoutStage);
    });
  }

  function polishVenueLayoutStage(root) {
    const scope = root || document;
    scope.querySelectorAll('.venue-layout-viewer .layout-stage').forEach((stage) => {
      stage.classList.add('layout-stage-polished');
      stage.querySelectorAll('.layout-editor-item-wall').forEach((wall) => {
        wall.classList.add('layout-viewer-wall-visible');
        wall.setAttribute('aria-hidden', 'true');
      });
      window.requestAnimationFrame(() => {
        deconflictLayoutItems(stage);
        fitVenueLayoutStage(stage);
      });
    });
  }

  function balanceVenueDetailColumns(root) {
    const scope = root || document;
    const leftStack = scope.querySelector('.venue-detail-left-stack') || document.querySelector('.venue-detail-left-stack');
    const bookingPanel = scope.querySelector('.venue-detail-booking-panel') || document.querySelector('.venue-detail-booking-panel');
    if (!leftStack || !bookingPanel) return;
    if (leftStack.querySelector('.venue-side-hall-panel')) return;

    const toolbar = bookingPanel.querySelector('.venue-layout-toolbar');
    const summaryGrid = bookingPanel.querySelector('.venue-layout-summary-grid');
    if (!toolbar && !summaryGrid) return;

    const panel = document.createElement('article');
    panel.className = 'panel venue-side-hall-panel';
    panel.innerHTML = '<div class="section-topline"><span class="section-kicker">Помещение</span><h2>Зал и столы</h2></div>';

    if (toolbar) panel.appendChild(toolbar);
    if (summaryGrid) panel.appendChild(summaryGrid);

    const photoLibrary = leftStack.querySelector('.venue-photo-library');
    if (photoLibrary) leftStack.insertBefore(panel, photoLibrary);
    else leftStack.appendChild(panel);
  }

  function polishVenueDetailPage(root) {
    balanceVenueDetailColumns(root);
    polishVenueLayoutStage(root);
  }

  function boot() {
    enhanceVenueCards(document);
    polishVenueDetailPage(document);
    window.addEventListener('resize', () => scheduleResponsiveLayoutFit(document));
    window.addEventListener('orientationchange', () => scheduleResponsiveLayoutFit(document));
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes && mutation.addedNodes.length)) {
        enhanceVenueCards(document);
        polishVenueDetailPage(document);
        scheduleResponsiveLayoutFit(document);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();