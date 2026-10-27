# TomorrowLab — Simulation Specification

**Versi 1.0 · 26 Oktober 2026 · Status: kontrak implementasi dan verifikasi; aplikasi belum diimplementasikan atau diuji melalui dokumen ini.**

| Atribut | Kontrak |
|---|---|
| Sumber kebutuhan | [PRD TomorrowLab v1.0](/Users/adrian/Documents/Codex/2026-10-26/referenced-chatgpt-conversation-this-is-an/outputs/PRD.md), khususnya §6–8 dan §12 |
| Dokumen terkait | [USER_FLOW.md](USER_FLOW.md); [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md); [ARCHITECTURE.md](ARCHITECTURE.md) |
| `modelVersion` | `canteen-fifo-v1` |
| `engineVersion` | Baseline implementasi pertama `des-ts-v1`; patch yang mengubah hasil memerlukan audit kompatibilitas |
| `rngVersion` | `pcg32-xsh-rr-v1` |
| `seedDerivationVersion` | `seed-pcg32-v1` |
| `schemaVersion` | `1`, dengan field ordinal pelanggan manual yang ditetapkan di bawah |
| `protocolVersion` | `1`, sesuai envelope ARCHITECTURE |
| Unit internal | Detik simulasi, IEEE-754 binary64; integer count eksak |
| Replikasi | Run eksplorasi memakai `r=0`; batch memakai `r=0…19` |

Dokumen ini menetapkan algoritme, identitas input, hasil numerik, dan bukti uji yang dibutuhkan pengembang. Arsitektur mengatur komponen dan protokol; spesifikasi ini menjadi acuan semantik engine. PRD tetap baseline kebutuhan. Pemilihan PRNG dan perluasan field ordinal adalah keputusan teknis untuk menutup pertanyaan implementasi PRD, tanpa mengubah fenomena yang dimodelkan. Tidak ada kode aplikasi atau angka hasil preset yang diklaim sudah tersedia.

## 1. Sistem, asumsi, dan batas input

Satu antrean FIFO bersama melayani `c` loket identik, non-preemptive. Pelanggan masuk satu kali, menunggu bila perlu, mulai layanan satu kali, lalu selesai satu kali. Sistem kosong pada `t=0`; seluruh loket idle. Tidak ada warm-up, prioritas, kapasitas antrean fisik, pelanggan batal, perjalanan, istirahat petugas, atau pergantian loket saat layanan. Posisi avatar dan loket tidak memengaruhi waktu atau routing.

| Field | Nilai sah | Default |
|---|---|---|
| `c` | Integer 1–6 | 2 |
| `lambdaPerMinute` (`λ`) | Bilangan finite 0–20; UI memakai step 0,1 | 4 |
| `serviceMinSec` (`a`) | Integer 1–300 | 20 |
| `serviceMaxSec` (`b`) | Integer `a…300` | 40 |
| `horizonSec` (`H`) | 60–1.800; input UI kelipatan 60 | 900 |
| `rootSeed` | Integer unsigned 32-bit, 0…4.294.967.295 | 2026 |
| Entry manual | Waktu finite `0≤t<H`, count integer 1–20 | Kosong |

Validasi di UI dan kembali di engine saat membuat run atau menerima command; data storage juga melewati validasi sama. Tolak NaN, Infinity, field wajib kosong, integer pecahan, jumlah manual dasar >2.000, ID duplikat, sequence tidak valid, dan waktu di luar rentang. Jangan clamp atau membulatkan diam-diam. Snapshot run immutable: perubahan `c,λ,a,b,H,rootSeed` selalu menghasilkan eksperimen baru melalui reset yang eksplisit.

Jendela kedatangan adalah `[0,H)`. Kedatangan tepat H ditolak atau tidak dijadwalkan; departure tepat H termasuk selesai pada horizon. Setelah H, engine mengosongkan semua pelanggan yang sudah diterima. Akhir run `T_end=max(H,max D_i)`, dengan `T_end=H` bila kosong. Antrean kosong sebelum H belum berarti COMPLETED karena kedatangan berikutnya masih mungkin. Batas 2.000 pelanggan merupakan batas resource, bukan kebijakan menolak pelanggan dalam model kantin.

## 2. Kontrak data canonical

Data berikut adalah isi minimum, bukan kewajiban menambah lapisan abstraksi. Array dan queue sederhana cukup untuk ≤2.000 pelanggan dan ≤6 loket.

| Struktur | Field dan invariant |
|---|---|
| `RunConfig` | Snapshot parameter, jadwal dasar, seluruh versi, rootSeed dan replicationIndex; tidak mengambil nilai draft setelah create |
| `ManualEntry` | `id:string`, `atSimSec:number`, `count:number`, `sequence:number`, `customerOrdinals:number[count]` |
| `Customer` | `id`, `origin:auto/manual`, `arrivalAt`, `serviceDemandU`, `serviceSec`, `serviceStartAt:null/number`, `departureAt:null/number`, `serverOrdinal:null/integer`, `state:waiting/inService/completed` |
| `Server` | Ordinal integer `0…c−1`, customer aktif atau null; ordinal adalah identitas stabil |
| `Queue` | ID dalam urutan FIFO; dequeue melalui head index agar tidak menggeser array setiap operasi |
| `Event` | `atSimSec`, `kind:arrival/departure/horizon`, identitas pelanggan/entry dan kunci tie; bukan event animasi |
| `Runtime` | simTime, status, phase, queue, servers, customers, agenda, inputLog, cursor stream, integral, countsAtH, stopReason |
| `RunResult` | Snapshot asal, versi, cohortMetrics, horizonMetrics, countsAtH, drainEndSec, validity; hanya final bila COMPLETED |

