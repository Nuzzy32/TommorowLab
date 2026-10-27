import { memo, useState } from 'react';
import type { Dispatch } from 'react';
import { fieldValue, horizonSec, nominalLoad, outOfRange } from './draft';
import type { Draft, DraftAction, FieldName } from './draft';
import { formatClock, formatCount, formatDecimal2 } from './format';
import { Icon, NumberField } from './ui';

const PAGE = 20;

export const ParameterPanel = memo(function ParameterPanel({ draft, dispatch, editable, onUnlock }: {
  draft: Draft; dispatch: Dispatch<DraftAction>; editable: boolean; onUnlock: () => void;
}) {
  const field = (name: FieldName, label: string, unit: string, extra: Partial<Parameters<typeof NumberField>[0]> = {}) => (
    <NumberField id={`field-${name}`} label={label} unit={unit} value={draft.fields[name]} error={draft.errors[name]}
      disabled={!editable} onChange={value => dispatch({ type: 'edit', name, value })}
      onCommit={() => dispatch({ type: 'commit', name })} {...extra} />
  );
  const c = fieldValue(draft.fields, 'c');
  const lambda = fieldValue(draft.fields, 'lambda');
  const horizon = horizonSec(draft.fields);
  const load = nominalLoad(draft);

  return (
    <section className="panel config" id="kontrol" aria-labelledby="config-title" tabIndex={-1}>
      <div className="panel-head">
        <h2 id="config-title">Skenario</h2>
        {!editable && <span className="tag"><Icon name="lock" size={16} />Terkunci</span>}
      </div>
      {!editable && (
        <div className="lock-note">
          <p>Parameter run ini dikunci agar percobaan dapat diulang. Ubah skenario untuk mengedit.</p>
          <button type="button" className="button secondary compact" onClick={onUnlock}>Ubah skenario</button>
        </div>
      )}

      <div className="group">
        <h3>Kapasitas</h3>
        {field('c', 'Loket aktif', 'loket', {
          hint: c === 6 ? 'Maksimum 6 loket.' : c === 1 ? 'Minimum 1 loket.' : 'Loket identik, 1–6.',
          before: <button type="button" className="icon-button" aria-label="Kurangi jumlah loket"
            disabled={!editable || c === null || c <= 1} onClick={() => dispatch({ type: 'step', name: 'c', delta: -1 })}><Icon name="minus" /></button>,
          after: <button type="button" className="icon-button" aria-label="Tambah loket"
            disabled={!editable || c === null || c >= 6} onClick={() => dispatch({ type: 'step', name: 'c', delta: 1 })}><Icon name="plus" /></button>,
        })}
      </div>

      <div className="group">
        <h3>Kedatangan</h3>
        {field('lambda', 'Kedatangan otomatis', '/menit', {
          decimal: true, hint: 'Pelanggan per menit, 0–20. Nol berarti tanpa kedatangan otomatis.',
        })}
        <input type="range" className="slider" min={0} max={20} step={0.1} value={lambda ?? 0} disabled={!editable}
          aria-labelledby="field-lambda-label" aria-valuetext={`${lambda ?? 0} pelanggan per menit`}
          onChange={event => {
            dispatch({ type: 'edit', name: 'lambda', value: event.target.value });
            dispatch({ type: 'commit', name: 'lambda' });
          }} />
      </div>

      <div className="group">
        <h3>Waktu pelayanan</h3>
        <div className="pair">
          {field('serviceMin', 'Minimum', 'detik')}
          {field('serviceMax', 'Maksimum', 'detik')}
        </div>
        <p className="field-hint">Setiap pelanggan dilayani selama nilai acak seragam di antara keduanya. Sama berarti konstan.</p>
      </div>

      <div className="group">
        <h3>Durasi menerima pelanggan</h3>
        {field('horizonMin', 'Durasi', 'menit', {
          hint: horizon === null ? '1–30 menit.' : `${horizon / 60} menit = ${formatCount(horizon)} detik. Sesudahnya sisa pelanggan tetap diselesaikan.`,
        })}
      </div>

      <div className="group">
        <h3>Seed percobaan</h3>
        {field('seed', 'Seed', '', { hint: 'Seed, konfigurasi dan catatan input yang sama mengulang hasil yang sama.' })}
      </div>

      {load !== null && load >= 1 && (
        <p className="callout warning"><Icon name="warning" />
          <span>Permintaan otomatis menyamai atau melebihi kapasitas rata-rata (ρ = {formatDecimal2(load)}). Antrean dapat terus bertambah selama jam kedatangan.
            {draft.schedule.length > 0 && ' ρ tidak mencakup pelanggan terjadwal manual.'}</span></p>
      )}
      {lambda === 0 && draft.schedule.length === 0 && (
        <p className="callout info"><Icon name="info" /><span>Tidak ada pelanggan terjadwal. Run tetap sah, hasilnya kosong.</span></p>
      )}

      <ScheduleEditor draft={draft} dispatch={dispatch} editable={editable} />
    </section>
  );
});

