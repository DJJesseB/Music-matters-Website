const tiles = [...document.querySelectorAll('[data-photo]')];
const viewer = document.querySelector('.gig-viewer');
const image = viewer.querySelector('.gig-viewer-frame img') || viewer.querySelector('img');
const status = viewer.querySelector('[role=status]');
const counter = viewer.querySelector('.gig-viewer-counter');
const caption = viewer.querySelector('.gig-viewer-caption');

let index = 0, trigger, previousOverflow;

function show(i) {
  index = (i + tiles.length) % tiles.length;
  const tile = tiles[index];
  const source = tile.querySelector('img');
  
  // Transition effect
  image.style.opacity = '0.5';
  image.src = source.src;
  image.alt = source.alt;
  image.onload = () => { image.style.opacity = '1'; };

  const countText = `Photo ${index + 1} of ${tiles.length}`;
  if (status) status.textContent = countText;
  if (counter) counter.textContent = `${index + 1} / ${tiles.length}`;
  if (caption) {
    const rawAlt = source.alt || '';
    caption.textContent = rawAlt.length > 5 ? rawAlt : 'DJ Jesse B event celebration';
  }

  // Preload next & previous images for instant navigation
  const nextSrc = tiles[(index + 1) % tiles.length].querySelector('img')?.src;
  const prevSrc = tiles[(index - 1 + tiles.length) % tiles.length].querySelector('img')?.src;
  if (nextSrc) { const p = new Image(); p.src = nextSrc; }
  if (prevSrc) { const p = new Image(); p.src = prevSrc; }
}

tiles.forEach((tile, i) => tile.addEventListener('click', () => {
  trigger = tile;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  show(i);
  viewer.showModal();
  viewer.querySelector('[data-close]')?.focus();
}));

viewer.querySelectorAll('[data-close]').forEach(b => {
  b.onclick = () => viewer.close();
});
viewer.querySelectorAll('[data-previous]').forEach(b => {
  b.onclick = (e) => { e.stopPropagation(); show(index - 1); };
});
viewer.querySelectorAll('[data-next]').forEach(b => {
  b.onclick = (e) => { e.stopPropagation(); show(index + 1); };
});

// Click outside image or on backdrop to close
viewer.addEventListener('click', e => {
  if (e.target === viewer || e.target.classList.contains('gig-viewer-stage') || e.target.classList.contains('gig-viewer-frame')) {
    viewer.close();
  }
});

// Keyboard controls
viewer.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    show(index - 1);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    show(index + 1);
  } else if (e.key === 'Escape') {
    viewer.close();
  }
});

// Touch swipe navigation for mobile
let touchStartX = 0, touchEndX = 0, touchStartY = 0;
viewer.addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

viewer.addEventListener('touchend', e => {
  touchEndX = e.changedTouches[0].screenX;
  const diffX = touchStartX - touchEndX;
  const diffY = Math.abs(touchStartY - e.changedTouches[0].screenY);
  if (Math.abs(diffX) > 40 && diffY < 80) {
    if (diffX > 0) show(index + 1);
    else show(index - 1);
  }
}, { passive: true });

viewer.addEventListener('close', () => {
  document.body.style.overflow = previousOverflow || '';
  trigger?.focus();
});
