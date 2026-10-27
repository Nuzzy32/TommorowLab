import { memo, useState } from 'react';
import type { Dispatch } from 'react';
import { fieldValue, horizonSec, nominalLoad, outOfRange } from './draft';
import type { Draft, DraftAction, FieldName } from './draft';
import { formatClock, formatCount, formatDecimal2, formatRate } from './format';
import { Icon, NumberField } from './ui';

const PAGE = 20;

export const ParameterPanel = memo(function ParameterPanel({ draft, dispatch, editable, status, onUnlock }: {
  draft: Draft; dispatch: Dispatch<DraftAction>; editable: boolean; status: 'draft' | 'running' | 'done'; onUnlock: () => void;
}) {
  const [open, setOpen] = useState(false);
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
    <section className="glass panel config area-config" id="kontrol" aria-labelledby="config-title" tabIndex={-1} data-collapsed={!open}>
      <div className="panel-head">
        <div>
          <h2 id="config-title">Skenario</h2>
          <p className="panel-sub">{status === 'draft' ? 'Draft · dapat diedit' : `Snapshot terkunci · ${status === 'done' ? 'selesai' : 'run aktif'}`}</p>
        </div>
        <button type="button" className="button compact config-toggle" aria-expanded={open} aria-controls="config-body" onClick={() => setOpen(!open)}>
          {open ? 'Tutup' : `${c ?? '—'} loket · ${lambda === null ? '—' : formatRate(lambda)}/mnt`}<Icon name={open ? 'caretUp' : 'caretDown'} size={14} />
        </button>
      </div>
      <div className="config-body" id="config-body">
        {!editable && (
          <div className="card lock-note">
            <p><Icon name="lock" size={16} /><span>Parameter run ini dikunci agar percobaan dapat diulang. Ubah skenario untuk mengedit.</span></p>
            <button type="button" className="button compact" onClick={onUnlock}><Icon name="pencil" size={15} />Ubah skenario</button>
          </div>
        )}

        {field('c', 'Loket aktif', '', {
          className: 'stepper', aside: '1–6 loket identik',
          hint: c === 6 ? 'Maksimum 6 loket.' : c === 1 ? 'Minimum 1 loket.' : undefined,
          before: <button type="button" className="icon-button" aria-label="Kurangi jumlah loket"
            disabled={!editable || c === null || c <= 1} onClick={() => dispatch({ type: 'step', name: 'c', delta: -1 })}><Icon name="minus" size={16} /></button>,
          after: <button type="button" className="icon-button" aria-label="Tambah loket"
            disabled={!editable || c === null || c >= 6} onClick={() => dispatch({ type: 'step', name: 'c', delta: 1 })}><Icon name="plus" size={16} /></button>,
        })}

        <div className="group">
          {field('lambda', 'Kedatangan otomatis', 'pelanggan/menit', {
            decimal: true, aside: '0–20, nol sah',
          })}
          <input type="range" className="slider" min={0} max={20} step={0.1} value={lambda ?? 0} disabled={!editable}
            aria-labelledby="field-lambda-label" aria-valuetext={`${lambda ?? 0} pelanggan per menit`}
            onChange={event => {
              dispatch({ type: 'edit', name: 'lambda', value: event.target.value });
              dispatch({ type: 'commit', name: 'lambda' });
            }} />
        </div>

        <div className="group">
          <div className="group-head"><h3>Waktu pelayanan</h3><span>per pelanggan, detik</span></div>
          <div className="pair">
            {field('serviceMin', 'Minimum', 'detik')}
            {field('serviceMax', 'Maksimum', 'detik')}
          </div>
        </div>

        <div className="pair">
          {field('horizonMin', 'Durasi menerima pelanggan', 'menit', {
            hint: horizon === null ? 'Dalam menit, 1–30.' : `${horizon / 60} menit = ${formatCount(horizon)} detik`,
          })}
          {field('seed', 'Seed percobaan', '', {
            hint: 'Ulangi sumber acak yang sama',
            after: <button type="button" className="icon-button small" aria-label="Seed baru" title="Seed baru" disabled={!editable}
              onClick={() => {
                dispatch({ type: 'edit', name: 'seed', value: String(Math.floor(Math.random() * 100000)) });
                dispatch({ type: 'commit', name: 'seed' });
              }}><Icon name="shuffle" size={15} /></button>,
          })}
        </div>

        {load !== null && load >= 1 && (
          <div className="callout warning"><Icon name="warning" />
            <div><strong>Permintaan otomatis {load > 1 ? 'melebihi' : 'menyamai'} kapasitas rata-rata (ρ = {formatDecimal2(load)})</strong>
              Antrean dapat terus bertambah selama jam kedatangan. Run tetap dapat dijalankan.
              {draft.schedule.length > 0 && ' ρ tidak mencakup pelanggan terjadwal manual.'}</div></div>
        )}
        {lambda === 0 && draft.schedule.length === 0 && (
          <p className="callout info"><Icon name="info" /><span>Tidak ada pelanggan terjadwal. Run tetap sah, hasilnya kosong.</span></p>
        )}

        <ScheduleEditor draft={draft} dispatch={dispatch} editable={editable} />
      </div>
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
      <div className="group-head">
        <h3 id="schedule-title">Jadwal pelanggan manual</h3>
        <span>{draft.schedule.length === 0 ? 'Kosong' : `${formatCount(draft.schedule.length)} entri · ${formatCount(total)} pelanggan`}</span>
      </div>
      {rows.length > 0 && (
        <ul className="entry-list" aria-labelledby="schedule-title">
          {rows.slice(0, shown).map((entry, index) => (
            <li key={entry.id} className={outside.has(entry.id) ? 'invalid' : undefined}>
              <span className="mono">{formatClock(entry.atSimSec)}</span>
              <span>+{entry.count} pelanggan</span>
              {outside.has(entry.id)
                ? <span className="tag danger"><Icon name="warning" size={13} />Di luar durasi</span>
                : <span className="tag schedule">Terjadwal</span>}
              {editable && (
                <button type="button" id={`remove-${entry.id}`} className="icon-button small quiet"
                  aria-label={`Hapus jadwal ${formatClock(entry.atSimSec)}, ${entry.count} pelanggan`} onClick={() => remove(index)}>
                  <Icon name="trash" size={15} />
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
      {draft.errors.schedule && <p id="schedule-error" className="field-error" role="alert"><Icon name="warning" size={14} />{draft.errors.schedule}</p>}

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
            <button type="submit" className="button compact"><Icon name="plus" size={14} />Tambah jadwal</button>
          </div>
          <p id="entry-hint" className="field-hint">Waktu simulasi sejak run dimulai, sebelum akhir durasi. Jumlah 1–20.</p>
          {draft.errors.entry && <p id="entry-error" className="field-error"><Icon name="warning" size={14} />{draft.errors.entry}</p>}
        </form>
      )}
    </div>
  );
}