`sequence` adalah integer nonnegatif yang aman di JavaScript, unik untuk seluruh entry dasar dan live satu run. Entry baru memperoleh sequence sesudah sequence terbesar yang sudah diterima. Pada waktu sama, sequence lebih kecil mendahului yang lebih besar; pelanggan dalam satu entry mengikuti posisi array `customerOrdinals`, bukan nilai ordinal yang diurutkan ulang.

Identitas otomatis adalah `a:0`, `a:1`, … menurut index proses kedatangan, mulai nol. Identitas manual adalah `m:<ordinal>`. Setiap ordinal manual merupakan integer unik `0…1999` di gabungan jadwal dasar dan live. Saat menerima entry baru, alokasikan ordinal terendah yang belum dipakai, sebanyak count; simpan array itu. Ordinal mengunci random variate layanan, sedangkan sequence mengunci FIFO. Jangan memakai string-sort ID untuk mengurutkan index angka: `a:10` tidak mendahului `a:2`.

Untuk draft baru, editor membuat identitas saat entry diterima; hapus entry tidak mengubah identitas entry yang bertahan. Storage yang membawa schema ini wajib memuat ordinal eksplisit. Jangan memperbaiki ordinal rusak atau membuat ulang ordinal setiap load. Format data lama yang belum mendukung ordinal harus melalui migrasi eksplisit dan tervalidasi atau ditolak dengan sebab; tidak diasumsikan identik secara reproduktif.

### 2.1 Jadwal dasar, input live, reset, replay

`configSnapshot.manualSchedule` berisi entry sebelum run. `inputLog` hanya entry tambahan yang diterima saat RUNNING/PAUSED. Event arrival/departure engine dan snapshot UI tidak masuk inputLog. Kedua sumber dijalankan tepat sekali. Simpan metadata sumber untuk diagnostik, tetapi sumber dasar/live tidak mengubah prioritas: keduanya manual dan diurutkan dengan sequence bersama.

- **Reset:** buang runtime, hasil run dan inputLog live; pertahankan parameter, root seed serta jadwal dasar beserta ordinal/sequence. Slot simpan dan hasil A/B lengkap bukan milik runtime yang dihapus.
- **Replay:** create run baru dari snapshot asal dan salinan inputLog yang dibekukan. Jadwalkan dasar dan log masing-masing sekali pada waktu simulasi tercatat; tidak memutar ulang klik waktu nyata.
- **Promosi untuk simpan/A/B:** gabungkan dasar+live menjadi satu jadwal dasar baru, pertahankan ID, waktu, sequence dan ordinal. Validasi unik dan count; inputLog run baru kosong. Jangan memasang jadwal gabungan bersama log asal.

Input live yang dicatat saat pause belum menambah `arrived`, `waiting` atau integral sampai resume. ACK “dicatat” berbeda dari “sudah tiba”; pending entry dapat ditampilkan terpisah. Replay boleh mengetahui entry live sejak awal, tetapi tidak menjalankannya sebelum waktu tercatat.

## 3. Randomness dan pairing yang dikunci

### 3.1 Algoritme dan seeding

