# TomorrowLab
## Product Requirements Document — v1.0

**Simulasikan pilihan hari ini. Pahami dampaknya sebelum diterapkan.**

| Atribut | Nilai |
|---|---|
| Versi dan tanggal | 1.0 — 26 Oktober 2026, WIB |
| Status | Baseline spesifikasi untuk development; implementasi dan hasil pengujian belum diverifikasi |
| Proyek | TomorrowLab untuk LaunchPad Hacks 2026 |
| Produk MVP | Web app desktop-first, simulator skenario antrean kantin kampus dengan visualisasi 3D interaktif |
| Tenggat resmi | Sabtu, 21 November 2026 pukul 05.00 WIB |
| Target submit internal | Jumat, 20 November 2026 pukul 20.00 WIB; buffer 9 jam |
| Bahasa antarmuka MVP | Bahasa Indonesia |
| Platform utama | Browser desktop; kontrol mouse, trackpad, dan keyboard |
| Kontrol tambahan | AirShift melalui webcam, opsional dan tidak menjadi syarat penggunaan |
| Penyimpanan | Lokal pada browser; tanpa akun dan tanpa backend aplikasi |
| Pemilik produk / persetujuan scope | Pemilik proyek TomorrowLab; nama belum ditetapkan di dokumen |
| Pemilik implementasi / QA / submission | Diisi tim pada kickoff; satu orang boleh memegang beberapa peran |

### Cara menggunakan dokumen

PRD ini menentukan perilaku produk, batas MVP, kontrak data dan statistik, serta bukti penerimaan yang diperlukan. Seluruh alur, keputusan model, timeline, dan kriteria rilis berada di dokumen ini. Dokumen ini tidak membuat atau mensyaratkan file USER_FLOW, DESIGN_SYSTEM, ARCHITECTURE, SIMULATION_SPEC, maupun ROADMAP terpisah.

Istilah **wajib** berarti syarat rilis MVP, **opsional** berarti boleh dihilangkan sesuai gate, dan **pascalomba** berarti bukan komitmen hackathon. Kriteria penerimaan adalah target yang harus diuji, bukan klaim bahwa kemampuan tersebut sudah tersedia.

### Dasar dan tingkat kepastian

- **Dikonfirmasi dari permintaan pengguna:** simulator web 3D desktop-first; antrean kantin sebagai MVP; seluruh operasi utama tersedia manual; AirShift opsional; simulasi event-driven, statistik valid dan reproducible; run/pause/reset, perbandingan fair, simpan lokal, responsif dan aksesibel; hanya satu PRD.
- **Keputusan baseline PRD:** antrean tunggal FIFO dengan 1–6 loket identik, model kedatangan Poisson, pelayanan uniform terbatas, jendela kedatangan hingga horizon lalu drain, 20 replikasi untuk perbandingan. Keputusan ini menghilangkan ambiguitas implementasi; bukan kutipan keputusan lama yang berhasil dipulihkan.
- **Belum terbukti:** kesesuaian distribusi dengan kantin nyata, kemudahan penggunaan, kemampuan perangkat target, serta kualitas integrasi AirShift.
- **Keterbatasan konteks:** pembacaan percakapan referensi hanya mengembalikan pesan awal; isi diskusi terdahulu tidak dapat direkonstruksi penuh. Rincian permintaan terbaru menjadi acuan utama.
- **Sumber eksternal:** jadwal dan aturan lomba diperiksa 26 Oktober 2026 melalui halaman resmi Devpost [R1–R2]. Ketentuan dapat berubah; periksa ulang sebelum submit.

### Daftar isi

1. Ringkasan, visi, dan positioning
2. Pemangku kepentingan, personas, dan masalah
3. Tujuan, metrik, dan batas keberhasilan
4. Scope MVP dan aspirasi pascalomba
5. Konsep pengalaman dan alur utama
6. Domain model dan kontrak konfigurasi
7. Requirements fungsional dan acceptance criteria
8. Model simulasi, statistik, dan validasi
9. AirShift, kontrol manual, dan fallback
10. Requirements nonfungsional
11. Error states, privasi, dan keamanan
12. Strategi pengujian dan kriteria rilis
13. Rencana pelaksanaan hingga deadline
14. Risiko, dependensi, dan pengendalian scope
15. Keputusan final dan open questions
16. Glosarium dan referensi

---

## 1. Ringkasan, visi, dan positioning

TomorrowLab membantu orang mengeksplorasi pertanyaan “bagaimana jika?” melalui simulasi yang terlihat, dapat diubah, dan dapat diperiksa hasilnya. Untuk MVP, pengguna mengatur loket, arus kedatangan, dan waktu pelayanan kantin, melihat antrean dalam ruang 3D, lalu membandingkan dua konfigurasi memakai kondisi permintaan yang setara.

Visi jangka panjangnya adalah laboratorium skenario interaktif untuk berbagai sistem sehari-hari. Bukti nilai hackathon dibatasi pada satu masalah: memahami dampak kapasitas pelayanan terhadap antrean kantin kampus. TomorrowLab bukan alat prediksi operasional yang sudah dikalibrasi, dan hasilnya tidak boleh dipresentasikan sebagai data kantin nyata.

**Janji produk MVP:** “Ubah satu keputusan, jalankan eksperimen yang sama, lalu lihat perubahan waktu tunggu dan beban loket beserta batas ketidakpastiannya.”

Nilai produk datang dari hubungan yang jelas antara kontrol, kejadian, dan metrik. 3D menjelaskan aktivitas; perhitungan kejadian menjadi sumber kebenaran. AirShift memperkaya demonstrasi hands-free, tetapi manfaat utama tetap tersedia tanpa kamera.

**Contoh pertanyaan yang didukung:** apakah menambah loket dari dua menjadi tiga menurunkan waktu tunggu pada arus kedatangan yang sama? Seberapa besar dampak mempercepat pelayanan? Apa yang terjadi bila permintaan melampaui kapasitas selama periode makan siang?

## 2. Pemangku kepentingan, personas, dan masalah

### 2.1 Peran dan tanggung jawab

| Peran | Tanggung jawab | Bukti keputusan |
|---|---|---|
| Pemilik produk | Menjaga masalah utama, menyetujui perubahan scope dan copy klaim | Catatan perubahan versi PRD |
| Pengembang simulasi | Memenuhi determinisme, definisi metrik, invariant dan fixture numerik | Hasil pengujian model |
| Pengembang pengalaman | Kontrol manual, 3D, responsivitas, keyboard, penyimpanan | Demo alur dan checklist aksesibilitas |
| Penanggung jawab QA | Menguji alur, browser, kegagalan, dan perbandingan | Laporan pass/fail dan issue tersisa |
| Penanggung jawab submission | Persyaratan peserta, tautan demo, materi, dan pengiriman | Konfirmasi submission dan tautan publik |

Ini pembagian tanggung jawab, bukan asumsi jumlah anggota. Bila tim kecil, tanggung jawab tetap eksplisit meskipun dirangkap.

### 2.2 Personas berbasis pekerjaan

Personas berikut adalah hipotesis untuk desain dan pengujian, bukan hasil riset pengguna.

| Persona | Situasi dan kebutuhan | Hambatan | Hasil yang diinginkan |
|---|---|---|---|
| Mahasiswa pembelajar | Mempelajari antrean lewat eksperimen singkat | Rumus terasa abstrak; sulit menghubungkan parameter dengan antrean | Mengubah parameter dan menjelaskan mengapa hasil berbeda |
| Pengelola kantin / perencana kegiatan | Mempertimbangkan tambahan kapasitas saat ramai | Uji langsung mengganggu layanan; data nyata belum lengkap | Membandingkan opsi di bawah asumsi yang transparan, sebelum mengumpulkan bukti lapangan |
| Presenter / juri / pengunjung demo | Memahami produk dalam waktu singkat | Waktu terbatas, perangkat atau kamera berbeda | Membuka demo, mencoba manual, melihat perbandingan dan keterbatasannya |

### 2.3 Pernyataan masalah

1. Orang melihat antrean panjang tetapi sulit membedakan penyebabnya: permintaan, jumlah loket, atau durasi pelayanan.
2. Eksperimen visual dapat menyesatkan jika animasi menentukan hasil, sampel terlalu kecil, atau dua skenario memakai pelanggan berbeda tanpa penjelasan.
3. Demo berbasis gesture saja mengecualikan pengguna tanpa webcam, izin kamera, ruang gerak, atau kemampuan motorik tertentu.
4. Konfigurasi percobaan mudah hilang dan hasil sulit diulang jika seed, asumsi, dan versi model tidak dicatat.

### 2.4 Use cases prioritas

| ID | Pemicu | Pekerjaan pengguna | Hasil |
|---|---|---|---|
| UC-01 | Pertama membuka app | Memuat preset dan menjalankan simulasi | Melihat pelanggan datang, menunggu, dilayani, dan keluar |
| UC-02 | Ingin menambah kapasitas | Klik Tambah loket, ubah waktu layanan, atau gunakan keyboard | Draft konfigurasi baru dengan batas valid |
| UC-03 | Ingin mencoba lonjakan | Klik Tambah pelanggan / tambah sejumlah pelanggan selama run | Kedatangan manual tercatat pada waktu simulasi yang tepat |
| UC-04 | Ingin menilai opsi | Menetapkan baseline A, menduplikasi ke B, mengubah kapasitas | Perbandingan berpasangan dengan permintaan sama |
| UC-05 | Ingin melanjutkan nanti | Simpan lokal lalu muat ulang | Draft konfigurasi kembali tanpa akun |
| UC-06 | Kamera tidak tersedia | Menggunakan semua fitur inti melalui manual | Tidak ada alur inti yang terblokir |
| UC-07 | Presentasi hands-free | Mengaktifkan AirShift dan memberi gesture terbatas | Pause/resume dengan status pengenalan yang jelas |

## 3. Tujuan, metrik, dan batas keberhasilan

### 3.1 Objective hackathon

Sebelum target submit internal, pengguna baru dapat menjalankan eksperimen antrean, membandingkan dua pilihan secara fair, dan menjelaskan satu temuan dengan memahami asumsi dasarnya. Produk harus tetap berguna saat webcam dimatikan.

| ID | Target penerimaan produk | Cara mengukur | Waktu |
|---|---|---|---|
| G-01 | ≥4 dari 5 peserta uji membuka preset, run, dan menemukan mean waktu tunggu dalam ≤3 menit tanpa bantuan | Uji tugas singkat; catat waktu dan keberhasilan | Sebelum 17 Nov |
| G-02 | ≥4 dari 5 peserta menyusun A/B dan menjelaskan arah perubahan dengan benar dalam ≤5 menit setelah UC-01 | Peserta menyebut parameter berubah, permintaan tetap, dan label ketidakpastian | Sebelum 18 Nov |
| G-03 | Semua fixture numerik, invariant, reproducibility dan fairness wajib lulus | Pengujian otomatis dan review hasil | Sebelum release candidate |
| G-04 | Semua tugas inti selesai dengan keyboard dan kamera off | Checklist end-to-end manual | Sebelum 18 Nov |
| G-05 | Tidak ada issue blocker atau major yang belum diselesaikan dalam scope wajib | Triage issue dan bukti retest | Sebelum submit |

