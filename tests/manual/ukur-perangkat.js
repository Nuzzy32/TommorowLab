// Pengukuran perangkat acuan (NFR-02/03/04). Panduan: docs/verification/manual-test-kit.md §5.
// Pakai: buka TomorrowLab dengan preset default, tutup bantuan, biarkan tampilan 3D, jangan sentuh halaman,
// lalu tempel seluruh isi file ini di DevTools Console (HP Android: chrome://inspect lewat USB) dan tekan Enter.
// Skrip hanya menekan tombol TomorrowLab di tab ini; tidak mengirim apa pun ke luar.
(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
  const text = element => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const status = () => document.querySelector('[aria-label="Status simulasi"]');
  const primary = () => document.getElementById('primary-action');
  const button = name => [...document.querySelectorAll('button, [role="tab"]')]
    .find(element => element.getAttribute('aria-label') === name || text(element) === name);
  const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]; };
  const ms = value => `${Math.round(value)} ms`;

  // Click, then wait until `target()` text matches and the next frame is painted.
  function timedClick(element, pattern, target = status, timeout = 30_000) {
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const done = async () => { observer.disconnect(); clearTimeout(timer); await frame(); resolve(performance.now() - start); };
      const observer = new MutationObserver(() => { if (pattern.test(text(target()))) done(); });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
      const timer = setTimeout(() => { observer.disconnect(); reject(new Error(`Tidak muncul ${pattern} dalam ${timeout} ms`)); }, timeout);
      element.click();
    });
  }

  if (!/Siap dijalankan/.test(text(status()))) throw new Error('Mulai dari status "Siap dijalankan" dengan preset default (muat ulang halaman, lalu Lewati bantuan).');
  const report = { perangkat: navigator.userAgent, viewport: `${innerWidth}×${innerHeight} @${devicePixelRatio}x`, waktu: new Date().toISOString() };

  // 5× keeps the default 15-minute run going for ~3 minutes, long enough for every step below. Speed is display pacing only.
  document.querySelector('input[name="speed"][value="5"]')?.click();
  await timedClick(primary(), /Berjalan/);
  await sleep(2000);

  // NFR-02: pause/lanjutkan berulang; feedback = status strip berubah dan sudah dipaint.
  const feedback = [];
  for (let pair = 0; pair < 25 && /Berjalan/.test(text(status())); pair++) {
    feedback.push(await timedClick(primary(), /Dijeda/));
    await sleep(250);
    feedback.push(await timedClick(primary(), /Berjalan/));
    await sleep(250);
  }
  report.pauseResume = { klik: feedback.length, median: ms(percentile(feedback, 0.5)), p95: ms(percentile(feedback, 0.95)), terlama: ms(Math.max(...feedback)), '≤100 ms': `${feedback.filter(value => value <= 100).length}/${feedback.length}` };

  // NFR-03: frame per detik selama run berjalan, maksimal 60 detik.
  const perSecond = [];
  while (perSecond.length < 60 && /Berjalan/.test(text(status()))) {
    perSecond.push(await new Promise(resolve => {
      let frames = 0; const start = performance.now();
      const tick = () => { frames++; if (performance.now() - start < 1000) requestAnimationFrame(tick); else resolve(frames); };
      requestAnimationFrame(tick);
    }));
  }
  report.fps = { detik: perSecond.length, median: percentile(perSecond, 0.5), terendah: Math.min(...perSecond), tampilan: document.querySelector('.scene-canvas') ? '3D' : 'ringkas' };

  // NFR-04: Selesaikan cepat (bila run masih berjalan) lalu A/B 20 pasangan.
  const fast = button('Selesaikan cepat');
  report.selesaikanCepat = fast && !fast.disabled && /Berjalan/.test(text(status()))
    ? ms(await timedClick(fast, /Selesai · hasil final|Batas percobaan tercapai/))
    : 'dilewati: run sudah selesai sebelum diukur';
  button('Bandingkan').click();
  await sleep(300);
  button('Jadikan skenario sekarang baseline A')?.click();
  await sleep(300);
  button('Tambah loket kandidat B').click();
  await sleep(300);
  const tag = () => document.querySelector('#hasil-perbandingan .tag');
  report.ab20 = ms(await timedClick(button('Jalankan 20 pasangan'), /^Final$/, tag, 60_000));

  console.table(Object.entries(report).map(([key, value]) => ({ ukuran: key, hasil: typeof value === 'object' ? JSON.stringify(value) : value })));
  console.log('Salin ke lembar §5:', JSON.stringify(report, null, 2));
  return report;
})();
