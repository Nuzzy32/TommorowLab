# TomorrowLab — Design System

**Versi 1.1 · 27 Oktober 2026 · Bahasa Indonesia**

> **Perubahan 1.1 (27 Oktober 2026):** arah visual diganti mengikuti mockup workspace yang dipilih pemilik produk: panel kaca (glass) di atas latar bidang warna lembut, font Plus Jakarta Sans + JetBrains Mono yang di-host sendiri, ikon Phosphor, dan ruang 3D kantin yang representatif (dapur, area makan, pintu masuk). Bagian 2.1, 3.2–3.6, 4.2, CMP-06, CMP-08, §11 dan §14 diperbarui; kontrak state, aksesibilitas dan kejujuran angka tidak berubah.

| Atribut | Nilai |
|---|---|
| Status | Diimplementasikan untuk workspace (WP-06/07); belum lulus audit aksesibilitas menyeluruh |
| Basis produk | TomorrowLab PRD v1.0, MVP LaunchPad Hacks 2026 |
| Pendamping | [USER_FLOW.md](USER_FLOW.md) |
| Acuan kebutuhan | [PRD v1.0](/Users/adrian/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an/outputs/PRD.md) |
| Fokus | Workspace simulasi antrean kantin desktop-first; kontrol manual lengkap; AirShift opsional |
| Arah visual | **Laboratorium kaca:** lembut, presisi, lapang, dan mudah dibaca |
| Tema MVP | Light mode tunggal; tidak membangun dark mode pada tahap ini |

## 1. Tujuan, batas, dan otoritas

Dokumen ini memberi nilai token, aturan layout, spesifikasi komponen, state, konten, aksesibilitas dan perilaku visual agar implementasi konsisten. PRD menentukan fungsi dan kebenaran model; USER_FLOW menentukan perjalanan serta keputusan pengguna; design system menentukan bagaimana keduanya disajikan.

Jika terjadi konflik: kontrak simulasi, privasi dan scope PRD didahulukan; konflik dicatat dan diperbaiki dalam dokumen turunan. Angka metrik, progress dan jumlah pelanggan selalu berasal dari engine. Nilai contoh dalam dokumen ini hanya fixture atau ilustrasi format, bukan hasil produk yang sudah berjalan.

Dokumen tidak menetapkan framework, membuat arsitektur, mengganti model antrean, atau memperluas MVP menjadi platform multi-domain. Tidak memerlukan gambar raster kustom untuk kontrol, scene, atau empty state: wordmark berupa teks, scene memakai geometri sederhana, dan ikon memakai SVG standar. Bila kelak dibutuhkan artwork ilustratif khusus, buat aset sungguhan dengan alur image generation, simpan, integrasikan dan periksa pada ukuran pakai; jangan menggantinya dengan placeholder.

### Prinsip sistem

| ID | Prinsip | Implikasi desain |
|---|---|---|
| DSP-01 | Eksperimen mudah dibaca | Parameter aktif, status run, waktu simulasi dan label sementara/final terlihat bersamaan. |
| DSP-02 | Manual selalu lengkap | Setiap aksi inti memiliki tombol/input dengan nama jelas dan dapat dioperasikan keyboard. |
| DSP-03 | Warna membantu makna | State juga memakai teks, ikon, bentuk atau pola. Warna seri A/B tidak berubah menjadi verdict baik/buruk. |
| DSP-04 | State dan asal data jujur | Hasil lama, parsial, kosong, invalid dan final memiliki penyajian berbeda; tidak menyamarkan N/A sebagai nol. |
| DSP-05 | Gerak menjelaskan kejadian | Animasi membantu mengikuti pelanggan tanpa mengubah waktu model atau menunda angka canonical. |
| DSP-06 | Kepadatan terukur | Satu pusat perhatian per task; kontrol sering dipakai dekat scene; asumsi dan metadata melalui disclosure. |

## 2. Identitas visual dan bahasa

### 2.1 Karakter visual

TomorrowLab terasa seperti meja kerja eksperimen yang tenang: panel kaca putih semi-transparan (blur + saturasi) di atas latar hijau pucat dengan tiga bidang warna radial lembut (mint, biru, krem), sudut membulat besar, angka tabular monospace, serta aksen evergreen. Gradasi hanya dipakai untuk bidang latar, isi progress bar dan kartu hero hasil final. Tidak memakai neon, background video atau dekorasi yang bergerak terus. Teks selalu berada di permukaan dengan opasitas putih ≥56% (panel) atau ≥62% (kartu), sehingga kontras tidak bergantung pada warna latar di belakang kaca.

Nama ditulis **TomorrowLab**, dengan kapital T dan L. Tagline bila ruang cukup: **“Coba skenario. Pahami dampaknya.”** Wordmark berupa teks; tidak menjadikan logo baru sebagai dependensi rilis. Minimum ukuran wordmark 20 px; sisakan ruang kosong 12 px di semua sisi. Pada layar kecil, tagline disembunyikan dan nama tetap terbaca.

### 2.2 Bahasa dan tata nama

Bahasa utama Indonesia dengan kata kerja spesifik. Label harus menjelaskan objek dan akibat: “Tambah loket”, “Tambah pelanggan”, “Reset run”, “Ulangi run yang sama”, “Selesaikan cepat”, “Simpan konfigurasi”. Istilah teknis seperti seed, replikasi dan interval 95% diberi penjelasan ringkas.

| Konsep | Label UI | Penjelasan bantuan |
|---|---|---|
| Horizon | Durasi menerima pelanggan | Setelah durasi ini, sisa pelanggan tetap diselesaikan. |
| Service range | Waktu pelayanan | Nilai minimum dan maksimum per pelanggan, dalam detik. |
| Seed | Seed percobaan | Nilai untuk mengulang sumber acak bersama konfigurasi dan catatan input yang sama. |
| Drain | Menyelesaikan sisa pelanggan | Kedatangan sudah ditutup; pelayanan masih berlangsung. |
| Local persistence | Tersimpan di browser ini | Tidak tersinkron antarperangkat dan dapat hilang saat data browser dibersihkan. |
| Partial mean | Rata-rata tunggu sementara | Hanya pelanggan yang sudah mulai dilayani. |
| Final mean | Rata-rata tunggu final | Seluruh pelanggan yang datang sebelum batas kedatangan, setelah semua selesai. |

Kalimat error menjelaskan sebab dan langkah berikutnya. Hindari “Oops”, “invalid” tanpa rincian, “optimal”, “akurat untuk kantin nyata”, “lebih baik pasti”, atau klaim kamera tidak pernah menimbulkan request jaringan apa pun. Model/asset boleh diunduh; frame kamera tidak boleh dikirim.

## 3. Design tokens

### 3.1 Struktur dan penamaan

Gunakan `--tl-{kategori}-{peran}` sebagai nama token CSS. Komponen memakai token semantik, bukan menyalin hex. Nilai dimensi berikut ditulis dalam px sebagai acuan; implementasi menggunakan rem untuk ukuran teks dan ruang yang harus mengikuti preferensi pengguna. Pada root 16 px, 16 px=1 rem. Jangan mengunci root font-size untuk mengalahkan pengaturan browser.

### 3.2 Warna semantik