Target 4/5 adalah gate formatif bersampel kecil, bukan estimasi tingkat keberhasilan populasi. Jika peserta tidak tersedia, uji internal tidak boleh dilabeli riset pengguna; gap dicatat pada laporan rilis.

### 3.2 Metrics produk dan operasional

| Metrik | Definisi | Pengumpulan MVP |
|---|---|---|
| Task completion | Tugas selesai / peserta yang mencoba, dengan jumlah pembilang dan penyebut | Catatan uji yang disetujui peserta |
| Time to first result | Waktu nyata dari membuka app hingga hasil run pertama ditemukan | Stopwatch pada sesi uji |
| Comparison comprehension | Peserta dapat membedakan efek konfigurasi, variasi acak, dan asumsi | Wawancara tugas singkat |
| Run integrity | Run completed tanpa invariant failure / total run yang diuji | Hasil QA lokal |
| Manual feature parity | Jumlah operasi inti yang dapat diselesaikan tanpa gesture / seluruh operasi inti | Harus 100% |
| Performance pass rate | Skenario benchmark yang memenuhi NFR / seluruh benchmark | Catatan build, browser, perangkat, hasil |
| Gesture false action | Aksi yang tidak diniatkan per menit saat mode gesture aktif | Uji terpisah; bukan telemetry webcam |

Tidak ada analytics pihak ketiga, session replay, atau pelacakan webcam dalam MVP. Metrik adopsi publik pascalomba memerlukan desain persetujuan dan privasi tersendiri.

### 3.3 Non-goals

- Menentukan jumlah loket optimal untuk kantin nyata atau memberi jaminan penghematan biaya.
- Digital twin, prediksi AI, deteksi jumlah orang melalui kamera, atau pengambilan data CCTV.
- Sistem antrean operasional, pembayaran, pemesanan makanan, dashboard kasir, dan reservasi.
- Multi-user, kolaborasi real-time, akun, sinkronisasi cloud, atau backend penyimpanan.
- Editor dunia bebas, simulasi lalu lintas/rumah sakit, VR/AR, atau dukungan gesture wajib.
- Mengimplementasikan semua disiplin antrean, perbedaan jenis menu, prioritas pelanggan, atau perjalanan fisik pelanggan.

## 4. Scope MVP dan aspirasi pascalomba

### 4.1 MoSCoW

| Prioritas | Cakupan | Konsekuensi rilis |
|---|---|---|
| **Must** | Satu kantin 3D, antrean tunggal FIFO, 1–6 loket identik, input manual lengkap | Tidak boleh dipotong |
| **Must** | Kedatangan otomatis dan penambahan pelanggan manual, event-driven, seed dan log input | Tidak boleh digantikan animasi acak |
| **Must** | Run, pause, resume, reset; model state jelas; draft tidak diam-diam mengubah run | Menentukan integritas eksperimen |
| **Must** | Statistik definisi eksplisit; hasil provisional/final; A/B 20 replikasi dengan permintaan berpasangan | Bukan sekadar dua angka dari run berbeda |
| **Must** | Simpan/muat/hapus konfigurasi lokal, validasi, fallback kegagalan storage | Tanpa login |
| **Must** | UI responsif, keyboard, alternatif tekstual 3D, reduced motion, pemulihan error | Kamera off tetap berfungsi |
| **Must** | Preset, ringkasan asumsi, bukti test model, demo publik yang dapat diakses | Mendukung penilaian |
| **Should** | AirShift terbatas pada pause/resume; petunjuk dan feedback kamera | Opsional; hanya ikut bila gate kualitas terpenuhi |
| **Should** | Tiga preset dan mode visual ringan otomatis | Satu preset cukup untuk rilis bila waktu terbatas; fallback 2D tekstual tetap Must |
| **Could** | Drag and drop posisi loket pada slot sah, ekspor hasil ringkas, grafik tambahan | Tidak boleh mengorbankan Must |
| **Won’t, hackathon** | Cloud, akun, import dataset, optimasi otomatis, variasi disiplin antrean, banyak domain, mobile gesture | Pascalomba atau di luar produk |

“Tambah antrean” diterjemahkan secara konkret menjadi **Tambah loket**, **Tambah pelanggan**, dan **atur laju kedatangan**. MVP menggunakan satu jalur antrean bersama; tombol tidak menciptakan jalur paralel dengan aturan routing yang belum ditentukan. Banyak jalur independen adalah fitur pascalomba.

### 4.2 Pemisahan aspirasi

| Dimensi | MVP hackathon | Aspirasi pascalomba; perlu validasi baru |
|---|---|---|
| Domain | Satu model kantin | Perpustakaan skenario sistem sehari-hari |
| Data | Sintetis dengan parameter terbuka | Kalibrasi distribusi dari data lapangan yang sah |
| Kapasitas | Loket identik dan tetap selama run | Jadwal buka/tutup, loket heterogen, menu berbeda |
| Interaksi | Manual lengkap; dua gesture opsional | Manipulasi ruang lebih kaya bila terbukti berguna |
| Analisis | A/B berpasangan 20 replikasi | Analisis sensitivitas, optimasi dan studi skala lebih besar |
| Penyimpanan | Konfigurasi lokal | Berbagi dan kolaborasi dengan kontrol akses |
| Pengguna | Pembelajar dan demonstrasi | Perencana operasional setelah validasi domain |

## 5. Konsep pengalaman dan alur utama

### 5.1 Struktur layar

Satu workspace utama memuat kontrol skenario, visualisasi kantin, toolbar simulasi, dan panel metrik. Panel perbandingan dapat menjadi tab atau drawer dalam workspace. Desain akhir boleh menyesuaikan layout, tetapi parameter aktif, waktu simulasi, state, dan sumber input selalu terlihat.

Kontrol input adalah elemen antarmuka biasa, bukan objek yang hanya bisa diakses melalui canvas 3D. Angka loket dan antrean memiliki pasangan teks/list. Scene menampilkan identitas loket, pelanggan menunggu, pelanggan dilayani, dan pelanggan selesai tanpa perlu animasi berjalan yang memengaruhi durasi pelayanan.

### 5.2 Alur pertama kali

1. App terbuka pada preset “Jam makan siang”, kamera off, state READY.
2. Pengguna melihat nilai parameter, seed, asumsi ringkas, dan tombol Jalankan.
3. Klik Jalankan atau fokus tombol lalu Enter. Input dibekukan menjadi konfigurasi run.
4. Waktu simulasi bergerak pada default playback 20×; pelanggan masuk dan loket melayani. Metrik berlabel “sementara”. Pengguna dapat memilih 1× untuk mengamati lebih pelan.
5. Pengguna dapat pause, mengubah kecepatan tampilan, atau menambahkan pelanggan manual.
6. Pada horizon, kedatangan ditutup dan sistem mengosongkan sisa antrean; label “Menyelesaikan sisa pelanggan”.
7. Setelah semua pelanggan selesai, hasil final, asumsi, seed, versi model, dan waktu drain tersedia. Tombol “Selesaikan cepat” dapat memproses sisa event tanpa menunggu playback, memakai konfigurasi dan log yang sama.

### 5.3 Eksperimen manual dan pengeditan

Pengguna menambah/mengurangi loket melalui tombol atau input angka; mengatur arus otomatis dengan slider dan input numerik; mengubah batas waktu pelayanan serta horizon. Semua perubahan konfigurasi hanya berlaku di READY. Pada run aktif atau selesai, tombol “Ubah skenario” menawarkan reset dengan konfirmasi bila progres/hasil akan hilang. Tidak ada parameter fisik yang berubah diam-diam di tengah run.

Penambahan pelanggan adalah pengecualian yang disengaja: tombol “Tambah pelanggan” dan input jumlah 1–20 dapat digunakan pada RUNNING atau PAUSED selama waktu simulasi belum mencapai horizon. Penambahan pada PAUSED dijadwalkan pada waktu pause dan diproses saat resume. Log menampilkan waktu, jumlah, dan asal manual. Saat RUNNING, waktu ditangkap ketika aksi diterima, bukan saat animasi selesai.

### 5.4 Membandingkan A/B

1. Jadikan konfigurasi sebagai A, lalu duplikasi ke B.
2. Ubah jumlah loket dan/atau parameter pelayanan B. Permintaan dan horizon dikunci sama.
3. Bila ingin memasukkan lonjakan manual dari run eksplorasi, pilih “Gunakan catatan pelanggan manual”. Ini menyalin jadwal input, bukan kondisi antrean sesaat.
4. Sebelum eksekusi tampil ringkasan perbedaan, root seed, jumlah replikasi, dan apakah jadwal manual disertakan.
5. Jalankan 20 pasangan replikasi. Hasil yang belum lengkap tidak diberi status final.
6. Tampilkan mean A, mean B, selisih B−A, interval 95% untuk mean selisih waktu tunggu, dan catatan interpretasi.
7. Pengguna boleh mengubah draft, tetapi hasil lama tetap terikat konfigurasi asal dan berlabel “hasil sebelumnya”. Jalankan ulang untuk memperoleh hasil baru.

Tidak ada input pelanggan tambahan selama batch A/B berjalan. Tombol batal menghentikan batch dan tidak mengubah hasil terakhir yang sudah lengkap.

### 5.5 Penyimpanan dan pemulihan

Pengguna menyimpan nama konfigurasi, parameter, seed, dan jadwal pelanggan manual yang dipilih. Memuat konfigurasi membuka draft READY, tidak melanjutkan waktu run lama. Saat refresh, konfigurasi tersimpan tetap tersedia; progres run dan video kamera tidak disimpan. Navigasi meninggalkan run memberi peringatan jika platform mendukung; pesan awal menjelaskan bahwa progres tidak dipulihkan setelah refresh.

## 6. Domain model dan kontrak konfigurasi

### 6.1 Entitas

| Entitas | Field minimum | Aturan |
|---|---|---|
| ScenarioConfig | id, name, schemaVersion, modelVersion, c, lambdaPerMinute, serviceMinSec, serviceMaxSec, horizonSec, rootSeed, manualSchedule, updatedAt | Snapshot immutable selama run |
| ManualArrival | id, atSimSec, count, sequence | 0 ≤ waktu < H; jumlah bulat 1–20; urutan stabil |
| Run | id, configSnapshot, engineVersion, rngVersion, replicationSeed, status, simTimeSec, phase, inputLog, stopReason | inputLog hanya tambahan manual saat runtime; hanya COMPLETED yang memiliki hasil final |
| Customer | id, origin, arrivalAt, serviceDemandU, serviceStartAt?, departureAt?, serverId?, state | Tepat satu status: waiting / inService / completed |
| Server | id, ordinal, busyCustomerId?, busyTimeWithinH | Identik; ordinal menentukan tie-break |
| Queue | orderedCustomerIds | FIFO stabil; tidak ada pelanggan duplikat |
| Event | atSimSec, type, entityId, sequence | Urutan waktu dan tie-break deterministik |
| RunResult | countsAtH, cohortMetrics, horizonMetrics, drainEndSec, validity, versions | Tidak diturunkan dari jumlah avatar |
| Comparison | snapshotA, snapshotB, demandSchedule, rootSeed, seedList, replicationCount, pairedResults, summary, status | Wajib lolos pemeriksaan kesetaraan permintaan |
| SavedScenario | config, savedAt, schemaVersion | Maksimum 10 slot; hasil run tidak wajib disimpan |

