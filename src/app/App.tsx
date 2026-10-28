import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { createSimulationController } from '../controller/client';
import type { ControllerView, SimulationController, Speed } from '../controller/client';
import { DEFAULT_CONFIG, promoteManualLog } from '../domain/config';
import type { ScenarioConfig } from '../domain/config';
import { browserScenarioStore, helpSeen, KEY_PREFIX, markHelpSeen } from '../storage/scenarios';
import type { Expected, Listing, Slot } from '../storage/scenarios';
import type { RunStatus } from '../simulation/engine';
import type { Ack } from '../workers/protocol';
import { buildConfig, draftReducer, FIELD_ORDER, fieldValue, horizonSec, initialDraft, outOfRange, parseNumber } from './draft';
import { formatClock } from './format';
import { ParameterPanel } from './ParameterPanel';
import { ComparePanel } from './ComparePanel';
import type { Baseline } from './ComparePanel';
import { InputLog, Results, SceneBox, STATUS_LABEL, StatusStrip } from './RunPanels';
import { SaveDialog, SavedDrawer } from './SavedPanels';
import type { SaveRequest } from './SavedPanels';
import { ConfirmDialog, DialogShell, Icon } from './ui';
import type { IconName } from './ui';

const EMPTY_VIEW: ControllerView = { projection: null, state: null, speed: 20, transitioning: false, failure: null, comparison: null, lastComparison: null };
const noSubscribe = () => () => {};
const emptyView = () => EMPTY_VIEW;
const SPEEDS: Speed[] = [1, 5, 20];
type Accepted = Extract<Ack, { accepted: true }>;
type Notice = { tone: 'success' | 'danger'; text: string } | null;

