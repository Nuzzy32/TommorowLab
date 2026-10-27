# TomorrowLab

Coba skenario. Pahami dampaknya.

SPA statis untuk simulator antrean kantin kampus. Kontrak data, validator, PCG32, core simulasi FIFO dan metrik sudah tersedia sebagai TypeScript murni dengan pengujian numerik. Adapter Web Worker, controller main thread dan workspace dengan kontrol manual (UF-01–08) sudah berjalan: atur skenario dan jadwal, jalankan, jeda, tambah pelanggan, selesaikan cepat, ulangi dan reset, dengan tampilan ringkas (CompactScene) dan hasil final. Scene 3D, perbandingan A/B, simpan/muat konfigurasi dan AirShift belum diimplementasikan.

## Menjalankan lokal

Gunakan Node **26.3.0** (lihat `.nvmrc`) dan npm **11.16.0**. Versi ini mengikuti runtime bootstrap yang tersedia dan diuji; bukan klaim versi LTS. Jika memakai nvm, jalankan `nvm install` lalu `nvm use`.

```sh
npm ci
npm run dev
```

Buka alamat lokal yang ditampilkan Vite. Aplikasi tidak meminta kamera, memakai backend, atau memuat font/aset dari layanan eksternal.

## Pemeriksaan

```sh
npx playwright install chromium
npm run check
```

`check` menjalankan typecheck, Vitest, build produksi, lalu Playwright Chromium terhadap hasil `dist/`. Tes browser menyalakan preview pada `127.0.0.1:4173`; port harus kosong. Build produksi dibuat terpisah dari typecheck sesuai [Vite](https://vite.dev/guide/).

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

## Struktur awal

`src/app/` memuat workspace (`App.tsx`), draft dan validasi form (`draft.ts`), panel parameter, panel run/hasil dan komponen dasar; `src/styles/` token DESIGN_SYSTEM dan CSS, `src/domain/` konfigurasi dan validasi, `src/simulation/` engine/RNG/metrik, `src/workers/` protokol dan runtime worker, `src/controller/` pacing dan lifecycle di main thread, `tests/integration/` protokol/controller, dan `tests/e2e/` alur workspace di browser. Three.js belum dipasang karena belum digunakan.

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

Runtime worker (`src/workers/runtime.ts`) memproses satu kelompok timestamp per langkah dan yield lewat macrotask setelah 100 kelompok atau ±4 ms. Ia menolak epoch/job lama, tidak pernah mengeksekusi ulang command duplikat (64 reply terakhir disimpan), dan mengirim ACK reset/replay pada epoch lama sebelum snapshot generasi baru. Proyeksi ke UI dibatasi 10 Hz dan paling banyak 150 ID antrean sampel; record pelanggan penuh tetap di worker. Command batch A/B menyusul pada WP-08.

Bukti dan batas pengujian: [core](docs/verification/core-2026-10-26.md), [worker/controller](docs/verification/worker-2026-10-27.md), [workspace](docs/verification/workspace-2026-10-27.md).

## Acuan dan scope berikutnya

- [PRD](PRD.md): kebutuhan dan batas MVP.
- [User flow](USER_FLOW.md): interaksi dan lifecycle.
- [Design system](DESIGN_SYSTEM.md): token, layout dan aksesibilitas.
- [Arsitektur](ARCHITECTURE.md): pembagian tanggung jawab dan protokol.
- [Spesifikasi simulasi](SIMULATION_SPEC.md): model, RNG dan fixture numerik.
- [Roadmap](ROADMAP.md): tahapan dan gate penerimaan.

Berikutnya: scene 3D Three.js di atas proyeksi yang sama (WP-07), lalu A/B 20 pasangan (WP-08) dan simpan/muat lokal (WP-09). Hasil simulasi tidak boleh digantikan animasi atau angka contoh.

Bootstrap lokal tidak menyelesaikan seluruh gate M0: owner/kapasitas tim, perangkat QA, host HTTPS, base path dan kebijakan deployment, serta eligibility/akses submission masih perlu ditetapkan. Smoke Chromium bukan audit aksesibilitas menyeluruh atau verifikasi lintas browser.
# TommorowLab