Tidak menyimpan nama pelanggan nyata, gambar wajah, landmark tangan, atau identitas biometrik.

**Satu sumber eksekusi input manual:** `configSnapshot.manualSchedule` berisi input yang sudah dijadwalkan sebelum run. `inputLog` hanya berisi aksi tambahan manual yang diterima saat RUNNING/PAUSED, bukan salinan jadwal awal atau seluruh event engine. Replay mengeksekusi jadwal awal dan log tambahan masing-masing sekali. Setiap entry memiliki ID unik dalam run. Untuk menyimpan catatan run atau memakainya di A/B, gabungkan keduanya menjadi satu `manualSchedule` baru dengan ID dan sequence tetap; run baru memulai `inputLog` kosong. Jangan menjalankan jadwal gabungan bersama log tambahan asalnya.

### 6.2 Parameter publik

| Parameter | Default | Batas dan satuan | Efek |
|---|---:|---|---|
| Loket aktif `c` | 2 | Integer 1–6 | Jumlah server identik |
| Laju otomatis `λ` | 4 | 0–20 pelanggan/menit, step UI 0,1 | Menghasilkan jeda antarkedatangan |
| Minimum layanan `a` | 20 | 1–300 detik, integer | Batas bawah uniform |
| Maksimum layanan `b` | 40 | 1–300 detik, integer, b ≥ a | a=b berarti layanan konstan |
| Horizon `H` | 900 | 60–1.800 detik, step UI 60 | Jendela menerima kedatangan; bukan batas durasi drain |
| Root seed | 2026 | Integer 0–4.294.967.295 | Identitas eksperimen acak |
| Jumlah pelanggan manual | 1 | Integer 1–20 per aksi | Ditambahkan ke jadwal pada waktu simulasi |
| Kecepatan playback | 20× | 1×, 5×, 20× | Hanya pacing tampilan; default untuk demo singkat |

Batas runtime: maksimum 2.000 kedatangan total per replikasi dan 10 konfigurasi tersimpan. Ini batas sumber daya, bukan kapasitas antrean fisik. Pelanggaran membatalkan run dengan status LIMIT_REACHED; tidak boleh diam-diam membuang pelanggan atau menganggapnya hasil valid. A/B dengan satu replikasi gagal dinyatakan belum selesai/invalid secara keseluruhan, bukan dirata-ratakan dari pasangan yang tersisa.

Nama konfigurasi wajib 1–60 karakter setelah trim; karakter ditampilkan sebagai teks. Nilai kosong, NaN, Infinity, pecahan pada integer, angka di luar batas, dan jadwal tidak valid ditolak dengan pesan field yang spesifik. Jangan membulatkan atau membatasi diam-diam nilai yang dimasukkan pengguna.

### 6.3 State machine produk

| State | Aksi sah | Peralihan dan batas |
|---|---|---|
| READY | Edit, tambah/hapus loket, atur jadwal, simpan, run | Run → RUNNING; semua input tervalidasi |
| RUNNING | Pause, reset, speed, kamera, tambah pelanggan sebelum H | Pause → PAUSED; antrean habis setelah H → COMPLETED |
| PAUSED | Resume, reset, speed, kamera, tambah pelanggan sebelum H | SimTime tetap; resume → RUNNING |
| COMPLETED | Tinjau, jadikan A/B, replay, reset, simpan konfigurasi | Replay memakai snapshot dan log sama; reset → READY |
| ERROR / LIMIT_REACHED / CANCELLED | Lihat sebab, salin rincian non-sensitif, reset | Tidak boleh resume atau menganggap data parsial sebagai final; CANCELLED dipakai bila Selesaikan cepat dibatalkan |

Phase `arrivalsOpen` dan `draining` terpisah dari status playback; pause tetap mungkin selama draining. Run tanpa pelanggan selesai pada H dengan drain duration 0. Reset mengosongkan runtime, hasil, dan inputLog tambahan, mempertahankan parameter, jadwal awal serta root seed; UI menyebut “Reset run: hapus progres dan tambahan pelanggan selama run ini”. Replay mengulang snapshot dan inputLog yang sama dan bukan sinonim reset.

## 7. Requirements fungsional dan acceptance criteria

Setiap baris berikut wajib kecuali ditandai opsional. Pengujian menggunakan fixture bila acak tidak diperlukan.

| ID | Requirement | Acceptance criteria yang dapat diuji |
|---|---|---|
| FR-01 | Membuka workspace siap pakai | Pada kunjungan baru, preset default, parameter, seed, state READY dan kamera off terlihat; tidak perlu login atau izin kamera untuk run. |
| FR-02 | Tambah dan hapus loket manual | Di READY, klik Tambah loket menaikkan c satu dan langsung memperbarui label/scene; keyboard memberi hasil sama. Pada c=6 tambah nonaktif; pada c=1 kurangi nonaktif. |
| FR-03 | Atur arus otomatis | Slider dan input angka sinkron; λ=0 sah, tidak menjadwalkan kedatangan otomatis; nilai negatif atau >20 mencegah run dan menunjukkan sebab. |
| FR-04 | Atur pelayanan dan horizon | Input menerapkan rentang §6.2; a>b ditolak; a=b menghasilkan waktu pelayanan konstan; semua label menunjukkan satuan. |
| FR-05 | Tambahkan pelanggan manual | Pada t<H, satu aksi count=k menghasilkan tepat k kedatangan, log waktu/urutan stabil dan total diperbarui sesudah event diproses; pada pause event menunggu resume; t≥H menonaktifkan aksi dengan alasan. |
| FR-06 | Sediakan jadwal manual di READY | Daftar waktu dan jumlah dapat ditambah/dihapus sebelum run; waktu di luar [0,H) ditolak. Jadwal dapat berjalan bersama λ>0 atau sendirian dengan λ=0. |
| FR-07 | Run / pause / resume | Jalankan membekukan snapshot valid; pause menghentikan SimTime dan metrik; resume melanjutkan tanpa mengulang event. Sepuluh siklus pause tidak menggandakan pelanggan. |
| FR-08 | Reset dan replay terpisah | Reset run aktif memerlukan satu konfirmasi, cancel mempertahankan state; reset sukses memenuhi §6.3. Replay completed mereproduksi log hasil dengan snapshot yang sama. |
| FR-09 | Kunci konfigurasi run | c, λ, a, b, H dan seed tidak berubah saat run; edit menawarkan reset eksplisit. Mengubah speed dan kamera tidak mengubah snapshot fisik. |
| FR-10 | Playback independen model | Dengan snapshot dan input log sama, 1×/5×/20×, frame rate berbeda dan reduced motion menghasilkan event dan hasil numerik sama dalam toleransi §8.8. |
| FR-11 | Visualisasi 3D sesuai state | Loket sibuk menampilkan sedang melayani; pelanggan menunggu dan dilayani dibedakan melalui label/bentuk selain warna; angka canonical sesuai state engine pada update UI berikutnya. |
| FR-12 | Interaksi kamera scene manual | Rotate/pan/zoom memiliki tombol atau kontrol keyboard dan Reset tampilan; perubahan kamera scene tidak mengubah model; drag bukan prasyarat tugas inti. |
| FR-13 | Tampilkan metrik dan status | Panel menampilkan arrived, waiting, inService, completed, mean wait sementara, waktu simulasi dan phase. Final menampilkan seluruh metrik §8.5, unit, denominator, dan N/A sesuai kondisi. |
| FR-14 | Jelaskan asumsi | Pengguna dapat membuka model, FIFO, distribusi, kondisi awal kosong, horizon/drain, batas, dan status sintetis dari layar utama serta hasil. |
| FR-15 | Kendali seed | Seed tampil dan dapat diedit di READY; tombol seed baru opsional. Menjalankan snapshot+versi+log sama menghasilkan event sama; Math.random tanpa kontrak tidak boleh menjadi sumber model. |
| FR-16 | Baseline A dan kandidat B | Duplikasi A menghasilkan B identik; pengguna dapat mengubah c/a/b B; panel menunjukkan diff parameter, termasuk bila tidak ada perubahan. |
| FR-17 | Kunci fairness | λ, H, jadwal manual, root seed, initial state dan versi model sama pada A/B; input tidak sama memblokir label “perbandingan fair” dan menyediakan penyamaan parameter. |
| FR-18 | Batch 20 replikasi | Sistem menjalankan tepat 20 pasangan independen antar-replikasi, menampilkan progres 0–20; summary final hanya tersedia setelah semua run valid. CI hanya tersedia jika setiap pasangan memiliki N>0; batch dengan pasangan kosong memberi N/A sesuai §8.6. |
| FR-19 | Interpretasi perbandingan | Tampilkan mean per-replikasi A/B, delta B−A dan CI95% delta mean wait; label negatif berarti tunggu menurun. Tidak ada klaim unggul pasti bila CI melintasi/menyentuh 0. |
| FR-20 | Cancel / stale result | Batal batch tidak menyimpan summary parsial sebagai final; edit setelah hasil menandai snapshot lama, tidak mengganti nilainya dengan hasil draft. |
| FR-21 | Simpan lokal | Simpan nama valid menghasilkan satu slot berversi; refresh mempertahankan nilai termasuk seed dan jadwal tersimpan; status sukses muncul hanya setelah write berhasil. |
| FR-22 | Muat dan hapus lokal | Muat dari slot membuka READY dengan nilai sama; run aktif meminta konfirmasi reset. Hapus hanya slot yang dipilih dan meminta konfirmasi; tidak memakai clear seluruh origin. |
| FR-23 | Storage error aman | Storage ditolak/penuh/rusak tidak mematikan run; tampilkan “berjalan tanpa simpan lokal”. Record invalid tidak menimpa draft dan tidak dihapus otomatis. |
| FR-24 | Alternatif tekstual scene | Saat 3D gagal atau pengguna memilih tampilan ringan, kontrol, antrean count, status loket, statistik dan A/B tetap dapat digunakan. |
| FR-25 | Pintasan dan keyboard | Tab, Enter/Space dan panah input bekerja; tombol Pause/Resume dapat memakai Space hanya saat fokus workspace non-input; shortcut tidak aktif di text field, modal, atau kontrol slider. |
| FR-26 | Batas dan error model | Mencapai 2.001 pelanggan membatalkan run dengan LIMIT_REACHED, menampilkan jumlah terakhir dan cara mengurangi beban; hasil tidak diberi status final valid. |
| FR-27 | Eksperimen berlebih | Saat ρ≥1 tampilkan indikasi permintaan melampaui/menyamai kapasitas rata-rata; run tetap bisa dimulai, karena horizon finite; jangan menjanjikan kestabilan jangka panjang. |
| FR-28 | Tutorial ringkas | Petunjuk awal menjelaskan run, edit, tambah pelanggan dan A/B; dapat dilewati dan dibuka kembali; tidak meminta webcam. |
| FR-29 | Siklus tab tersembunyi | Tab hidden saat run memicu pause dan pesan ketika kembali; tidak melakukan catch-up berbasis waktu nyata. Saat kembali resume tetap tindakan eksplisit. |
| FR-30 | AirShift opt-in — opsional | Tombol aktifkan menampilkan penjelasan lalu meminta kamera; penolakan tetap menyisakan semua FR wajib; tombol matikan menghentikan semua track dan inferensi. |
| FR-31 | Gesture terbatas — opsional | Hanya pause/resume sesuai §9; aksi berulang saat gesture ditahan dicegah; confidence rendah dan tangan hilang tidak mengubah model. |
| FR-32 | Feedback AirShift — opsional | UI membedakan off/loading/ready/no-hand/low-confidence/error; status tidak hanya berupa warna; kegagalan tidak menjalankan aksi tertunda. |
| FR-33 | Drag and drop — Could | Bila disertakan, loket hanya pindah antar-slot sah di READY; klik pilih slot dan keyboard memberi hasil identik; posisi dekoratif tidak mengubah service time/routing. |
| FR-34 | Selesaikan run tanpa menunggu playback | Pada RUNNING/PAUSED, “Selesaikan cepat” memproses sisa event hingga drain selesai tanpa pacing animasi; input manual baru dinonaktifkan selama komputasi, jadwal/log yang sudah diterima tetap diproses. Hasil sama dengan replay normal; tombol batal tetap responsif dan membatalkan run sebagai nonfinal, bukan memotong cohort. |