const HELP: { icon: IconName; title: string; body: string; tip: string }[] = [
  { icon: 'playCircle', title: 'Jalankan percobaan', body: 'Preset Jam makan siang sudah siap. Tekan Jalankan untuk melihat pelanggan datang, menunggu, dilayani, lalu selesai.',
    tip: 'Kecepatan tampilan 1×, 5×, 20× hanya mengubah pacing, bukan hasil. Spasi menjeda atau melanjutkan saat fokus tidak di kolom isian.' },
  { icon: 'sliders', title: 'Ubah skenario', body: 'Atur jumlah loket, kedatangan otomatis, waktu pelayanan, durasi menerima pelanggan dan jadwal saat status Siap dijalankan.',
    tip: 'Selama run, parameter dikunci. Ubah skenario akan mereset run setelah konfirmasi.' },
  { icon: 'userPlus', title: 'Tambah pelanggan', body: 'Saat run berjalan atau dijeda, tambahkan 1–20 pelanggan sekaligus. Kedatangan dicatat pada waktu simulasi, bukan waktu klik.',
    tip: 'Tambahan saat jeda menunggu diproses ketika run dilanjutkan.' },
  { icon: 'scales', title: 'Bandingkan A/B', body: 'Jadikan skenario sebagai baseline A, ubah loket atau waktu pelayanan kandidat B, lalu jalankan 20 pasangan replikasi dengan permintaan yang sama.',
    tip: 'Hasil ditampilkan sebagai selisih B − A dengan interval 95%; interval yang menyentuh nol berarti arahnya belum meyakinkan.' },
];
const ASSUMPTIONS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'flask', title: 'Data sintetis', body: 'Hasil berasal dari model, bukan data kantin nyata. Distribusi belum dikalibrasi terhadap lapangan.' },
  { icon: 'users', title: 'Kedatangan Poisson', body: 'Arus otomatis mengikuti proses Poisson dengan laju λ pelanggan/menit. Pelanggan manual adalah tambahan di luar Poisson.' },
  { icon: 'timer', title: 'Pelayanan uniform', body: 'Setiap pelanggan dilayani selama nilai acak seragam antara minimum dan maksimum. Jika sama, waktu pelayanan konstan.' },
  { icon: 'queue', title: 'Satu antrean FIFO', body: 'Satu antrean bersama melayani 1–6 loket identik. Kantin kosong saat mulai; tidak ada pelanggan yang batal atau pindah antrean.' },
  { icon: 'drain', title: 'Batas kedatangan lalu penyelesaian', body: 'Setelah durasi menerima pelanggan berakhir, sisa pelanggan tetap diselesaikan sampai kosong.' },
  { icon: 'walk', title: 'Ruang 3D hanya visual', body: 'Dapur, area makan, jarak berjalan dan posisi avatar tidak memengaruhi waktu tunggu atau pelayanan.' },
  { icon: 'warning', title: 'Batas 2.000 pelanggan', body: 'Melewati batas per run menghentikan run sebagai tidak valid.' },
  { icon: 'replay', title: 'Dapat diulang', body: 'Seed, konfigurasi, versi model dan catatan pelanggan manual yang sama menghasilkan run yang sama.' },
];

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
  const [tab, setTab] = useState<'sim' | 'compare'>('sim');
  const [compareConfirm, setCompareConfirm] = useState<null | 'open' | 'baseline'>(null);
  const [baseline, setBaseline] = useState<{ value: Baseline; version: number } | null>(null);
  const [compareNotice, setCompareNotice] = useState<string | null>(null);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(() => !helpSeen());
  const [store] = useState(browserScenarioStore);
  const [listing, setListing] = useState<Listing>({ readable: true, writable: false, reason: null, slots: [] });
  const [savedOpen, setSavedOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedStale, setSavedStale] = useState(false);
  const [savedNotice, setSavedNotice] = useState<Notice>(null);
  const [pendingLoad, setPendingLoad] = useState<Extract<Slot, { status: 'ok' }> | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Slot | null>(null);
  // Identity of the open scenario and, when it came from (or was written to) a slot, what that slot held.
  const [identity, setIdentity] = useState<Pick<ScenarioConfig, 'id' | 'name'>>({ id: DEFAULT_CONFIG.id, name: DEFAULT_CONFIG.name });
  const [loaded, setLoaded] = useState<Expected | null>(null);
  const [helpStep, setHelpStep] = useState(0);
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
  const batch = view.comparison;
  const batchActive = batch !== null && (batch.status === 'starting' || batch.status === 'running' || batch.status === 'suspended');
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
    const built = buildConfig(draft, identity);
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
    const fallback = lastConfig.current ?? (() => { const built = buildConfig(draft, identity); return 'config' in built ? built.config : null; })();
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

  // Baseline A from the Simulasi context: the valid draft when READY, otherwise the run's snapshot (never the live queue).
  function takeBaseline() {
    setCompareConfirm(null);
    let value: Baseline;
    if (status === 'READY' || !projection) {
      const built = buildConfig(draft, identity);
      if ('errors' in built) {
        setTab('sim');
        flushSync(() => dispatch({ type: 'errors', errors: built.errors }));
        setNotice({ tone: 'danger', text: 'Perbaiki isian skenario yang ditandai sebelum menjadikannya baseline A.' });
        return;
      }
      value = { config: built.config, source: 'draft skenario', log: [] };
    } else {
      value = { config: projection.configSnapshot, source: `snapshot run (${STATUS_LABEL[status].toLowerCase()})`, log: projection.inputLog };
    }
    setBaseline(current => ({ value, version: (current?.version ?? 0) + 1 }));
    setCompareNotice(null);
    setTab('compare');
    setAnnouncement(`Baseline A ditetapkan dari ${value.source}; kandidat B dibuat identik.`);
  }
  const requestBaseline = () => (baseline ? setCompareConfirm('baseline') : takeBaseline());

  // A running visual run is paused first: run and batch are never computed together (UF-09).
  function openCompare() {
    if (status === 'RUNNING') { setCompareConfirm('open'); return; }
    setTab('compare');
  }
  function pauseAndOpen() {
    setCompareConfirm(null);
    void act(() => controller!.pause(), () => setTab('compare'));
  }

  const refreshSaved = useCallback(() => setListing(store.list()), [store]);
  useEffect(() => {
    refreshSaved();
    // Another tab changed this app's slots: refresh and say so; locks still guard every write.
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(KEY_PREFIX)) { refreshSaved(); setSavedStale(true); }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshSaved]);
  useEffect(() => { if (!helpOpen) markHelpSeen(); }, [helpOpen]);

  async function saveConfig(request: SaveRequest): Promise<string | null> {
    let config: ScenarioConfig;
    if (status === 'READY' || !projection) {
      const built = buildConfig(draft, identity);
      if ('errors' in built) return 'Perbaiki isian skenario yang ditandai sebelum menyimpan.';
      config = built.config;
    } else {
      config = request.includeLog && projection.inputLog.length ? promoteManualLog(projection.configSnapshot, projection.inputLog) : projection.configSnapshot;
    }
    const outcome = await store.save(config, request.name, request.target);
    refreshSaved();
    if (!outcome.ok) return outcome.message;
    const record = outcome.record!;
    setSaveOpen(false);
    setIdentity({ id: record.recordId, name: record.config.name });
    setLoaded({ recordId: record.recordId, raw: JSON.stringify(record) });
    const text = `Konfigurasi “${record.config.name}” tersimpan di browser ini.`;
    setSavedNotice({ tone: 'success', text });
    if (!savedOpen) setNotice({ tone: 'success', text });
    setAnnouncement(text);
    return null;
  }

  function requestLoad(slot: Extract<Slot, { status: 'ok' }>) {
    if (batchActive) { setSavedNotice({ tone: 'danger', text: 'Batalkan perbandingan A/B yang sedang berjalan sebelum memuat konfigurasi.' }); return; }
    setPendingLoad(slot);
  }

  // Load opens READY with the saved values (FR-22); a previous run is replaced, never resumed.
  async function loadSlot(slot: Extract<Slot, { status: 'ok' }>) {
    const { config } = slot.record;
    setPendingLoad(null);
    setSavedOpen(false);
    setTab('sim');
    if (status !== 'READY' && view.state !== null) {
      await act(() => controller!.create(config));
      lastConfig.current = config;
    }
    dispatch({ type: 'load', config });
    setIdentity({ id: config.id, name: config.name });
    setLoaded({ recordId: slot.recordId, raw: slot.raw });
    const text = `Konfigurasi “${config.name}” dimuat dengan seed ${config.rootSeed}. Siap dijalankan.`;
    setNotice({ tone: 'success', text });
    setAnnouncement(text);
    setFocusTarget('field-c');
  }

  async function deleteSlot(slot: Slot) {
    setPendingDelete(null);
    const index = listing.slots.findIndex(item => item.recordId === slot.recordId);
    const neighbour = listing.slots[index + 1] ?? listing.slots[index - 1];
    const outcome = await store.remove({ recordId: slot.recordId, raw: slot.raw });
    refreshSaved();
    const label = slot.status === 'ok' ? slot.record.config.name : 'yang tidak dapat dimuat';
    if (!outcome.ok) { setSavedNotice({ tone: 'danger', text: outcome.message }); return; }
    if (loaded?.recordId === slot.recordId) setLoaded(null);
    const text = `Konfigurasi “${label}” dihapus.`;
    setSavedNotice({ tone: 'success', text });
    setAnnouncement(text);
    setFocusTarget(neighbour ? (neighbour.status === 'ok' ? `load-${neighbour.recordId}` : `delete-${neighbour.recordId}`) : 'saved-empty-title');
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

  const hasProgress = live || status === 'COMPLETED' || batchActive;
  useEffect(() => {
    if (!hasProgress) return;
    const onUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [hasProgress]);

  // Space toggles pause/resume only from non-interactive workspace focus, never from fields or dialogs.
  const toggleRef = useRef<() => void>(() => {});
  toggleRef.current = () => {
    if (tab !== 'sim' || batchActive) return;
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

  const addReason = batchActive ? 'Tidak tersedia selama perbandingan A/B berjalan.'
    : !live ? 'Tersedia saat run berjalan atau dijeda.'
    : fast ? 'Tidak tersedia selama penyelesaian cepat.'
      : phase === 'draining' || (horizon !== null && simTime >= horizon) ? 'Kedatangan ditutup; sisa pelanggan sedang diselesaikan.' : null;
  const name = status === 'READY' || !projection ? identity.name : projection.configSnapshot.name;
  const seed = status === 'READY' ? draft.fields.seed : String(projection?.configSnapshot.rootSeed ?? '');
  const step = HELP[helpStep];

  return (
    <>
      <div className="backdrop" aria-hidden="true"><span /><span /><span /></div>
      <a className="skip-link" href="#kontrol">Ke kontrol simulasi</a>
      <a className="skip-link" href="#hasil">Ke hasil</a>
      <div className="app">
        <header className="glass site-header">
          <div className="brand">
            <a className="wordmark" href="./">Tomorrow<span>Lab</span></a>
            <span className="tagline">Coba skenario. Pahami dampaknya.</span>
          </div>
          <div className="tabs" role="tablist" aria-label="Area kerja">
            <button type="button" role="tab" id="tab-sim" aria-controls="main" aria-selected={tab === 'sim'} tabIndex={tab === 'sim' ? 0 : -1}
              onClick={() => setTab('sim')}><Icon name="flask" size={16} />Simulasi</button>
            <button type="button" role="tab" id="tab-compare" aria-controls="panel-compare" aria-selected={tab === 'compare'} tabIndex={tab === 'compare' ? 0 : -1}
              onClick={openCompare}><Icon name="scales" size={16} />Bandingkan{batchActive && <span className="tab-dot" aria-label="perbandingan berjalan" />}</button>
          </div>
          <div className="header-spacer" />
          <div className="scenario-name">
            <h1 id="workspace-title" tabIndex={-1}>{name}</h1>
            <p>{loaded ? 'Tersimpan di browser ini' : 'Belum disimpan'} · data sintetis</p>
          </div>
          <nav className="header-actions" aria-label="Informasi">
            <button type="button" className="button compact" onClick={() => { refreshSaved(); setSavedStale(false); setSavedNotice(null); setSavedOpen(true); }}><Icon name="folder" /><span>Tersimpan</span></button>
            <button type="button" className="button compact" onClick={() => setAssumptionsOpen(true)}><Icon name="info" /><span>Asumsi</span></button>
            <button type="button" className="button compact" onClick={() => { setHelpStep(0); setHelpOpen(true); }}><Icon name="help" /><span>Bantuan</span></button>
          </nav>
        </header>

        <StatusStrip status={status} phase={phase} simTimeSec={simTime} horizonSec={horizon} fastMode={fast}
          pauseReason={projection?.pauseReason ?? null} seed={seed} speed={view.speed}
          drainSec={status === 'COMPLETED' ? projection?.result?.drainDurationSec ?? null : null}>
          {batchActive && (
            <p className="callout info"><Icon name="scales" /><span>Perbandingan A/B sedang berjalan di tab Bandingkan; run Simulasi tidak dihitung bersamaan.</span></p>
          )}
          {view.failure && (
            <p className="callout danger" role="alert"><Icon name="warning" /><span>Worker simulasi berhenti. Reset untuk memulai lagi dengan parameter yang sama.</span></p>
          )}
          {hiddenPause && (
            <p className="callout warning"><Icon name="hidden" /><span>Dijeda karena tab tidak aktif. Lanjutkan saat siap.</span></p>
          )}
        </StatusStrip>

        <main id="main" className="workspace" role="tabpanel" aria-labelledby="tab-sim" hidden={tab !== 'sim'}>

          <section className="glass panel stage area-stage" aria-label="Panggung simulasi">
            <div className="toolbar-row" role="group" aria-label="Kontrol run">
              <button type="button" id="primary-action" className="button primary" disabled={!controller || batchActive}
                aria-disabled={busy || view.transitioning || undefined}
                onClick={() => { if (!busyRef.current && !view.transitioning) primary.onClick(); }}>
                <Icon name={primary.icon} weight="fill" />{primary.label}
              </button>
              {live && !fast && !batchActive && (
                <button type="button" className="button" onClick={() => void act(() => controller!.fastFinish())}>
                  <Icon name="fast" />Selesaikan cepat
                </button>
              )}
              <fieldset className="speed">
                <legend title="Tidak mengubah hasil simulasi">Kecepatan tampilan</legend>
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
              <div className="toolbar-spacer" />
              {(live || status === 'COMPLETED') && !batchActive && (
                <button type="button" className="button danger" onClick={() => setConfirm('reset')}><Icon name="reset" />Reset run</button>
              )}
            </div>

            <div className="add-strip" role="group" aria-labelledby="add-title">
              <Icon name="userPlus" size={18} />
              <label id="add-title" htmlFor="add-count">Tambah pelanggan</label>
              <div className={`field-control${addError ? ' invalid' : ''}`}>
                <input id="add-count" type="text" inputMode="numeric" autoComplete="off" value={addCount} disabled={addReason !== null}
                  aria-invalid={addError ? true : undefined} aria-describedby={addError ? 'add-hint add-error' : 'add-hint'}
                  onChange={event => setAddCount(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') addCustomers(); }} />
              </div>
              <button type="button" className="button compact" disabled={addReason !== null} onClick={addCustomers}><Icon name="plus" size={15} />Tambahkan</button>
              <p id="add-hint" className="field-hint">{addReason ?? `Pada waktu simulasi ${formatClock(simTime)}. Jumlah 1–20.`}</p>
              {addError && <p id="add-error" className="field-error"><Icon name="warning" size={14} />{addError}</p>}
            </div>

            {notice && (
              <p key={notice.text} className={`callout stage-notice ${notice.tone}`} role={notice.tone === 'danger' ? 'alert' : undefined}>
                <Icon name={notice.tone === 'danger' ? 'warning' : 'check'} /><span>{notice.text}</span>
              </p>
            )}

            <SceneBox c={counters} status={status} projection={status === 'READY' ? null : projection} speed={view.speed} />
            <p className="field-hint">Kecepatan hanya mengatur tampilan, tidak mengubah hasil. Spasi menjeda atau melanjutkan saat fokus tidak berada di kolom isian.</p>
          </section>

          <ParameterPanel draft={draft} dispatch={dispatch} editable={editable} onUnlock={() => setConfirm('edit')}
            status={status === 'READY' ? 'draft' : status === 'COMPLETED' ? 'done' : 'running'} />
          <Results status={status} projection={projection} horizonSec={horizon} onAssumptions={() => setAssumptionsOpen(true)} onEdit={() => setConfirm('edit')} onBaseline={requestBaseline} onSave={() => setSaveOpen(true)} />
          <InputLog status={status} projection={projection} draftSchedule={draft.schedule} />
        </main>

        <div className="compare-view" id="panel-compare" role="tabpanel" aria-labelledby="tab-compare" hidden={tab !== 'compare'}>
          {compareNotice && <p className="callout danger" role="alert"><Icon name="warning" /><span>{compareNotice}</span></p>}
          <ComparePanel key={baseline?.version ?? 0} controller={controller} comparison={batch} lastComparison={view.lastComparison}
            baseline={baseline?.value ?? null} onSetBaseline={requestBaseline} onOpenSimulation={() => setTab('sim')}
            onAssumptions={() => setAssumptionsOpen(true)} announce={setAnnouncement} onNotice={setCompareNotice} />
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>

      <DialogShell open={helpOpen} className="dialog help" labelledBy="help-title" describedBy="help-body"
        onClose={() => { setHelpOpen(false); setFocusTarget('workspace-title'); }}>
        <div className="help-top">
          <span>Bantuan ringkas · {helpStep + 1} dari {HELP.length}</span>
          <button type="button" className="button quiet compact" onClick={() => { setHelpOpen(false); setFocusTarget('workspace-title'); }}>Lewati</button>
        </div>
        <div className="help-body">
          <div className="help-icon" aria-hidden="true"><Icon name={step.icon} size={40} weight="duotone" /></div>
          <div className="help-text">
            <h2 id="help-title">{step.title}</h2>
            <p id="help-body">{step.body}</p>
            <p className="muted">{step.tip}</p>
          </div>
        </div>
        <div className="help-nav">
          <div className="help-dots" aria-hidden="true">{HELP.map((item, index) => <span key={item.title} aria-current={index === helpStep ? 'step' : undefined} />)}</div>
          {helpStep > 0 && <button type="button" className="button" onClick={() => setHelpStep(helpStep - 1)}>Kembali</button>}
          {helpStep < HELP.length - 1
            ? <button type="button" className="button primary" onClick={() => setHelpStep(helpStep + 1)}>Berikutnya<Icon name="next" size={15} /></button>
            : <button type="button" className="button primary" onClick={() => { setHelpOpen(false); setFocusTarget('primary-action'); }}>Mulai mencoba<Icon name="next" size={15} /></button>}
        </div>
        <p className="help-foot"><Icon name="cameraOff" size={15} />Kamera tidak diperlukan. Semua tugas dapat dilakukan dengan mouse dan keyboard. Progres run tidak dipulihkan setelah halaman dimuat ulang.</p>
      </DialogShell>

      <ConfirmDialog open={confirm !== null}
        title={confirm === 'edit' ? 'Reset untuk mengubah skenario?' : 'Reset run ini?'}
        description={<p>{confirm === 'edit' ? 'Hasil dan progres run ini akan ditinggalkan; perubahan baru tidak mengedit sejarah run. ' : ''}
          Hapus progres, hasil run, dan tambahan pelanggan selama run ini? Parameter, seed, dan jadwal awal tetap disimpan.</p>}
        confirmLabel={confirm === 'edit' ? 'Reset dan edit' : 'Reset run'}
        onCancel={() => setConfirm(null)} onConfirm={() => reset(confirm === 'edit')} />

      <SavedDrawer open={savedOpen} listing={listing} stale={savedStale} notice={savedNotice} onClose={() => setSavedOpen(false)}
        onSave={() => setSaveOpen(true)} onLoad={requestLoad} onDelete={slot => setPendingDelete(slot)} />
      {saveOpen && (
        <SaveDialog open source={status === 'READY' || !projection ? 'draft skenario' : `snapshot run (${STATUS_LABEL[status].toLowerCase()})`}
          defaultName={loaded ? identity.name : `Kantin · ${counters} loket`} logEntries={status === 'READY' ? 0 : projection?.inputLog.length ?? 0}
          listing={listing} loaded={loaded} onClose={() => setSaveOpen(false)} onSave={saveConfig} />
      )}
      <ConfirmDialog open={pendingLoad !== null} title={`Muat konfigurasi “${pendingLoad?.record.config.name ?? ''}”?`}
        description={<p>{status === 'READY' ? 'Isian skenario saat ini diganti dengan konfigurasi tersimpan.' : 'Run, hasil dan tambahan pelanggan saat ini ditinggalkan; workspace kembali Siap dijalankan dari waktu 00:00.'} Ini memuat konfigurasi, bukan melanjutkan run lama.</p>}
        confirmLabel="Muat konfigurasi" onCancel={() => setPendingLoad(null)} onConfirm={() => void loadSlot(pendingLoad!)} />
      <ConfirmDialog open={pendingDelete !== null} title={`Hapus konfigurasi “${pendingDelete?.status === 'ok' ? pendingDelete.record.config.name : 'tidak dapat dimuat'}”?`}
        description={<p>Hanya slot ini yang dihapus dari browser ini. Konfigurasi lain dan data aplikasi lain tidak tersentuh.</p>}
        confirmLabel="Hapus konfigurasi" onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteSlot(pendingDelete!)} />

      <ConfirmDialog open={compareConfirm === 'open'} title="Pause dan buka perbandingan?"
        description={<p>Run dan perbandingan tidak dihitung bersamaan. Run ini dijeda pada waktu simulasi {formatClock(simTime)} dan dapat dilanjutkan nanti.</p>}
        confirmLabel="Pause dan buka" onCancel={() => setCompareConfirm(null)} onConfirm={pauseAndOpen} />
      <ConfirmDialog open={compareConfirm === 'baseline'} title="Ganti baseline A?"
        description={<p>Baseline A dan kandidat B saat ini diganti dengan skenario dari tab Simulasi. Hasil perbandingan terakhir tetap ditampilkan sebagai hasil sebelumnya.</p>}
        confirmLabel="Ganti baseline" onCancel={() => setCompareConfirm(null)} onConfirm={takeBaseline} />

      <DialogShell open={assumptionsOpen} className="dialog drawer" labelledBy="assumptions-title" describedBy="assumptions-desc"
        onClose={() => setAssumptionsOpen(false)}>
        <div className="drawer-head">
          <h2 id="assumptions-title">Asumsi model</h2>
          <button type="button" className="icon-button small" aria-label="Tutup" autoFocus onClick={() => setAssumptionsOpen(false)}><Icon name="close" size={16} /></button>
        </div>
        <p id="assumptions-desc" className="dialog-description">Hasil adalah eksperimen sintetis. Kesesuaiannya dengan kantin nyata belum divalidasi dengan data lapangan.</p>
        <ul className="assumptions">
          {ASSUMPTIONS.map(item => (
            <li key={item.title} className="card"><Icon name={item.icon} size={20} /><div><strong>{item.title}</strong><span>{item.body}</span></div></li>
          ))}
        </ul>
        <p className="versions">canteen-fifo-v1 · des-ts-v1 · pcg32-xsh-rr-v1</p>
      </DialogShell>
    </>
  );
}
