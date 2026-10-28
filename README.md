# TomorrowLab

Coba skenario. Pahami dampaknya.

SPA statis untuk simulator antrean kantin kampus. Kontrak data, validator, PCG32, core simulasi FIFO dan metrik sudah tersedia sebagai TypeScript murni dengan pengujian numerik. Adapter Web Worker, controller main thread dan workspace dengan kontrol manual (UF-01–08) sudah berjalan: atur skenario dan jadwal, jalankan, jeda, tambah pelanggan, selesaikan cepat, ulangi dan reset, dengan ruang 3D kantin (three.js, dimuat lazy) atau tampilan ringkas, grafik panjang antrean dan hasil final. Tampilan mengikuti arah visual kaca DESIGN_SYSTEM v1.1. Tab **Bandingkan** menjalankan 20 pasangan replikasi A/B dengan permintaan yang sama (CRN) dan interval 95% selisih rata-rata tunggu. Drawer **Tersimpan** menyimpan, memuat dan menghapus hingga 10 konfigurasi di browser ini. **AirShift** (opsional, flag `VITE_AIRSHIFT`, default aktif) mengenali telapak terbuka/jempol ke atas lewat kamera secara lokal untuk pause/lanjut; gate produknya masih menunggu uji manusia, jadi bangun dengan `VITE_AIRSHIFT=0` bila keputusannya no-go.

## Menjalankan lokal

Gunakan Node **26.3.0** (lihat `.nvmrc`) dan npm **11.16.0**. Versi ini mengikuti runtime bootstrap yang tersedia dan diuji; bukan klaim versi LTS. Jika memakai nvm, jalankan `nvm install` lalu `nvm use`.

```sh
npm ci
npm run dev
```

Buka alamat lokal yang ditampilkan Vite. Aplikasi tidak meminta kamera, memakai backend, atau memuat font/aset dari layanan eksternal.

## Pemeriksaan

```sh
npx playwright install chromium firefox webkit
npm run check
```