## 8. Model simulasi, statistik, dan validasi

### 8.1 Batas fenomena yang dimodelkan

Model MVP adalah antrean tunggal FIFO, banyak loket identik, layanan non-preemptive, kapasitas antrean konseptual tak terbatas, kondisi awal kosong pada t=0. Pelanggan datang, menunggu bila seluruh loket sibuk, dilayani satu kali, lalu keluar. Tidak ada balking, reneging, prioritas, blocking, istirahat petugas, perpindahan jalur, menu, pembayaran terpisah, maupun jarak berjalan.

Avatar boleh berjalan untuk penjelasan visual, tetapi perjalanan tidak menambah waktu model. Tidak boleh mengklaim perubahan posisi loket meningkatkan performa karena jarak belum dimodelkan.

### 8.2 Distribusi dan unit

Seluruh perhitungan internal memakai detik simulasi dan angka presisi penuh. UI boleh membulatkan angka tampilan, bukan hasil perhitungan.

- Kedatangan otomatis mengikuti proses Poisson homogen dengan λ pelanggan/menit. Jeda `Δt = -ln(1-u) × 60/λ`, dengan `0<u<1`. Arrival pertama terjadi setelah satu jeda, bukan otomatis pada t=0. λ=0 tidak menggunakan rumus dan tidak membuat event otomatis.
- Pelayanan `S_i = a + (b-a) × v_i`, `0<v_i<1`; ketika a=b, `S_i=a`. Semua loket memakai distribusi sama dan waktu selalu positif.
- Kedatangan manual menambah event eksplisit di luar Poisson; total kedatangan saat manual aktif tidak boleh disebut murni Poisson. Batch k pelanggan memiliki waktu kedatangan sama dengan urutan ID stabil.
- Kedatangan diterima hanya jika `0≤arrivalAt<H`. Event persis di H tidak masuk cohort. Pelayanan yang selesai persis H dihitung selesai pada horizon.
- Pada H, kedatangan ditutup. Simulasi terus memproses seluruh pelanggan cohort sampai kosong (**drain**). Tidak ada warm-up: ini model periode dimulai kosong, bukan estimasi steady state.

Default `c=2, λ=4/menit, a=20, b=40` memberi E[S]=30 detik dan beban nominal `ρ = λ×E[S]/(60×c)=1`. Ini sengaja preset dekat kapasitas, bukan bukti performa kantin nyata. ρ dihitung hanya dari arus otomatis; saat ada manual, tampilkan catatan bahwa ρ tidak mencakup lonjakan manual. Tidak memakai formula steady-state untuk menggantikan hasil simulasi.

Preset tambahan yang dianjurkan: “Relatif lengang” c=2, λ=2, a=20, b=40; “Tambah kapasitas” c=3, λ=4, a=20, b=40; H=900 dan seed=2026 pada ketiganya. Jangan menulis angka hasil sebelum engine diuji.

### 8.3 Event dan penyelesaian tie

Sumber waktu adalah jam simulasi. Engine melompat ke kejadian berikutnya; renderer menampilkan state atau interpolasi visual tanpa mengatur event.

Pada setiap timestamp:

1. Integrasikan luas antrean dan waktu sibuk sejak timestamp sebelumnya, terpotong pada H untuk metrik horizon.
2. Selesaikan seluruh departure timestamp tersebut, urut ordinal loket lalu customer ID.
3. Masukkan seluruh arrival sah timestamp tersebut, urut sumber otomatis sebelum manual; dalam sumber gunakan sequence stabil.
4. Layani pelanggan FIFO ke loket idle dengan ordinal terendah. Pelanggan yang sudah mengantre selalu mendahului arrival baru.
5. Jadwalkan departure berdasarkan waktu layanan pelanggan yang telah ditentukan. Catat state sesudah timestamp selesai diproses.

Horizon dievaluasi setelah departure di H; tidak ada arrival di H. Sequence input manual pada timestamp sama disimpan dalam log. Loop arrival otomatis berhenti ketika next arrival≥H. Tie-break adalah bagian modelVersion dan diuji; urutan render/frame tidak boleh ikut menentukan hasil.

### 8.4 Randomness dan reproducibility

Kontrak reproducibility adalah kombinasi **snapshot parameter + root seed + algoritme seed/PRNG dan versinya + modelVersion + urutan input manual**. Seed saja tidak cukup bila input berubah.

- Gunakan PRNG deterministik dengan algoritme dan seed derivation yang dipilih serta dikunci paling lambat 28 Oktober. Dilarang mengandalkan RNG global browser untuk model. Seed nol harus dipetakan sah bila algoritme memiliki state terlarang.
- Pisahkan stream arrival dan service. Setiap replikasi mendapat stream berbeda dari root seed dan index replikasi; rumus derivasi harus menjadi kontrak berversi dan memiliki golden vectors.
- Service variate dipetakan berdasarkan customer ID, bukan “loket yang lebih dulu meminta random”. Ini menjaga pelanggan yang sama menerima v_i sama saat c berubah.
- Identitas otomatis mengikuti index arrival; identitas manual mengikuti entry schedule dan ordinal batch. Stream layanan otomatis/manual dipisahkan atau diturunkan berdasarkan identitas agar penambahan manual tidak menggeser variate pelanggan otomatis.
- A/B pada pasangan r memakai daftar arrival, ID, dan v_i yang sama. Parameter a/b boleh mengubah hasil transformasi v_i; c hanya mengubah penugasan pelayanan.
- Input eksplorasi dicatat pada waktu simulasi, termasuk batch saat pause. Replay menggunakan log yang dibekukan; tidak mengulang waktu klik nyata pengguna.
- Target identik lintas playback/perangkat dalam toleransi numerik §8.8 dan versi sama. Tidak menjanjikan hasil identik lintas versi engine tanpa migrasi/compatibility contract.

### 8.5 Definisi metrik

Misalkan pelanggan cohort i datang pada A_i, mulai dilayani pada B_i, dan selesai pada D_i. N adalah semua arrival sah sebelum H, termasuk manual. `Wq_i=B_i−A_i`, `S_i=D_i−B_i`, `W_i=D_i−A_i`. Setelah drain semua N pelanggan memiliki nilai lengkap.

| Metrik | Definisi / denominator | Aturan tampilan |
|---|---|---|
| Arrived | Semua arrival sah yang telah diproses | Pisahkan otomatis dan manual bila manual ada |
| Waiting / inService / completed | Jumlah state canonical saat waktu t | Invariant: arrived = waiting + inService + completed |
| Mean wait final | ΣWq_i/N atas seluruh cohort setelah drain | Detik; bukan hanya pelanggan yang cepat selesai |
| P95 wait final | Urutkan Wq; nearest-rank pada index ceil(0,95N), index mulai 1 | “95% pelanggan cohort menunggu ≤ nilai ini”; bukan CI |
| Mean time in system | ΣW_i/N setelah drain | Termasuk menunggu dan pelayanan |
| Mean actual service | ΣS_i/N | Membantu menjelaskan model dan hasil |
| Completed at H | Jumlah D_i≤H | Dibekukan pada H; berbeda dari completed final=N |
| Throughput pada horizon | Completed at H / (H/60) | Pelanggan/menit; tidak memakai completed setelah drain |
| Mean queue pada horizon | ∫₀ᴴ Q(t)dt/H | Time-weighted; Q tidak termasuk inService |
| Max queue pada horizon | Maksimum waiting setelah dispatch per timestamp, untuk t<H | Pelanggan langsung dilayani tidak dihitung menunggu |
| Utilization agregat | Σ_j busySeconds_j dalam [0,H] / (c×H) | 0–100%; tampilkan utilization tiap loket bila ruang cukup |
| Waiting at H | Pelanggan cohort yang belum mulai layanan pada H | Jelaskan backlog saat kedatangan ditutup |
| In service at H | Pelanggan dengan B_i≤H<D_i | Tidak sama dengan waiting at H |
| Drain duration | max(0, T_end−H), T_end=max(H, max_i D_i) | Waktu menyelesaikan sisa cohort |

Saat RUNNING, mean wait sementara dihitung hanya pada pelanggan yang **sudah mulai layanan**, dengan denominator terlihat. P95 dan cohort final tidak ditampilkan sebagai final sebelum drain selesai. Mean sementara bukan estimasi bebas bias atas seluruh cohort.

Jika N=0, mean wait/P95/time in system/mean service adalah N/A dengan “Belum ada pelanggan”, bukan 0. Count, throughput, mean queue, utilization dan drain duration tetap 0. Jika N>0 dan seluruh pelanggan langsung dilayani, mean/P95 wait sah bernilai 0.

### 8.6 Perbandingan fair dan ketidakpastian

**Yang dipasangkan:** permintaan, horizon, kondisi awal kosong, jadwal manual, stream arrival dan service variate, serta versi model. **Yang diubah:** c, a, b. Mengubah λ membentuk eksperimen permintaan lain; tidak didukung sebagai klaim peningkatan kapasitas A/B MVP.

Gunakan 20 replikasi independen antar-r. Untuk setiap pasangan valid, hitung `d_r = meanWait_B,r − meanWait_A,r`. Summary menggunakan rata-rata aritmetika mean tiap replikasi, bukan pooling pelanggan seluruh replikasi, dan menuliskan metode ini. Dengan 20 pasangan valid:

`meanDelta = Σd_r / 20`

`s_d = sqrt(Σ(d_r−meanDelta)² / 19)`

`CI95% = meanDelta ± 2,093024 × s_d / sqrt(20)`

Angka kritis adalah Student-t df=19. Rumus dan interpretasi interval mean merujuk NIST [R3]; penerapan pada selisih replikasi adalah keputusan analisis PRD ini. Interval ini pendekatan dengan asumsi mean selisih antar-replikasi cukup layak untuk pendekatan t; 20 replikasi bukan jaminan akurasi pada distribusi sangat menceng. UI menyebut “estimasi dari 20 replikasi sintetis”, bukan kepastian atau prediksi lapangan.

Aturan interpretasi:

- CI seluruhnya <0: “Waktu tunggu rata-rata B lebih rendah pada eksperimen ini.”
- CI seluruhnya >0: “Waktu tunggu rata-rata B lebih tinggi pada eksperimen ini.”
- CI mencakup/menyentuh 0: “Arah perbedaan belum meyakinkan pada percobaan ini.”
- A=B identik: delta=0, CI=[0,0], label “Skenario identik”.
- Bila baseline mean=0, persentase perubahan adalah N/A; delta absolut tetap tersedia.
- Bila satu pasangan N=0, mean wait pasangan tidak terdefinisi; jangan keluarkan pasangan diam-diam. Batalkan ringkasan inferensial, tampilkan “Data pelanggan tidak cukup untuk CI” dan count replikasi kosong. Metrik count tetap dapat ditinjau; pengguna dapat menaikkan λ, horizon, atau memberi jadwal manual sama.

CI wajib hanya untuk delta mean wait. P95, throughput, mean queue, utilization, dan drain duration dapat ditampilkan sebagai rata-rata metrik per replikasi dengan label tersebut; tanpa CI tidak boleh diberi klaim signifikansi. Mean dari P95 replikasi harus disebut “rata-rata P95 per replikasi”, bukan P95 gabungan.

### 8.7 Validitas yang boleh diklaim

1. **Verifikasi implementasi:** model mengikuti kontrak, invariant, fixture deterministik dan replay. Ini wajib sebelum rilis.
2. **Pemeriksaan distribusi:** generator menghasilkan sampel sesuai rumus, mean dan varians wajar pada fixed seeds, diuji terpisah dari UI.
3. **Validasi domain:** belum tersedia data lapangan; kesesuaian Poisson/uniform, kondisi awal, dan loket identik belum dibuktikan. Jangan menyebut MVP sebagai digital twin terkalibrasi.

Tidak menggunakan Little’s Law steady-state sebagai satu-satunya pembuktian run finite yang dimulai kosong. Identitas integral pada seluruh cohort dapat dipakai sebagai pemeriksaan konservasi: area jumlah dalam sistem selama [0,T_end] = ΣW_i; area antrean pada rentang sama = ΣWq_i.

### 8.8 Fixture numerik wajib

Fixture mematikan arrival otomatis dan memakai waktu layanan deterministik; ini jalur pengujian, bukan editor distribusi tambahan.

| ID | Input | Hasil yang harus didapat |
|---|---|---|
| ST-01 | c=1, H=60, a=b=10; arrival [0,0,0] | Start [0,10,20], departure [10,20,30]; waits [0,10,20]; mean wait=10, P95=20, mean system=20; mean queue horizon=0,5; utilization=0,5; throughput=3/menit; drain=0. |
| ST-02 | c=2; input lain ST-01 | Loket pertama dan kedua melayani dua pelanggan awal; start [0,0,10], departure [10,10,20]; mean wait=10/3; mean queue=1/6; utilization agregat=0,25. |
| ST-03 | c=1,H=60,a=b=10; arrival [0,10] | Departure pelanggan pertama dan arrival kedua bersamaan; waits [0,0]; max waiting sesudah dispatch=0; tidak ada double assignment. |
| ST-04 | c=1,H=60,a=b=20; arrival [50] dan percobaan arrival [60] | Arrival 60 ditolak dari cohort; completed at H=0, inService at H=1; utilization=10/60; final wait=0, final system=20, drain=10. |
| ST-05 | λ=0, tidak ada manual, H=60 | Selesai pada 60; count=0, utilization/throughput=0, mean/P95=N/A, drain=0; tidak ada NaN. |
| ST-06 | Skenario A=B, seed dan log sama; 20 replikasi berisi pelanggan | Seluruh event tiap pasangan sama, setiap d_r=0, CI=[0,0]. |
| ST-07 | Replay snapshot/log pada tiga speed dan pause di timestamp diketahui | Urutan event dan counts identik; selisih angka waktu/metrik ≤10⁻⁸ detik atau ≤10⁻¹⁰ relatif, ambil toleransi lebih besar. |
| ST-08 | Input manual pada pause t=10 count=3, lalu resume | Tiga arrival tepat t=10, sequence stabil; tidak muncul sebelum resume; replay menghasilkan hasil sama. |
| ST-09 | 20 nilai selisih fixture: sepuluh −1 dan sepuluh +1 detik | meanDelta=0; sample variance=20/19; half-width=2,093024/√19≈0,4802 detik; label belum meyakinkan. |
| ST-10 | Konfigurasi sah dengan jadwal tepat 2.000 pelanggan pada t=0, ditambah satu arrival otomatis sebelum H melalui fixture generator | Arrival otomatis tambahan memicu LIMIT_REACHED; tidak ada valid final summary atau penghilangan pelanggan diam-diam. Jadwal awal >2.000 diuji terpisah sebagai input ditolak sebelum run. |

Dalam fixture yang selesai valid, setiap pelanggan dilayani tepat sekali hingga completed=N. Pada semua state parsial maupun final, waktu tidak mundur, wait yang sudah terdefinisi≥0, start≥arrival, departure=start+service bila selesai, busy≤c, dan konservasi pelanggan yang sudah diterima berlaku. Pada ST-10, pelanggan pemicu batas tidak diterima dan run diberi invalid; pelanggan yang sudah diterima tidak hilang dari state parsial. Bandingkan angka sebelum pembulatan tampilan.

## 9. AirShift, kontrol manual, dan fallback

### 9.1 Prinsip kontrol

Manual adalah jalur default dan sumber kemampuan penuh. AirShift di PRD ini adalah nama pengalaman gesture opsional; ketersediaan SDK/library dengan nama tersebut belum diasumsikan. Pemilihan teknologi pengenalan tangan harus dibuktikan melalui spike, termasuk lisensi, pemrosesan lokal, dan dukungan browser.

| Operasi | Kontrol wajib | Gesture MVP |
|---|---|---|
| Tambah/hapus loket | Tombol +/− dan input angka, keyboard | Tidak diperlukan |
| Atur kedatangan dan layanan | Slider plus input angka | Tidak diperlukan |
| Tambah pelanggan | Tombol, input jumlah, Enter | Tidak diperlukan |
| Mulai dari READY | Tombol Jalankan | Tidak didukung untuk mencegah start tidak sengaja |
| Pause | Tombol dan shortcut kontekstual | Telapak tangan terbuka, jika AirShift aktif |
| Resume | Tombol dan shortcut kontekstual | Jempol ke atas, jika AirShift aktif |
| Reset / hapus / simpan | Tombol dengan label dan konfirmasi yang relevan | Tidak didukung |
| Kamera scene | Tombol pan/rotate/zoom dan Reset tampilan | Tidak diperlukan |

### 9.2 Kontrak pengenalan bila disertakan

- Pengguna sengaja menekan “Aktifkan AirShift”; izin kamera tidak pernah muncul saat halaman dibuka. Audio selalu off.
- Tampilkan preview kecil opsional, instruksi posisi tangan, status kamera dan tombol matikan yang tetap dapat dijangkau keyboard.
- Satu tangan digunakan. Bila lebih dari satu terdeteksi, tampilkan “Gunakan satu tangan” dan jangan mengeksekusi aksi.
- Ambang awal confidence ≥0,85, pose stabil selama ≥600 ms menurut clock nyata; hasil stale >200 ms diabaikan. Angka ini baseline yang harus diuji, bukan klaim akurasi model.
- Satu pose mengeksekusi paling banyak satu aksi. Untuk re-arm, pose harus netral/hilang ≥300 ms, disertai cooldown ≥1.500 ms sejak aksi terakhir. Gesture ditahan tidak mengulang aksi.
- Open palm hanya mem-pause RUNNING. Thumbs up hanya me-resume PAUSED yang dipause manual/gesture; pause akibat hidden tab atau error tidak dapat dipulihkan gesture.
- Tidak ada perubahan c/λ/a/b, penambahan pelanggan, reset, hapus, atau penyimpanan akibat gesture.
- Gesture diabaikan saat modal terbuka, batch A/B aktif, tab hidden, atau fokus pengguna berada di input teks. Feedback menjelaskan bahwa gesture sementara tidak tersedia.
- Bila confidence tidak memadai/tangan hilang >500 ms: hentikan progress dwell, jangan eksekusi aksi, tampilkan petunjuk; run melanjutkan state terakhir. Kamera putus membuat AirShift off/error, bukan reset simulasi.
- Kamera off, navigasi, atau hidden tab menghentikan media track dan inferensi; pengaktifan kembali perlu klik eksplisit. Jangan menampilkan status ready bila track telah berhenti.

### 9.3 Gate AirShift

Sebelum 13 November, uji minimal tiga orang dengan dua kondisi pencahayaan, masing-masing 10 percobaan per pose per kondisi. Target ≥90% aksi sah dikenali dalam ≤2 detik; hitung keberhasilan dengan denominator jelas. Uji gerakan non-perintah total ≥10 menit dengan target nol aksi tidak sengaja. Selesaikan satu alur inti dengan kamera ditolak, tidak ditemukan, dan dicabut di tengah run.

Jika gate gagal atau mengganggu Must, hapus entry point gesture dari build submission dan jelaskan “AirShift direncanakan, belum termasuk MVP yang disubmit”. Jangan menampilkan tombol placeholder atau menyebut gesture sebagai fitur berhasil. Ketiadaan AirShift tidak memblokir release MVP manual.

## 10. Requirements nonfungsional

Target berikut adalah budget penerimaan, belum hasil benchmark. Catat perangkat, OS, browser, build, konfigurasi dan network ketika diuji.