| Token | Nilai | Pemakaian |
|---|---|---|
| `--tl-color-canvas` | `#EAF0EC` | Latar halaman di bawah bidang warna |
| `--tl-color-glass` | `rgb(255 255 255 / 56%)` + `blur(24px) saturate(180%)` | Panel utama (header, status, skenario, panggung, hasil, catatan) |
| `--tl-color-card` | `rgb(255 255 255 / 62%)` + border `#FFFFFF` | Kartu metrik, baris jadwal, kartu loket |
| `--tl-color-field` | `rgb(255 255 255 / 88%)` | Isi input |
| `--tl-color-text` | `#17221E` | Teks utama dan angka |
| `--tl-color-text-body` | `#2C3A34` | Paragraf dan isi kartu |
| `--tl-color-text-muted` | `#45544E` | Label metrik dan legend |
| `--tl-color-text-subtle` | `#52615B` | Hint, catatan metrik, metadata |
| `--tl-color-text-inverse` | `#FFFFFF` | Teks di atas primary/danger solid |
| `--tl-color-border-subtle` | `rgb(23 34 30 / 10%)` | Divider dekoratif; bukan satu-satunya batas input |
| `--tl-color-border-button` | `rgb(23 34 30 / 16%)` | Tombol sekunder (label teks memberi bentuk) |
| `--tl-color-border-control` | `rgb(23 34 30 / 50%)` | Batas input; ≥3:1 terhadap isi field |
| `--tl-color-primary` | `#1F6F57` | CTA utama, selected control |
| `--tl-color-primary-hover` | `#1A5F4A` | Hover primary |
| `--tl-color-primary-pressed` | `#164F3E` | Pressed primary |
| `--tl-color-focus` | `#2459A8` | Ring fokus keyboard |
| `--tl-color-success-text` / `-bg` | `#1A5C44` / `#D9F0E4` | Final, Melayani |
| `--tl-color-warning-text` / `-bg` | `#6B4800` / `#FBEFCF` | Dijeda, overload, pending |
| `--tl-color-danger-text` / `-bg` | `#9D3434` / `#FBEDEC` | Error dan destructive action |
| `--tl-color-info-text` / `-bg` | `#1F4E7E` / `#DDEBFA` | Berjalan, Sementara |
| `--tl-color-disabled-bg` | `rgb(23 34 30 / 7%)` | Kontrol nonaktif |
| `--tl-color-disabled-text` | `#52615B` | Label nonaktif tetap dapat dibaca |
| `--tl-color-overlay` | `rgb(23 34 30 / 22%)` + `blur(6px)` | Backdrop modal |

Link memakai primary, underline selalu terlihat dalam body copy. Border-subtle hanya menyusun area; input dan tombol secondary memakai border-control bila bentuk kontrol dibutuhkan untuk memahami operasinya. Disabled tidak ditentukan oleh opacity seluruh komponen.

### 3.3 Pasangan kontras yang diperiksa

Rasio berikut dihitung terhadap latar efektif terburuk: kaca 56% di atas bidang biru `#BED6EC` (≈`#E2EDF7`) dan kartu 62% di atasnya (≈`#F4F8FC`). Angka dibulatkan dua desimal; pengujian implementasi tetap diperlukan untuk opacity, overlay, anti-aliasing, state dan background sebenarnya. Rujukan kontras mengacu WCAG [S1].

| Foreground / background | Rasio | Penggunaan |
|---|---:|---|
| text / kaca | 13,78:1 | Body dan angka |
| text-muted / kaca | 6,72:1 | Label sekunder |
| text-subtle / kaca | 5,49:1 | Hint dan metadata |
| primary / kaca | 5,10:1 | Link dan ikon aksen |
| white / primary | 6,05:1 | Tombol Jalankan |
| white / primary-hover | 7,55:1 | Hover tombol |
| focus / kaca | 5,76:1 | Ring fokus |
| border-control / field | 3,22:1 | Batas input |
| disabled-text / disabled-bg | 5,34:1 | Kontrol nonaktif |
| danger-text / danger-bg | 6,20:1 | Error |
| warning-text / warning-bg | 7,19:1 | Warning |
| success-text / success-bg | 6,60:1 | Konfirmasi |
| info-text / info-bg | 7,08:1 | Informasi |

### 3.4 Warna data A/B dan scene

| Token | Nilai | Aturan |
|---|---|---|
| `--tl-data-a` | `#245D49` | Baseline A; garis solid, marker bulat, label A |
| `--tl-data-b` | `#3E5C97` | Kandidat B; garis putus-putus, marker persegi, label B |
| `--tl-scene-waiting` | `#EDC35A` (tepi `#C8961E`) | Avatar menunggu, marker cincin + angka agregat |
| `--tl-scene-serving` | `#2E8B6C` | Avatar dilayani, loket aktif + status teks loket |
| `--tl-scene-manual` | `#4C5FD5` | Penanda kecil di atas kepala pelanggan tambahan manual |
| `--tl-scene-idle` | `#DDE6E1` | Loket kosong |

Warna scene adalah material visual; pencahayaan dapat mengubah warna terender. Status loket memakai label DOM (L1 · Melayani/Kosong) yang mengikuti posisi loket. Nama zona besar (Dapur, Antrean, Area makan, Pintu masuk, Gudang, Wastafel, Keluar) boleh tertulis di lantai sebagai orientasi; informasi yang dibutuhkan tetap tersedia sebagai teks DOM. Pemilihan A/B tidak menyatakan pemenang. Verdict penurunan/kenaikan wait adalah status terpisah dengan teks dan CI.

### 3.5 Tipografi

Font di-host sendiri dari paket `@fontsource` (subset latin, woff2) sehingga tidak ada request ke layanan font eksternal; fallback ke font sistem bila belum termuat.

| Token | Family / ukuran / weight / line-height | Peran |
|---|---|---|
| `--tl-font-ui` | `"Plus Jakarta Sans", system-ui, sans-serif` (400–800) | Kontrol, body, heading, wordmark |
| `--tl-font-mono` | `"JetBrains Mono", ui-monospace, monospace` (500–600) | Timer, angka metrik, input angka, seed, waktu jadwal |
| Wordmark | UI 21 / 800, “Tomorrow” + “Lab” evergreen | Header |
| Judul panel | UI 17 / 700 / 1,2 | Skenario, Hasil |
| Label field/metrik | UI 12–13 / 600 | Field, metrik, legend |
| Hint/catatan | UI 11–12 / 500 / 1,4 | Catatan metrik, hint field |
| Timer | Mono 28 / 600 | Waktu simulasi |
| Metrik | Mono 22 / 600 (hero final 44) | Nilai metrik; unit UI 12 terpisah |

Teks hint minimum 12 px dan catatan metrik 11 px dengan kontras ≥5,4:1; body bantuan 15 px. Gunakan `font-variant-numeric: tabular-nums` untuk semua angka metrik dan tabel, serta `lining-nums` bila tersedia. Jangan memakai ALL CAPS untuk kalimat; label mikro seperti “A” tetap singkat. Heading dapat mengecil ke 28 px pada mobile, sedangkan ukuran kontrol dipertahankan.

### 3.6 Spacing, dimensi dan bentuk

| Token / kelompok | Nilai | Aturan |
|---|---|---|
| `--tl-space-1/2/3/4` | 4 / 8 / 12 / 16 px | Ikon-label, unit, antarfield |
| `--tl-space-5/6/8/10/12` | 20 / 24 / 32 / 40 / 48 px | Panel dan kelompok |
| `--tl-radius-control` | 10–13 px | Input 10, tombol 13 |
| `--tl-radius-card` | 14 px | Kartu metrik dan baris |
| `--tl-radius-inner` | 20 px | Kotak scene |
| `--tl-radius-panel` | 24 px | Panel kaca |
| `--tl-radius-dialog` | 26–30 px | Dialog; drawer menempel tepi kanan |
| `--tl-radius-tag` | 6 px; badge status pil 999 px | Status/seri tag |
| `--tl-border-width` | 1 px | Permukaan dan kontrol |
| `--tl-control-height` | min 44 px | Tombol/input default; tinggi boleh bertambah saat teks wrap |
| `--tl-control-compact-height` | min 36 px | Utility desktop; hit target minimal 36×36 px |
| `--tl-focus-width/gap` | 2 / 2 px | Outline keyboard; gap surface solid |
| `--tl-shadow-panel` | `inset 0 1px 0 rgb(255 255 255 / 95%), 0 20px 50px -24px rgb(22 58 48 / 28%)` | Panel kaca |
| `--tl-shadow-overlay` | `inset 0 1px 0 #fff, 0 40px 90px -30px rgb(22 58 48 / 50%)` | Dialog/drawer |

