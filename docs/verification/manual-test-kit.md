# Kit uji manual TomorrowLab — WP-10 dan gate AirShift

Disusun 30 Oktober 2026. Dokumen ini berisi protokol dan lembar catat untuk uji yang **tidak bisa dibuktikan oleh tes otomatis**: orang sungguhan, perangkat sungguhan, browser asli dan pembaca layar. Dokumen ini tidak melaporkan hasil apa pun. Hasil setiap bagian ditulis di file baru `docs/verification/<topik>-<tanggal>.md` dengan identitas build yang diuji.

| Bagian | Isi | Batas waktu (ROADMAP) | Orang/perangkat |
|---|---|---|---|
| §1 | Gate produk AirShift | **13 Nov 20.00 WIB** (keputusan go/no-go) | ≥3 orang, laptop berkamera |
| §2 | Browser asli: Safari, Edge, Firefox dengan GPU | Sebelum feature freeze 18 Nov | Mac + Windows |
| §3 | Pembaca layar: VoiceOver dan NVDA | Sebelum 18 Nov | Mac + Windows |
| §4 | Reduced motion dan reduced transparency | Sebelum 18 Nov | Perangkat mana pun |
| §5 | Perangkat acuan: FPS, latensi, batch, startup | Sebelum 17 Nov | Laptop menengah + HP Android menengah |
| §6 | Mode privat Safari dan Firefox tanpa Web Locks | Sebelum 18 Nov | Mac |
| §7 | Uji tugas ±5 peserta (G-01/G-02) | G-01 sebelum 17 Nov, G-02 sebelum 18 Nov | 5 peserta + 1 fasilitator |

## 0. Persiapan bersama

**Identitas build.** Catat di setiap lembar: commit (`git rev-parse --short HEAD`), cara penyajian (lokal atau URL HTTPS), browser beserta versi persisnya, OS dan perangkat.

**Cara menyajikan aplikasi.**

```bash
npm ci && npm run build && npm run preview
```

Perintah ini membuka build produksi di `http://127.0.0.1:4173` untuk browser di komputer yang sama.

> **Penting untuk HP dan perangkat lain.** Kamera (AirShift) dan Web Locks (simpan/hapus) hanya tersedia di *secure context*: HTTPS atau `localhost`. Bila HP membuka `http://192.168.x.x:4173`, tombol simpan akan nonaktif dan AirShift tidak bisa menyala. Itu perilaku browser, **bukan bug**. Pilihan yang benar:
> - **HP Android:** sambungkan USB, buka `chrome://inspect` di Chrome laptop → *Port forwarding* `4173` → `localhost:4173`, lalu buka `http://localhost:4173` di HP.
> - **iPhone / perangkat lain:** tunggu host HTTPS (WP-11). Bagian §5 dan §7 paling mudah dijalankan setelah URL publik ada.

**Format hasil.** Tulis **Lulus**, **Gagal** (beserta langkah reproduksi dan screenshot) atau **Tidak diuji** (beserta alasannya). Jangan biarkan sel kosong. Setiap Gagal menjadi issue sebelum retest.

---

## 1. Gate produk AirShift

Acuan: PRD §9.3, ROADMAP §7, [airshift-2026-10-28.md](airshift-2026-10-28.md). **Go** hanya bila semua baris di §1.6 lulus. Bila waktu atau peserta tidak cukup, keputusannya **no-go**: build submission memakai `VITE_AIRSHIFT=0`.

### 1.1 Persiapan

- Laptop dengan kamera bawaan dan Chrome terbaru. Catat model laptop dan kamera.
- Build produksi lewat `npm run preview` di laptop itu (localhost = secure context) atau host HTTPS.
- Ponsel kedua untuk **merekam layar dan tangan sekaligus** dari belakang peserta. Video dipakai untuk mengukur ≤2 detik. Minta izin peserta sebelum merekam, simpan video secara lokal, dan hapus setelah penilaian selesai. TomorrowLab sendiri tidak menyimpan frame kamera.
- Dua kondisi cahaya, diukur bila ada aplikasi lux meter di HP:
  - **Terang:** lampu ruangan menyala dan/atau siang hari dekat jendela (perkiraan ≥300 lux di wajah).
  - **Redup:** lampu utama dimatikan, hanya lampu kecil atau cahaya layar (perkiraan 30–80 lux).