| ID | Area dan requirement | Acceptance criteria |
|---|---|---|
| NFR-01 | Akurasi dan determinisme | ST-01–10 dan invariant lulus; input log serta versi tersedia di ringkasan diagnostik; render tidak memengaruhi hasil. |
| NFR-02 | Respons kontrol | Pada perangkat acuan, 95 dari 100 klik pause/resume/input mendapat feedback UI ≤100 ms; pause engine ≤100 ms; batch tidak membekukan tombol batal. |
| NFR-03 | Render | Perangkat acuan: median ≥30 FPS selama 60 detik preset default pada viewport 1366×768, webcam off; saat avatar ramai boleh dibatasi visualnya, count model tetap penuh. |
| NFR-04 | Komputasi cepat | A/B 20 pasangan selesai ≤10 detik dan Selesaikan cepat ≤2 detik pada preset default di perangkat acuan; UI tetap responsif, progress diperbarui ≥sekali/500 ms selama pekerjaan berlangsung. Batal menghentikan pekerjaan baru ≤500 ms. |
| NFR-05 | Startup | Cold load sampai kontrol dapat dipakai ≤5 detik pada 10 Mbps dan RTT 100 ms; kamera/model gesture tidak menghalangi startup dan dimuat setelah opt-in. |
| NFR-06 | Aksesibilitas | Semua tugas Must dengan keyboard; fokus terlihat, urutan masuk akal, tidak terjebak canvas/modal; target WCAG 2.2 AA pada komponen produk. Rasio teks ≥4,5:1, teks besar ≥3:1, kontrol/fokus ≥3:1; target sentuh minimum 24×24 CSS px atau spacing yang memenuhi kriteria; audit otomatis plus manual. |
| NFR-07 | Alternatif dan gerak | Informasi tidak hanya mengandalkan warna/3D; reduced motion menonaktifkan gerak dekoratif/interpolasi; screen reader membaca kontrol, state dan ringkasan tanpa membacakan setiap event pelanggan. |
| NFR-08 | Responsivitas | 1280×720 ke atas nyaman dengan panel berdampingan; 768–1279 panel bertumpuk/tab; 360–767 kontrol dan hasil tetap terjangkau, canvas boleh diperkecil/collapsed. Zoom browser 200% tidak menutup aksi inti atau menyebabkan scroll horizontal halaman. |
| NFR-09 | Kompatibilitas | Must diuji pada Chrome, Edge dan Firefox desktop stabil yang tersedia saat QA; Safari desktop bila perangkat tersedia. Versi aktual dicatat; dukungan tidak diasumsikan dari nama engine browser. AirShift boleh punya subset dukungan dengan label. |
| NFR-10 | Resiliensi grafis | WebGL unavailable/context lost berpindah ke tampilan tekstual; snapshot dan hasil yang masih sah dipertahankan; kegagalan renderer tidak dianggap kegagalan statistik. |
| NFR-11 | Privasi | Tidak ada frame, video, landmark, atau analytics dikirim; inspeksi network saat AirShift aktif membuktikan ini; camera track stopped saat off/hidden/unmount. |
| NFR-12 | Keamanan data dan input | Semua konfigurasi termasuk storage lama tervalidasi; nama tidak dieksekusi sebagai HTML; tidak ada secret client; origin produksi HTTPS; dependency dan lisensi ditinjau sebelum release. |
| NFR-13 | Integritas penyimpanan | Write gagal tidak menimpa konfigurasi valid terakhir; record incompatible ditolak dengan pesan; menghapus data TomorrowLab tidak menghapus storage app lain. |
| NFR-14 | Ketahanan resource | Avatar yang dirender maksimal 150; di atasnya gunakan representasi agregat dengan label “X pelanggan diringkas”. Engine tetap memproses sampai batas model. Uji reset/run berulang 20 kali tanpa track/worker/job tertinggal. |
| NFR-15 | Ketersediaan demo | Tautan publik tanpa login, tanpa secret, dapat dibuka di profil browser baru; tetap tersedia hingga sekurangnya 26 November 2026 pukul 05.00 WIB. |

Perangkat acuan awal: laptop RAM 8 GB, CPU setara Intel Core i5 generasi ke-10, GPU terintegrasi, viewport 1366×768. Tim menetapkan satu mesin aktual paling lambat 28 Oktober dan mencatat perbedaannya; tidak mengklaim hasil pada perangkat ini sebelum diuji. Bila perangkat lebih lemah, mode ringan tetap harus menyelesaikan fungsi inti. Target performa tidak menjadikan kamera syarat perangkat.

Klaim “aksesibel” berarti memenuhi checklist yang diuji; sertifikasi penuh WCAG tidak diklaim tanpa audit menyeluruh. Referensi resmi WCAG tercantum pada R4.

## 11. Error states, privasi, dan keamanan

### 11.1 Matriks kegagalan

| Kondisi | Respons produk dan pesan contoh | Pemulihan / integritas |
|---|---|---|
| Parameter invalid | Pesan pada field: “Waktu maksimum harus ≥ minimum.” | Fokus ke error pertama; run/bandingkan tidak dimulai |
| λ=0 dan jadwal kosong | Info “Tidak ada pelanggan terjadwal.” | Run tetap sah; hasil kosong sesuai §8.5 |
| Beban otomatis ρ≥1 | Info “Antrean dapat terus bertambah selama jam kedatangan.” | Boleh run; bukan error |
| Batas 2.000 terlampaui | “Batas percobaan tercapai; kurangi durasi atau kedatangan.” | Stop invalid, pertahankan draft, tidak klaim hasil final |
| Invariant / waktu non-finite | “Simulasi dihentikan karena perhitungan tidak valid.” | Stop engine, jangan teruskan hasil; reset tersedia, rincian non-sensitif |
| WebGL gagal / context lost | “Tampilan 3D tidak tersedia. Gunakan tampilan ringkas.” | Kontrol dan metrik tetap bekerja; model tidak di-reset |
| Kamera ditolak / tidak ada / sibuk | “AirShift belum aktif. Semua kontrol manual tetap tersedia.” | Tidak mengulang prompt otomatis; tombol coba lagi eksplisit |
| Kamera putus / model gagal dimuat | AirShift error/off dengan sebab singkat | Stop inferensi/tracks, buang gesture tertunda; state run tetap |
| Storage penuh / dilarang | “Konfigurasi belum tersimpan; browser menolak penyimpanan.” | Run lanjut di memori, record lama tidak dihapus |
| Sepuluh slot sudah terisi | “Penyimpanan penuh: pilih konfigurasi untuk diganti atau hapus satu slot.” | Penggantian memerlukan pilihan dan konfirmasi eksplisit; tidak menimpa slot lain otomatis |
| Record rusak / versi baru | “Konfigurasi ini tidak dapat dimuat oleh versi aplikasi ini.” | Pertahankan record, jangan setengah memuat; hapus hanya jika dipilih pengguna |
| Tab hidden | Pause dan hentikan kamera | Tampilkan sebab; resume dan kamera opt-in lagi |
| Offline setelah initial load | Komponen yang sudah tersedia tetap bekerja; tampilkan kegagalan asset bila ada | Tidak menjanjikan cold-start offline/PWA; AirShift boleh tidak tersedia |
| A/B dibatalkan / satu pasangan invalid | “Perbandingan belum selesai.” | Summary parsial tidak diberi CI final; hasil lengkap sebelumnya tetap ada |
| Perubahan draft setelah hasil | Label “Hasil dari konfigurasi sebelumnya” | Snapshot hasil tetap dapat dibuka; rerun eksplisit |

### 11.2 Data dan lifecycle

| Data | Lokasi | Retensi | Kontrol pengguna |
|---|---|---|---|
| Konfigurasi, seed, jadwal manual tersimpan | Browser origin TomorrowLab | Hingga dihapus atau storage browser dibersihkan | Simpan, muat, hapus per item; hapus seluruh data TomorrowLab dengan konfirmasi |
| Runtime, input log belum disimpan, hasil A/B | Memori sesi | Hingga reset/refresh/tutup tab | Reset dengan penjelasan dampak |
| Video webcam dan landmark sementara | Memori lokal proses inferensi | Hanya selama AirShift aktif; frame tidak disimpan | Kamera off menghentikan track/inferensi dan melepas buffer yang dikuasai app |
| Static access logs hosting | Bergantung penyedia hosting | Sesuai kebijakan penyedia yang dipilih | Nyatakan kebijakan yang berlaku; jangan menjanjikan tidak ada server log sama sekali |

Tidak meminta nama, email, lokasi, atau data mahasiswa. Jangan memasukkan informasi pribadi ke nama konfigurasi pada demo bersama. Preview kamera tidak masuk ekspor maupun rekaman demo tanpa persetujuan orang terkait.

### 11.3 Batas keamanan

- Input dari UI dan local storage sama-sama tidak tepercaya; validasi struktur, tipe, versi, rentang, jumlah entry, dan ukuran total.
- Payload tersimpan maksimal 100 KB per konfigurasi, jadwal maksimal 2.000 pelanggan total; tolak record berlebih sebelum membangun runtime. Batas ini juga berlaku pada jadwal yang diedit langsung.
- Tidak menjalankan script/eval dari konfigurasi, nama, atau URL. Tidak menyediakan import file/URL arbitrer pada MVP.
- Aset dan model gesture di-host pada origin yang dikendalikan atau sumber yang sudah direview. Catat bila asset fetch membutuhkan internet; tidak mengirim frame untuk inference cloud.
- Produksi menggunakan HTTPS; akses kamera dibatasi untuk origin aplikasi, microphone tidak diminta. Terapkan kebijakan resource yang sesuai hosting dan dependency tanpa memutus asset sah.
- Jika engine/model/library berlisensi tidak jelas atau mensyaratkan pengiriman gambar ke pihak lain, jangan sertakan AirShift dalam MVP.
- Local storage bukan enkripsi dan bukan cadangan permanen. UI menyatakan “Tersimpan di browser ini”; berpindah perangkat atau membersihkan browser dapat menghilangkan data.

## 12. Strategi pengujian dan kriteria rilis

### 12.1 Lapisan pengujian

| ID | Lapisan | Bukti minimum | Requirements terkait |
|---|---|---|---|
| QA-01 | Unit model | ST-01–05, event tie, FIFO, pemilihan loket, horizon, drain | FR-03–10, FR-13, NFR-01 |
| QA-02 | Determinisme dan pairing | Golden vectors PRNG/seed, replay tanpa duplikasi jadwal/log, A=B, ID mapping saat c berubah | FR-15–19, ST-06–09 |
| QA-03 | Invariant dan generatif | Fixed corpus ≥100 seed × kombinasi rendah/sedang/overload dalam rentang; konservasi, nonnegative wait, waktu monoton | FR-26–27, NFR-01 |
| QA-04 | Distribusi | Sampel fixed seed ≥100.000 uniform/service dan interarrival; mean dalam 5 standard error teoritis; varians relatif menyimpang ≤5%; λ=0 dan a=b diuji terpisah | §8.2–8.4 |
| QA-05 | Metrik | Integral queue/busy, batas H, cohort vs horizon, N/A, P95 nearest-rank, CI fixture dan baseline 0; batch dengan satu pasangan kosong menghasilkan CI N/A tanpa membuang pasangan | FR-13, FR-18–19, ST-01–09 |
| QA-06 | Integrasi state | Pause/resume/reset/cancel berulang, input pause, hidden tab, hasil stale, stop invalid | FR-05–09, FR-20, FR-26, FR-29 |
| QA-07 | Penyimpanan | Save/refresh/load/delete, 10 slot penuh, write gagal, JSON rusak, schema unsupported, nama HTML tampil literal | FR-21–23, NFR-12–13 |
| QA-08 | End-to-end manual | UC-01–06 pada tiap browser wajib, kamera off, fallback WebGL, Selesaikan cepat dan batal | FR-01–29, FR-34 |
| QA-09 | Aksesibilitas | Keyboard-only, screen reader satu kombinasi desktop, fokus modal, zoom 200%, kontras, reduced motion, viewport minimum | FR-24–25, NFR-06–08 |
| QA-10 | Performa dan resource | Startup, latency, FPS, batch, cancel, 2.000 pelanggan, 20 siklus run/reset | NFR-02–05, NFR-14 |
| QA-11 | Kamera dan privasi | Bila AirShift disertakan: gate §9.3, permission denied, disconnect, hidden, traffic inspection, track berhenti | FR-30–32, NFR-11 |
| QA-12 | Usability dan submission | 5 peserta formatif bila tersedia; demo tanpa login, tautan/rekaman/submission diuji dengan profil baru | G-01–05, NFR-15 |

