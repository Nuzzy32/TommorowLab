# Verifikasi workspace dan kontrol manual TomorrowLab — 27 Oktober 2026

Scope: WP-06, yaitu workspace satu layar, panel skenario dan jadwal, toolbar run, tambah pelanggan, status, CompactScene, hasil sementara/final, dialog reset dan asumsi, serta keyboard, hidden tab dan responsif dasar (USER_FLOW UF-01–08, sebagian UF-14/15). Bukti lokal; bukan audit aksesibilitas menyeluruh atau kelulusan gate M2.

## Keputusan implementasi

- State form memakai `useReducer` (`src/app/draft.ts`); controller dibuat di effect dan dibaca lewat `useSyncExternalStore`. Engine hanya diakses melalui controller/worker.
- Input disimpan sebagai teks sampai commit (blur/Enter). Nilai invalid ditolak dengan pesan field, tidak di-clamp atau dibulatkan. Desimal hanya untuk kedatangan otomatis; koma atau titik tunggal diterima, pemisah ribuan ditolak.
- Dialog memakai `<dialog>` native (focus trap, Escape, background inert dari platform); fokus awal Batal pada konfirmasi destruktif dan kembali ke pemicu.
- Tombol utama satu elemen yang labelnya berganti (Jalankan → Pause → Lanjutkan → Ulangi run yang sama). Saat command sedang diproses ia memakai `aria-disabled`, bukan `disabled`, agar fokus tidak hilang.
- Spasi menjeda/melanjutkan hanya dari fokus non-interaktif; tidak aktif di input, tombol, radio, tautan, dialog, atau mode selesaikan cepat.
- Stage WP-06 adalah CompactScene DOM (loket, antrean bersama dengan ≤150 marker, count canonical). Scene 3D adalah WP-07; tidak ada tab Bandingkan, Tersimpan atau AirShift karena fitur itu belum ada.
- Ikon adalah glyph SVG geometris lokal minimal, belum paket Phosphor; semua kontrol tetap berlabel teks.
- Runtime worker kini mengirim snapshot langsung setelah ACK `FAST_FINISH` agar UI segera menampilkan "Batalkan penyelesaian".

## Pemeriksaan otomatis

`npm run check` lulus: typecheck, **512 tes Vitest pada 8 file**, build produksi (chunk `simulation.worker-*.js` terbentuk) dan **11 tes Playwright Chromium 156** terhadap `dist/`. Suite e2e diulang 3× (33/33 lulus) untuk memeriksa flakiness. Setiap tes e2e gagal bila ada error console/page.

| Bukti | Tes | Hasil |
|---|---|---|
| UF-01 | e2e | Preset Jam makan siang (c=2, λ=4, 20–40 detik, 15 menit, seed 2026), READY, 20×, info ρ=1,00; bantuan dapat dilewati/dibuka kembali dengan fokus benar; dialog asumsi Escape mengembalikan fokus |
| UF-02 | e2e + `draft.test.ts` | Maksimum < minimum dan seed `1.000` ditolak tanpa mengubah teks; Jalankan memfokuskan field error pertama; λ `1.5` → `1,5`; loket berhenti di 6 dengan alasan; stage mengikuti c |
| UF-03 | e2e + unit | Jadwal beridentitas stabil (sequence/ordinal); memperpendek durasi menandai entry di luar rentang tanpa menghapus; Jalankan diblokir dan memfokuskan entry tersebut |
| ST-01 lewat UI | e2e | c=1, λ=0, layanan 10 detik, 1 menit, 3 pelanggan di 00:00 → mean wait 10,00, P95 20,00, waktu di sistem 20,00 detik, utilisasi 50,0%, throughput 3,00/menit, antrean maks 2, drain 0,00 detik — memakai worker hasil build produksi |
| UF-04 | e2e | Run dengan Enter; parameter terkunci; Spasi dari heading menjeda/melanjutkan; waktu tidak maju saat jeda; Spasi pada tombol hanya mengaktifkan sekali dan fokus tetap |
| UF-05 | e2e | Tambah 3 saat jeda → "3 pelanggan dicatat pada mm:ss. Menunggu Lanjutkan…", count tiba tetap 0 sampai lanjut; 21 ditolak; hasil akhir 3 selesai |
| UF-06/07 | e2e | Selesaikan cepat sampai hasil final; kelompok metrik cohort, horizon dan drain terpisah |
| UF-08 | e2e | Replay menghasilkan metrik sama; dialog reset fokus Batal, Escape tidak mereset; reset mempertahankan seed dan jadwal; Ubah skenario → Reset dan edit memfokuskan Loket aktif |
| UF-15 | e2e | `visibilitychange` hidden menjeda run dengan alasan; kembali visible menampilkan banner, waktu tidak maju, lanjut manual |
| Responsif | e2e | 360, 640 (≈1280 pada zoom 200%), 768 dan 1280 px tanpa scroll horizontal; Tambah pelanggan dan Selesaikan cepat terjangkau |

## Pemeriksaan visual

Browser pane pada 1366×900 dan 375×812: layout tiga kolom/bertumpuk sesuai DESIGN_SYSTEM §4, tanpa overflow horizontal. Pane pratinjau ini membatasi `requestAnimationFrame` ke ±2 fps sehingga waktu simulasi hanya maju ±2 detik per detik di sana; di Chromium headless (60 fps) kecepatan 20× tercapai.

## Batas yang diketahui

- Pacing mengikuti ARCHITECTURE §7.1 (satu `ADVANCE_TO` per frame, maksimal +1 detik dari ACK). Pada perangkat di bawah 20 fps, 20× tidak tercapai; perlu dicek pada perangkat acuan sebelum mengubah kontrak.
- Belum diuji: Firefox, Edge, Safari; screen reader; kontras pada render aktual; reduced motion pada UI; FPS/latency perangkat acuan; batal Selesaikan cepat lewat UI (terlalu cepat untuk diklik pada preset; dicakup tes integrasi); state ERROR/LIMIT_REACHED lewat UI.
- Bantuan ringkas muncul di setiap kunjungan karena preferensi "sudah dilihat" belum disimpan (penyimpanan lokal adalah WP-09).
