import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { createSimulationController } from '../controller/client';
import type { ControllerView, SimulationController, Speed } from '../controller/client';
import type { ScenarioConfig } from '../domain/config';
import type { RunStatus } from '../simulation/engine';
import type { Ack } from '../workers/protocol';
import { buildConfig, draftReducer, FIELD_ORDER, fieldValue, horizonSec, initialDraft, outOfRange, parseNumber } from './draft';
import { formatClock } from './format';
import { ParameterPanel } from './ParameterPanel';
import { InputLog, Results, Stage, STATUS_LABEL, StatusStrip } from './RunPanels';
import { ConfirmDialog, Dialog, Icon, NumberField } from './ui';
import type { IconName } from './ui';

const EMPTY_VIEW: ControllerView = { projection: null, state: null, speed: 20, transitioning: false, failure: null };
const noSubscribe = () => () => {};
const emptyView = () => EMPTY_VIEW;
const SPEEDS: Speed[] = [1, 5, 20];
type Accepted = Extract<Ack, { accepted: true }>;
type Notice = { tone: 'success' | 'danger'; text: string } | null;

// The controller owns a worker, so it lives in an effect (StrictMode-safe) rather than in render.
function useController() {
  const [controller, setController] = useState<SimulationController | null>(null);
  useEffect(() => {
    const created = createSimulationController();
    setController(created);
    return () => created.dispose();
  }, []);
  const view = useSyncExternalStore(controller?.subscribe ?? noSubscribe, controller?.getView ?? emptyView, emptyView);
  return [controller, view] as const;
}

function rejectionText(ack: Extract<Ack, { accepted: false }>) {
  if (ack.code === 'LIMIT_REACHED') return 'Batas percobaan tercapai; kurangi durasi atau kedatangan.';
  if (ack.code === 'INVALID_INPUT' || ack.code === 'INVALID_STATE' || ack.code === 'BUSY') return ack.message;
  return `Aksi tidak dapat diproses (${ack.code}). ${ack.message}`;
}

function statusAnnouncement(status: RunStatus, phase: string, fast: boolean, hidden: boolean) {
  if (status === 'RUNNING') return fast ? 'Menyelesaikan run.' : phase === 'draining' ? 'Kedatangan ditutup; sisa pelanggan sedang diselesaikan.' : 'Simulasi berjalan.';
  if (status === 'PAUSED') return hidden ? 'Simulasi dijeda karena tab tidak aktif.' : 'Simulasi dijeda.';
  if (status === 'COMPLETED') return 'Run selesai. Hasil final tersedia.';
  if (status === 'CANCELLED') return 'Run dibatalkan. Hasil belum final.';
  return `${STATUS_LABEL[status]}.`;
}