- Peserta duduk di jarak kerja normal (±50–70 cm). Hanya satu tangan di depan kamera.

### 1.2 Definisi satu percobaan

| Pose | Kondisi awal | Aksi yang benar |
|---|---|---|
| Telapak terbuka ✋ | Run **Berjalan** | Run menjadi **Dijeda** |
| Jempol ke atas 👍 | Run **Dijeda** (oleh AirShift atau tombol, bukan karena tab tersembunyi) | Run kembali **Berjalan** |

- Waktu dihitung dari frame video saat pose pertama kali terbentuk sampai status strip berubah. Gate di aplikasi butuh ±0,6 detik pose stabil, jadi pose harus **ditahan**, bukan dikedipkan.
- **Benar** berarti aksi yang tepat terjadi tepat sekali dalam ≤2 detik.
- **Salah** berarti tidak ada aksi dalam 2 detik, aksi terjadi lebih dari sekali, atau aksi yang salah.
- Di antara percobaan, turunkan tangan ±2 detik. Aplikasi butuh tangan netral ≥300 ms dan cooldown 1,5 detik sebelum pose berikutnya dihitung.
- Supaya run tidak selesai di tengah sesi, set **Kecepatan tampilan 1×** dan durasi menerima pelanggan 60 menit. Reset bila perlu; reset tidak termasuk percobaan.

### 1.3 Lembar pose sah (salin per orang × cahaya; total ≥6 lembar)

Peserta: ____ · Cahaya: terang / redup (± ____ lux) · Browser: ____ · Commit: ____

| # | ✋ Jeda: benar? | detik | 👍 Lanjut: benar? | detik | Catatan |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6 | | | | | |
| 7 | | | | | |
| 8 | | | | | |
| 9 | | | | | |
| 10 | | | | | |
| **Jumlah benar** | **/10** | | **/10** | | |

Rekap: target **≥90% benar dalam ≤2 s**, dihitung per orang × cahaya × pose. Tulis denominatornya secara eksplisit, misalnya "✋ terang: 29/30 = 96,7%". Laporkan juga angka per orang supaya satu orang dengan hasil bagus tidak menutupi orang lain.

| Pose × cahaya | Orang 1 | Orang 2 | Orang 3 | Total | ≥90%? |
|---|---|---|---|---|---|
| ✋ terang | /10 | /10 | /10 | /30 | |
| ✋ redup | /10 | /10 | /10 | /30 | |
| 👍 terang | /10 | /10 | /10 | /30 | |
| 👍 redup | /10 | /10 | /10 | /30 | |

### 1.4 Aksi palsu (≥10 menit total)

AirShift aktif, run **Berjalan** dengan kecepatan 1×. Peserta melakukan gerakan biasa, bukan perintah. Pengamat mencatat setiap jeda atau lanjut yang tidak diminta. Status strip menulis "Manual + AirShift" selama kamera aktif.

| Aktivitas | Menit | Aksi tak sengaja | Catatan |
|---|---|---|---|
| Mengetik di laptop | 2 | | |
| Menunjuk-nunjuk layar sambil menjelaskan | 2 | | |
| Minum dari gelas/botol | 1 | | |
| Menggaruk kepala, membetulkan rambut/kacamata | 1 | | |
| Melambai ke orang lain, menopang dagu | 2 | | |
| Bicara sambil bergestur bebas | 2 | | |
| **Total** | **≥10** | **target 0** | |

### 1.5 Kamera dan jaringan

| Uji | Langkah | Yang diharapkan | Hasil |
|---|---|---|---|
| Izin ditolak | Aktifkan AirShift → pilih *Block* | Pesan "Izin kamera ditolak…", tombol Coba lagi, tidak ada prompt ulang otomatis, kontrol manual tetap jalan | |
| Tidak ada kamera | Laptop/PC tanpa kamera, atau kamera dimatikan lewat pengaturan OS | Pesan jelas, manual utuh | |
| Kamera dicabut | Pakai webcam USB, aktifkan AirShift, run berjalan, lalu cabut kabelnya | AirShift mati sendiri dengan pesan, run **tidak** berubah status, tidak ada prompt ulang | |
| Tab disembunyikan | Ganti tab selama AirShift aktif | Lampu kamera mati, run "Dijeda · tab tidak aktif", perlu opt-in ulang | |
| Jaringan | DevTools → Network → centang *Preserve log* → aktifkan AirShift → gunakan 2 menit | Semua request ke origin sendiri; tidak ada POST/upload; tidak ada request baru selama inferensi | |
| Lampu kamera | Klik "Matikan AirShift" | Lampu indikator kamera mati ≤1 detik | |