`check` menjalankan typecheck, Vitest, build produksi, lalu Playwright (Chromium, Firefox, WebKit) terhadap hasil `dist/`. Tes browser menyalakan preview pada `127.0.0.1:4173`; port harus kosong. Build produksi dibuat terpisah dari typecheck sesuai [Vite](https://vite.dev/guide/).

| Perintah | Fungsi |
|---|---|
| `npm run typecheck` | Memeriksa TypeScript aplikasi, konfigurasi dan tes |
| `npm test` | Unit/integration tests sekali jalan |
| `npm run test:watch` | Vitest selama pengembangan |
| `npm run build` | Menghasilkan aplikasi statis di `dist/` |
| `npm run preview` | Meninjau build yang sudah dibuat |
| `npm run test:e2e` | Smoke browser; jalankan build terlebih dahulu |

Workflow `.github/workflows/ci.yml` memakai lockfile dan urutan pemeriksaan yang sama. CI remote belum dijalankan. Belum ada repository Git atau deployment yang dibuat pada bootstrap ini.

Verifikasi bootstrap lokal 26 Oktober 2026: instalasi ulang `npm ci` dari lockfile, typecheck, 1 tes Vitest, build produksi dan 2 smoke test Chromium 156 lulus pada macOS Apple Silicon. Tampilan desktop 1366 px dan mobile 360 px diperiksa melalui screenshot. Browser pengujian sesi ini berada di direktori sementara melalui `PLAYWRIGHT_BROWSERS_PATH`; instalasi standar memakai perintah di atas. Ini hanya bukti bootstrap, bukan seluruh gate M0.

Setelah penambahan core pada tanggal yang sama, `npm run check` kembali lulus: typecheck, **484 tes Vitest pada 5 file**, build produksi dan **2 smoke test Chromium**. Rincian input, corpus dan batas klaim ada pada laporan verifikasi core di bawah.

Setelah worker/controller (27 Oktober 2026), `npm run check` lulus dengan **504 tes Vitest pada 7 file**, build produksi dan 2 smoke test Chromium.

Setelah workspace (27 Oktober 2026), `npm run check` lulus dengan **512 tes Vitest pada 8 file**, build produksi (termasuk chunk worker) dan **11 tes e2e Chromium** terhadap `dist/`.

Setelah redesign kaca dan ruang 3D (27 Oktober 2026), `npm run check` lulus dengan **513 tes Vitest pada 8 file**, build produksi (chunk worker dan chunk three.js terpisah) dan **13 tes e2e Chromium** (39/39 saat diulang 3×). Playwright menjalankan Chromium dengan `--enable-unsafe-swiftshader` agar jalur WebGL deterministik.

Setelah perbandingan A/B (27 Oktober 2026), `npm run check` lulus dengan **530 tes Vitest pada 9 file**, build produksi dan **16 tes e2e Chromium**.

Setelah simpan/muat lokal (28 Oktober 2026), `npm run check` lulus dengan **538 tes Vitest pada 10 file**, build produksi dan **20 tes e2e Chromium** (60/60 saat diulang 3×).

Setelah hardening WP-10 (28 Oktober 2026), `npm run check` lulus dengan **539 tes Vitest**, build produksi dan **72 tes e2e** di Chromium, Firefox dan WebKit (termasuk audit axe WCAG 2.2 AA dan benchmark indikatif). Setelah AirShift, totalnya **545 tes Vitest pada 11 file** dan **75 tes e2e** (150/150 saat diulang 2×).

## Struktur awal

`src/app/` memuat workspace (`App.tsx`), draft dan validasi form (`draft.ts`), panel parameter, panel run/hasil dan komponen dasar; `src/styles/` token DESIGN_SYSTEM dan CSS, `src/domain/` konfigurasi dan validasi, `src/simulation/` engine/RNG/metrik, `src/workers/` protokol dan runtime worker, `src/controller/` pacing dan lifecycle di main thread, `src/scene/` ruang 3D kantin (visual saja), `src/storage/` konfigurasi tersimpan, `tests/integration/` protokol/controller, dan `tests/e2e/` alur workspace di browser. Font Plus Jakarta Sans/JetBrains Mono di-host sendiri lewat `@fontsource`; ikon dari `@phosphor-icons/react`. `src/airshift/` berisi gate pose, adapter kamera dan worker MediaPipe; model ada di `src/airshift/gesture_recognizer.task` (lihat `src/airshift/NOTICE.txt`).

## Core simulasi

```ts
import { DEFAULT_CONFIG } from './src/domain/config';
import { createSimulation } from './src/simulation/engine';

const run = createSimulation(DEFAULT_CONFIG);
run.start();
const { result } = run.finish();
```

Core tidak membaca DOM, kamera, storage atau waktu nyata. `advanceTo(t)` memajukan waktu simulasi, `pause()`/`resume()` menjaga waktu, dan `enqueueManual(count)` mencatat tambahan pada waktu canonical. Tambahan pending diproses pada advance/resume berikutnya. `snapshot()` dan `getLedger()` mengembalikan salinan terpisah. Replay memakai `createSimulation(configSnapshot, replicationIndex, inputLog)`; reset memakai konfigurasi awal tanpa log live. `promoteManualLog` menggabungkan jadwal dasar dan log untuk konfigurasi baru tanpa mengubah identitas.

`finish()` sinkron untuk komputasi headless; jangan memanggilnya dari event handler UI. Batas 2.000 pelanggan menghasilkan status nonfinal, bukan penghapusan pelanggan. Metrik final hanya tersedia setelah horizon dan drain selesai.

## Penyimpanan lokal

Setiap konfigurasi adalah satu key `tomorrowlab:scenario:<recordId>` berisi record JSON berversi (≤100 KB, maksimal 10 key). Daftar dibentuk dengan enumerasi namespace dan validasi tiap record; record rusak atau versinya tidak didukung ditampilkan tetapi tidak dimuat dan tidak dihapus otomatis. Simpan dan hapus berjalan di dalam Web Lock `tomorrowlab:scenario-write:v1`: target dibaca ulang dan harus sama dengan yang dilihat pengguna, lalu satu `setItem`/`removeItem` dan readback. Tanpa localStorage atau Web Locks, menulis dinonaktifkan dengan alasan dan simulasi tetap berjalan di memori. Preferensi bantuan disimpan di `tomorrowlab:pref:help-seen`.

## Worker dan controller

UI memakai `createSimulationController()` dari `src/controller/client.ts`, bukan engine langsung:

```ts
const controller = createSimulationController();
controller.subscribe(view => render(view.projection));
await controller.create(DEFAULT_CONFIG);
await controller.run();          // pacing ADVANCE_TO dari requestAnimationFrame
await controller.addManual(3);   // timestamp ditetapkan worker, terlihat di ACK
await controller.pauseForHidden(); // panggil dari handler visibilitychange
```

Runtime worker (`src/workers/runtime.ts`) memproses satu kelompok timestamp per langkah dan yield lewat macrotask setelah 100 kelompok atau ±4 ms. Ia menolak epoch/job lama, tidak pernah mengeksekusi ulang command duplikat (64 reply terakhir disimpan), dan mengirim ACK reset/replay pada epoch lama sebelum snapshot generasi baru. Proyeksi ke UI dibatasi 10 Hz dan paling banyak 150 ID antrean sampel; record pelanggan penuh tetap di worker.

Perbandingan A/B memakai worker yang sama: `controller.startComparison(a, b)` mengirim `START_COMPARISON`, worker menjalankan pasangan r=0…19 secara serial (A lalu B dengan stream `(rootSeed, r, domain)` yang sama), memeriksa identitas permintaan tiap pasangan, dan melaporkan progres dengan `jobId` batch. Selama batch, command yang menghitung run visual ditolak `BUSY`; tab tersembunyi menangguhkan batch (`SUSPEND_COMPARISON`) tanpa catch-up. Ringkasan (`src/simulation/comparison.ts`) memakai rata-rata per replikasi dan t-interval berpasangan df19 (2,093024).

Bukti dan batas pengujian: [core](docs/verification/core-2026-10-26.md), [worker/controller](docs/verification/worker-2026-10-27.md), [workspace](docs/verification/workspace-2026-10-27.md), [redesign dan ruang 3D](docs/verification/redesign-3d-2026-10-27.md), [perbandingan A/B](docs/verification/comparison-2026-10-27.md), [simpan/muat lokal](docs/verification/storage-2026-10-28.md), [hardening](docs/verification/hardening-2026-10-28.md), [AirShift](docs/verification/airshift-2026-10-28.md).

## Acuan dan scope berikutnya

- [PRD](PRD.md): kebutuhan dan batas MVP.
- [User flow](USER_FLOW.md): interaksi dan lifecycle.
- [Design system](DESIGN_SYSTEM.md): token, layout dan aksesibilitas.
- [Arsitektur](ARCHITECTURE.md): pembagian tanggung jawab dan protokol.
- [Spesifikasi simulasi](SIMULATION_SPEC.md): model, RNG dan fixture numerik.
- [Roadmap](ROADMAP.md): tahapan dan gate penerimaan.

Berikutnya: hardening, uji lintas browser, aksesibilitas dan performa (WP-10), lalu build produksi dan submission (WP-11). Hasil simulasi tidak boleh digantikan animasi atau angka contoh.

Bootstrap lokal tidak menyelesaikan seluruh gate M0: owner/kapasitas tim, perangkat QA, host HTTPS, base path dan kebijakan deployment, serta eligibility/akses submission masih perlu ditetapkan. Smoke Chromium bukan audit aksesibilitas menyeluruh atau verifikasi lintas browser.
# TommorowLab