export function App() {
  const [controller, view] = useController();
  const [draft, dispatch] = useReducer(draftReducer, undefined, () => initialDraft());
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [announcement, setAnnouncement] = useState('');
  const [confirm, setConfirm] = useState<null | 'reset' | 'edit'>(null);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(true);
  const [addCount, setAddCount] = useState('1');
  const [addError, setAddError] = useState<string>();
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const lastConfig = useRef<ScenarioConfig | null>(null);

  const { projection } = view;
  const status: RunStatus = view.failure ? 'ERROR' : view.state?.status ?? 'READY';
  const phase = view.state?.phase ?? 'arrivalsOpen';
  const simTime = view.state?.simTimeSec ?? 0;
  const fast = status === 'RUNNING' && (projection?.fastMode ?? false);
  const hiddenPause = status === 'PAUSED' && projection?.pauseReason === 'hidden';
  const editable = status === 'READY' && !view.transitioning;
  const live = status === 'RUNNING' || status === 'PAUSED';
  const horizon = status === 'READY' ? horizonSec(draft.fields) : projection?.configSnapshot.horizonSec ?? null;
  const counters = status === 'READY' ? fieldValue(draft.fields, 'c') ?? projection?.configSnapshot.c ?? 2 : projection?.configSnapshot.c ?? 2;

  async function act<T extends Ack | null>(task: () => Promise<T>, onAccepted?: (ack: Accepted) => void) {
    if (busyRef.current || !controller) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const ack = await task();
      if (ack && !ack.accepted) setNotice({ tone: 'danger', text: rejectionText(ack) });
      else if (ack) onAccepted?.(ack);
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : String(error) });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function run() {
    const built = buildConfig(draft);
    if ('errors' in built) {
      flushSync(() => dispatch({ type: 'errors', errors: built.errors }));
      const first = FIELD_ORDER.find(name => built.errors[name]);
      const outside = outOfRange(draft)[0];
      document.getElementById(first ? `field-${first}` : outside ? `remove-${outside.id}` : 'entry-minute')?.focus();
      setAnnouncement('Run belum dimulai. Periksa isian yang ditandai.');
      return;
    }
    setNotice(null);
    void act(async () => {
      const created = await controller!.create(built.config);
      if (!created.accepted) return created;
      lastConfig.current = built.config;
      return controller!.run();
    });
  }

  function reset(edit: boolean) {
    setConfirm(null);
    setNotice(null);
    const fallback = lastConfig.current ?? (() => { const built = buildConfig(draft); return 'config' in built ? built.config : null; })();
    void act(() => (view.failure && fallback ? controller!.create(fallback) : controller!.reset()), () => {
      if (edit) setFocusTarget('field-c');
    });
  }

  function addCustomers() {
    const count = parseNumber(addCount);
    if (count === null || count < 1 || count > 20) {
      setAddError('Jumlah pelanggan harus bilangan bulat 1–20.');
      return;
    }
    setAddError(undefined);
    void act(() => controller!.addManual(count), ack => {
      const text = `${count} pelanggan dicatat pada ${formatClock(ack.entry!.atSimSec)}.`
        + (ack.state.status === 'PAUSED' ? ' Menunggu Lanjutkan, pada waktu jeda.' : '');
      setNotice({ tone: 'success', text });
      setAnnouncement(text);
    });
  }

  let primary: { label: string; icon: IconName; onClick: () => void };
  if (fast) primary = { label: 'Batalkan penyelesaian', icon: 'stop', onClick: () => void act(() => controller!.cancelFast()) };
  else if (status === 'READY') primary = { label: 'Jalankan', icon: 'play', onClick: run };
  else if (status === 'RUNNING') primary = { label: 'Pause', icon: 'pause', onClick: () => void act(() => controller!.pause()) };
  else if (status === 'PAUSED') primary = { label: 'Lanjutkan', icon: 'play', onClick: () => void act(() => controller!.resume()) };
  else if (status === 'COMPLETED') primary = { label: 'Ulangi run yang sama', icon: 'replay', onClick: () => void act(() => controller!.replay(), () => setAnnouncement('Memutar ulang percobaan yang sama.')) };
  else primary = { label: 'Reset run', icon: 'reset', onClick: () => setConfirm('reset') };

  // Announce state changes once; the timer itself is never announced.
  const announcedKey = useRef<string | null>(null);
  const statusKey = `${status}|${phase}|${fast}|${hiddenPause}`;
  useEffect(() => {
    if (announcedKey.current === null) { announcedKey.current = statusKey; return; }
    if (announcedKey.current === statusKey) return;
    announcedKey.current = statusKey;
    setAnnouncement(statusAnnouncement(status, phase, fast, hiddenPause));
    setNotice(current => (current?.tone === 'success' ? null : current));
  }, [statusKey, status, phase, fast, hiddenPause]);

  useEffect(() => {
    if (!focusTarget) return;
    const element = document.getElementById(focusTarget) as HTMLInputElement | null;
    if (element && !element.disabled) {
      element.focus();
      setFocusTarget(null);
    }
  }, [focusTarget, editable]);

  // Hidden tab: pause on the worker's checkpoint, no catch-up and no automatic resume.
  useEffect(() => {
    if (!controller) return;
    const onVisibility = () => { if (document.visibilityState === 'hidden') controller.pauseForHidden().catch(() => {}); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [controller]);

  const hasProgress = live || status === 'COMPLETED';
  useEffect(() => {
    if (!hasProgress) return;
    const onUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [hasProgress]);

  // Space toggles pause/resume only from non-interactive workspace focus, never from fields or dialogs.
  const toggleRef = useRef<() => void>(() => {});
  toggleRef.current = () => {
    if (status === 'RUNNING' && !fast) primary.onClick();
    else if (status === 'PAUSED') primary.onClick();
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, button, a, summary, [contenteditable], [role="slider"], [role="tab"], dialog')
        || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      toggleRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const addReason = fast ? 'Tidak tersedia selama penyelesaian cepat.'
    : phase === 'draining' || (horizon !== null && simTime >= horizon) ? 'Kedatangan ditutup; sisa pelanggan sedang diselesaikan.' : null;
  const name = projection?.configSnapshot.name ?? 'Jam makan siang';

  return (
    <>
      <a className="skip-link" href="#kontrol">Ke kontrol simulasi</a>
      <a className="skip-link" href="#hasil">Ke hasil</a>
      <header className="site-header">
        <div className="brand">
          <a className="wordmark" href="./">TomorrowLab</a>
          <span className="tagline">Coba skenario. Pahami dampaknya.</span>
        </div>
        <nav className="header-actions" aria-label="Informasi">
          <button type="button" className="button quiet compact" onClick={() => setAssumptionsOpen(true)}><Icon name="info" />Asumsi model</button>
          <button type="button" className="button quiet compact" aria-expanded={helpOpen} aria-controls="help"
            onClick={() => { setHelpOpen(true); setFocusTarget('help-title'); }}>Bantuan</button>
        </nav>
      </header>

      <main id="main">
        {helpOpen && (
          <section className="help" id="help" aria-labelledby="help-title">
            <h2 id="help-title" tabIndex={-1}>Mulai dalam tiga langkah</h2>
            <ol>
              <li><strong>Jalankan</strong> preset untuk melihat pelanggan datang, menunggu, dilayani dan selesai.</li>
              <li><strong>Ubah skenario</strong> sebelum run: jumlah loket, kedatangan, waktu pelayanan dan jadwal pelanggan.</li>
              <li><strong>Tambah pelanggan</strong> saat run berjalan atau dijeda untuk mencoba lonjakan.</li>
            </ol>
            <p className="muted">Semua kontrol bisa dipakai dengan keyboard; kamera tidak diperlukan. Progres run tidak dipulihkan setelah halaman dimuat ulang.</p>
            <div className="help-actions">
              <button type="button" className="button secondary compact" onClick={() => { setHelpOpen(false); setFocusTarget('workspace-title'); }}>Lewati</button>
              <button type="button" className="button secondary compact" onClick={() => { setHelpOpen(false); setFocusTarget('primary-action'); }}>Mulai mencoba</button>
            </div>
          </section>
        )}

        <div className="workspace-head">
          <p className="eyebrow">Skenario · Antrean kantin · Data sintetis</p>
          <h1 id="workspace-title" tabIndex={-1}>{name}</h1>
        </div>

        <StatusStrip status={status} phase={phase} simTimeSec={simTime} horizonSec={horizon}
          fastMode={fast} pauseReason={projection?.pauseReason ?? null} />

        {view.failure && (
          <p className="callout danger" role="alert"><Icon name="warning" /><span>Worker simulasi berhenti. Reset untuk memulai lagi dengan parameter yang sama.</span></p>
        )}
        {hiddenPause && (
          <p className="callout info"><Icon name="pause" /><span>Dijeda karena tab tidak aktif. Lanjutkan saat siap.</span></p>
        )}

        <div className="workspace">
          <ParameterPanel draft={draft} dispatch={dispatch} editable={editable} onUnlock={() => setConfirm('edit')} />

          <div className="run-column">
            <section className="panel toolbar" aria-label="Kontrol run">
              <div className="toolbar-row">
                <button type="button" id="primary-action" className="button primary" disabled={!controller}
                  aria-disabled={busy || view.transitioning || undefined}
                  onClick={() => { if (!busyRef.current && !view.transitioning) primary.onClick(); }}>
                  <Icon name={primary.icon} />{primary.label}
                </button>
                {live && !fast && (
                  <button type="button" className="button secondary" onClick={() => void act(() => controller!.fastFinish())}>
                    <Icon name="fast" />Selesaikan cepat
                  </button>
                )}
                <fieldset className="speed">
                  <legend>Kecepatan tampilan</legend>
                  <div className="segmented">
                    {SPEEDS.map(speed => (
                      <label key={speed}>
                        <input type="radio" name="speed" value={speed} checked={view.speed === speed}
                          onChange={() => controller?.setSpeed(speed)} />
                        <span>{speed}×</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {(live || status === 'COMPLETED') && (
                  <button type="button" className="button danger" onClick={() => setConfirm('reset')}><Icon name="reset" />Reset run</button>
                )}
              </div>
              <p className="field-hint">Kecepatan hanya mengatur tampilan, tidak mengubah hasil. Spasi menjeda atau melanjutkan saat fokus tidak berada di kolom isian.</p>

              {live && (
                <div className="add-customers" role="group" aria-labelledby="add-title">
                  <h3 id="add-title">Tambah pelanggan</h3>
                  <NumberField id="add-count" label="Jumlah" unit="orang" value={addCount} error={addError}
                    disabled={addReason !== null} onChange={setAddCount} onCommit={() => {}}
                    hint={addReason ?? `Pada waktu simulasi ${formatClock(simTime)}. Jumlah 1–20.`}
                    after={<button type="button" className="button secondary" disabled={addReason !== null} onClick={addCustomers}>
                      <Icon name="plus" />Tambah pelanggan</button>} />
                </div>
              )}

              {notice && (
                <p key={notice.text} className={`callout ${notice.tone}`} role={notice.tone === 'danger' ? 'alert' : undefined}>
                  <Icon name={notice.tone === 'danger' ? 'warning' : 'check'} /><span>{notice.text}</span>
                </p>
              )}
            </section>

            <Stage c={counters} projection={status === 'READY' ? null : projection} />
          </div>

          <div className="side-column">
            <Results status={status} projection={projection} onAssumptions={() => setAssumptionsOpen(true)} />
            <InputLog status={status} projection={projection} />
          </div>
        </div>
      </main>

      <footer className="site-footer">
        <span>TomorrowLab · simulasi sintetis, belum dikalibrasi terhadap kantin nyata.</span>
      </footer>

      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      <ConfirmDialog open={confirm !== null}
        title={confirm === 'edit' ? 'Reset untuk mengubah skenario?' : 'Reset run ini?'}
        description={<p>{confirm === 'edit' ? 'Hasil dan progres run ini akan ditinggalkan; perubahan baru tidak mengedit sejarah run. ' : ''}
          Hapus progres, hasil run, dan tambahan pelanggan selama run ini? Parameter, seed, dan jadwal awal tetap disimpan.</p>}
        confirmLabel={confirm === 'edit' ? 'Reset dan edit' : 'Reset run'}
        onCancel={() => setConfirm(null)} onConfirm={() => reset(confirm === 'edit')} />

      <Dialog open={assumptionsOpen} title="Asumsi model" onClose={() => setAssumptionsOpen(false)}
        description={<p>Hasil adalah eksperimen sintetis. Kesesuaiannya dengan kantin nyata belum divalidasi dengan data lapangan.</p>}
        actions={<button type="button" className="button secondary" autoFocus onClick={() => setAssumptionsOpen(false)}>Tutup</button>}>
        <ul className="assumptions">
          <li>Satu antrean bersama, dilayani menurut urutan datang (FIFO), oleh 1–6 loket identik.</li>
          <li>Kedatangan otomatis mengikuti proses Poisson; pelanggan manual adalah tambahan di luar Poisson.</li>
          <li>Waktu pelayanan acak seragam antara minimum dan maksimum.</li>
          <li>Kantin kosong saat mulai. Pelanggan diterima selama durasi menerima pelanggan, lalu sisa pelanggan diselesaikan.</li>
          <li>Jarak berjalan dan posisi tampilan tidak memengaruhi waktu. Tidak ada pelanggan yang batal atau pindah antrean.</li>
          <li>Batas 2.000 pelanggan per run; melewatinya menghentikan run sebagai tidak valid.</li>
          <li>Seed, konfigurasi, versi model dan catatan pelanggan manual yang sama menghasilkan run yang sama.</li>
        </ul>
      </Dialog>
    </>
  );
}