### 1.6 Keputusan (isi paling lambat 13 Nov 20.00 WIB)

| Baris gate | Lulus? | Bukti |
|---|---|---|
| Pose sah ≥90% di semua sel §1.3 | | |
| Aksi palsu 0 dalam ≥10 menit (§1.4) | | |
| Kamera ditolak / tidak ada / dicabut (§1.5) | | |
| Jaringan tanpa upload (§1.5) | | |
| Kapasitas: sisa kapasitas − wajib − opsional ≥24 jam (ROADMAP §7.1) | | |
| **Keputusan** | **Go / No-go** | Diputuskan oleh: ____ · tanggal: ____ |

---

## 2. Browser asli

Engine Playwright sudah lulus otomatis di Chromium, Firefox dan WebKit. Bagian ini memastikan browser yang benar-benar dipakai orang. Catat versi dari menu *About*. **Firefox dengan GPU:** pastikan `about:support` → *Graphics* → *WebGL 2 Driver Renderer* bukan renderer software (bukan "llvmpipe"/"SwiftShader"/"Basic Render").

| # | Langkah | Safari macOS | Edge | Firefox (GPU) |
|---|---|---|---|---|
| | Versi / OS | | | |
| 1 | Buka halaman: bantuan muncul, Lewati, preset siap tanpa error di Console | | | |
| 2 | Scene 3D tampil; seret/zoom kamera; Tampilan ringkas ↔ 3D | | | |
| 3 | Jalankan → Jeda → Lanjutkan (tombol dan Spasi) | | | |
| 4 | Tambah 5 pelanggan saat berjalan dan saat dijeda | | | |
| 5 | Ubah kecepatan 1×/5×/20×; angka hasil final tidak berubah dibanding 20× | | | |
| 6 | Selesaikan cepat → hasil final; Ulangi run yang sama memberi angka sama | | | |
| 7 | Isian salah (mis. kedatangan 25) → pesan, fokus ke kolom pertama yang salah | | | |
| 8 | Bandingkan: baseline A, B = 3 loket, 20 pasangan, hasil + interval | | | |
| 9 | Simpan → muat ulang halaman → Muat → Hapus | | | |
| 10 | Dua tab: hapus di tab 1 setelah slot diubah di tab 2 → pesan konflik | | | |
| 11 | Ganti tab saat run berjalan → kembali: dijeda, tidak lanjut sendiri | | | |
| 12 | Zoom browser 200%: tidak ada scroll horizontal, semua aksi inti terjangkau | | | |
| 13 | AirShift aktif → pose ✋ menjeda (cek singkat, bukan gate) | | | |
| 14 | Lebar jendela ±400 px: tata letak 1 kolom, semua kontrol terjangkau | | | |

---

## 3. Pembaca layar

Kombinasi minimum: **VoiceOver + Safari** (macOS) dan **NVDA + Firefox** (Windows). Tambahkan **NVDA + Chrome** bila sempat. Gunakan keyboard saja; jangan sentuh mouse.

Pintasan dasar:
- **VoiceOver:** nyala/mati `Cmd+F5`; baca berikutnya `VO+→` (`VO` = `Ctrl+Option`); rotor `VO+U`; aktifkan `VO+Spasi`.
- **NVDA:** mode baca `H` (heading berikutnya), `B` (tombol), `F` (kolom isian), `D` (landmark); `Insert+Spasi` untuk berpindah mode fokus/baca; `Tab` di mode fokus.