Uji distribusi adalah sanity check deterministik, bukan bukti statistik bahwa generator sempurna. Saat gagal, periksa implementasi dan fixture; jangan memilih seed baru hanya agar tes lolos. Tidak menuntut sampel acak kebetulan menghasilkan nilai output tertentu dalam uji UI.

### 12.2 Klasifikasi issue

- **Blocker:** app tidak bisa digunakan; model salah; seed/log tidak reproducible; pairing tidak fair; data tersimpan rusak/terhapus tanpa permintaan; kamera mengirim atau merekam data tanpa perilaku yang dijanjikan.
- **Major:** alur wajib gagal di browser wajib; keyboard menghalangi tugas; hasil provisional terlihat final; unit/denominator salah; storage error mematikan app.
- **Minor:** gangguan visual/copy yang tidak mengubah hasil atau menghalangi tugas. Boleh tersisa dengan owner dan workaround yang jelas.

### 12.3 Definition of Ready untuk implementasi

Scope Must, domain dan unit disepakati; peran terisi; perangkat/browser acuan ditetapkan; algoritme PRNG dan versi seed derivation dipilih; akses hosting dan jadwal tersedia; tim memahami perbedaan hasil sintetis dan validasi lapangan. Open question nonblokir memiliki default pada §15.2.

### 12.4 Definition of Done dan release gate

1. Semua FR wajib dan NFR wajib memiliki bukti pass pada build release candidate; tidak ada blocker/major terbuka.
2. Fixture numerik dan invariant lulus; ringkasan hasil menampilkan seed, snapshot, model/engine/RNG version, horizon dan metode replikasi.
3. Pengguna dapat menambah loket, mengatur kedatangan, menambah pelanggan, run/pause/reset, A/B, serta simpan/muat tanpa kamera.
4. Statistik cohort sudah melalui drain; statistik horizon tidak bercampur; A/B menggunakan 20 pasangan valid atau secara eksplisit tidak memberi summary inferensial.
5. 3D berjalan pada perangkat acuan; kegagalan 3D tetap punya alternatif fungsional. Tidak ada angka statistik yang berasal dari avatar.
6. Kamera tidak aktif otomatis. Jika gesture dirilis, gate §9.3 dan inspeksi privasi lulus; bila tidak, semua klaim submission disesuaikan.
7. G-01/02 diuji secara formatif bila peserta tersedia. Jika tidak tercapai, perbaiki hambatan tugas sebelum submit; kegagalan memperoleh peserta dicatat terbuka, tanpa klaim validasi pengguna.
8. Demo publik dan petunjuk singkat dapat diakses tanpa akun; tautan diverifikasi di profil browser baru, termasuk mode kamera ditolak.
9. Deskripsi submission menyebut masalah, kemampuan aktual, teknologi, kontribusi, keterbatasan, serta sumber/lisensi aset dan bantuan alat sesuai aturan lomba [R2]. Materi tidak menyatakan fitur rencana sebagai fitur jadi.
10. Submission diterima sebelum deadline; screenshot/konfirmasi disimpan oleh tim. Build dan tautan penjurian dijaga aktif sesuai jadwal resmi.

Materi submission adalah pekerjaan pelaksanaan berikutnya; PRD ini hanya menentukan kebutuhan, tidak membuat file atau mengirim submission.

## 13. Rencana pelaksanaan hingga deadline

### 13.1 Basis perencanaan

Periode rencana 26 Oktober–21 November 2026, sekitar 26 hari kalender. Estimasi dasar membutuhkan sekitar 120–160 jam kerja fokus tim total, termasuk QA dan submission; ini asumsi kapasitas, bukan komitmen anggota yang sudah dikonfirmasi. Tugas dapat dirangkap atau berjalan paralel bila anggota tersedia. Bila kapasitas aktual lebih rendah, potong Should/Could terlebih dahulu; jangan menurunkan kebenaran model atau akses manual.

Deadline Devpost adalah 20 November 2026 pukul 17.00 EST [R1]. EST=UTC−5 dan WIB=UTC+7, sehingga tenggat lokal **21 November 2026 pukul 05.00 WIB**. Semua jadwal di bawah memakai WIB. Jangan mengandalkan hitung mundur lokal tanpa memeriksa halaman resmi kembali.

| Tanggal | Fokus dan output | Gate selesai | Owner peran |
|---|---|---|---|
| 26–28 Okt | Kunci scope, PRNG, model, perangkat acuan; validasi akses hosting dan persyaratan peserta | Input contract, seed vectors dan fixture rencana tersedia; open question implementasi terjawab | Produk + simulasi + submission |
| 29 Okt–2 Nov | Engine event-driven, state, metrik, drain dan penambahan manual | ST-01–05, ST-08, invariant dasar lulus tanpa ketergantungan 3D | Simulasi |
| 3–6 Nov | Workspace, kontrol manual, 3D, teks alternatif, responsive layout | UC-01–03 end-to-end; kamera off; render tidak mengubah hasil | Pengalaman + QA |
| 7–10 Nov | A/B, 20 replikasi, CI, snapshot/replay, storage lokal | ST-06–10, fairness, persistence/error tests lulus | Simulasi + pengalaman |
| 11–13 Nov | Spike/implementasi gesture opsional; performa dan aksesibilitas awal | Putuskan go/no-go AirShift paling lambat 13 Nov pukul 20.00 | Pengalaman + QA |
| 14–17 Nov | Uji peserta, browser, batas resource, privacy dan fallback | Hambatan alur utama diketahui dan diperbaiki; bukti uji tersusun | QA + produk |
| 18 Nov | Feature freeze, release candidate | Seluruh Must selesai; hanya bugfix dan perapian submission | Seluruh tim |
| 19 Nov | Regression final, pemeriksaan demo/rekaman dan copy klaim | Tidak ada blocker/major; tautan di browser baru lulus | QA + submission |
| 20 Nov, sebelum 20.00 | Kirim dan verifikasi submission | Status terkirim terkonfirmasi; tautan benar | Submission |
| 20 Nov 20.00–21 Nov 04.00 | Buffer hanya untuk gangguan akses/submission atau blocker | Tidak ada eksperimen fitur baru; cek ulang kiriman | Submission + owner terkait |
| 21 Nov, 05.00 | Deadline resmi | Perubahan baru tidak diandalkan setelah batas ini | Submission |

Jalur kritis: kontrak model → engine terverifikasi → kontrol manual → pairing/statistik → QA → submission. 3D sederhana dapat berjalan bersama integrasi UI. AirShift dan drag and drop tidak boleh berada di jalur kritis.

### 13.2 Kebijakan pemotongan scope

1. Hapus drag and drop, grafik tambahan, ekspor, dekorasi scene dan preset tambahan.
2. Hapus AirShift bila belum lulus gate; tetap ungkapkan status sebenarnya.
3. Kurangi kerumitan visual 3D, jumlah avatar, dan animasi. Pertahankan scene 3D sederhana dan alternatif tekstual.
4. Pertahankan satu model, satu baseline dan satu kandidat, serta 20 replikasi. Jangan mengganti fairness dengan perbandingan acak dua run.
5. Jika Must belum lulus 18 November, fokus perbaikan blocker/major. Jangan menyebut fitur belum teruji sebagai selesai; penanggung jawab produk menentukan kelayakan submission dengan keterbatasan yang jujur.

## 14. Risiko, dependensi, dan pengendalian scope

### 14.1 Risk register

P=probabilitas, D=dampak; R=rendah, S=sedang, T=tinggi. Penilaian awal bersifat kualitatif dan perlu ditinjau selama pelaksanaan.

| ID | Risiko | P / D | Pemicu awal | Mitigasi dan fallback | Owner |
|---|---|---|---|---|---|
| RK-01 | Waktu habis karena scope melebar | T/T | Must belum terintegrasi 10 Nov | Freeze; pangkas Could/Should; alokasikan buffer QA/submission | Produk |
| RK-02 | Statistik tampak meyakinkan tetapi salah | S/T | Angka UI tidak cocok fixture; cohort belum lengkap | Metrik canonical, drain, invariant, review fixture sebelum visual polish | Simulasi |
| RK-03 | A/B tidak fair karena RNG tergeser | S/T | A=B memberi delta; service berubah ketika c berubah | Per-customer variate, stream terpisah, pairing fixture dan golden vectors | Simulasi |
| RK-04 | Frame rate memengaruhi hasil | S/T | Seed sama berbeda saat speed berubah | Pisahkan event clock dari render, replay lintas speed | Simulasi |
| RK-05 | Gesture tidak andal atau SDK tidak tersedia | T/S | Aksi palsu, pencahayaan buruk, lisensi tidak jelas | Dua gesture saja; manual lengkap; go/no-go 13 Nov | Pengalaman |
| RK-06 | GPU/perangkat tidak kuat | S/S | FPS rendah, context lost | Avatar agregat, mode ringan, alternatif teks; jaga perhitungan penuh | Pengalaman |
| RK-07 | Storage browser gagal/hilang | S/S | Quota, private mode, schema berbeda | Status simpan jujur, validasi, tidak overwrite data invalid, mode memori | Pengalaman |
| RK-08 | Kamera/landmark bocor | R/T | Network request membawa data kamera | Inferensi lokal, inspeksi network, stop tracks, tanpa telemetry | Pengalaman + QA |
| RK-09 | Model dianggap prediksi nyata | S/T | Copy “optimal/akurasi” tanpa data | Label sintetis, asumsi terlihat, pisahkan verifikasi dari kalibrasi | Produk |
| RK-10 | Batch overload membekukan UI | S/T | Tombol batal macet, pelanggan terlalu banyak | Batas input/runtime, chunk/yield atau mekanisme komputasi terpisah yang sesuai; fail jelas | Simulasi |
| RK-11 | Gagal submit atau demo tidak dapat diakses | S/T | Akun/tautan belum diuji 18 Nov | Target submit 9 jam lebih awal; rekaman walkthrough cadangan; uji profil baru | Submission |
| RK-12 | Persyaratan lomba/eligibility tidak terpenuhi | Belum diketahui/T | Status mahasiswa/usia/geografi belum dicek | Owner memeriksa aturan resmi pada kickoff dan sebelum submit; jangan mengklaim eligible tanpa bukti | Submission |
| RK-13 | CI disalahartikan atau sampel kurang | S/S | Klaim pasti dari 20 replikasi, run kosong | Label estimasi, CI delta, N/A/empty gate, tanpa persentase saat baseline nol | Produk + simulasi |
| RK-14 | Peserta uji tidak tersedia | S/S | Belum ada jadwal uji 12 Nov | Rekrut lebih awal; fallback uji internal dengan label keterbatasan | QA |