function ScheduleEditor({ draft, dispatch, editable }: { draft: Draft; dispatch: Dispatch<DraftAction>; editable: boolean }) {
  const [shown, setShown] = useState(PAGE);
  const outside = new Set(outOfRange(draft).map(entry => entry.id));
  const total = draft.schedule.reduce((sum, entry) => sum + entry.count, 0);
  const rows = [...draft.schedule].sort((a, b) => a.atSimSec - b.atSimSec || a.sequence - b.sequence);

  function remove(index: number) {
    const next = rows[index + 1] ?? rows[index - 1];
    dispatch({ type: 'removeEntry', id: rows[index].id });
    // Keep focus on a sensible neighbour once the row is gone.
    requestAnimationFrame(() => document.getElementById(next ? `remove-${next.id}` : 'entry-minute')?.focus());
  }

  return (
    <div className="group schedule">
      <h3 id="schedule-title">Jadwal pelanggan</h3>
      <p className="field-hint">
        {draft.schedule.length === 0 ? 'Belum ada jadwal. Jadwal berjalan bersama kedatangan otomatis.'
          : `${formatCount(total)} pelanggan dalam ${formatCount(draft.schedule.length)} jadwal.`}
      </p>
      {rows.length > 0 && (
        <ul className="entry-list" aria-labelledby="schedule-title">
          {rows.slice(0, shown).map((entry, index) => (
            <li key={entry.id} className={outside.has(entry.id) ? 'invalid' : undefined}>
              <span className="mono">{formatClock(entry.atSimSec)}</span>
              <span>{entry.count} pelanggan</span>
              {outside.has(entry.id)
                ? <span className="tag danger"><Icon name="warning" size={16} />Di luar durasi</span>
                : <span className="tag">Terjadwal</span>}
              {editable && (
                <button type="button" id={`remove-${entry.id}`} className="icon-button quiet"
                  aria-label={`Hapus jadwal ${formatClock(entry.atSimSec)}, ${entry.count} pelanggan`} onClick={() => remove(index)}>
                  <Icon name="trash" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {rows.length > shown && (
        <button type="button" className="button quiet compact" onClick={() => setShown(shown + PAGE)}>
          Lihat catatan berikutnya ({formatCount(rows.length - shown)} lagi)
        </button>
      )}
      {draft.errors.schedule && <p id="schedule-error" className="field-error" role="alert"><Icon name="warning" size={16} />{draft.errors.schedule}</p>}

      {editable && (
        <form className="entry-form" aria-label="Tambah jadwal pelanggan" noValidate
          onSubmit={event => { event.preventDefault(); dispatch({ type: 'addEntry' }); }}>
          <div className="entry-inputs">
            {(['minute', 'second', 'count'] as const).map(name => (
              <div className="field" key={name}>
                <label htmlFor={`entry-${name}`}>{name === 'minute' ? 'Menit' : name === 'second' ? 'Detik' : 'Jumlah'}</label>
                <div className={`field-control${draft.errors.entry ? ' invalid' : ''}`}>
                  <input id={`entry-${name}`} type="text" inputMode="numeric" autoComplete="off" value={draft.entry[name]}
                    aria-invalid={draft.errors.entry ? true : undefined} aria-describedby={draft.errors.entry ? 'entry-error' : 'entry-hint'}
                    onChange={event => dispatch({ type: 'editEntry', name, value: event.target.value })} />
                </div>
              </div>
            ))}
          </div>
          <p id="entry-hint" className="field-hint">Waktu simulasi sejak run dimulai, sebelum akhir durasi. Jumlah 1–20.</p>
          {draft.errors.entry && <p id="entry-error" className="field-error"><Icon name="warning" size={16} />{draft.errors.entry}</p>}
          <button type="submit" className="button secondary compact"><Icon name="plus" />Tambah jadwal</button>
        </form>
      )}
    </div>
  );
}
