import type { RefObject } from 'react';
import type { GateStatus } from '../airshift/gate';
import { Icon } from './ui';

export const AIRSHIFT_ENABLED = import.meta.env.VITE_AIRSHIFT !== '0';
export type AirStatus = 'off' | 'requesting' | 'loading' | 'error' | GateStatus;
export type AirView = { status: AirStatus; message: string | null; progress: number; pose: 'Open_Palm' | 'Thumb_Up' | null; feedback: string | null };

const LABEL: Record<AirStatus, string> = {
  off: 'AirShift nonaktif', requesting: 'Menunggu izin kamera', loading: 'Menyiapkan pengenalan tangan', error: 'AirShift berhenti',
  ready: 'AirShift siap', 'no-hand': 'Tangan belum terlihat', 'low-confidence': 'Pose belum jelas', 'multiple-hands': 'Gunakan satu tangan',
  holding: 'Tahan pose…', 're-arm': 'Turunkan tangan sebelum gesture berikutnya',
};
const HINT: Partial<Record<AirStatus, string>> = {
  requesting: 'Izinkan akses kamera di browser. Kontrol manual tetap tersedia.',
  loading: 'Model dimuat dan dijalankan di perangkat ini. Belum ada gesture yang dijalankan.',
  ready: 'Gunakan satu tangan. Telapak terbuka menjeda, jempol ke atas melanjutkan.',
  'no-hand': 'Arahkan satu tangan ke kamera. Run mengikuti status terakhir.',
  'low-confidence': 'Tahan pose lebih jelas; aksi tidak dijalankan.',
  'multiple-hands': 'Lebih dari satu tangan terlihat; semua pose diabaikan.',
  're-arm': 'Satu pose hanya menjalankan satu aksi.',
};
export const cameraOn = (status: AirStatus) => status !== 'off' && status !== 'error';

/** CMP-16: opt-in explanation first, then status text (never colour alone), dwell progress and an explicit off. */
export function AirShiftPanel({ open, view, videoRef, onEnable, onStop, onClose }: {
  open: boolean; view: AirView; videoRef: RefObject<HTMLVideoElement | null>; onEnable: () => void; onStop: () => void; onClose: () => void;
}) {
  const on = cameraOn(view.status);
  return (
    <aside className="glass airshift" aria-labelledby="airshift-title" hidden={!open}>
      <div className="airshift-head">
        <span className="airshift-icon" aria-hidden="true"><Icon name="hand" size={20} /></span>
        <div><h2 id="airshift-title">AirShift</h2><p className="field-hint">Kontrol gesture opsional</p></div>
        <button type="button" className="icon-button small" aria-label="Tutup panel AirShift" onClick={onClose}><Icon name="close" size={15} /></button>
      </div>
      {!on && (
        <>
          <p className="airshift-consent">Kamera diproses di perangkat untuk mengenali pose tangan. Frame tidak dikirim atau disimpan oleh TomorrowLab. Semua kontrol manual tetap tersedia.</p>
          <div className="airshift-poses">
            <div className="card"><Icon name="hand" size={22} /><strong>Telapak terbuka</strong><span className="field-hint">Pause run yang berjalan</span></div>
            <div className="card"><Icon name="thumbsUp" size={22} /><strong>Jempol ke atas</strong><span className="field-hint">Lanjutkan run yang dijeda</span></div>
          </div>
          <p className="field-hint">Audio tidak diminta. Gesture tidak dapat memulai, mereset, menyimpan, atau menambah pelanggan.</p>
          {view.message && <p className={`callout ${view.status === 'error' ? 'danger' : 'info'}`} role={view.status === 'error' ? 'alert' : 'status'}><Icon name={view.status === 'error' ? 'warning' : 'info'} /><span>{view.message}</span></p>}
          <div className="dialog-actions">
            <button type="button" className="button" onClick={onClose}>Batal</button>
            <button type="button" className="button primary" onClick={onEnable}><Icon name="camera" />{view.status === 'error' ? 'Coba lagi' : 'Aktifkan AirShift'}</button>
          </div>
        </>
      )}
      <div className="airshift-live" hidden={!on}>
        <video ref={videoRef} className="airshift-preview" muted playsInline aria-label="Pratinjau kamera, tidak disimpan" />
        <div className="airshift-state">
          <p className="tag info airshift-status" role="status">{LABEL[view.status]}</p>
          {HINT[view.status] && <p className="field-hint">{HINT[view.status]}</p>}
        </div>
      </div>
      {on && (
        <>
          <div className="airshift-dwell">
            <label htmlFor="airshift-dwell">{view.pose ? `Tahan pose ${view.pose === 'Open_Palm' ? 'telapak terbuka' : 'jempol ke atas'}…` : 'Belum ada pose'}</label>
            <progress id="airshift-dwell" max={1} value={view.progress} />
          </div>
          {view.feedback && <p className="callout info"><Icon name="info" /><span>{view.feedback}</span></p>}
          <button type="button" className="button danger" onClick={onStop}><Icon name="cameraOff" />Matikan AirShift</button>
        </>
      )}
    </aside>
  );
}