### 14.2 Dependensi

| Dependensi | Status / batas | Rencana jika gagal |
|---|---|---|
| Browser dengan WebGL | Dibutuhkan untuk pengalaman 3D; dukungan aktual diuji | Alternatif teks tetap menjalankan model |
| Kamera + izin + secure context | Hanya untuk AirShift | Semua tugas inti manual |
| Library inferensi tangan lokal | Belum dipilih; spike lisensi dan latency | AirShift dikeluarkan dari build |
| PRNG dan perhitungan statistik | Algoritme/versi harus dikunci; Student-t df19 fixed untuk n=20 | Pilih implementasi deterministik teruji, golden vectors; tidak menambah fleksibilitas n tanpa kebutuhan |
| Library rendering/UI | Belum ditentukan PRD; harus mendukung semantik kontrol dan ukuran bundle | Gunakan pilihan sederhana yang tim kuasai |
| Hosting HTTPS dan URL publik | Belum ditetapkan; wajib diverifikasi sebelum 18 Nov | Build statis yang sama pada host cadangan; rekaman sebagai pendukung |
| Akun dan formulir Devpost | Dikelola peserta; eligibility belum diverifikasi | Selesaikan sebelum hari submit, eskalasi ke penyelenggara bila perlu oleh pemilik akun |
| Data lapangan | Tidak tersedia dan tidak diperlukan untuk MVP sintetis | Tidak mengklaim validasi operasional |
| Asset/font/model 3D | Lisensi dan ukuran ditinjau | Geometri sederhana dan font yang sah; artwork kustom hanya bila menambah nilai |

Keputusan framework, struktur modul, deployment pipeline dan pemisahan worker adalah keputusan implementasi berikutnya. PRD menetapkan perilaku dan budget; tidak memaksa stack yang belum diperiksa tim.

### 14.3 Perubahan scope

Perubahan Must, distribusi, horizon/cohort, seed derivation, tie-break atau formula metrik memerlukan revisi PRD dan pengujian ulang terkait. Perubahan semantik model menaikkan modelVersion; perubahan bentuk penyimpanan menaikkan schemaVersion. Copy, tata letak, dan dekorasi dapat disempurnakan sepanjang kontrak aksesibilitas dan hasil tetap sama.

## 15. Keputusan final dan open questions

### 15.1 Keputusan final baseline v1.0

“Final” berarti acuan development versi ini; perubahan berikutnya harus dicatat, bukan larangan evaluasi ulang berdasarkan bukti.

| ID | Keputusan | Alasan / dampak |
|---|---|---|
| DEC-01 | Satu PRD Markdown menjadi keluaran tahap ini | Fokus pada kebutuhan sebelum implementasi atau dokumen turunan |
| DEC-02 | MVP kantin, desktop-first, satu antrean FIFO, 1–6 loket identik | Cukup bermakna untuk eksperimen dan realistis untuk deadline |
| DEC-03 | Seluruh fitur inti manual; penambahan loket dan pelanggan melalui klik/keyboard | Produk tidak bergantung webcam atau gesture |
| DEC-04 | AirShift opsional dengan dua aksi pause/resume dan gate kualitas | Membatasi aksi palsu, kompleksitas dan risiko privasi |
| DEC-05 | DES menjadi sumber kebenaran; visual tidak menentukan waktu | Hasil tetap valid pada speed dan FPS berbeda |
| DEC-06 | Poisson + uniform bounded; awal kosong; [0,H) kemudian drain | Model mudah dijelaskan dan endpoint metrik eksplisit |
| DEC-07 | c/λ/a/b/H/seed immutable selama run | Menghindari eksperimen yang sulit direproduksi |
| DEC-08 | Kedatangan manual live menjadi input log berwaktu simulasi | Eksplorasi tetap interaktif dan dapat di-replay |
| DEC-09 | A/B memvariasikan kapasitas/layanan, mengunci permintaan | Efek intervensi dapat ditafsirkan dengan lebih adil |
| DEC-10 | 20 pasangan replikasi; CI95% delta mean wait | Ketidakpastian terlihat dengan scope analisis terbatas |
| DEC-11 | Konfigurasi lokal maksimal 10 slot, tanpa akun/backend | Mengurangi beban pengembangan dan data pribadi |
| DEC-12 | 3D sederhana plus alternatif teks; drag opsional | Visual membantu pemahaman tanpa menghalangi akses |
| DEC-13 | Tidak ada klaim terkalibrasi atau optimal untuk dunia nyata | Belum ada data lapangan dan validasi domain |
| DEC-14 | Submit internal 20 Nov 20.00 WIB | Buffer terhadap deadline resmi 21 Nov 05.00 WIB |

### 15.2 Open questions dengan owner dan default

Tidak semua pertanyaan menahan implementasi. Default berikut berlaku sampai keputusan terdokumentasi menggantikannya.

| ID | Pertanyaan | Owner / batas keputusan | Default / pengaruh |
|---|---|---|---|
| OQ-01 | Siapa owner peran, berapa kapasitas kerja aktual? | Produk, 27 Okt | Satu orang dapat merangkap; potong Should/Could bila kapasitas tidak cukup |
| OQ-02 | Library dan versi PRNG/seed derivation mana yang dipakai? | Simulasi, 28 Okt | Algoritme deterministik dengan golden vectors; harus diputuskan sebelum hasil model dijadikan baseline |
| OQ-03 | Stack UI/3D dan strategi agar batch responsif? | Implementasi, 28 Okt | Gunakan stack yang dikuasai tim dan memenuhi budget; jangan membuat backend baru |
| OQ-04 | Mesin acuan dan browser aktual mana yang tersedia? | QA, 28 Okt | Spesifikasi minimum §10; dokumentasikan substitusi dan keterbatasan pengujian |
| OQ-05 | AirShift adalah integrasi yang sudah ada atau pengalaman gesture baru? | Produk + pengalaman, spike sampai 11 Nov | Jangan mengasumsikan SDK tersedia; dua gesture lokal atau hilangkan dari submission |
| OQ-06 | Dapatkah tiga orang memenuhi gate gesture? | QA, 13 Nov | Bila belum lulus, AirShift tidak masuk build |
| OQ-07 | Apakah persona pengelola kantin dapat diwawancarai? | Produk, 12 Nov | Personas tetap hipotesis; lima peserta pembelajar cukup untuk uji formatif awal |
| OQ-08 | Hosting dan alamat demo final? | Submission, 10 Nov; final 18 Nov | Host HTTPS statis tanpa login, pertahankan saat penjurian |
| OQ-09 | Apakah tim memenuhi usia, status mahasiswa dan pembatasan geografi lomba? | Pemilik peserta, sebelum pengerjaan submission | Tidak diasumsikan; cek aturan resmi dan akun peserta |
| OQ-10 | Apakah perlu bahasa Inggris untuk materi juri? | Submission, 14 Nov | UI Indonesia; siapkan penjelasan demo yang dapat dipahami juri sesuai formulir, tanpa memperluas UI multilingual |
| OQ-11 | Adakah data kantin nyata yang boleh digunakan? | Produk, pascalomba | Tidak memakai data nyata pada MVP; distribusi tetap asumsi sintetis |

### 15.3 Riwayat versi

| Versi | Tanggal | Perubahan |
|---|---|---|
| 1.0 | 26 Oktober 2026 | Baseline lengkap untuk MVP hackathon: scope, kontrol manual/AirShift, model dan metrik, acceptance criteria, rencana rilis serta risiko |

## 16. Glosarium dan referensi

### 16.1 Glosarium

- **Skenario:** konfigurasi parameter dan jadwal input untuk percobaan.
- **Run:** satu eksekusi skenario dengan seed, versi model dan input tertentu.
- **Replikasi:** run baru dengan stream acak independen untuk mengukur variasi hasil.
- **DES / event-driven:** jam model maju dari satu kejadian ke kejadian berikutnya.
- **FIFO:** pelanggan dilayani menurut urutan datang; tie dipecahkan secara stabil.
- **Horizon H:** akhir periode penerimaan pelanggan, bukan akhir pelayanan seluruh pelanggan.
- **Cohort:** semua pelanggan yang datang sebelum H dan kemudian dituntaskan melalui drain.
- **Drain:** fase setelah H untuk menyelesaikan seluruh pelanggan cohort.
- **Seed:** nilai awal pembentukan bilangan acak deterministik; membutuhkan versi algoritme dan log input agar hasil dapat diulang.
- **Common random numbers:** A/B menggunakan variate permintaan dan layanan pelanggan sama untuk setiap pasangan replikasi.
- **P95:** nilai persentil ke-95 di antara pelanggan cohort; berbeda dari confidence interval.
- **CI95%:** interval ketidakpastian estimasi mean selisih antar-replikasi; tidak menyatakan peluang pasti hasil dunia nyata.
- **AirShift:** mode gesture webcam opsional TomorrowLab; nama tidak membuktikan adanya SDK tertentu.

### 16.2 Referensi dan batas penggunaan

- **[R1]** [LaunchPad Hacks — Schedule resmi](https://launchpad-hacks.devpost.com/details/dates). Diakses 26 Oktober 2026. Mendukung deadline submission 20 November pukul 17.00 EST dan jadwal penjurian sampai 25 November. Konversi WIB dihitung dalam PRD.
- **[R2]** [LaunchPad Hacks — Rules resmi](https://launchpad-hacks.devpost.com/rules). Diakses 26 Oktober 2026. Mendukung pemeriksaan eligibility, karya/atribusi, materi submission dan akses tautan penjurian. Ringkasan PRD tidak menggantikan seluruh aturan; peserta wajib memeriksa versi resmi sebelum submit.
- **[R3]** [NIST/SEMATECH — Confidence Limits for the Mean](https://www.itl.nist.gov/div898/handbook/eda/section3/eda352.htm). Diakses 26 Oktober 2026. Rujukan formula interval Student-t dan interpretasi coverage; pemilihan 20 replikasi serta desain pasangan adalah keputusan proyek.
- **[R4]** [W3C — Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/). Acuan normatif aksesibilitas; hasil kepatuhan baru dapat dinyatakan setelah pengujian implementasi.

Seluruh angka default, batas sumber daya, target UX/performa, threshold gesture dan estimasi kerja adalah keputusan atau target PRD, bukan temuan empiris. Dokumen ini selesai sebagai spesifikasi; produk, kalibrasi data nyata, uji perangkat, dan submission belum dikerjakan oleh penyusunan dokumen ini.
