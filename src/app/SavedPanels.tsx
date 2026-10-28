import { useState } from 'react';
import type { Expected, Listing, Slot } from '../storage/scenarios';
import { MAX_SLOTS, nameError } from '../storage/scenarios';
import { formatClock, formatCount, formatRate } from './format';
import { ConfirmDialog, DialogShell, Icon } from './ui';

const savedAt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const slotName = (slot: Slot) => (slot.status === 'ok' ? slot.record.config.name : 'Konfigurasi tidak dapat dimuat');
const asExpected = (slot: Slot): Expected => ({ recordId: slot.recordId, raw: slot.raw });

/** SCR-03: local slots of this browser. Names are rendered as text, never as HTML. */
export function SavedDrawer({ open, listing, stale, notice, onClose, onSave, onLoad, onDelete }: {
  open: boolean; listing: Listing; stale: boolean; notice: { tone: 'success' | 'danger'; text: string } | null; onClose: () => void; onSave: () => void;
  onLoad: (slot: Extract<Slot, { status: 'ok' }>) => void; onDelete: (slot: Slot) => void;
}) {
  return (
    <DialogShell open={open} className="dialog drawer" labelledBy="saved-title" describedBy="saved-desc" onClose={onClose}>
      <div className="drawer-head">
        <h2 id="saved-title" tabIndex={-1}>Tersimpan</h2>
        <button type="button" className="icon-button small" aria-label="Tutup" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      <p id="saved-desc" className="dialog-description">
        Tersimpan di browser ini, maksimal {MAX_SLOTS} slot ({formatCount(listing.slots.length)} terpakai). Tidak tersinkron antarperangkat dan dapat hilang saat data browser dibersihkan. Progres run tidak disimpan, hanya konfigurasi.
      </p>
      {listing.reason && <p className="callout warning"><Icon name="warning" /><span>{listing.reason}</span></p>}
      {notice && <p className={`callout ${notice.tone}`} role={notice.tone === 'danger' ? 'alert' : 'status'}><Icon name={notice.tone === 'danger' ? 'warning' : 'check'} /><span>{notice.text}</span></p>}
      {stale && <p className="callout info" role="status"><Icon name="info" /><span>Daftar diperbarui karena ada perubahan dari tab lain.</span></p>}
      <button type="button" className="button primary" disabled={!listing.writable} onClick={onSave}><Icon name="save" />Simpan konfigurasi</button>
      {listing.readable && listing.slots.length === 0 && (
        <div className="card saved-empty">
          <Icon name="folder" size={28} />
          <h3 id="saved-empty-title" tabIndex={-1}>Belum ada konfigurasi tersimpan</h3>
          <p className="field-hint">Simpan skenario yang sedang dibuka untuk memuatnya lagi nanti di browser ini.</p>
        </div>
      )}
      {listing.slots.length > 0 && (
        <ul className="saved-list" aria-label="Konfigurasi tersimpan">
          {listing.slots.map(slot => (
            <li key={slot.recordId} className={`card saved-item${slot.status === 'ok' ? '' : ' broken'}`}>
              <div className="saved-text">
                <strong className="saved-name" title={slotName(slot)}>{slotName(slot)}</strong>
                {slot.status === 'ok' ? (
                  <>
                    <span className="field-hint">{savedAt.format(new Date(slot.record.savedAt))}</span>
                    <span className="saved-meta">
                      {slot.record.config.c} loket · {formatRate(slot.record.config.lambdaPerMinute)}/menit · {slot.record.config.serviceMinSec}–{slot.record.config.serviceMaxSec} detik · {formatClock(slot.record.config.horizonSec)} · seed {slot.record.config.rootSeed}
                      {slot.record.config.manualSchedule.length > 0 && ` · ${slot.record.config.manualSchedule.length} jadwal`}
                    </span>
                  </>
                ) : <span className="field-error"><Icon name="warning" size={14} />{slot.message} Record tidak diubah.</span>}
              </div>
              <div className="saved-actions">
                {slot.status === 'ok' && (
                  <button type="button" id={`load-${slot.recordId}`} className="button compact" aria-label={`Muat ${slot.record.config.name}`} onClick={() => onLoad(slot)}>Muat</button>
                )}
                <button type="button" id={`delete-${slot.recordId}`} className="button compact danger" disabled={!listing.writable}
                  aria-label={`Hapus ${slotName(slot)}`} onClick={() => onDelete(slot)}>Hapus</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DialogShell>
  );
}

export type SaveRequest = { name: string; includeLog: boolean; target: Expected | null };

/** SCR-04: name, optional run additions, and an explicit target when updating or when all slots are full. */
export function SaveDialog({ open, source, defaultName, logEntries, listing, loaded, onClose, onSave }: {
  open: boolean; source: string; defaultName: string; logEntries: number; listing: Listing;
  loaded: Expected | null; onClose: () => void; onSave: (request: SaveRequest) => Promise<string | null>;
}) {
  const loadedSlot = loaded ? listing.slots.find(slot => slot.recordId === loaded.recordId && slot.raw === loaded.raw) ?? null : null;
  const [name, setName] = useState(defaultName);
  const [includeLog, setIncludeLog] = useState(false);
  const [mode, setMode] = useState<'update' | 'new'>(loadedSlot ? 'update' : 'new');
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameInvalid, setNameInvalid] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const full = listing.slots.length >= MAX_SLOTS;
  const target: Slot | null = mode === 'update' && loadedSlot ? loadedSlot
    : full ? listing.slots.find(slot => slot.recordId === replaceId) ?? null : null;

  async function commit() {
    setConfirming(false);
    setSaving(true);
    const failure = await onSave({ name, includeLog, target: target ? asExpected(target) : null });
    setSaving(false);
    if (failure) setError(failure);
  }

  function submit() {
    const invalid = nameError(name);
    setNameInvalid(invalid);
    if (invalid) { document.getElementById('save-name')?.focus(); return; }
    if (mode === 'new' && full && !target) { setError('Penyimpanan penuh: pilih konfigurasi untuk diganti atau hapus satu slot.'); return; }
    setError(null);
    if (target) setConfirming(true);
    else void commit();
  }

  return (
    <DialogShell open={open} labelledBy="save-title" describedBy="save-desc" onClose={onClose}>
      <h2 id="save-title">Simpan konfigurasi</h2>
      <p id="save-desc" className="dialog-description">Sumber: {source}. Tersimpan di browser ini; hanya konfigurasi yang disimpan, bukan progres run.</p>
      <form className="save-form" noValidate onSubmit={event => { event.preventDefault(); submit(); }}>
        <div className="field">
          <div className="field-head"><label htmlFor="save-name">Nama</label><span>1–60 karakter</span></div>
          <div className={`field-control${nameInvalid ? ' invalid' : ''}`}>
            <input id="save-name" type="text" autoComplete="off" autoFocus value={name} maxLength={200}
              aria-invalid={nameInvalid ? true : undefined} aria-describedby={nameInvalid ? 'save-name-error' : undefined}
              onChange={event => setName(event.target.value)} />
          </div>
          {nameInvalid && <p id="save-name-error" className="field-error"><Icon name="warning" size={14} />{nameInvalid}</p>}
        </div>
        {logEntries > 0 && (
          <label className="check">
            <input type="checkbox" checked={includeLog} onChange={event => setIncludeLog(event.target.checked)} />
            <span>Sertakan tambahan pelanggan run ini ({formatCount(logEntries)} entri) sebagai bagian jadwal</span>
          </label>
        )}
        {loadedSlot && (
          <fieldset className="choice">
            <legend>Tujuan</legend>
            <label className="check"><input type="radio" name="save-mode" checked={mode === 'update'} onChange={() => setMode('update')} />
              <span>Perbarui konfigurasi ini ({slotName(loadedSlot)})</span></label>
            <label className="check"><input type="radio" name="save-mode" checked={mode === 'new'} onChange={() => setMode('new')} />
              <span>Simpan sebagai baru</span></label>
          </fieldset>
        )}
        {mode === 'new' && full && (
          <fieldset className="choice">
            <legend>Penyimpanan penuh — pilih slot untuk diganti</legend>
            {listing.slots.map(slot => (
              <label className="check" key={slot.recordId}>
                <input type="radio" name="save-replace" checked={replaceId === slot.recordId} onChange={() => setReplaceId(slot.recordId)} />
                <span>{slotName(slot)}</span>
              </label>
            ))}
          </fieldset>
        )}
        {error && <p className="callout danger" role="alert"><Icon name="warning" /><span>{error}</span></p>}
        <div className="dialog-actions">
          <button type="button" className="button" onClick={onClose}>Batal</button>
          <button type="submit" className="button primary" aria-disabled={saving || undefined}><Icon name="save" />Simpan</button>
        </div>
      </form>
      <ConfirmDialog open={confirming} title="Ganti konfigurasi tersimpan?"
        description={<p>Konfigurasi “{target ? slotName(target) : ''}” diganti dengan “{name.trim()}”. Data lama baru diganti setelah penyimpanan berhasil.</p>}
        confirmLabel="Ganti konfigurasi" onCancel={() => setConfirming(false)} onConfirm={() => void commit()} />
    </DialogShell>
  );
}
