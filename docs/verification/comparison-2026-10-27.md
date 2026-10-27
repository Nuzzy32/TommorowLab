# Verifikasi perbandingan A/B TomorrowLab — 27 Oktober 2026

Scope: WP-08. Ini mencakup baseline A dan kandidat B, kunci fairness, batch 20 pasangan dengan CRN, ringkasan dan interval 95%, cancel/suspend/invalid, hasil sebelumnya (stale) dan tab Bandingkan (USER_FLOW UF-09–11, SIMULATION_SPEC §6, ARCHITECTURE §6.2/§8, DESIGN_SYSTEM CMP-09–11). Bukti lokal; belum uji lintas browser atau validasi distribusi t-interval.

## Keputusan implementasi

- **Statistik** ada di `src/simulation/comparison.ts` sebagai fungsi murni:
  - mean A/B adalah rata-rata dari 20 mean replikasi (tanpa pooling pelanggan);
  - selisih `d_r = wait_B,r − wait_A,r` memakai varians two-pass dan SE `s_d/√20`;
  - CI = mean ± 2,093024 × SE;
  - persen `100×(meanB−meanA)/meanA`, bernilai N/A bila baseline 0.
- **Urutan label:**
  - pasangan kosong → N/A, didahulukan atas label lain;
  - A=B identik → "Skenario identik";
  - CI < 0 → B lebih rendah;
  - CI > 0 → B lebih tinggi;
  - CI menyentuh atau melintasi 0 → belum meyakinkan.
- **Pairing:** memakai stream engine `(rootSeed, r, domain)` yang sudah ada. Untuk tiap pasangan, worker memeriksa bahwa daftar `(id, arrivalAt, serviceDemandU)` A dan B identik. Bila berbeda, batch dinyatakan invalid; pasangan tidak dibuang.
- **Fairness:**
  - Worker menolak `START_COMPARISON` bila λ, H, seed, jadwal manual (id/sequence/ordinal) atau versi berbeda.
  - Di UI, B hanya bisa mengubah loket dan rentang pelayanan, jadi fairness berlaku sejak awal.
  - "Ubah permintaan bersama" dilakukan dengan mengedit skenario di tab Simulasi, lalu memakai "Ganti baseline A" (dengan konfirmasi).
- **Batch di runtime worker yang sama:**
  - Pasangan berjalan serial, A lalu B per pasangan, dengan budget slice yang sama.
  - Selama batch, command yang menghitung atau mengganti run visual ditolak `BUSY`.
  - Batch tidak bisa dimulai saat run visual RUNNING. UI menawarkan dialog "Pause dan buka perbandingan?".
  - Worker baru yang belum terikat diikat ke run READY dari A terlebih dulu.
- **Pelaporan:** controller menyimpan `comparison` (batch terbaru) dan `lastComparison` (batch terakhir yang selesai). Cancel atau invalid tidak pernah menggantikan hasil lengkap sebelumnya. Hasil yang dihitung dari konfigurasi selain A/B saat ini diberi label "Hasil dari konfigurasi sebelumnya". Perbandingannya memakai signature kanonis yang tidak mencakup nama/id.
- **Log run sebagai jadwal bersama:** bila baseline diambil dari snapshot run yang punya tambahan live, opsi "Sertakan tambahan pelanggan dari run" menggabungkannya sekali sebagai jadwal bersama (default off).
- **Tampilan hasil:**
  - tabel metrik A/B dengan kolom B − A;
  - grafik interval dengan garis nol (sumbu selalu memuat 0 dan kedua batas);
  - detail 20 pasangan;
  - di bawah 760 px, tabel dipivot menjadi blok per metrik.

## Pemeriksaan otomatis

`npm run check` lulus dengan rincian berikut:
- typecheck;
- **530 tes Vitest pada 9 file**;
- build produksi;
- **16 tes e2e Chromium**.

| Bukti | Tes | Hasil |
|---|---|---|
| ST-09 | unit | d sepuluh −1 dan sepuluh +1 menghasilkan mean 0, varians 20/19, half-width 0,48017263696869866, label belum meyakinkan |
| ST-06 | unit + integrasi | A=B pada r=0/7/19 memberi demand dan ringkasan identik; batch memberi d=0, CI [0;0], IDENTICAL |
| CRN | unit | Mengubah c/a/b mempertahankan id/arrival/uniform; r berbeda mengubah demand |
| SX-08 | unit | Satu pasangan kosong membuat rata-rata tunggu, delta, persen dan CI N/A tanpa memakai n=19 |
| Baseline 0 | unit | Persen N/A; delta dan CI tetap ada |
| Batch = engine langsung | integrasi | 20 pasangan worker identik dengan 20 pasangan `createSimulation(config, r)`; progres monoton 0→20 dengan `jobId` batch |
| Guard | integrasi | Permintaan beda menghasilkan INVALID_INPUT; visual RUNNING menghasilkan BUSY; RESUME/ADD/FAST/START kedua selama batch menghasilkan BUSY; run visual PAUSED tetap PAUSED dan dapat dilanjutkan |
| SX-12 batch | integrasi | Suspend di tengah pasangan tidak menghasilkan progres; resume memberi ringkasan sama dengan batch tanpa jeda |
| Cancel | integrasi + controller | Cancel nonfinal; completion yang lebih dulu menang atas cancel terlambat; `lastComparison` tetap batch lengkap sebelumnya |
| Invalid | integrasi | Replikasi yang melewati 2.000 pelanggan membuat seluruh batch invalid tanpa ringkasan |
| Hidden | controller | Tab tersembunyi menangguhkan batch, bukan menjeda run visual; lanjut manual sampai selesai |
| UF-09/10/11 | e2e | A=B "Skenario identik" [0,00; 0,00]; B 3 loket diberi label stale lalu "B lebih rendah", Final, 20 baris detail, tanpa scroll horizontal |
| Buka saat RUNNING | e2e | Dialog Pause dan buka (fokus Batal); sumber A snapshot run dijeda; Simulasi tetap Dijeda lalu dapat dilanjutkan |
| Dari hasil final | e2e | "Jadikan baseline A" dari panel Hasil; jadwal tetap λ=0 menghasilkan Skenario identik |

## Pemeriksaan visual

Browser pane diperiksa pada 1440×1000 dan 360×800. Preset dengan B 3 loket menghasilkan selisih −38,66 detik, CI [−50,70; −26,61], −89,12%. Pada 360 px, tabel tampil sebagai blok per metrik tanpa scroll horizontal.

## Batas yang diketahui

- Utilisasi dan metrik lain tanpa CI hanya ditampilkan sebagai selisih, tanpa label signifikansi.
- Waktu batch belum diukur pada perangkat acuan. Pembatalan berlaku pada checkpoint slice (≤4 ms atau 100 kelompok), tetapi latensi UI ≤500 ms belum dibenchmark.
- Hasil perbandingan tidak tersimpan setelah refresh; penyimpanan konfigurasi adalah WP-09.
- Validasi distribusi t-interval dengan corpus seed besar (SIMULATION_SPEC §8, QA-04) belum dikerjakan.
