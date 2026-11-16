document.documentElement.classList.add('js');

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
  const prints = [...walk.querySelectorAll('.fp[data-at]')];
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;

  const show = (metres, step, walked = metres) => {
    read.firstChild.nodeValue = String(metres);
    fill.style.width = `${metres}%`;
    walk.style.setProperty('--m', String(metres / 100));
    for (const fp of prints) fp.classList.toggle('on', walked >= Number(fp.dataset.at));
    if (walk.dataset.step !== String(step)) walk.dataset.step = String(step);
  };

  const update = () => {
    frame = 0;
    if (still.matches) return show(100, 1, Infinity);
    const rect = walk.getBoundingClientRect();
    const stage = walk.querySelector('.walk__stage');
    const pin = parseFloat(getComputedStyle(stage).top) || 0;
    const total = walk.offsetHeight - stage.offsetHeight;
    const p = Math.min(1, Math.max(0, (pin - rect.top) / total));
    const metres = Math.round(Math.min(1, p / 0.32) * 100);
    const step = metres < 100 ? 0 : p < 0.56 ? 1 : p < 0.8 ? 2 : 3;
    // Footprints keep going past the fence as long as the visitor keeps scrolling.
    show(metres, step, Math.round((p / 0.32) * 100));
  };

  const queue = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  still.addEventListener('change', queue);
  update();
}

// The hero loop: a walker leaves the phone (home), counts metres along the route, and the moment
// they cross the 100 m fence the fence flashes and the reminder lands on the phone.
const hero = document.querySelector('.hero');
if (hero) {
  const route = hero.querySelector('[data-route]');
  const walked = hero.querySelector('.scene__walked');
  const walker = hero.querySelector('.scene__walker');
  const metres = hero.querySelector('[data-metres]');
  const burst = hero.querySelector('.scene__burst');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  // On a phone the fence is smaller on screen; a steeper route crosses it where it can be seen.
  if (matchMedia('(max-width: 520px)').matches) for (const p of [route, walked]) p.setAttribute('d', 'M150 -150 H260 V-400 H720');
  const length = route.getTotalLength();
  const FENCE = 520;

  // How far along the route the fence is crossed.
  let cross = length;
  for (let s = 0; s <= length; s += 1) {
    const p = route.getPointAtLength(s);
    if (Math.hypot(p.x, p.y) >= FENCE) { cross = s; break; }
  }
  const crossPoint = route.getPointAtLength(cross);
  burst.setAttribute('cx', crossPoint.x);
  burst.setAttribute('cy', crossPoint.y);
  walked.style.strokeDasharray = `${length} ${length}`;

  const LOOP = 6500;
  const start = performance.now() + 1100; // as the phone settles
  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
  let wasOut = false;
  let running = false;
  let frame = 0;

  const place = (s, alpha) => {
    const p = route.getPointAtLength(s);
    walker.setAttribute('transform', `translate(${p.x} ${p.y})`);
    walked.style.strokeDashoffset = String(length - s);
    walker.style.opacity = walked.style.opacity = String(alpha);
    metres.textContent = `${Math.round(Math.min(1, s / cross) * 100)} m`;
    const out = s >= cross && alpha > 0.5;
    hero.classList.toggle('is-out', out);
    if (out && !wasOut) {
      burst.classList.remove('go');
      void burst.getBBox();
      burst.classList.add('go');
    }
    wasOut = out;
  };

  const tick = (now) => {
    frame = running ? requestAnimationFrame(tick) : 0;
    if (now < start) return;
    const t = ((now - start) % LOOP) / LOOP;
    const s = ease(Math.min(1, t / 0.42)) * length;
    const alpha = t < 0.04 ? t / 0.04 : t > 0.9 ? Math.max(0, (0.97 - t) / 0.07) : 1;
    place(s, alpha);
  };

  const run = (on) => {
    running = on && !still.matches;
    if (running && !frame) frame = requestAnimationFrame(tick);
    if (still.matches) place(length, 1);
  };

  new IntersectionObserver(([e]) => run(e.isIntersecting)).observe(hero);
  document.addEventListener('visibilitychange', () => run(!document.hidden));
  still.addEventListener('change', () => run(true));

  // A little depth under a mouse: the map and the phone drift against each other.
  if (matchMedia('(pointer: fine)').matches) {
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty('--mx', ((e.clientX - r.left) / r.width - 0.5) * 2);
      hero.style.setProperty('--my', ((e.clientY - r.top) / r.height - 0.5) * 2);
    });
  }
}

