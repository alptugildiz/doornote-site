// Remember a language the visitor picked, so the root page does not send them back.
for (const link of document.querySelectorAll('[data-lang]')) {
  link.addEventListener('click', () => {
    try {
      localStorage.setItem('doornote-lang', link.dataset.lang);
    } catch {}
  });
}

// The walk: as the visitor scrolls, they walk away from the door. At 100 m the reminder lands,
// then the check screen, then the stamp.
const walk = document.querySelector('.walk');
if (walk) {
  const read = walk.querySelector('[data-read]');
  const fill = walk.querySelector('.rail__fill');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;

  const show = (metres, step) => {
    read.firstChild.nodeValue = String(metres);
    fill.style.width = `${metres}%`;
    if (walk.dataset.step !== String(step)) walk.dataset.step = String(step);
  };

  const update = () => {
    frame = 0;
    if (still.matches) return show(100, 1);
    const rect = walk.getBoundingClientRect();
    const total = walk.offsetHeight - innerHeight;
    const p = Math.min(1, Math.max(0, -rect.top / total));
    const metres = Math.round(Math.min(1, p / 0.32) * 100);
    const step = metres < 100 ? 0 : p < 0.56 ? 1 : p < 0.8 ? 2 : 3;
    show(metres, step);
  };

  const queue = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  still.addEventListener('change', queue);
  update();
}
