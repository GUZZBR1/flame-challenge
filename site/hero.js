(() => {
  'use strict';
  const hero = document.querySelector('.hero');
  const identity = document.querySelector('.identity');
  const topbarBrand = document.querySelector('.topbar-brand');
  const themeToggle = document.querySelector('#theme-toggle');
  const title = document.querySelector('#ignis-title');
  const titleText = title.textContent;
  title.setAttribute('aria-label', titleText);
  let typingTimer;

  function typeTitle() {
    clearTimeout(typingTimer);
    title.replaceChildren();
    const cursor = document.createElement('span');
    cursor.className = 'caret';
    cursor.setAttribute('aria-hidden', 'true');
    title.append(cursor);
    let index = 0;
    function typeNext() {
      if (index < titleText.length) {
        title.insertBefore(document.createTextNode(titleText[index++]), cursor);
        typingTimer = setTimeout(typeNext, 320);
      } else typingTimer = setTimeout(() => cursor.remove(), 1200);
    }
    typingTimer = setTimeout(typeNext, 700);
  }
  typeTitle();

  const starsCanvas = document.querySelector('.stars');
  const stars = starsCanvas.getContext('2d');
  const waveCanvas = document.querySelector('.heat-surface');
  const wave = waveCanvas.getContext('2d');
  const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0, height = 0, pixelRatio = 1, frame = 0, lastDraw = 0;
  const gridSize = 38;
  const extent = 3;

  function resize() {
    const bounds = hero.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    pixelRatio = Math.min(devicePixelRatio || 1, 2);
    for (const canvas of [starsCanvas, waveCanvas]) {
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.getContext('2d').setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }
    drawStars();
    drawWave(0);
  }

  function drawStars() {
    stars.clearRect(0, 0, width, height);
    for (let i = 0; i < 145; i++) {
      const x = ((Math.sin(i * 127.1 + 1) * 43758.5453) % 1 + 1) % 1;
      const y = ((Math.sin(i * 311.7 + 2) * 96453.132) % 1 + 1) % 1;
      stars.fillStyle = `rgba(195,218,236,${.16 + (i % 5) * .1})`;
      stars.beginPath();
      stars.arc(x * width, y * height, i % 11 === 0 ? 1.2 : .6, 0, Math.PI * 2);
      stars.fill();
    }
  }

  function surfaceZ(x, y, time) {
    // Stylized mathematical wave for the hero; it is illustrative, not experimental data.
    return 0.78 * Math.sin(x * 1.18 + time) * Math.cos(y * 1.04 - time * .72)
      + 0.28 * Math.sin(x * 2.05 - time * .68) * Math.cos(y * 1.55 + time * .8);
  }

  function project(x, y, z) {
    return [width / 2 + (x - y) * width * .06,
      height * .49 + (x + y) * height * .03 - z * height * .115];
  }

  function drawWave(time) {
    wave.clearRect(0, 0, width, height);
    const n = gridSize;
    const step = extent * 2 / n;
    const cells = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cells.push([i, j]);
    cells.sort((a, b) => a[0] + a[1] - b[0] - b[1]);

    for (const [i, j] of cells) {
      const x = -extent + i * step;
      const y = -extent + j * step;
      const corners = [[x, y], [x + step, y], [x + step, y + step], [x, y + step]];
      const z = surfaceZ(x + step / 2, y + step / 2, time);
      const level = Math.max(0, Math.min(1, (z + 1.05) / 2.1));
      const hue = 215 - level * 212;
      const lightness = 22 + level * 22;
      wave.beginPath();
      corners.forEach(([px, py], index) => {
        const [sx, sy] = project(px, py, surfaceZ(px, py, time));
        if (index === 0) wave.moveTo(sx, sy); else wave.lineTo(sx, sy);
      });
      wave.closePath();
      wave.fillStyle = `hsla(${hue}, 82%, ${lightness}%, .88)`;
      wave.fill();
      wave.strokeStyle = 'rgba(193,231,220,.21)';
      wave.lineWidth = .7;
      wave.stroke();
    }
  }

  function animate(now) {
    if (now - lastDraw > 30) {
      drawWave(now * .00009);
      lastDraw = now;
    }
    if (!prefersReducedMotion.matches) frame = requestAnimationFrame(animate);
  }

  function startWave() {
    cancelAnimationFrame(frame);
    if (prefersReducedMotion.matches) drawWave(0);
    else frame = requestAnimationFrame(animate);
  }

  let scrollFrame = 0;
  function updateScrollTitle() {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      const progress = Math.max(0, Math.min(1, window.scrollY / (hero.offsetHeight * .58)));
      const lift = (hero.offsetHeight * .43 - 45) * progress;
      const scale = 1 - progress * .72;
      identity.style.transform = `translate(-50%, calc(-50% - ${lift}px)) scale(${scale})`;
      identity.style.opacity = String(1 - Math.max(0, (progress - .76) / .24));
      topbarBrand.style.opacity = String(Math.max(0, (progress - .78) / .22));
    });
  }

  resize();
  hero.classList.add('ready');
  startWave();
  updateScrollTitle();
  window.addEventListener('scroll', updateScrollTitle, { passive: true });
  window.addEventListener('resize', updateScrollTitle);
  const savedTheme = localStorage.getItem('ignis-theme');
  if (savedTheme === 'dark') document.documentElement.dataset.theme = 'dark';
  function updateThemeButton() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    themeToggle.setAttribute('aria-pressed', String(isDark));
    themeToggle.setAttribute('aria-label', isDark ? 'Ativar modo claro' : 'Ativar modo escuro');
    themeToggle.title = isDark ? 'Modo claro' : 'Modo escuro';
  }
  updateThemeButton();
  themeToggle.addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem('ignis-theme', nextTheme);
    updateThemeButton();
  });
  prefersReducedMotion.addEventListener('change', startWave);
  new ResizeObserver(resize).observe(hero);
})();