Gunakan PCG-XSH-RR 64/32 sesuai implementasi referensi `pcg32` dari pembuat PCG. State 64-bit dihitung dengan BigInt dan wrap unsigned modulo `2^64`; jangan mengandalkan perkalian Number untuk integer 64-bit. Langkah output memakai state lama, xorshift ke 32-bit lalu rotate-right. Referensi primer: [PCG C basic — pcg_basic.c](https://github.com/imneme/pcg-c-basic/blob/master/pcg_basic.c), diperiksa 26 Oktober 2026. Pseudocode berikut menetapkan padanan operasi integer; aturan domain stream adalah keputusan TomorrowLab.

```text
MASK64 = 2^64 − 1
next32():
  old = state
  state = (old × 6364136223846793005 + inc) AND MASK64
  x = uint32(((old >> 18) XOR old) >> 27)
  rot = old >> 59
  return uint32((x >> rot) OR (x << ((−rot) AND 31)))

seed(initstate, initseq):
  state = 0
  inc = (initseq << 1) OR 1
  next32()                         // output dibuang
  state = (state + initstate) AND MASK64
  next32()                         // output dibuang
```

`uint32` membuang bit di atas 32; right shift `x` bersifat logical. Dalam JavaScript hasil bitwise harus dinormalisasi `>>>0` sebelum diubah menjadi uniform. Output index 0 adalah pemanggilan berikut setelah dua pemanggilan seeding; bukan salah satu output yang dibuang. BigInt hanya internal worker, bukan nilai JSON config/result.

Setiap stream mempunyai `initstate=rootSeed` dan `initseq=3r+domain`. Untuk run eksplorasi `r=0`; batch tepat `r=0…19`. Domain 0 untuk interarrival otomatis, 1 untuk layanan otomatis, 2 untuk layanan manual. Seed nol sah dan tidak diganti seed lain. Tuple `(rootSeed,r,domain,versi)` adalah identitas stream; daftar 20 seed replikasi dalam metadata ditulis sebagai tuple stream ini, bukan 20 root seed yang dipilih diam-diam.

Stream berbeda memberi pemisahan deterministik yang dimaksudkan untuk replikasi dan sumber acak. Ini bukan pembuktian matematis bahwa semua output independen; validasi distribusi dan kewajaran t-interval tetap diperlukan. Run eksplorasi dengan r=0 sengaja dapat cocok dengan pasangan batch pertama untuk demand sama.

### 3.2 Transformasi dan konsumsi output

Setiap integer output `z∈{0,…,2^32−1}` dipetakan menjadi `u=(z+0,5)/2^32`. Maka `0<u<1`, termasuk untuk output 0 dan maksimum. Jangan memakai `z/(2^32−1)`, yang dapat menghasilkan endpoint 0/1.

Untuk λ>0, gap index i adalah `Δ_i=−Math.log1p(−u_i)×60/λ`; `A_0=Δ_0`, `A_i=A_(i−1)+Δ_i`. Arrival pertama bukan t=0. Hentikan penjadwalan ketika `A_i≥H`, tanpa membuat pelanggan untuk gap penutup itu. λ=0 membuat stream arrival tidak dikonsumsi dan agenda otomatis kosong. Jangan membulatkan timestamp, menambahkan epsilon tie, atau menyisipkan arrival terakhir agar dekat H. Bila penjumlahan gagal maju atau menjadi nonfinite, hentikan ERROR numerik; tidak mengubah waktu agar tampak sah.

Layanan pelanggan otomatis `a:i` memakai output index i domain 1. Manual `m:k` memakai output index k domain 2. `serviceDemandU` menyimpan uniform tersebut; `S_i=a+(b−a)v_i`, atau tepat a bila a=b. Variate tetap dipetakan saat a=b agar perubahan a/b A/B tidak menggeser index. Tidak ada draw saat memilih loket, saat render, pause, snapshot, atau penjadwalan ulang. Boleh precompute 2.000 output layanan setiap domain; untuk manual random access ordinal menjadi sederhana. Arrival boleh dibangkitkan bertahap; tetap harus menghitung kandidat ke-2.001 bila masih sebelum H untuk mendeteksi batas.

Dalam pasangan r, A/B memakai daftar `(ID,arrivalAt,serviceDemandU)` identik, termasuk ordinal manual. Transformasi layanan menggunakan a/b masing-masing; c hanya memengaruhi assignment. Penambahan manual tidak menggeser variate otomatis. Mengubah c tidak mengubah demand pelanggan berikutnya karena RNG tidak diminta oleh loket.

### 3.3 Golden vectors

Seluruh bilangan berikut adalah uint32 hex, delapan digit. Tes harus membandingkan integer secara eksak, tanpa toleransi. Vektor referensi `initstate=42,initseq=54` sesudah seeding: `a15c02b7 7b47f409 ba1d3330 83d2f293 bfa4784b cbed606e`.

| rootSeed | r | domain | Output 0, 1, 2, 3 |
|---:|---:|---:|---|
| 0 | 0 | 0 | `e4c14788 379c6516 5c4ab3bb 601d23e0` |
| 0 | 0 | 1 | `0f5deba9 184296dd 357643f4 f8e84c31` |
| 0 | 0 | 2 | `7aa10266 fe1a2e6e a37c7f0c 1f9a25c6` |
| 0 | 19 | 0 | `9b6d4cd0 2d08fc26 243157b0 a4dcde18` |
| 0 | 19 | 1 | `a495d23f 092af7bf 08a62244 3aa28006` |
| 0 | 19 | 2 | `e188288b 87fa5442 ab615cca 5dc04f7f` |
| 2026 | 0 | 0 | `bbc743b4 e9f40ea7 2828adaf 608c60dc` |
| 2026 | 0 | 1 | `31896c9d dcd45124 7941e065 2c7b521a` |
| 2026 | 0 | 2 | `0ff74d18 5802d880 83787c69 17e38e22` |
| 2026 | 19 | 0 | `6f017ace b2a3e280 320695d4 33d19793` |
| 2026 | 19 | 1 | `b6b05895 2d9a4d9e 6b31427b 368906b5` |
| 2026 | 19 | 2 | `d5ddc4a1 1dc1b8b2 00354065 f05d7f9c` |

Transformasi contoh root2026/r0: arrival u0=`0.7335092845605686`, sehingga λ=4 memberi arrival pertama `19.836238122893338` detik; auto service v0=`0.19350317807402462` memberi S=`23.870063561480492` untuk a=20,b=40; manual ordinal0 v=`0.062367266160435975` memberi S=`21.24734532320872`. Contoh ini hanya golden transform, bukan hasil mean preset.

## 4. Mesin kejadian dan kemajuan jam

### 4.1 Agenda dan transaksi timestamp

Agenda menyimpan kedatangan berikut, seluruh entry manual yang belum diproses, departure aktif per loket, serta marker H. Tidak perlu satu event per frame. Ambil timestamp terkecil secara eksak; semua event dengan angka timestamp yang sama menjadi satu transaksi. Untuk c≤6, scan departure aktif dan pointer jadwal terurut sudah mencukupi; priority heap opsional bila membantu struktur yang sudah ada.

Pada timestamp `τ`, urutan wajib:

1. Integrasikan state lama pada interval `[t,τ)` dan majukan jam ke τ.
2. Selesaikan semua departure τ, menurut ordinal loket lalu identitas pelanggan sebagai tie tambahan. Bebaskan loket; satu pelanggan tidak boleh menyelesaikan dua kali.
3. Masukkan arrival sah τ: otomatis menurut index, lalu manual menurut sequence entry dan urutan di dalam entry. Pelanggan lama dalam queue tetap di depan. Arrival `τ≥H` tidak diterima.
4. Dispatch queue FIFO ke loket idle dengan ordinal terkecil, satu per satu. Rekam start=τ dan departure=τ+S. S selalu ≥1 sehingga tidak menimbulkan departure baru pada τ.
5. Perbarui max queue dari waiting setelah seluruh dispatch, hanya bila `τ<H`. Bila τ=H, bekukan countsAtH serta integral horizon setelah departure dan dispatch; tutup arrival. Publikasikan state sesudah transaksi.

Departure dan arrival yang bertepatan tidak membuat pelanggan langsung dilayani dihitung dalam max queue. Dispatch pada H boleh mulai melayani pelanggan yang sudah menunggu, sehingga `waitingAtH` didefinisikan sesudah dispatch. Integrasi horizon tidak memasukkan waktu sibuk pelanggan yang baru mulai di H, tetapi `inServiceAtH` memasukkannya.

### 4.2 `advanceTo` dan batas observasi

API inti minimum: `create(config,r,replayLog?)`, `advanceTo(targetSimSec)`, `enqueueManual(count)`, `snapshot()`, dan `finish()`. API tidak mengakses DOM, rAF, webcam, storage atau jam nyata. Wrapper worker memegang izin status dan scheduling pekerjaan.

```text
advanceTo(target):
  require finite target ≥ simTime dan status RUNNING
  selesaikan pending arrival pada simTime lebih dahulu
  while ada timestamp agenda τ ≤ target dan run aktif:
    processTimestamp(τ)              // transaksi lengkap
    bila H sudah dilewati dan sistem kosong: complete lalu stop
    bila budget kerja habis: yield, lanjut dari checkpoint
  bila tetap aktif:
    integrate(simTime, target)       // meski tidak ada event
    simTime = target
  return snapshot acknowledged
```

Marker H menjamin run tanpa event tetap mencapai H dan selesai; jangan melompat melewati akhir completed menuju target lebih besar. `finish()` menggunakan pemroses timestamp sama sampai COMPLETED/error/cancel, tanpa pacing animasi. Akses snapshot tidak memajukan jam dan tidak mengonsumsi RNG. Integrasi pada batas observasi tidak mengubah state queue; beberapa advance kecil atau satu advance besar memberi integral sama dalam toleransi floating point.

Main hanya mengirim satu ADVANCE_TO dalam proses sekaligus; setelah ACK, clock tampilan dapat mengajukan target berikutnya. Pause/hidden/manual diterima worker di antara transaksi timestamp. ACK simTime menjadi waktu canonical; UI dilarang menstempel manual dengan waktu terakhir yang kebetulan terlihat. Clock tetap maju ke target yang diakui walau interval tidak memiliki event: pause t=10 tidak berubah menjadi t=0 hanya karena arrival berikutnya t=15. Istilah budget/yield pada pseudocode adalah checkpoint milik adapter worker: core menyediakan pemrosesan satu kelompok timestamp tanpa membaca jam nyata; adapter menentukan kapan mengembalikan kontrol dan menjadwalkan task berikutnya.

### 4.3 Input live pada waktu yang sudah diobservasi

Worker menerima ADD_MANUAL count, mengecek status/waktu saat penerimaan, lalu mencatat entry pada simTime worker, memberi sequence/ordinal dan mengirim ACK. Jika simTime≥H, command ditolak tanpa log baru. Ketika PAUSED entry tetap pending; resume memprosesnya sebelum jam maju. Ketika RUNNING, entry diproses pada waktu yang sama sebelum advance berikutnya. Kecepatan dan antrean command dapat memengaruhi waktu penerimaan klik; reproduksibilitas dijanjikan untuk log tercatat yang sama, bukan klik nyata yang dilakukan pada playback berbeda.

Sebuah input boleh diterima pada τ setelah transaksi τ selesai. Ini hanya membuka tahap arrival/dispatch τ; departure lama tidak diproses ulang dan dt integrasi=0. Sequence live sesudah semua entry yang sudah diterima memastikan FIFO yang sama seperti replay dengan semua arrival τ diketahui sebelumnya. Karena layanan positif, tidak ada departure baru di antara subtransaksi τ. Snapshot setelah input pertama dan input kedua dapat berbeda; hasil akhir dan ledger canonical tetap sama.

Ledger QA canonical diurutkan dengan `(timestamp,phase,source,index/sequence,withinEntry)`; fase departure sebelum arrival sebelum serviceStart, start berurutan ordinal loket. Ledger merekam fakta model, bukan urutan kirim pesan worker. Untuk timestamp yang dibuka kembali, normalkan kelompok itu sebelum membandingkan ledger live/replay. Revision snapshot, commandSeq dan penerimaan ACK tidak dibandingkan sebagai event model. Ledger bukan sumber replay: hanya snapshot konfigurasi dan inputLog yang mengeksekusi ulang run.

Max queue memakai ukuran queue sesudah dispatch setiap subtransaksi τ. Nilainya tidak turun ketika hanya manual baru masuk dan dispatch ke loket yang masih idle; akibatnya maksimum subtransaksi sama dengan nilai canonical sesudah seluruh arrival τ. Jangan mengukur puncak sementara sebelum dispatch atau jumlah avatar yang sedang berjalan.

### 4.4 Lifecycle, kontrol, dan penghentian

Status canonical adalah READY/RUNNING/PAUSED/COMPLETED/ERROR/LIMIT_REACHED/CANCELLED; phase `arrivalsOpen/draining` terpisah. Selesaikan cepat adalah mode RUNNING. Hidden saat cepat menghasilkan PAUSED, mematikan mode cepat; resume eksplisit boleh normal atau cepat. Batch hidden ditangguhkan pada checkpoint yang memuat index pasangan, sisi A/B, dan runtime subreplikasi; kembali tidak melakukan catch-up atau memulai ulang pasangan diam-diam.

Satu worker simulasi memproses satu pekerjaan aktif. Envelope `protocolVersion:1` memuat epoch, jobId dan commandSeq; reset/replacement run menaikkan epoch, sedangkan batch baru memperoleh jobId baru dan dapat mempertahankan epoch run visual yang PAUSED. Hasil epoch/job lama diabaikan. Command duplikat tidak diaplikasikan dua kali. Snapshot mempunyai snapshotRevision monoton per job dalam epoch; sequence log input terpisah dari revision transport dan keduanya bukan sumber acak. ACK kontrol tidak menunggu throttle snapshot render. ADD_MANUAL menghentikan advance tertunda pada yield berikutnya, menerima input di jam canonical lalu mengakui waktu tersebut; main melakukan reanchor sebelum meminta target baru. Rincian envelope dan UI berada dalam ARCHITECTURE.

Worker yield melalui task baru, misalnya setTimeout, sesudah sekitar 4 ms atau 100 kelompok timestamp, mana lebih dahulu. Jangan hanya yield microtask yang membuat message kontrol tetap tertahan. Pause ditargetkan diakui ≤100 ms dan batal menghentikan pekerjaan baru ≤500 ms pada perangkat acuan. Transaksi timestamp tidak dipotong untuk snapshot/pause; kelompok terburuk 2.000 arrival tetap harus dibenchmark. Hasil yang menang race finish/cancel ditentukan command yang diterima pada checkpoint: COMPLETED yang sudah committed tidak diubah CANCELLED; cancel yang diakui sebelum completion menutup run nonfinal.

### 4.5 Batas resource dan kegagalan

Sebelum menerima setiap pelanggan ke state, periksa arrived<2.000. Kandidat ke-2.001 tidak dibuat sebagai customer dan tidak menambah arrived. Hentikan LIMIT_REACHED; pertahankan seluruh pelanggan diterima, inputLog dan sebab/waktu pemicu. Bila overflow terjadi di tengah kelompok arrival, simpan prefix yang sah, dispatch prefix itu ke loket idle untuk menutup transaksi konsisten, lalu berhenti; tidak melanjutkan arrival berikut atau mengklaim final. Identitas dan count yang belum diproses tetap terlihat sebagai pending/attempted diagnostik, bukan arrived.

Jadwal awal >2.000 ditolak sebelum create. Live yang tidak dapat memperoleh ordinal manual karena 2.000 ordinal telah dipakai juga mencapai batas resource: jangan reuse ordinal atau menerima sebagian aksi diam-diam; stop invalid dengan entry pemicu terpisah dari inputLog accepted. Dalam kasus normal, entry diterima penuh sebagai input, sedangkan batas total auto+manual tetap diperiksa saat arrival diproses. Invariant internal gagal, waktu nonfinite, atau assignment duplikat menghasilkan ERROR, bukan koreksi state tersembunyi. Cancel cepat menghasilkan CANCELLED; ketiganya tidak dapat resume dan tidak memiliki metrik final valid.

## 5. Definisi dan perhitungan metrik

### 5.1 Integral dan snapshot horizon

Misalkan Q(t) jumlah waiting, B_j(t) indikator loket j sibuk, `L(t)=Q(t)+ΣB_j(t)`. Nilai berlaku konstan antara kejadian; integrasi memakai state sebelum timestamp berikutnya. Untuk interval `[t_old,t_new)`, `dt=t_new−t_old` dan `dtH=max(0,min(t_new,H)−min(t_old,H))`.

Akumulasikan `queueAreaFull+=Q×dt`, `systemAreaFull+=L×dt`, `busyFull_j+=B_j×dt`; versi horizon memakai dtH. Seluruh integral full berakhir pada T_end; horizon berhenti di H. Observation advance juga memakai aturan ini agar snapshot t tanpa event tetap akurat. Integral tidak diperbarui lagi untuk snapshot berulang pada t sama.

Marker H membekukan `arrivedAtH`, `waitingAtH`, `inServiceAtH`, `completedAtH` setelah semua departure H dan dispatch. Konservasi `arrivedAtH=waitingAtH+inServiceAtH+completedAtH`; pada final valid arrivedAtH=N karena tak ada arrival sesudah H. Hitung juga `completedAtH=#(D_i≤H)` sebagai cross-check, jangan menimpa dengan completed akhir drain.

### 5.2 Cohort dan sementara

Untuk cohort N arrival sah: `A_i=arrivalAt`, `B_i=serviceStartAt`, `D_i=departureAt`; `Wq_i=B_i−A_i`, `S_i=D_i−B_i`, `W_i=D_i−A_i`. Setelah drain, semua N mempunyai data lengkap.

| Metrik final cohort | Rumus |
|---|---|
| Mean wait | `ΣWq_i/N` |
| P95 wait | Urutkan Wq menaik; ambil elemen satu-based `ceil(0,95N)`, atau zero-based `ceil(0,95N)−1`; tanpa interpolasi |
| Mean time in system | `ΣW_i/N` |
| Mean actual service | `ΣS_i/N` |
| Arrived/completed final | N dan N; arrived auto+manual ditampilkan terpisah bila relevan |
| Drain duration | `max(0,T_end−H)` detik |

Saat RUNNING, mean wait sementara adalah `Σ_(B_i≤t)(B_i−A_i)/N_started(t)`, termasuk pelanggan sedang dilayani dan sudah selesai. Bila N_started=0, N/A; jangan memakai denominator completed atau seluruh arrived yang belum punya wait lengkap. Tampilkan denominator “sudah mulai layanan”, tidak menyebut estimasi cohort final. P95/mean system/mean service final menunggu drain; data parsial boleh untuk diagnostik dengan label jelas, bukan kartu final.

### 5.3 Metrik jendela horizon

| Metrik | Rumus dan denominator |
|---|---|
| Throughput horizon | `completedAtH/(H/60)` pelanggan/menit |
| Mean queue horizon | `queueAreaH/H`, pelanggan; tidak termasuk in-service |
| Max queue horizon | Maksimum Q setelah dispatch timestamp/subtransaksi t<H; nilai awal 0 |
| Utilization loket j | `busyH_j/H` |
| Utilization agregat | `ΣbusyH_j/(c×H)` |
| Waiting/inService at H | Count canonical yang dibekukan pada H, sesudah departure/dispatch |
| Beban otomatis nominal ρ | `λ×((a+b)/2)/(60c)`; tidak memasukkan manual |

ρ≥1 adalah informasi kapasitas rata-rata, bukan alasan menolak run finite. ρ bukan utilization aktual. Throughput tidak memakai completed final; utilization tidak memasukkan drain dan tidak merata-ratakan persentase loket dengan denominator berbeda. Q maksimum tidak menghitung semua arrival bersamaan sebelum loket idle menerima mereka.

Untuk N=0, mean wait/P95/mean system/mean service adalah `null` dengan reason `NO_CUSTOMERS`; UI “N/A — Belum ada pelanggan”. Count, throughput, mean queue, max queue, utilization dan drain adalah 0. Bila N>0 dan tidak ada yang menunggu, wait/P95 sah bernilai 0. Sebelum hasil tersedia gunakan reason `NOT_AVAILABLE_YET`; hasil invalid reason `INVALID_RUN`, bukan null yang ditafsirkan nol. Jangan mengekspor NaN/Infinity dalam JSON.

Untuk metrik sementara time-weighted bila ditampilkan, gunakan denominator `min(t,H)` dengan label sementara; pada t=0 hasil N/A. Jangan memakai H sebagai denominator metrik sementara lalu mengesankan horizon lengkap. Hasil final selalu memakai H yang dibekukan.

### 5.4 Identitas numerik untuk pemeriksaan

Pada COMPLETED valid, `queueAreaFull=ΣWq_i`, `systemAreaFull=ΣW_i`, `ΣbusyFull_j=ΣS_i`, serta `meanSystem=meanWait+meanService` untuk N>0. Ini berlaku pada keseluruhan `[0,T_end]`, tanpa asumsi steady state. Jangan memaksakan identitas tersebut pada area horizon ketika sebagian pelanggan masih di sistem. Toleransi `max(10^−8 detik,10^−10×max(|expected|,|actual|))` dipakai untuk waktu/metrik waktu; terapkan bentuk relatif/absolut yang setara dengan unit sesuai untuk area dan rasio. ID, urutan, counts, integer PRNG dan flag dibandingkan eksak. Keputusan horizon/tie menggunakan angka asli, bukan toleransi pengujian.

## 6. Perbandingan 20 pasangan

Sebelum batch, verifikasi kesamaan λ,H,rootSeed,kondisi awal,versi dan jadwal manual lengkap, termasuk ID/sequence/ordinal. Hanya c/a/b boleh berbeda. Bekukan A/B dan jadwal; tidak ada pelanggan live selama batch. Untuk setiap r, buat demand sekali, jalankan A dan B dengan demand itu, lalu validasi identitas. Simpan 20 pairedResults beserta tuple stream dan kedua snapshot. Kemajuan pasangan bertambah hanya setelah A dan B pasangan itu selesai valid.

Untuk `x_A,r=meanWait_A,r`, `x_B,r=meanWait_B,r`, definisikan `d_r=x_B,r−x_A,r`. Summary memakai rata-rata per replikasi, tidak pooling pelanggan: `meanA=Σx_A,r/20`, `meanB=Σx_B,r/20`, `meanDelta=Σd_r/20`. Varians sampel `s_d²=Σ(d_r−meanDelta)²/19`, standard error `s_d/√20`, CI95% `[meanDelta−2,093024×SE;meanDelta+2,093024×SE]`. Gunakan penjumlahan stabil/two-pass untuk varians; jangan menghitung selisih dua jumlah kuadrat besar tanpa kontrol cancellation.

Nilai kritis Student-t df19 dikunci PRD. Lihat [NIST — Confidence Limits for the Mean](https://www.itl.nist.gov/div898/handbook/eda/section3/eda352.htm) untuk bentuk umum interval mean; pemakaian pada selisih pasangan merupakan kontrak analisis TomorrowLab. CI ini pendekatan dari 20 replikasi sintetis; independensi antar-replikasi dan bentuk distribusi selisih membatasi interpretasinya.

| Kondisi | Summary dan interpretasi |
|---|---|
| Semua 20 valid, semua N>0 | Hitung mean/delta/CI lengkap |
| Satu atau lebih pasangan N=0 | Jangan buang pasangan atau ganti mean kosong dengan 0; mean wait aggregate A/B, delta, persen dan CI=N/A; tampilkan count pasangan kosong dan count tiap replikasi |
| Satu replikasi ERROR/LIMIT_REACHED | Batch invalid seluruhnya; tidak ada summary final dari 19 pasangan; pairedResult parsial boleh diagnostik |
| Cancel batch | Nonfinal; hasil lengkap batch sebelumnya tetap tersedia |
| Mean baseline 0 | Persen N/A; delta absolut/CI tetap sah bila seluruh mean pasangan terdefinisi |
| A=B identik, seluruh N>0 | Tiap d=0, CI=[0;0], label “Skenario identik” |
| CI upper<0 | “Waktu tunggu rata-rata B lebih rendah pada eksperimen ini” |
| CI lower>0 | “Waktu tunggu rata-rata B lebih tinggi pada eksperimen ini” |
| CI lower≤0≤upper | “Arah perbedaan belum meyakinkan pada percobaan ini” |

Aturan pasangan kosong didahulukan daripada label A=B. Jika tersedia, persen perubahan `100×(meanB−meanA)/meanA`; jangan merata-ratakan persentase pasangan dengan baseline berbeda. Metrik yang terdefinisi pada semua replikasi, misalnya count/throughput/utilization, tetap boleh dirata-rata dari tepat 20. Rata-rata P95 per replikasi disebut demikian, bukan P95 gabungan; jika ada P95 kosong, aggregate itu N/A. CI wajib hanya delta mean wait. Pembulatan tampilan tidak menentukan tanda CI atau label. Hasil lama terikat snapshot asal dan ditandai sebelumnya ketika draft berubah.

## 7. Fixture penerimaan dan edge cases

Fixture memakai jalur pengujian dengan daftar arrival/layanan eksplisit; bukan pilihan distribusi tambahan dalam UI. λ=0 kecuali dinyatakan lain. Counts dan urutan diuji eksak; angka sebelum pembulatan. Semua fixture valid harus drain hingga completed=N.

| ID | Input | Expected output minimum |
|---|---|---|
| ST-01 | c1,H60,S10; arrival [0,0,0] | Start [0,10,20], departure [10,20,30], wait [0,10,20]; mean wait10,P9520,mean system20; queueAreaH30,mean queue0,5; busyH30,util0,5; throughput3/menit,drain0 |
| ST-02 | c2; input ST-01 | Start [0,0,10], departure [10,10,20]; pelanggan pertama loket0,kedua loket1,ketiga loket0; mean wait10/3,P9510,mean system40/3; area queue10,mean queue1/6; busy per loket[20,10],util agregat0,25 |
| ST-03 | c1,H60,S10; arrival [0,10] | Departure10 sebelum arrival10; start[0,10],departure[10,20],wait[0,0]; max queue0; setiap customer tepat satu assignment |
| ST-04 | c1,H60,S20; arrival50; kandidat arrival60 | Pelanggan60 tidak diterima; atH waiting0,inService1,completed0; busyH10,util1/6; final wait0,system20; T_end70,drain10; busyFull20 |
| ST-05 | λ0,manual kosong,H60 | COMPLETED pada60; counts0,area0,util/throughput0; mean/P95/system/service N/A; drain0; tak ada NaN |
| ST-06 | A=B,seed/log sama,20 pasangan semua N>0 | Demand dan ledger canonical tiap pasangan identik; seluruh d0,CI[0;0],label identik |
| ST-07 | Snapshot/log sama; playback1×/5×/20×; pause timestamp diketahui | ID/urutan/count sama, waktu/metrik dalam toleransi; termasuk reduced motion/frame lambat; snapshot/advance kosong tidak menarik RNG |
| ST-08 | Pause tepat t10,count3,λ0,c1,S10,H60 | ACK entry t10; sebelum resume arrived0; resume arrival[10,10,10],start[10,20,30],departure[20,30,40]; mean wait10,log satu entry; replay sama |
| ST-09 | d sepuluh −1 lalu sepuluh +1 detik | meanDelta0,varians20/19,halfwidth `2,093024/√19=0,48017263696869866`; CI[−0,4801726369…;+0,4801726369…]; belum meyakinkan |
| ST-10 | Jadwal2.000 di t0 dalam100 entry count20; satu auto fixture t1<H | Arrival tambahan tidak diterima; arrived tetap2.000; LIMIT_REACHED,final invalid; tidak membuang pelanggan. Jadwal awal2.001 ditolak sebelum run |

Tambahan boundary wajib:

| ID | Kasus dan expected |
|---|---|
| SX-01 | c1,H60,S10,arrival50: departure60 termasuk completedAtH1; inServiceAtH0,util1/6,throughput1/menit,drain0 |
| SX-02 | c1,H60,S20,arrival[50,55]: di H waiting1,inService1,completed0; area queueH5,full15; mean queue1/12; start[50,70],depart[70,90]; mean wait7,5,mean system27,5,drain30 |
| SX-03 | c1,H60,S10,arrival[0,0,10]: pelanggan lama di queue mulai pada10 sebelum arrival baru; start[0,10,20],max waiting1,mean wait20/3 |
| SX-04 | c2,H60,S10,arrival[0,0,10,10],arrival10 auto lalu manual: departure loket0/1 dulu; auto memakai loket0,manual loket1; wait seluruh0 |
| SX-05 | Auto c1,S10 di t0; dua live entry pada paused t10,sequence1/2: sebelum resume counts tak berubah; replay dan normalisasi ledger τ menghasilkan identitas/start sama |
| SX-06 | Advance0→7 tanpa event hingga15: simTime7; integral sesuai state lama; input live dicatat7, bukan0/15. Pause berulang tidak mengubah waktu/RNG |
| SX-07 | Marker H dengan queue menunggu dan departure di H: setelah departure, FIFO berikut mulai tepat H dan masuk inServiceAtH; busy tambahan horizon0 |
| SX-08 | Batch19 pasangan berisi+1 kosong: count pasangan kosong1,CI/delta/meanwait aggregate N/A; tidak memakai n19. A=B kosong tetap N/A |
| SX-09 | Duplicate command ADD_MANUAL,epoch lama setelah reset,dua ADVANCE race: command tidak gandakan log; stale epoch diabaikan; main menjaga satu advance aktif |
| SX-10 | Promosi dasar+live lalu run baru: total tepat sekali,inputLog baru kosong,ordinal/sequence/v_i tetap; reset versi asal hanya mempertahankan dasar |
| SX-11 | Tambah pada t=H ditolak; count0/21/pecahan,ordinal duplikat,sequence duplikat dan timestamp NaN ditolak tanpa merusak runtime |
| SX-12 | Fast finish/normal/replay log sama: hasil sama; cancel/hidden di checkpoint tidak menerbitkan final parsial; batch suspend di tengah sisi B melanjutkan state yang sama |

SX-02 memberi pemeriksaan integral horizon versus full yang berbeda; implementasi tidak boleh menyamakan keduanya. Uji tie memakai timestamp eksplisit agar tidak berharap RNG menghasilkan persamaan waktu secara kebetulan. Untuk ST-10 gunakan fixture generator, bukan seed yang kebetulan memberi pelanggan tambahan.

## 8. Invariant, strategi uji, dan traceability

Setelah setiap transaksi timestamp, setiap observation advance, serta saat stop invalid: waktu monoton, semua angka finite, arrived=waiting+inService+completed, busy≤c; customer berada tepat di satu state. Server dan customer saling menunjuk secara konsisten; tidak ada ID ganda di queue/agenda. Wait terdefinisi≥0; start≥arrival; departure=start+S dan S>0. Di state stabil, queue tidak boleh nonempty bersamaan loket idle. Pending input belum termasuk arrived. Counts horizon dibekukan sekali. Saat invalid overflow diakhiri, pelanggan yang sebelumnya diterima tetap terkonservasi.

| Kelompok | Tipe, cakupan wajib | Acuan |
|---|---|---|
| Model dasar | Unit: ST01–05,08,10; SX01–07; tiap tie/FIFO/lowest idle, horizon/drain dan N/A | PRD QA01,05; FR03–10,13,26 |
| RNG dan pairing | Unit/contract: seluruh golden integer, transform endpoint, auto/manual random access, c/a/b berubah, ST06–07; promosi sekali | QA02; FR15–19 |
| Integral/statistik | Unit: area full/horizon, provisional denominator, P95 nearest rank N1/2/20/21, ST09; baseline0,CI menyentuh0,pasangan kosong | QA05; FR13,18–19 |
| Generatif | Fixed corpus ≥100 seed, kombinasi rendah/sedang/overload; invariant setiap timestamp,20 pasangan valid atau invalid eksplisit | QA03; NFR01 |
| Distribusi | ≥100.000 sampel per stream uniform/service/gap; fixed seeds; mean dalam5 standard error,varians relatif≤5%; λ0 dan a=b terpisah | QA04 |
| Lifecycle worker | Integrasi: 10 pause/resume; epoch/reset; duplicate seq; live same-time; hidden/cancel; satu compute aktif;20 run/reset | QA06,10; NFR02,04,14 |
| Playback/render | Integrasi/E2E: speed,frame rendah,reduced motion,renderer gagal tetap hasil sama; limit150 avatar tidak mengubah count | QA08–10; FR10–12,24,34 |

Untuk uniform `(0,1)`, target teoritis mean1/2 dan varians1/12; untuk uniform layanan mean(a+b)/2,varians(b−a)²/12; untuk exponential gap mean60/λ dan varians(60/λ)². Gunakan standard error mean `σ/√n`. Dengan a=b varians0 dan semua S harus tepat a; tidak membagi selisih varians dengan nol. Toleransi distribusi adalah sanity check, bukan bukti PRNG sempurna. Jangan mengganti fixed seed ketika gagal hanya agar lolos.

Gate model adalah 100% fixture wajib, golden vectors, invariant corpus dan error paths yang disebutkan, bukan angka persentase line coverage yang dapat menutupi branch penting. Uji UI tidak menggantikan unit fixture matematis. Simpan laporan dengan versi build/model/RNG, corpus seed, snapshot input, expected/actual, toleransi dan perangkat/browser. Benchmark run cepat≤2 detik dan 20 pasangan≤10 detik memakai preset default perangkat acuan; progress≥sekali/500 ms. Catat metrik latency kontrol terpisah dari waktu simulasi.

Yang terverifikasi saat menyusun dokumen ini: scratch calculation PCG sesuai vektor referensi enam output, 12 kombinasi stream tabel, golden transform dan half-width ST09. Belum ada engine aplikasi untuk menjalankan ST/SX, corpus, distribusi, worker/browser, performa atau integrasi UI. Batas perangkat, konsistensi lintas browser dan kecocokan model dengan kantin nyata masih perlu bukti. Tidak ada klaim kalibrasi lapangan.

| Keputusan handoff | Konsekuensi perubahan |
|---|---|
| Poisson/uniform,FIFO,tie,horizon,drain dan awal kosong | Ubah modelVersion,PRD dan fixture bila semantik berubah |
| PCG/seed mapping/output index/identity mapping | Ubah rngVersion atau seedDerivationVersion; hasil lama tetap terikat versi asal |
| Ordinal manual persisten dalam schema1 | Validator semua pintu masuk dan storage harus sama; migrasi eksplisit jika format sudah beredar berbeda |
| Formula cohort/horizon dan CI | Ubah kontrak statistik dan uji numerik, bukan sekadar copy UI |
| Throttle snapshot,avatar,playback,kamera | Boleh berubah tanpa mengubah hasil model; regresi determinisme tetap wajib |

**Riwayat versi:** 1.0, 26 Oktober 2026 — kontrak teknis awal TomorrowLab berdasarkan PRD v1.0, disejajarkan dengan flow dan desain; PRNG serta seed derivation diputuskan, implementasi aplikasi belum dilakukan.
