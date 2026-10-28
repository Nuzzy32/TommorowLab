# Verifikasi hardening WP-10 TomorrowLab — 28 Oktober 2026

Scope: bagian WP-10 yang dapat diotomatisasi, yaitu uji lintas mesin browser, audit aksesibilitas otomatis, korpus batch A/B, dan benchmark indikatif. Bagian yang membutuhkan manusia atau perangkat nyata tercantum di akhir sebagai checklist terbuka. Dokumen ini **tidak** menyatakan gate G5 lulus.

## Perubahan dari temuan

| Temuan | Mesin | Perbaikan |
|---|---|---|
| Fokus tidak kembali ke pemicu setelah dialog ditutup, karena Safari tidak memfokuskan tombol saat diklik | WebKit | `DialogShell` juga mengingat elemen terakhir yang ditekan pointer sebagai pemicu |
| Tab "Bandingkan" tidak dapat dicapai keyboard (tab tak aktif `tabIndex=-1` tanpa navigasi panah) | semua | Pola ARIA tabs: ←/→/Home/End berpindah tab |
| `aria-label` pada `<span>` timer tidak didukung dengan baik oleh pembaca layar | semua | Timer visual `aria-hidden`, ditambah teks sr-only "N menit M detik" |
| CI hanya menjalankan Chromium | — | Workflow memasang dan menjalankan Chromium, Firefox, dan WebKit |
| Dialog bertumpuk dengan `backdrop-filter` blur selebar viewport membuat WebKit Linux (render software) tidak pernah stabil | Linux | Dialog dan backdrop modal tanpa blur (putih 96%, overlay 30%); panel kaca tetap. CI menjalankan Playwright dengan 1 worker; direproduksi dan diverifikasi di container `mcr.microsoft.com/playwright:v1.64.1-noble` (4 CPU) |
| Di runner Linux, WebKit me-render 3D dengan software GL hanya beberapa fps sehingga kontrol nyaris tidak bisa diklik; Firefox headless Linux tidak punya WebGL2 | Linux | Scene memantau jeda antarframe: ≥12 dari 15 frame terakhir >120 ms (di bawah ±8 fps; terukur 2–5 fps di container WebKit Linux) memicu fallback otomatis ke tampilan ringkas dengan pesan "Ruang 3D terlalu berat untuk perangkat ini" dan tombol "Coba 3D lagi" (permintaan ulang mempertahankan 3D). Tes 3D dilewati bila WebGL2 tidak ada atau <10 fps; tes baru memperlambat `requestAnimationFrame` untuk membuktikan fallback |

## Pemeriksaan otomatis

`npm run check` lulus: typecheck, **539 tes Vitest pada 10 file**, build produksi, dan **72 tes e2e** (24 × Chromium/Firefox/WebKit; audit axe hanya di Chromium sehingga 6 dilewati). Diulang 2× → 144/144.

| Bukti | Cakupan | Hasil |
|---|---|---|
| Lintas mesin | Seluruh alur UF-01–15, ST-01, A/B, simpan/muat, konflik tab, fallback WebGL, storage diblokir, layout 360–1280 px | Lulus di Chromium 156, Firefox, dan WebKit 27.2 (Playwright, macOS) |
| axe-core 4.14, WCAG 2.2 A/AA | Bantuan, READY, asumsi, run dijeda, hasil final, drawer Tersimpan, dialog Simpan, tampilan ringkas 360 px, hasil perbandingan + detail | Nol pelanggaran |
| Kontras di atas kaca | Latar gradien diganti warna bidang paling gelap `#BED6EC` dan blur dimatikan agar lapisan transparan terukur | Nol pelanggaran kontras. Sisa "incomplete" hanya chip angka di kotak scene bergradien (kartu putih 80%, aman secara analitis) |
| Keyboard tab | ←/→/Home berpindah tab dan mengatur `aria-selected` | Lulus di 3 mesin |
| Korpus batch A/B | 100 seed × 20 pasangan, λ 3/6/9, c dan pelayanan bervariasi | Setiap pasangan berbagi permintaan; CI finite memuat mean; label sesuai tanda CI; lebih dari satu jenis interpretasi muncul |

## Benchmark indikatif

Headless Playwright pada MacBook Apple Silicon. Bukan perangkat acuan; angka ini hanya untuk mendeteksi regresi besar.

| Mesin | FPS halaman dengan scene 3D + run 20× | Pause sampai "Dijeda" | 20 pasangan A/B (preset, B=3 loket) | Selesaikan cepat ±1.970 pelanggan |
|---|---:|---:|---:|---:|
| Chromium (SwiftShader) | 44–52 | 59–251 ms | 73–79 ms | 378–385 ms; tidak ada long task main thread >50 ms |
| WebKit | 61 | 78–91 ms | 76–79 ms | 156–250 ms |
| Firefox (headless, tanpa GPU) | 13–18 | 215–217 ms | 107–112 ms | 228–246 ms |

Tes `perf.spec.ts` hanya memakai batas longgar (pause < 2 s, batch < 10 s, beban berat < 15 s) agar stabil di CI. FPS Firefox headless rendah karena render perangkat lunak. Ini **harus diukur ulang** di Firefox dengan GPU dan di perangkat acuan.

## Checklist terbuka (butuh manusia atau perangkat nyata)

| Item | Acuan | Status |
|---|---|---|
| Safari dan Edge asli (bukan engine Playwright); Firefox dengan GPU | NFR browser, M5 | Belum |
| Perangkat acuan: laptop kelas menengah dan HP Android menengah; FPS scene, latensi pause ≤ 500 ms, batch | NFR-02/04, ARCHITECTURE §14 | Belum |
| Screen reader: VoiceOver (Safari) dan NVDA (Firefox/Chrome), alur run, tambah pelanggan, hasil, A/B, simpan | DS-QA, M5 | Belum |
| Zoom browser 200% dan teks 200% pada perangkat nyata (otomatis hanya mensimulasikan 640 px) | WCAG 1.4.4/1.4.10 | Sebagian |
| `prefers-reduced-motion` dan `prefers-reduced-transparency` diperiksa visual | DS §3.7 | Belum |
| Uji tugas formatif ±5 peserta (G-01/G-02 PRD) | M5 | Belum dijadwalkan |
| Mode privat Safari (kuota localStorage), Firefox dengan Web Locks dimatikan | FR-23 | Belum |
| Host HTTPS produksi: worker MIME, base path, cache | WP-11 | Belum (hosting belum dipilih) |