// The route: from the first stop to the last, drawn up to a line 60% down the screen.
const routeEl = document.querySelector('.route');
if (routeEl) {
  const stops = [...document.querySelectorAll('[data-stop]')];
  const first = stops[0];
  const last = stops[stops.length - 1];
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const host = routeEl.parentElement;
  const centre = (el) => {
    const r = el.querySelector('i').getBoundingClientRect();
    return r.top + r.height / 2 - host.getBoundingClientRect().top;
  };
  let frame = 0;

  const layout = () => {
    const top = centre(first);
    routeEl.style.top = `${top}px`;
    routeEl.style.height = `${centre(last) - top}px`;
    draw();
  };

  const draw = () => {
    frame = 0;
    const r = routeEl.getBoundingClientRect();
    // One fixed mark per layout, low enough that the last stop can still reach it at the very
    // bottom, so the line always moves at the same speed as the page.
    const maxScroll = document.documentElement.scrollHeight - innerHeight;
    const lastAtEnd = r.bottom - (maxScroll - scrollY);
    const mark = Math.max(innerHeight * 0.6, lastAtEnd + 2);
    const p = still.matches ? 1 : Math.min(1, Math.max(0, (mark - r.top) / (r.height || 1)));
    routeEl.style.setProperty('--p', p.toFixed(4));
    routeEl.toggleAttribute('data-edge', p <= 0 || p >= 1);
    for (const s of stops) s.classList.toggle('on', still.matches || s.getBoundingClientRect().top < mark);
  };

  addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(draw); }, { passive: true });
  new ResizeObserver(layout).observe(document.body);
  layout();
}

// Reveal blocks once, as they come into view.
const reveal = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      reveal.unobserve(e.target);
    }
  },
  { rootMargin: '0px 0px -12% 0px' },
);
for (const el of document.querySelectorAll('[data-reveal]')) reveal.observe(el);

// Questions open and close with a height animation (instant with reduced motion).
for (const qa of document.querySelectorAll('.qa')) {
  const summary = qa.querySelector('summary');
  const body = qa.querySelector('.qa__a');
  let anim = null;
  summary.addEventListener('click', (e) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    e.preventDefault();
    if (anim) anim.cancel();
    if (!qa.open) {
      qa.open = true;
      const h = body.scrollHeight;
      anim = body.animate([{ height: '0px', opacity: 0 }, { height: `${h}px`, opacity: 1 }], { duration: 480, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
      anim.onfinish = () => (anim = null);
    } else {
      const h = body.scrollHeight;
      anim = body.animate([{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 340, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' });
      anim.onfinish = () => {
        qa.open = false;
        anim.cancel();
        anim = null;
      };
    }
  });
}

// The bar: shown once the hero is behind you. It counts the page as a walk and marks the section you are in.
const bar = document.querySelector('[data-bar]');
if (bar) {
  const pedo = bar.querySelector('[data-pedo]');
  const marks = [...bar.querySelectorAll('[data-nav]')]
    .map((a) => [a, document.getElementById(a.dataset.nav)])
    .filter(([, el]) => el);
  let frame = 0;
  const update = () => {
    frame = 0;
    if (pedo) pedo.textContent = String(Math.round(scrollY / 8));
    let here = null;
    for (const [a, el] of marks) if (el.getBoundingClientRect().top < innerHeight * 0.4) here = a;
    for (const [a] of marks) a.classList.toggle('is-here', a === here);
  };
  addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(update); }, { passive: true });
  update();
}

// Phone menu.
const menu = document.getElementById('menu');
if (menu) {
  const openers = [...document.querySelectorAll('[data-menu-open]')];
  let last = null;
  const open = (on) => {
    menu.classList.toggle('is-open', on);
    menu.toggleAttribute('inert', !on);
    document.documentElement.style.overflow = on ? 'hidden' : '';
    for (const b of openers) b.setAttribute('aria-expanded', String(on));
    if (on) {
      last = document.activeElement;
      menu.querySelector('[data-menu-close]').focus();
    } else if (last) last.focus();
  };
  for (const b of openers) b.addEventListener('click', () => open(true));
  menu.querySelector('[data-menu-close]').addEventListener('click', () => open(false));
  for (const a of menu.querySelectorAll('a')) a.addEventListener('click', () => open(false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('is-open')) open(false); });
}