Touch target standar 44×44 px. Minimum 24×24 CSS px atau spacing yang memenuhi kriteria WCAG hanya untuk konteks padat yang sudah diuji; tidak menjadi ukuran default tombol. Tombol ikon memakai area klik 44 px meski glyph 20 px.

### 3.7 Motion dan layering

| Token | Nilai | Penggunaan |
|---|---|---|
| `--tl-motion-fast` | 120 ms | Hover/pressed |
| `--tl-motion-normal` | 180 ms | Expand/collapse panel |
| `--tl-motion-overlay` | 220 ms | Drawer/dialog masuk |
| `--tl-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Transisi UI |
| `--tl-z-base/sticky/popover/modal/toast` | 0 / 10 / 20 / 40 / 50 | Urutan lapisan deterministik |

Tidak ada animasi entry bertahap yang menunda akses toolbar. Hover tidak menggeser layout. Ketika `prefers-reduced-motion: reduce`, durasi gerak/interpolasi dekoratif menjadi 0 ms; status dan progress angka tetap diperbarui. Nilai FPS, pose dwell kamera, dan waktu simulasi tidak memakai token motion UI.

## 4. Layout dan adaptasi viewport

### 4.1 Region tetap

| Region | Isi wajib | Terkait screen |
|---|---|---|
| Header | Wordmark, tab Simulasi/Bandingkan, Tersimpan, Asumsi, Bantuan; AirShift bila dirilis | SCR-01/02 |
| Status strip | State run, phase, SimTime, playback, sumber kontrol manual/AirShift | SCR-01 |
| Panel konfigurasi | Loket, arrival, pelayanan, horizon, seed dan jadwal manual | SCR-01 |
| Stage | Scene 3D atau representasi ringkas, kamera scene dan legend | SCR-01 |
| Toolbar run | Jalankan/Pause/Lanjutkan, Selesaikan cepat, Reset run | SCR-01 |
| Hasil | Live metrics/final; asumsi dan snapshot metadata | SCR-01/02 |

Tab “Bandingkan” memakai workspace yang sama. “Tersimpan” adalah drawer, bukan dashboard akun. Pengguna selalu tahu apakah ia melihat konfigurasi draft, snapshot run, atau snapshot hasil lama.

### 4.2 Ukuran dan grid

| Rentang viewport | Layout | Detail |
|---|---|---|
| ≥1240 px | 3 kolom, max 1600 px terpusat | Area `status` penuh; `config` 290 · `stage` fleksibel · `results` 320; `log` di bawah stage; gap 16 |
| 760–1239 px | 2 kolom | `status` dan `stage` penuh; `config` dan `results` berdampingan; `log` di bawah config |
| <760 px | 1 kolom | Urutan status → skenario (dilipat dengan ringkasan “2 loket · 4/mnt”) → panggung → hasil → catatan; tombol header ikon saja dengan nama aksesibel |

Scene memakai rasio 16:9 dengan tinggi minimum 300 px (240 px di ponsel). Tombol “Tampilan ringkas” selalu tersedia; perangkat tanpa WebGL langsung memakai tampilan ringkas. Scroll vertikal diperbolehkan.

Hindari mengunci `height:100vh` yang memotong isi. Layout utama memakai document scroll; hanya daftar panjang drawer yang boleh mempunyai area scroll terbatas dengan header/footer jelas. Konten pada 200% zoom mengikuti lebar viewport CSS hasil zoom, bukan memaksa layout desktop. Aksi inti tidak tertutup footer sticky atau keyboard virtual.

### 4.3 Urutan baca dan fokus

Urutan DOM stabil: header → status → konfigurasi → toolbar run → stage/kontrol tampilan → metrik → log manual. Grid visual tidak mengubah urutan ini secara membingungkan. Ada skip link “Ke kontrol simulasi” dan “Ke hasil”. Informasi utama ringkas di status strip agar pengguna tidak perlu melewati seluruh scene.

Drawer informasi di desktop dapat menjadi nonmodal complementary panel. Jika tampil sebagai overlay pada viewport sempit, ia menjadi dialog modal dengan fokus terkelola. Penentuan semantik mengikuti perilaku aktual; tidak memberi `aria-modal=true` pada panel yang membiarkan background interaktif.

## 5. Inventaris screen dan pola

| ID | Tampilan / region | Isi utama | Aksi keluar dan focus return |
|---|---|---|---|
| SCR-01 | Workspace / Simulasi | Parameter, stage, live/final metrics, input log | Tab Bandingkan mengikuti guard run; drawers kembali ke trigger |
| SCR-02 | Bandingkan | A/B snapshot, locked demand, 20 pasangan, hasil/CI | Kembali ke Simulasi tidak menghapus hasil lengkap |
| SCR-03 | Tersimpan | 0–10 item, muat/hapus, penjelasan lokal | Tutup ke tombol Tersimpan |
| SCR-04 | Simpan konfigurasi | Nama, opsi sertakan input live, slot target bila perlu | Batal ke trigger; sukses ke nama item/trigger dengan announcement |
| SCR-05 | Asumsi model | Distribusi, FIFO, horizon/drain, keterbatasan sintetis | Tutup ke Asumsi |
| SCR-06 | Konfirmasi | Akibat reset, load/overwrite, delete | Batal/escape ke trigger; konfirmasi ke aksi/state tujuan |
| SCR-07 | AirShift — opsional | Consent, status kamera, pose hint, tombol off | Tutup panel tidak otomatis kamera off bila masih aktif; tombol Matikan eksplisit selalu tersedia |
| SCR-08 | Bantuan ringkas | Mulai, tambah manual, A/B, shortcut, simpan lokal | Tutup ke Bantuan; tutorial awal tidak menghalangi run |

Menutup panel AirShift ketika kamera masih aktif harus menyisakan indikator “Kamera aktif” dan tombol Matikan pada header. Tidak boleh menyembunyikan indikator penggunaan kamera.

## 6. Kontrak state bersama

### 6.1 Status run dan aksi utama

| Canonical state | Label | Primary action | Secondary action / perlakuan |
|---|---|---|---|
| READY | Siap dijalankan | Jalankan | Simpan, tambah loket/pelanggan terjadwal, seed |
| RUNNING | Berjalan | Pause | Selesaikan cepat, Reset run; input fisik terkunci |
| PAUSED | Dijeda | Lanjutkan | Selesaikan cepat, Reset run; tambah pelanggan bila t<H |
| COMPLETED | Selesai | Ulangi run yang sama | Ubah skenario, Jadikan baseline A, simpan konfigurasi |
| ERROR | Perhitungan dihentikan | Reset run | Sebab dan rincian non-sensitif; hasil parsial invalid |
| LIMIT_REACHED | Batas percobaan tercapai | Reset run | Saran kurangi kedatangan/durasi; final tidak tersedia |
| CANCELLED | Run dibatalkan | Reset run | State parsial tetap nonfinal; tidak menawarkan resume |

`arrivalsOpen`/`draining` adalah phase tambahan, bukan state pengganti RUNNING/PAUSED. Label drain berbunyi “Menyelesaikan sisa pelanggan”. Pada draining, tambah pelanggan nonaktif dengan alasan “Durasi menerima pelanggan sudah berakhir”.

Selesaikan cepat adalah mode komputasi pada run, bukan state domain baru. Primary sementara adalah “Batalkan penyelesaian”; cancel eksplisit menghasilkan CANCELLED. Pause karena tab hidden menghasilkan PAUSED pada checkpoint, menonaktifkan mode cepat dan membutuhkan Lanjutkan atau Selesaikan cepat secara eksplisit ketika kembali.

### 6.2 Batch dan prioritas state

Status batch UI: belum disiapkan, siap, menghitung, ditangguhkan, selesai, dibatalkan, gagal. Ini milik comparison dan tidak mengganti canonical state run. Hanya satu pekerjaan engine aktif. Dari RUNNING menuju Bandingkan, tawarkan “Pause dan buka perbandingan”; membatalkan dialog mempertahankan run. Batch hidden ditangguhkan pada checkpoint dan harus dilanjutkan eksplisit; summary tetap nonfinal.

Lifecycle hidden selalu diproses, termasuk ketika dialog atau error sedang terlihat: pause hanya run RUNNING, tangguhkan batch aktif, hentikan kamera/inferensi, dan pertahankan terminal state yang sudah ada. Tidak ada modal yang menunda tindakan privasi ini. Setelah lifecycle ditangani, prioritas interaksi adalah terminal error/limit → konfirmasi aktif → pekerjaan cepat/batch atau suspension → interaksi normal. Gesture tidak dapat melewati guard atau memulihkan pause hidden/error. Modal informasi tidak otomatis mengubah state engine; UI menyatakan run masih berjalan bila memang berjalan.

## 7. Spesifikasi komponen

Kode `CMP-xx` adalah identitas komponen desain, bukan nama class atau kewajiban framework. Semua komponen interaktif memiliki default, hover, pressed, focus-visible, disabled dan error bila relevan. Native semantics diprioritaskan; jangan membungkus native control dengan ARIA yang bertentangan.

### CMP-01 — Button dan IconButton

| Variant | Tampilan | Penggunaan |
|---|---|---|
| Primary | primary background, white text, radius-control | Satu aksi utama per kelompok tugas |
| Secondary | surface, text, border-control | Tambah loket, simpan, selesaikan cepat |
| Quiet | Transparan, text, underline/outline saat hover/focus | Asumsi, Bantuan |
| Danger | surface + danger-text; konfirmasi akhir danger solid + white | Reset/hapus, tidak menjadi primary saat pertama masuk |

Tinggi minimum 44 px, padding horizontal 16, gap ikon-label 8; utility compact 36 px hanya pada desktop. Hover primary memakai primary-hover; secondary memakai surface-subtle. Pressed primary memakai primary-pressed. Tidak ada scale yang memindah target. Loading mempertahankan lebar dan label tindakan, menampilkan spinner dekoratif + teks “Menyimpan…”; cegah double submit dengan in-flight guard. Cancel pekerjaan panjang adalah tombol terpisah yang tetap aktif.

Disabled tetap menampilkan label dan alasan di dekatnya; tooltip bukan satu-satunya penjelasan. IconButton mempunyai accessible name spesifik seperti “Kurangi jumlah loket”, bukan “Minus”. Enter/Space mengikuti native button. Fokus tidak hilang ketika label Pause berubah menjadi Lanjutkan.

### CMP-02 — NumberField dan SliderField

Field memuat label, input, unit terpisah, batas/rentang dan error inline. Label selalu visible dan dihubungkan ke input. Tinggi 44; font input mobile 16 px. Error memakai danger-text, ikon warning dan `aria-invalid`; teks error dihubungkan melalui `aria-describedby`. Nilai invalid tidak otomatis dibulatkan, di-clamp atau dianggap tersimpan.

Slider memiliki pasangan NumberField yang sama nilainya; drag adalah salah satu cara, bukan syarat. Arrow mengikuti step, Home/End ke batas. Gunakan native range bila memenuhi kebutuhan. Saat pengguna sedang mengetik nilai sementara kosong, jangan menimpa ketikan atau mengirim ulang slider; commit pada blur/Enter setelah validasi. Jalankan memvalidasi seluruh form.

| Field | Nilai / batas dari PRD | Detail UI |
|---|---|---|
| Loket | Default 2; integer 1–6 | Stepper + NumberField; tanpa slider yang tidak diperlukan |
| Arrival otomatis | Default 4; 0–20 pelanggan/menit, step slider 0,1 | Label “Kedatangan otomatis”; nol sah |
| Pelayanan min/max | Default 20/40; integer 1–300 detik, max≥min | Dua field satu kelompok; error relational di bawah kelompok |
| Durasi kedatangan | Default 15 menit; 1–30 menit, step UI 1 menit | Konversi detik tepat; tampilkan “15 menit = 900 detik” di metadata snapshot |
| Seed | Default 2026; uint32 termasuk 0 | Input teks numerik/number dengan validasi integer; tampilan tanpa pemisah ribuan |
| Jumlah manual | Default 1; integer 1–20 | Selalu berdekatan tombol Tambah pelanggan |

NumberField menerima format desimal Indonesia yang ditetapkan aplikasi. Baseline parser menerima koma atau titik desimal tunggal, menampilkan koma setelah commit, dan menolak format campuran ambigu serta pemisah ribuan pada input. Batas tetap mengikuti model. Hindari mengandalkan locale browser tanpa tes.

### CMP-03 — ParameterPanel dan ManualSchedule

Urutan kelompok: kapasitas → kedatangan → pelayanan → durasi → seed → jadwal manual. Helper untuk ρ otomatis muncul bila ≥1 dan tidak memblokir run. Di state terkunci, nilai snapshot ditampilkan dengan lock icon dan teks “Ubah skenario untuk mengedit”. Disabled controls tetap terbaca; tombol Ubah skenario menuju guard reset.

Jadwal manual menampilkan waktu `mm:ss`, jumlah dan tombol Hapus entry. Waktu input berupa menit/detik yang tervalidasi `0≤t<H`; setiap entry berjumlah 1–20. Entry siap run diberi label “Terjadwal”. Tambahan saat pause diberi “Menunggu diproses saat lanjut”. Entry log runtime tidak dapat diedit untuk mengubah sejarah run.

Tabel/daftar panjang dipaginasi atau di-collapse dengan “Lihat catatan berikutnya”; jangan merender 2.000 row aktif yang membuat fokus lambat. Ringkasan count selalu penuh dan bukan count row yang terlihat.

### CMP-04 — SimulationToolbar

Urutan: primary state action → Selesaikan cepat → speed → Reset run. Pertahankan urutan ketika label berubah. Speed segmented select 1×/5×/20×, default 20×. Label “Kecepatan tampilan”; bantuan “Tidak mengubah hasil simulasi”. Pada viewport kecil kelompok wrap perbaris; jangan memotong label.

Tombol tambah pelanggan merupakan kelompok terpisah di dekat toolbar dan menampilkan “Pada waktu simulasi 02:15”. Capture timestamp dilakukan engine ketika menerima aksi, bukan dari angka UI yang dibulatkan. Selama fast/batch, aksi baru nonaktif. Reset menggunakan CMP-13 dan menjelaskan bahwa log live hilang sementara jadwal awal/parameter/seed tetap.

### CMP-05 — RunStatusStrip

Isi: status teks+ikon, phase, waktu simulasi, durasi menerima pelanggan dan indikator kamera. Timer `mm:ss`; untuk waktu >59:59 gunakan `hh:mm:ss`; accessible label menyebut satuan lengkap. Karena max drain bisa panjang, timer tidak berhenti di horizon. Label contohnya “Waktu simulasi 18:12 · Kedatangan ditutup pada 15:00”.

READY netral; RUNNING info; PAUSED warning; COMPLETED success; ERROR/LIMIT_REACHED danger; CANCELLED neutral dengan ikon stop. Animasi dot berkedip tidak diperlukan. Perubahan state diumumkan melalui satu live region polite; timer tidak diumumkan setiap detik.

### CMP-06 — SceneViewport dan CameraControls

Scene adalah denah kantin 3D representatif (three.js, dimuat lazy): dinding, dapur, 1–6 loket berlabel, satu jalur antrean bersama berpagar, pintu masuk, area makan, gudang dan wastafel. Avatar kapsul berjalan dari pintu ke antrean, ke loket, lalu ke kursi dan keluar. Bagian setelah loket (makan, keluar) dan seluruh jarak berjalan murni visual; AssumptionPanel menyatakannya secara eksplisit dan angka selalu berasal dari engine. Paling banyak 40 avatar antrean digambar; sisanya ditulis “X pelanggan diringkas”. Default seluruh loket masuk frame; seret untuk memutar, pinch/Ctrl+scroll untuk zoom (scroll biasa tetap menggulir halaman), klik ganda untuk reset.

CameraControls: pan kiri/kanan/atas/bawah, rotate kiri/kanan, zoom +/− dan Reset tampilan. Tombol keyboard-native; tidak mengambil alih arrow global. Scroll halaman tidak dipakai zoom kecuali pengguna sengaja memberi fokus/mode kontrol scene yang dijelaskan. Batas zoom/rotate mencegah scene hilang; Reset tampilan selalu memulihkan frame default tanpa mengubah simulasi.

Avatar maksimum 150. Di atasnya, render sebagian secara deterministik dan tampilkan “X pelanggan diringkas”; jumlah canonical tetap penuh. Warna avatar mewakili waiting/inService, ditambah marker/legend dan label loket. Selesai ditunjukkan di counter, bukan ribuan avatar yang harus tetap dirender. Visual boleh tertinggal sebentar dari state engine, tetapi panel angka canonical tidak menunggu avatar berjalan ke posisi.

Canvas tidak menjadi satu-satunya informasi untuk screen reader. Kontrol dan ringkasan berada di DOM, dengan deskripsi scene singkat. Jika canvas tidak interaktif langsung, jangan membuatnya fokusable tanpa kebutuhan. `role=application` tidak dipakai pada seluruh workspace.

### CMP-07 — CompactScene / alternatif tekstual

Tombol “Tampilan ringkas” tersedia meski WebGL berhasil. Tampilkan arrived/waiting/inService/completed dan list Loket 1..c dengan “Kosong” atau “Melayani pelanggan …”. Tidak harus menampilkan seluruh ID pelanggan untuk memahami antrean; detail dapat di-collapse. Engine, manual input dan A/B tetap bekerja. Saat WebGL context lost, ganti viewport ini, tampilkan banner dan jangan reset run atau menyalakan kamera.

### CMP-08 — MetricBlock

Metrik ditampilkan sebagai kartu kecil dalam grid auto-fill (min 128 px): label, angka monospace + unit, catatan penyebut. Hasil final punya satu kartu hero (rata-rata tunggu final), lalu kelompok “Seluruh pelanggan percobaan” dan “Selama menerima pelanggan”, bar utilisasi per loket, dan grafik langkah panjang antrean (puncak per bin, dihitung worker dari catatan pelanggan) dengan garis batas kedatangan. Urutan utama: rata-rata tunggu → waiting saat ini → completed → utilization; metrik lain di detail. Label unit dan denominator langsung terkait nilai.

| Kondisi | Nilai | Penanda wajib |
|---|---|---|
| READY belum run | Em dash | “Belum dijalankan” |
| RUNNING dengan 3 pelanggan mulai dilayani | Nilai sementara | “Sementara · 3 pelanggan sudah mulai dilayani” |
| RUNNING belum ada yang mulai | N/A | “Belum ada pelanggan mulai dilayani” |
| COMPLETED N>0 | Nilai final | “Final · N pelanggan” |
| COMPLETED N=0 | N/A untuk mean/P95; count=0 | “Tidak ada pelanggan pada percobaan ini” |
| ERROR/LIMIT/CANCELLED | Nilai parsial bila dipertahankan | “Parsial · tidak digunakan sebagai hasil final” |

Bagian hasil final terpisah **Seluruh pelanggan percobaan** (mean/P95 wait, time in system, mean service) dan **Selama menerima pelanggan** (throughput, time-weighted queue, utilization, selesai/menunggu/dilayani pada H). Drain duration punya label sendiri. Jangan menyatukan completed final dengan completed pada H.

### CMP-09 — ComparisonEditor dan LockedDemand

Kolom A “Baseline” dan B “Kandidat”, label seri konsisten. A adalah snapshot referensi, B adalah draft c/a/b; locked demand memuat λ, H, seed, kondisi awal, jadwal manual dan versi model yang sama. Pilihan “Sertakan tambahan pelanggan dari run” menjelaskan penggabungan schedule+log sekali, bukan memuat state antrean saat pause.

Diff menggunakan teks: “Loket: 2 → 3”, “Pelayanan: tetap 20–40 detik”. A dan B identik tetap sah dan memberi info “Belum ada parameter yang diubah”. Jika mismatch permintaan, banner menjelaskan field berbeda dan aksi “Samakan dengan baseline”; tidak ada label fair sebelum validasi berhasil.

Untuk mengganti λ/H/seed/jadwal, aksi “Ubah permintaan bersama” membuka satu draft yang berlaku ke A dan B sekaligus; c/a/b B tetap independen. Perubahan menghasilkan label hasil sebelumnya pada summary lama. Selama batch menghitung atau ditangguhkan, seluruh draft A/B terkunci sampai selesai atau dibatalkan; snapshot pekerjaan tidak berubah.

Hanya primary “Jalankan 20 pasangan” setelah syarat terpenuhi. AirShift dan input manual live nonaktif di batch. Pada mobile A/B bertumpuk tetapi heading selalu melekat pada datanya; tabel result dipivot menjadi blok per metrik agar halaman tidak scroll horizontal.

### CMP-10 — ProgressAndCancel

Progress berbasis pekerjaan selesai: “7 dari 20 pasangan selesai”; tidak memakai animasi persentase palsu. Pasangan yang sedang berjalan boleh dijelaskan, tetapi tidak dihitung sebagai selesai. Gunakan progress native/semantik dengan label. Update visual boleh ≤500 ms sekali; live announcement hanya tiap 5 pasangan atau saat state berubah, bukan setiap event.

Selesaikan cepat menampilkan “Memproses sisa pelanggan…” dan progress indeterminate jika total belum diketahui. Tombol Batal tetap fokusable dan merespons. Batch suspended karena hidden menampilkan “Perbandingan dijeda saat tab tidak aktif” dan tombol Lanjutkan perbandingan. Cancel batch mempertahankan hasil lengkap sebelumnya dan tidak mempromosikan partial summary.

### CMP-11 — ComparisonResult dan IntervalView

| Elemen | Penyajian |
|---|---|
| Summary utama | Delta mean wait B−A dalam detik, A dan B dalam unit sama |
| Interval | Angka batas bawah/atas dengan label “Interval 95% rata-rata selisih”; penjelasan bukan rentang tunggu pelanggan |
| Interpretasi | Seluruh CI<0: “B lebih rendah pada eksperimen ini”; seluruh CI>0: “B lebih tinggi”; mencakup/menyentuh 0: “Arah perbedaan belum meyakinkan” |
| Jumlah replikasi | “20 pasangan replikasi sintetis”; tidak menyebut 20 pelanggan |
| Kasus A=B | Jika seluruh pasangan berisi pelanggan: “Skenario identik”, delta 0, CI [0; 0]. Jika ada pasangan kosong, aturan N/A didahulukan. |
| Ada pasangan N=0 | CI=N/A; “Data pelanggan tidak cukup untuk interval”; count pasangan kosong terlihat |
| Baseline mean=0 | Persentase=N/A; delta absolut tetap ditampilkan |
| Hasil sudah stale | “Hasil dari konfigurasi sebelumnya”; tampilkan snapshot asal dan Jalankan ulang |

Grafik interval adalah Could; tabel angka lengkap tetap Must. Jika grafik disertakan, sumbu delta memiliki garis nol, marker dan rentang yang sebenarnya. Auto-range harus memuat 0 dan kedua batas CI; tidak memotong interval untuk memberi kesan peningkatan. Warna seri A/B tidak dipakai sebagai warna verdict. Catatan menyebut rata-rata metrik per replikasi; rata-rata P95 tidak disebut P95 gabungan.

### CMP-12 — SavedList dan SaveDialog

Daftar menampilkan nama, waktu simpan lokal, c/λ/pelayanan/H dan seed. Nama 1–60 karakter setelah trim, baris maksimal dua dengan reveal nama penuh yang dapat diakses; tidak menghilangkan pembeda nama slot. Nama selalu teks, tidak dirender sebagai HTML. SaveDialog memiliki autofocus pada nama; default nama kontekstual “Kantin · 2 loket”.

Simpan adalah aksi eksplisit, tanpa autosave runtime. Sukses baru diumumkan setelah write berhasil. Bila record lama sedang dimuat, tombol “Perbarui konfigurasi ini” menargetkan ID record yang sama dan memerlukan konfirmasi overwrite; “Simpan sebagai baru” memakai slot kosong. Jika sudah 10 slot, pengguna memilih slot pengganti atau membatalkan; tidak menimpa yang paling lama otomatis. Tidak mewajibkan nama unik; bedakan slot memakai ID dan metadata.

Storage invalid/unsupported menampilkan record tak dapat dimuat; tidak menghapus atau memperbaiki diam-diam. Hapus item/hapus seluruh data TomorrowLab selalu menjelaskan cakupan; tidak membersihkan origin aplikasi lain.

### CMP-13 — ConfirmDialog

Dialog memuat judul tindakan, dampak spesifik dan dua aksi. Untuk tindakan destruktif, initial focus pada Batal. Backdrop tidak mengeksekusi tindakan; Escape membatalkan dan mengembalikan fokus. Saat modal terbuka, background inert, Tab tetap dalam dialog. Pola fokus mengikuti WAI-ARIA APG [S2].

| Trigger | Judul / tombol konfirmasi | Penjelasan wajib |
|---|---|---|
| Reset | “Reset run ini?” / “Reset run” | Progres, hasil dan tambahan pelanggan live dihapus; parameter, seed dan jadwal awal tetap. |
| Edit run aktif/selesai | “Reset untuk mengubah skenario?” / “Reset dan edit” | Snapshot hasil lama akan ditinggalkan; perubahan baru tidak mengedit sejarah run. |
| Muat saat run aktif | “Ganti skenario aktif?” / “Reset dan muat” | Progres/log live run aktif hilang; tersimpan tidak otomatis berisi progres run. |
| Hapus slot | “Hapus konfigurasi ini?” / “Hapus konfigurasi” | Sebut nama yang dipilih; aksi hanya slot tersebut. |
| Timpa slot | “Ganti konfigurasi tersimpan?” / “Ganti konfigurasi” | Sebut slot target; data lama diganti setelah write sukses. |
| Buka Bandingkan saat RUNNING | “Pause dan buka perbandingan?” / “Pause dan buka” | Run dijeda; hanya konfigurasi/jadwal dijadikan baseline, bukan antrean saat ini. |

Maksimum satu modal aktif. Bila aksi membutuhkan dialog berikutnya, ganti konten/lanjut tahap dan kelola fokus; tidak menumpuk dialog. Membuka informasi tidak otomatis pause; label state tetap jujur.

### CMP-14 — Alert, InlineMessage dan Toast

Persistent alert untuk kegagalan run, storage, kamera, mismatch A/B dan hasil stale; toast untuk sukses simpan/hapus yang tidak memerlukan aksi. Alert memuat ikon+judul+sebab+aksi pemulihan. Error penting diumumkan sekali; jangan mengulang `role=alert` pada setiap render.

Toast tidak menjadi satu-satunya lokasi informasi penting. Sukses simpan juga tercermin pada daftar/status. Toast biasa 5 detik, dapat ditutup, tidak mengambil fokus; aksi penting tetap tersedia di panel. Jangan menyembunyikan error sebelum pengguna dapat membacanya. Field error muncul setelah commit/submit; tidak menampilkan error agresif tiap keypress saat angka masih diketik.

### CMP-15 — Tabs, Accordion, Tooltip dan Disclosure

Tabs Simulasi/Bandingkan: satu tab stop untuk tab aktif; panah memindah fokus; Enter/Space mengaktifkan tab agar perpindahan yang perlu guard tidak terjadi hanya karena fokus. Gunakan hubungan tab/tabpanel yang benar. Ini mengikuti pola tabs manual activation APG [S3]. Guard RUNNING tetap melalui CMP-13.

Accordion memakai button dengan expanded state, tidak menghalangi alur baca. Tooltip hanya untuk informasi tambahan; muncul saat hover dan focus, dapat ditutup Escape, dan tidak memuat aksi form. Batas, unit, alasan nonaktif dan status kamera selalu punya teks di luar tooltip.

### CMP-16 — AirShiftPanel — opsional

Entry point hanya hadir bila AirShift termasuk build dan lolos gate PRD. Tidak memasang badge “beta” sebagai pengganti uji privasi. Kamera default off; tombol “Aktifkan AirShift” membuka penjelasan sebelum request permission. Audio tidak diminta.

| Status | Label dan perilaku |
|---|---|
| off | “AirShift nonaktif”; CTA aktifkan |
| requesting | “Menunggu izin kamera”; manual tetap tersedia |
| loading | “Menyiapkan pengenalan tangan”; tidak mengirim gesture |
| ready | “AirShift siap”; hint open palm pause, thumbs up lanjut |
| no-hand | “Tangan belum terlihat”; run mengikuti state terakhir |
| low-confidence | “Pose belum jelas”; reset dwell, tidak menjalankan aksi |
| multiple-hands | “Gunakan satu tangan”; semua pose diabaikan |
| error | Sebab dan tombol coba lagi/matikan; tidak auto prompt ulang |

Feedback dwell berupa progress berlabel “Tahan pose…” dan aksi setelah threshold. Threshold PRD: confidence ≥0,85, stabil ≥600 ms, data stale >200 ms diabaikan; cooldown ≥1.500 ms dan netral/hilang ≥300 ms untuk re-arm. Pose di bawah ambang, berganti, hilang atau stale langsung memutus dwell stabil; label bantuan “Tangan belum terlihat” boleh menunggu kehilangan >500 ms agar tidak berkedip. Jeda singkat tidak boleh digabung menjadi pose stabil 600 ms. Ini waktu nyata, bukan waktu simulasi. Jangan menyamakan pose yang sedang terbaca dengan aksi yang sudah dieksekusi.

Gesture hanya pause RUNNING biasa dan resume pause manual/gesture. Tidak resume hidden/error, tidak mulai READY, tidak reset/save/add customer, dan tidak bekerja saat modal, batch, mode Selesaikan cepat, atau input teks aktif. Tab hidden menghentikan track/inferensi dan membutuhkan opt-in lagi. Preview bila aktif berukuran 160×120 px pada desktop atau maksimal lebar panel pada mobile; jangan menutupi angka/toolbar. Preview tidak disimpan. Teks consent: “Kamera diproses di perangkat untuk mengenali pose tangan. Frame tidak dikirim atau disimpan oleh TomorrowLab. Semua kontrol manual tetap tersedia.”

### CMP-17 — SnapshotDetails dan AssumptionPanel

SnapshotDetails memuat c, λ, a/b, H, root seed, jadwal manual, jumlah replikasi bila relevan, serta model/engine/RNG version. Detail berupa definition list/tabel ringkas yang bisa disalin sebagai teks bila fitur salin tersedia; tidak mewajibkan ekspor file tambahan.

AssumptionPanel menyebut data sintetis; Poisson untuk arus otomatis; uniform layanan; FIFO, awal kosong, loket identik; horizon lalu drain; jarak/avatar tidak memengaruhi model; manual arrival adalah tambahan di luar Poisson. Informasi selalu dapat dibuka dari hasil maupun sebelum run, tanpa link eksternal wajib.

## 8. Format angka dan visualisasi statistik

| Data | Format tampilan | Catatan |
|---|---|---|
| Count pelanggan/loket | Integer locale Indonesia | Contoh 1.250 pelanggan; bukan “1,2K” untuk hasil analisis |
| Waktu tunggu/layanan | Detik, maksimal 2 desimal | Contoh 10,25 detik; angka exact tetap disimpan engine |
| Arrival rate | Maksimal 1 desimal | Contoh 4,5 pelanggan/menit |
| Throughput | Maksimal 2 desimal | Satuan pelanggan/menit; hanya completed≤H |
| Utilization | Persen, 1 desimal | 50,0%; denominator c×H, tidak memasukkan drain |
| Mean queue | Maksimal 2 desimal | Boleh pecahan; label rata-rata berbobot waktu |
| Delta | Signed, 2 desimal | Gunakan minus Unicode “−”; delta 0 tampil 0,00 |
| Interval | `[bawah; atas] detik` | Semicolon menghindari ambigu dengan koma desimal |
| Seed | Digit utuh | 2026 tanpa pemisah ribuan |
| N/A | Teks “N/A” + sebab | Bedakan belum run, kosong dan invalid |

Nilai nonzero yang membulat ke 0,00 tampil “<0,01 detik” atau “>−0,01 detik” sesuai tanda, dengan nilai lebih presisi di detail bila tersedia. Keputusan CI menggunakan presisi engine, bukan angka tampilan yang dibulatkan. Endpoint yang membulat ke nol tidak boleh membuat interpretasi bertentangan: tambah catatan bahwa interval dibulatkan dan sediakan presisi cukup di detail. Tidak memakai counter animasi yang membuat nilai sementara terlihat seperti final.

Contoh fixture yang benar untuk desain: ST-01 PRD, 3 pelanggan datang bersamaan, satu loket, layanan konstan 10 detik, H = 60 detik → mean wait 10,00 detik, P95 20,00 detik, utilization 50,0%. Contoh ini diberi label “Fixture pengujian”; bukan angka preset acak default.

## 9. Keyboard, pointer dan screen reader

| Area | Kontrak |
|---|---|
| Global | Tab/Shift+Tab mengikuti DOM; tidak memakai tabindex positif. Escape menutup overlay/tooltip yang aktif, tidak mereset model. |
| Workspace non-input | Space boleh pause/resume hanya pada RUNNING/PAUSED biasa ketika fokus berada pada workspace yang mendukung shortcut dan ada hint; selama batch atau mode Selesaikan cepat, shortcut ini nonaktif. Cegah page scroll hanya ketika shortcut benar-benar ditangani. |
| Native button | Space/Enter hanya mengaktifkan button tersebut; handler global tidak mengeksekusi toggle kedua. |
| Input/slider/select/text/modal | Tidak menjalankan shortcut workspace; key handling lokal tetap native. |
| Scene controls | Pan/rotate/zoom via tombol; tidak mengunci pointer atau memerlukan drag. |
| Dialog | Fokus masuk, terkandung, Escape membatalkan, kembali ke trigger atau target logis bila trigger hilang. |
| Setelah sukses run | Tidak mencuri fokus otomatis dari kontrol; announce “Run selesai” dan sediakan link Ke hasil. |
| Setelah invalid form | Fokus ke field invalid pertama; error lokal dan ringkasan dapat dibaca. |
| Setelah hidden | Banner menjelaskan pause dan kamera off; fokus tidak meloncat sebelum pengguna berinteraksi. |

Screen reader mendapat satu polite status region untuk state/peristiwa penting, bukan setiap customer. Update count dan timer boleh dibaca saat pengguna menavigasi ke panel; jangan memaksakan announcement terus-menerus. Data result table punya caption serta header yang saling terkait. Icon dekoratif `aria-hidden`; icon bermakna diwakili label teks/button.

## 10. Error, empty, loading dan long content

| Kondisi | Penyajian | Recovery yang selalu tersedia |
|---|---|---|
| Storage kosong | “Belum ada konfigurasi tersimpan” + penjelasan lokal | Tutup, Simpan konfigurasi aktif |
| Storage gagal | Banner warning persistent; draft tetap ada di memori | Coba simpan lagi secara eksplisit |
| Schema record rusak/baru | Item ditandai “Tidak dapat dimuat” | Lihat sebab/hapus pilihan; tidak auto-delete |
| λ0 jadwal kosong | Info ringan sebelum run; final kosong mengikuti N/A | Edit kedatangan/jadwal |
| ρ≥1 | Warning “Permintaan otomatis menyamai/melebihi kapasitas rata-rata” | Run tetap tersedia; asumsi dapat dibaca |
| Batas resource | Error persistent dengan count terakhir dan label invalid | Reset; kurangi durasi/arrival |
| WebGL hilang | CompactScene + banner | Coba 3D lagi secara eksplisit bila didukung; model tetap |
| AirShift permission denied | Penjelasan spesifik tanpa menyalahkan pengguna | Manual + coba lagi dari tombol |
| Nama panjang | Wrap dua baris dan reveal penuh yang bisa diakses | Detail tetap menampilkan nama utuh |
| Mobile input keyboard | Field dan error tidak tertutup viewport/toolbar | Scroll ke field tanpa memindah state |
| Download asset lama | Hanya area terkait menunjukkan loading | Manual engine tetap bisa dipakai jika tidak bergantung asset |

Empty state memakai ikon standar dan teks; tidak membutuhkan ilustrasi custom. UI tidak menyebut “Tersimpan” jika write gagal. Status success/error tidak hanya muncul di toast yang sudah hilang.

## 11. Ikon, scene dan kebijakan aset

Keluarga ikon **Phosphor** melalui paket `@phosphor-icons/react` (MIT), weight bold untuk glyph kecil, fill untuk ikon tombol utama, duotone untuk ilustrasi bantuan. Pilih satu weight per kelompok; ukuran 20 px pada tombol 44 px dan 16 px untuk metadata. Referensi keluarga resmi [S4]; implementasi memeriksa lisensi paket/versi yang benar-benar dipakai, serta hanya menyertakan ikon yang diperlukan sebagai SVG lokal.

| Makna | Bentuk ikon |
|---|---|
| Jalankan / pause / lanjut | Play / Pause; label selalu ada pada toolbar |
| Tambah / kurangi | Plus / Minus; nama objek di accessible label |
| Reset run | ArrowCounterClockwise; teks “Reset run” membedakan kamera scene |
| Reset tampilan | FrameCorners atau bentuk frame; teks “Reset tampilan” |
| Simpan / tersimpan | FloppyDisk / FolderOpen |
| Hapus | Trash |
| Asumsi | Info |
| Kamera | Camera / CameraSlash |
| Terkunci | LockSimple + penjelasan parameter |

Pilih padanan tersedia dalam paket; nama glyph di atas tidak memaksa menambah library kedua. Jangan memakai emoji untuk status utama, foto mahasiswa, atau avatar raster sebagai data. Scene avatar/counter dibuat geometri prosedural tanpa mengarang kemiripan kampus nyata. Custom raster tidak menjadi sumber icon SVG atau angka hasil simulasi.

## 12. Implementasi token dan contoh pola

Potongan berikut adalah kontrak nilai, bukan file aplikasi atau pilihan stack. Daftar token lengkap tetap berada pada §3; komponen tidak membuat warna semantik baru tanpa memperbarui dokumen.

```css
:root {
  --tl-color-canvas: #f7f6f3;
  --tl-color-surface: #ffffff;
  --tl-color-text: #202722;
  --tl-color-text-muted: #59635d;
  --tl-color-primary: #245d49;
  --tl-color-border-control: #7a847d;
  --tl-color-focus: #1f5ea8;
  --tl-space-2: 0.5rem;
  --tl-space-4: 1rem;
  --tl-space-6: 1.5rem;
  --tl-radius-control: 0.375rem;
  --tl-radius-panel: 0.75rem;
  --tl-control-height: 2.75rem;
}

