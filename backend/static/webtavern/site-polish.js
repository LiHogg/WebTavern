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

  let venuePriceDataPromise = null;
  let pricePatchFrame = 0;

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

  function parseMoney(value) {
    const normalized = String(value || '')
      .replace(/\s+/g, '')
      .replace(/[^0-9,.-]/g, '')
      .replace(',', '.');
    const amount = Number.parseFloat(normalized);
    return Number.isFinite(amount) ? amount : 0;
  }

  function formatMoneyRu(amount, currency) {
    try {
      return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: currency || 'RUB', maximumFractionDigits: 2 }).format(Number(amount) || 0);
    } catch {
      return `${(Number(amount) || 0).toFixed(2)} ${currency || 'RUB'}`;
    }
  }

  function activePriceRules(venue) {
    return Array.isArray(venue && venue.price_rules)
      ? venue.price_rules.filter((rule) => rule && rule.is_active !== false && Number(rule.price_amount || 0) > 0)
      : [];
  }

  function calculateCumulativeTablePrice(venue, tableCount) {
    const count = Math.max(Number(tableCount) || 0, 0);
    if (!venue || count <= 0) return null;
    const rules = activePriceRules(venue)
      .filter((rule) => rule.rule_type === 'table_count' && Number(rule.table_count || 0) > 0)
      .sort((a, b) => Number(a.table_count || 0) - Number(b.table_count || 0));
    if (!rules.length) return null;

    const byCount = new Map();
    rules.forEach((rule) => {
      const ruleCount = Number(rule.table_count || 0);
      if (ruleCount > 0 && !byCount.has(ruleCount)) byCount.set(ruleCount, rule);
    });

    const oneRule = byCount.get(1);
    const unitAmount = oneRule ? Number(oneRule.price_amount || 0) : Number(venue.booking_rule?.deposit_amount || 0);
    let currency = (oneRule && oneRule.price_currency) || venue.booking_rule?.deposit_currency || 'RUB';
    const calculated = { 0: 0 };
    let note = '';

    for (let step = 1; step <= count; step += 1) {
      const previousAmount = Number(calculated[step - 1] || 0);
      const exactRule = byCount.get(step);
      const exactAmount = exactRule ? Number(exactRule.price_amount || 0) : 0;
      const additiveAmount = unitAmount > 0 ? previousAmount + unitAmount : null;

      if (exactRule && (step === 1 || exactAmount >= previousAmount)) {
        calculated[step] = exactAmount;
        currency = exactRule.price_currency || currency;
        note = exactRule.title || `Бронь ${step} стол(ов)`;
      } else if (additiveAmount !== null) {
        calculated[step] = additiveAmount;
        note = exactRule && exactAmount < previousAmount
          ? `Накопительная стоимость ${step} стол(ов): акция меньшего набора + доплата за стол`
          : `Накопительная стоимость ${step} стол(ов)`;
      } else if (exactRule) {
        calculated[step] = exactAmount;
        currency = exactRule.price_currency || currency;
        note = exactRule.title || `Бронь ${step} стол(ов)`;
      } else {
        calculated[step] = previousAmount;
      }
    }

    const amount = Number(calculated[count] || 0);
    return amount > 0 ? { amount, currency, note: note || `Накопительная стоимость ${count} стол(ов)` } : null;
  }

  function selectedBookingTableCount() {
    const bookingType = document.querySelector('#client-booking-type');
    if (bookingType && String(bookingType.value || 'tables') === 'hall') return 0;
    const hiddenValue = String(document.querySelector('#client-booking-table')?.value || '').trim();
    if (hiddenValue) return hiddenValue.split(',').map((item) => item.trim()).filter(Boolean).length;
    const selectedText = String(document.querySelector('#client-selected-table-inline')?.textContent || '');
    const match = selectedText.match(/Выбрано столов:\s*(\d+)/i);
    return match ? Number(match[1]) || 0 : 0;
  }

  async function loadVenuePriceData() {
    if (venuePriceDataPromise) return venuePriceDataPromise;
    const slug = document.body.getAttribute('data-venue-slug');
    if (!slug) return null;
    venuePriceDataPromise = fetch(`/api/v1/venues/${encodeURIComponent(slug)}/`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .catch(() => null);
    return venuePriceDataPromise;
  }

  function scheduleCumulativePricePreviewPatch() {
    window.cancelAnimationFrame(pricePatchFrame);
    pricePatchFrame = window.requestAnimationFrame(async () => {
      const preview = document.querySelector('#client-booking-price-preview');
      if (!preview) return;
      const tableCount = selectedBookingTableCount();
      if (tableCount <= 0) return;
      const venue = await loadVenuePriceData();
      const price = calculateCumulativeTablePrice(venue, tableCount);
      if (!price) return;
      const signature = `${tableCount}:${price.amount}:${price.currency}`;
      if (preview.dataset.cumulativePriceSignature === signature) return;
      preview.dataset.cumulativePriceSignature = signature;
      preview.innerHTML = `<strong>Итоговая предоплата:</strong> ${formatMoneyRu(price.amount, price.currency)}<br><span>${price.note}. Расчёт накопительный: стоимость не уменьшается при добавлении следующего стола.</span>`;
    });
  }

  function polishBookingPricePreview(root) {
    const scope = root || document;
    if (!scope.querySelector('#client-booking-price-preview')) return;
    scheduleCumulativePricePreviewPatch();
  }

  function polishAccountReviewCandidates(root) {
    const scope = root || document;
    const rootNode = scope.querySelector ? scope.querySelector('#account-review-candidates') : null;
    const emptyNode = document.querySelector('#account-review-candidates-empty');
    if (emptyNode) {
      emptyNode.textContent = 'Здесь появятся заведения после завершённой брони. Отзывы для остальных заведений можно оставить на странице конкретного заведения.';
    }
    if (!rootNode) return;
    rootNode.querySelectorAll('.review-candidate-card p.muted-block').forEach((paragraph) => {
      if (paragraph.textContent.includes('без бронирования')) {
        paragraph.textContent = 'Это заведение появилось здесь, потому что у вас уже была завершённая бронь. Отзывы для других заведений можно оставить на их страницах.';
      }
    });
  }

  function polishVenueDetailPage(root) {
    balanceVenueDetailColumns(root);
    polishVenueLayoutStage(root);
    polishBookingPricePreview(root);
  }

  function boot() {
    enhanceVenueCards(document);
    polishVenueDetailPage(document);
    polishAccountReviewCandidates(document);
    window.addEventListener('resize', () => scheduleResponsiveLayoutFit(document));
    window.addEventListener('orientationchange', () => scheduleResponsiveLayoutFit(document));
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-table-id], #client-booking-type, #client-hall-select')) {
        window.setTimeout(scheduleCumulativePricePreviewPatch, 0);
      }
    });
    document.addEventListener('input', (event) => {
      if (event.target.matches('#client-booking-table, #client-booking-type')) scheduleCumulativePricePreviewPatch();
    });
    document.addEventListener('change', (event) => {
      if (event.target.matches('#client-booking-type, #client-hall-select')) scheduleCumulativePricePreviewPatch();
    });
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes && mutation.addedNodes.length)) {
        enhanceVenueCards(document);
        polishVenueDetailPage(document);
        polishAccountReviewCandidates(document);
        scheduleResponsiveLayoutFit(document);
      }
      if (mutations.some((mutation) => mutation.target && mutation.target.id === 'client-selected-table-inline')) {
        scheduleCumulativePricePreviewPatch();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();