| # | Tugas | Yang diharapkan terdengar | VO+Safari | NVDA+Firefox | NVDA+Chrome |
|---|---|---|---|---|---|
| 1 | Buka halaman | Judul dialog bantuan dan tombol "Lewati"; fokus ada di dalam dialog | | | |
| 2 | Telusuri landmark/heading | Header, Status simulasi, Skenario, Panggung simulasi, Hasil; heading berurutan | | | |
| 3 | Ubah "Loket aktif" dan "Kedatangan otomatis" | Nama kolom, nilai, satuan dan rentang terbaca | | | |
| 4 | Jalankan | Status "Berjalan" diumumkan sekali, **tidak** membacakan setiap pelanggan | | | |
| 5 | Timer | Waktu terbaca sebagai "N menit M detik" bila difokuskan, tidak berbunyi setiap detik | | | |
| 6 | Jeda dengan Spasi | "Dijeda" diumumkan; fokus tetap di tombol | | | |
| 7 | Tambah pelanggan | Konfirmasi jumlah yang ditambahkan terbaca | | | |
| 8 | Tampilan ringkas | Ringkasan teks loket/antrean terbaca (mis. "2 loket, 1 melayani, 3 menunggu") | | | |
| 9 | Selesaikan cepat → hasil | Hasil final terbaca dengan angka dan satuan; label "Final" | | | |
| 10 | Bandingkan (tab dengan ←/→) | Nama tab dan status terpilih; progres 20 pasangan; hasil + interval dan interpretasinya | | | |
| 11 | Simpan konfigurasi | Dialog bernama, fokus ke kolom Nama, pesan sukses diumumkan | | | |
| 12 | Tutup dialog dengan Esc | Fokus kembali ke tombol yang membuka dialog | | | |
| 13 | Isian salah lalu Jalankan | Pesan kesalahan diumumkan dan terhubung ke kolomnya | | | |

Catat juga bila ada hal yang terlalu cerewet (diumumkan berulang) atau elemen yang dibaca tanpa nama ("button", "group").

---

## 4. Reduced motion dan reduced transparency

Tes otomatis [`tests/e2e/preferences.spec.ts`](../../tests/e2e/preferences.spec.ts) sudah membuktikan CSS-nya bereaksi. Di sini manusia menilai **tampilannya** di perangkat sungguhan.

Cara menyalakan:

| OS | Reduced motion | Reduced transparency |
|---|---|---|
| macOS | Pengaturan Sistem → Aksesibilitas → Tampilan → Kurangi gerakan | … → Kurangi transparansi |
| Windows 11 | Pengaturan → Aksesibilitas → Efek visual → Efek animasi: Mati | … → Efek transparansi: Mati |
| Android | Pengaturan → Aksesibilitas → Hapus animasi | — |
| iOS | Pengaturan → Aksesibilitas → Gerakan → Kurangi Gerakan | … → Tampilan & Ukuran Teks → Kurangi Transparansi |

Dukungan browser: `prefers-reduced-transparency` saat ini hanya dibaca oleh Chrome dan Edge. Di Safari dan Firefox panel kaca **tetap** tampil, dan itu sesuai harapan. Catat apa yang terlihat.

| # | Periksa (reduced motion) | Hasil |
|---|---|---|
| 1 | Dialog/drawer muncul tanpa animasi geser atau fade | |
| 2 | Avatar 3D berpindah posisi tanpa animasi jalan, tanpa mengangguk atau memantul | |
| 3 | Timer, angka hasil dan progress A/B tetap diperbarui | |
| 4 | Tidak ada elemen yang terus bergerak saat run dijeda | |

| # | Periksa (reduced transparency, Chrome/Edge) | Hasil |
|---|---|---|
| 5 | Panel padat (tanpa efek kaca), latar polos tanpa bidang warna | |
| 6 | Teks tetap mudah dibaca; batas panel masih terlihat | |
| 7 | Banner "Run selesai" di atas scene padat, tidak buram | |

---

## 5. Perangkat acuan: performa

Target dari PRD:
- **NFR-02:** ≥95% klik pause/lanjutkan mendapat feedback ≤100 ms.
- **NFR-03:** median ≥30 FPS selama 60 detik pada 1366×768, kamera mati.
- **NFR-04:** Selesaikan cepat ≤2 s dan A/B 20 pasangan ≤10 s.
- **NFR-05:** dari cold load sampai kontrol bisa dipakai ≤5 s pada 10 Mbps / RTT 100 ms.