/* Ring berjarak dari komponen agar tetap terbaca pada tombol solid. */
:focus-visible {
  outline: 2px solid var(--tl-color-focus);
  outline-offset: 2px;
}
```

Komponen native yang semantiknya cukup tidak perlu wrapper baru hanya untuk nama desain. Pisahkan visual state dari model state: `loading` tombol simpan bukan RUNNING simulasi, `stale` result bukan ERROR run, dan kamera off bukan PAUSED model. Nilai UI yang terlihat dikunci mengambil snapshot yang benar, bukan draft lain yang kebetulan mempunyai nama sama.

## 13. Traceability dan acceptance desain

### 13.1 Pemetaan kebutuhan

| Kelompok desain | Komponen | Acuan PRD |
|---|---|---|
| Kontrol manual, form dan jadwal | CMP-01–04 | FR-01–10, FR-25, FR-28 |
| State, scene dan fallback | CMP-05–07 | FR-11–12, FR-24, FR-26–29; NFR-03,07–10,14 |
| Hasil dan asumsi | CMP-08,17 | FR-13–15, FR-27; NFR-01 |
| A/B, CI dan cancellation | CMP-09–11 | FR-16–20, FR-34; NFR-02,04 |
| Penyimpanan dan konfirmasi | CMP-12–15 | FR-08–09, FR-21–23; NFR-12–13 |
| Gesture dan kamera | CMP-16 | FR-30–32; NFR-11 |
| Drag and drop | CMP-06 dengan alternatif tombol slot bila dibuat | FR-33 — Could |
| Akses semua tugas | Seluruh komponen | NFR-06–09 |

Drag and drop tidak punya komponen custom wajib. Jika disertakan, hanya di READY, pindah slot legal, memiliki klik pilih slot/keyboard dan tidak mengubah jarak layanan atau metrik.

### 13.2 Checklist handoff

| ID | Kriteria penerimaan dokumen desain / implementasi berikutnya |
|---|---|
| DS-QA-01 | Semua warna UI mengambil token semantik; batas kontrol dan teks lolos kontras pada background aktual. |
| DS-QA-02 | Button/input/slider/dialog/tabs memiliki state dan perilaku keyboard sesuai kontrak; tidak ada icon-only action tanpa nama. |
| DS-QA-03 | Viewport 360, 768, 1280, 1366 dan 1600 px serta zoom 200% tidak memotong aksi inti; scroll halaman horizontal tidak diperlukan. |
| DS-QA-04 | READY/RUNNING/PAUSED/COMPLETED/ERROR/LIMIT_REACHED/CANCELLED dan phase draining dapat dibedakan melalui teks. |
| DS-QA-05 | Sementara/final/N/A/parsial/stale tidak memakai placeholder angka yang sama; denominator dan unit dapat dibaca. |
| DS-QA-06 | Seluruh tugas bisa dilakukan dengan kamera off, keyboard dan tampilan ringkas; Space tidak men-trigger dua aksi. |
| DS-QA-07 | Dialog destructive fokus Batal; cancel tidak menjalankan aksi; fokus kembali ke tempat logis. |
| DS-QA-08 | A/B memakai marker dan label selain warna; CI rounded tidak mengubah interpretasi presisi engine. |
| DS-QA-09 | Reduced motion tidak mengubah hasil, urutan event atau waktu simulasi. |
| DS-QA-10 | Kamera aktif selalu punya indikator dan tombol off; hidden menghentikan kamera dan tidak auto-resume run/gesture saat kembali. |
| DS-QA-11 | Cancel cepat menghasilkan nonfinal; batch partial dan hasil terakhir yang lengkap tidak tertukar. |
| DS-QA-12 | Nama 60 karakter, count 2.000, N=0, overload, storage gagal dan WebGL gagal mempunyai tampilan yang dapat digunakan. |

Checklist ini perlu dijalankan pada UI yang dibangun. Rasio token telah dihitung; interaksi, scene, runtime browser dan kepatuhan WCAG menyeluruh belum diuji.

## 14. Keputusan baseline dan pengembangan berikutnya

**Dikunci untuk v1.1:** light workspace kaca/evergreen; Plus Jakarta Sans + JetBrains Mono self-hosted; ruang 3D kantin representatif dengan tampilan ringkas sebagai alternatif; struktur single workspace; label Indonesia; manual completeness; semantic state; teks alternatif scene; A/B 20 pasangan; glyph SVG standar; tidak ada ketergantungan artwork baru untuk MVP.

**Diperiksa saat implementasi:** wrapping font sistem aktual; rendering material di GPU target; camera controls; library icon yang sudah dipilih proyek; breakpoint pada konten nyata; screen reader/browser; kinerja dengan jumlah avatar tinggi; integrasi AirShift dan gate kualitasnya.

**Pascalomba:** dark theme, custom brand mark, kalibrasi visual scene berdasarkan kantin nyata, varian banyak domain, kolaborasi dan visualisasi analisis tambahan. Semua memerlukan kebutuhan dan pengujian baru, bukan otomatis menjadi scope karena ada di bagian ini.

Perubahan token semantik, perilaku fokus, state dan angka metrik menaikkan versi dokumen serta memeriksa USER_FLOW terkait. Perubahan token tidak mengubah modelVersion kecuali semantik model juga berubah. PRD v1.0 tetap menjadi baseline kebutuhan; tidak diubah oleh penyusunan dua dokumen turunan ini.

## 15. Referensi

- **[S1]** [W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/). Acuan kontras, keyboard, reflow, focus dan target size; diakses 26 Oktober 2026. Rasio pasangan warna dalam dokumen dihitung dari token, bukan sertifikasi aplikasi.
- **[S2]** [WAI-ARIA APG — Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Acuan pengelolaan fokus dan keyboard modal; diakses 26 Oktober 2026.
- **[S3]** [WAI-ARIA APG — Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). Acuan hubungan tab/panel dan interaksi keyboard; diakses 26 Oktober 2026.
- **[S4]** [Phosphor Icons — Repositori resmi](https://github.com/phosphor-icons/homepage). Acuan keluarga ikon; versi dan lisensi artefak implementasi perlu diperiksa saat dipilih.

| Versi | Tanggal | Catatan |
|---|---|---|
| 1.0 | 26 Oktober 2026 | Design system awal untuk implementasi TomorrowLab, diturunkan dari PRD v1.0 dan disejajarkan dengan USER_FLOW v1.0. |