**Perangkat acuan** (catat spesifikasinya): laptop kelas menengah (±4 core, 8 GB RAM, GPU terintegrasi, layar atau jendela 1366×768) dan HP Android kelas menengah (±4–6 GB RAM, Chrome terbaru).

### 5.1 Skrip pengukur

[`tests/manual/ukur-perangkat.js`](../../tests/manual/ukur-perangkat.js) menekan tombol aplikasi secara otomatis, lalu mencetak tabel hasil di Console. Skrip menyetel kecepatan tampilan 5× supaya run 15 menit cukup lama untuk diukur; kecepatan tidak mengubah hasil model.

1. Buka build produksi. Laptop: jendela 1366×768. HP: lewat port forwarding (§0).
2. Klik **Lewati** pada bantuan. Biarkan tampilan 3D dan preset default. Jangan aktifkan AirShift.
3. Buka DevTools → Console. Untuk HP, pakai `chrome://inspect` → *inspect* pada tab HP.
4. Tempel seluruh isi skrip, tekan Enter, dan jangan sentuh halaman ±2–3 menit.
5. Salin JSON yang dicetak ke lembar di bawah. Ulangi 3×, dengan memuat ulang halaman setiap kali.

Contoh keluaran di MacBook Apple Silicon dengan Chromium headless (30 Okt, bukan perangkat acuan): pause/lanjut p95 17 ms (50/50 ≤100 ms), FPS median 56, Selesaikan cepat 29 ms, A/B 45 ms.

| Perangkat / browser | Ulang | Klik ≤100 ms | p95 pause | FPS median (terendah) | Selesaikan cepat | A/B 20 | Lulus? |
|---|---|---|---|---|---|---|---|
| | 1 | | | | | | |
| | 2 | | | | | | |
| | 3 | | | | | | |

### 5.2 Startup (NFR-05)

DevTools → Network → *Disable cache* → profil throttling custom (download 10 Mbps, upload 5 Mbps, latency 100 ms) → muat ulang keras. Ukur waktu sampai tombol **Lewati** bisa diklik, lewat panel Performance atau rekaman layar. Lakukan 3 kali dan tulis mediannya. Target ≤5 s.

### 5.3 Siklus berulang (NFR-14)

Jalankan → Selesaikan cepat → Reset run, 20 kali. Di DevTools → Memory/Performance monitor, jumlah worker dan *JS heap* tidak boleh terus naik. Kamera tidak menyala.

---

## 6. Penyimpanan di kondisi khusus

Tes otomatis di `workspace.spec.ts` sudah mensimulasikan write yang ditolak (QuotaExceededError) dan browser tanpa Web Locks. Bagian ini memastikan browser aslinya berperilaku sama.

| # | Kondisi | Langkah | Yang diharapkan | Hasil |
|---|---|---|---|---|
| 1 | **Safari jendela privat** | Simpan konfigurasi → muat ulang → Muat | Bila Safari mengizinkan: tersimpan selama jendela privat terbuka. Bila menolak: "Konfigurasi belum tersimpan; browser menolak penyimpanan.", dialog tetap terbuka, isian tidak hilang. Tidak ada error di Console. | |
| 2 | Safari privat, tutup lalu buka jendela privat baru | Buka Tersimpan | Slot dari sesi privat sebelumnya tidak ada (wajar); aplikasi tidak error | |
| 3 | **Firefox tanpa Web Locks** | `about:config` → cari `weblocks` → set `false` → muat ulang | Drawer Tersimpan: "Browser ini tidak mendukung Web Locks, jadi menyimpan dan menghapus dinonaktifkan."; tombol Simpan/Hapus nonaktif; slot lama tetap bisa dimuat; run berjalan | |
| 4 | Firefox: kembalikan pref ke `true` | Simpan → muat ulang | Normal kembali | |
| 5 | Situs diblokir menyimpan data (Chrome: Pengaturan situs → Cookie dan data situs → Blokir) | Buka Tersimpan, lalu Jalankan | "Simulasi tetap berjalan tanpa simpan lokal"; run normal | |

---

## 7. Uji tugas peserta (G-01/G-02)

Tujuan: menemukan hambatan pada tugas inti. Ini uji **formatif**, bukan klaim validasi pengguna. Bila peserta kurang dari 5, catat jumlah sebenarnya dan jangan mengubah denominator target.

### 7.1 Peserta dan etika

- 5 orang yang belum pernah melihat TomorrowLab, misalnya mahasiswa atau pengelola kantin. Hindari anggota tim.
- Sebelum mulai, bacakan: "Yang diuji aplikasinya, bukan Anda. Sesi ±20 menit. Saya akan mencatat waktu dan komentar. Layar boleh direkam bila Anda setuju; rekaman dihapus setelah dianalisis. Anda boleh berhenti kapan saja." Catat persetujuannya.
- Jangan kumpulkan data pribadi selain kode peserta (P1–P5). AirShift **mati** selama sesi ini.

### 7.2 Aturan fasilitator

- Siapkan build yang sama untuk semua peserta di laptop yang sama, dibuka dari halaman baru (bantuan muncul).
- Minta peserta berpikir keras (*think aloud*). Jangan menunjuk layar atau menjelaskan istilah. Bila peserta bertanya, jawab "Menurut Anda bagaimana?".
- Bila peserta macet >60 detik, tanyakan "Apa yang Anda cari?". Bila tetap macet, beri satu petunjuk dan **catat sebagai dibantu**. Tugas dengan bantuan dihitung gagal untuk target G.
- Stopwatch mulai saat tugas selesai dibacakan dan berhenti saat peserta menyatakan jawabannya.

### 7.3 Tugas

**T1 (G-01, batas 3 menit):** "Kantin ini punya pengaturan awal. Jalankan simulasinya dan sebutkan berapa rata-rata waktu tunggu pelanggan."
Berhasil bila peserta menyebut nilai *Rata-rata tunggu* dari panel Hasil (live atau final) tanpa bantuan dalam ≤3 menit.

**T2 (G-02, batas 5 menit setelah T1):** "Kantin sedang mempertimbangkan menambah satu loket. Gunakan aplikasi ini untuk membandingkan kondisi sekarang dengan tiga loket, lalu jelaskan apa bedanya."
Berhasil bila dalam ≤5 menit peserta menjalankan A/B 20 pasangan **dan** penjelasannya mencakup ketiga hal berikut:
- (a) yang diubah hanya jumlah loket;
- (b) permintaan/pelanggan sama di A dan B;
- (c) arah perubahan beserta tingkat keyakinannya (label interval, misalnya "lebih rendah" atau "belum meyakinkan").

**T3 (opsional, kesan):** "Simpan pengaturan ini supaya bisa dipakai lagi besok." Catat waktu dan hambatannya.

### 7.4 Lembar peserta

| Peserta | T1 waktu | T1 berhasil tanpa bantuan? | T2 waktu | (a) | (b) | (c) | T2 berhasil? | Hambatan utama (kutipan / pengamatan) |
|---|---|---|---|---|---|---|---|---|
| P1 | | | | | | | | |
| P2 | | | | | | | | |
| P3 | | | | | | | | |
| P4 | | | | | | | | |
| P5 | | | | | | | | |
| **Total** | | **/5 (target ≥4)** | | | | | **/5 (target ≥4)** | |

### 7.5 Pertanyaan penutup (±3 menit)

1. Bagian mana yang paling membingungkan?
2. Menurut Anda, apa arti rentang angka (interval) di hasil perbandingan?
3. Apakah Anda percaya angka hasilnya? Kenapa?
4. Satu hal yang ingin diubah?

Setelah sesi, kelompokkan hambatan berdasarkan dampak: **blocker** (tugas gagal), **major** (dibantu atau >2× batas waktu), **minor**. Setiap blocker dan major masuk issue dan diperbaiki sebelum freeze 18 Nov (ROADMAP G5).

---

## 8. Setelah uji

- Tulis hasil per bagian di `docs/verification/<topik>-<tanggal>.md`, misalnya `airshift-gate-2026-11-12.md` atau `browsers-2026-11-14.md`.
- Perbarui tabel "Checklist terbuka" di [hardening-2026-10-28.md](hardening-2026-10-28.md) dengan tautan ke hasilnya.
- Rekaman dan foto yang memuat wajah peserta tidak masuk repo.
