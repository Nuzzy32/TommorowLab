import { memo, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CanteenScene, SceneView } from '../scene/canteen';
import type { RunStatus } from '../simulation/engine';
import type { Projection } from '../workers/protocol';
import {
  formatClock, formatCount, formatDecimal2, formatPercent, formatRate, formatSeconds, metricParts, metricReason, spokenClock,
} from './format';
import { Icon } from './ui';
import type { IconName } from './ui';

export const STATUS_LABEL: Record<RunStatus, string> = {
  READY: 'Siap dijalankan', RUNNING: 'Berjalan', PAUSED: 'Dijeda', COMPLETED: 'Selesai · hasil final',
  ERROR: 'Perhitungan dihentikan', LIMIT_REACHED: 'Batas percobaan tercapai', CANCELLED: 'Run dibatalkan',
};
const STATUS_TONE: Record<RunStatus, [string, IconName]> = {
  READY: ['neutral', 'idle'], RUNNING: ['info', 'play'], PAUSED: ['warning', 'pause'], COMPLETED: ['success', 'check'],
  ERROR: ['danger', 'warning'], LIMIT_REACHED: ['danger', 'warning'], CANCELLED: ['neutral', 'stop'],
};
const INVALID = new Set<RunStatus>(['ERROR', 'LIMIT_REACHED', 'CANCELLED']);

export function StatusStrip({ status, phase, simTimeSec, horizonSec, fastMode, pauseReason, seed, speed, drainSec, children }: {
  status: RunStatus; phase: 'arrivalsOpen' | 'draining'; simTimeSec: number; horizonSec: number | null;
  fastMode: boolean; pauseReason: string | null; seed: string; speed: number; drainSec: number | null; children?: ReactNode;
}) {
  const [tone, icon] = STATUS_TONE[status];
  const label = fastMode && status === 'RUNNING' ? 'Menyelesaikan run…' : STATUS_LABEL[status];
  const draining = phase === 'draining' && (status === 'RUNNING' || status === 'PAUSED');
  const phaseLabel = status === 'READY' ? 'Belum dijalankan'
    : status === 'COMPLETED' ? `Semua pelanggan selesai pada ${formatClock(simTimeSec)}`
      : INVALID.has(status) ? 'Run berhenti'
        : draining ? 'Menyelesaikan sisa pelanggan' : 'Kedatangan dibuka';
  const progress = horizonSec ? Math.min(1, simTimeSec / horizonSec) : 0;
  return (
    <section className={`glass status-strip area-status tone-${tone}`} aria-label="Status simulasi">
      <div className="status-main">
        <span className="status-badge"><Icon name={icon} size={15} />{label}
          {status === 'PAUSED' && pauseReason === 'hidden' && <span> · tab tidak aktif</span>}</span>
        <span className="status-phase">{phaseLabel}</span>
      </div>
      <div className="status-clock">
        <span className="label">Waktu simulasi</span>
        <span className="timer" aria-label={spokenClock(simTimeSec)}>{formatClock(simTimeSec)}</span>
      </div>
      <div className="status-progress">
        <div className="progress" aria-hidden="true"><span style={{ width: `${(progress * 100).toFixed(2)}%` }} /></div>
        <p>
          <span>{horizonSec !== null ? `Kedatangan ditutup pada ${formatClock(horizonSec)}` : 'Durasi belum valid'}</span>
          <span>{drainSec !== null ? `Penyelesaian sisa ${formatSeconds(drainSec)}` : draining ? 'Menyelesaikan sisa pelanggan' : `Kecepatan ${speed}×`}</span>
        </p>
      </div>
      <div className="status-chips"><span className="chip mono">seed {seed || '—'}</span></div>
      {children}
    </section>
  );
}

const SCENE_SHOWN = 40;
type SceneState = 'loading' | 'ready' | 'compact' | 'unsupported' | 'failed';

function supportsWebGL() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

/** Scene box: 3D canteen (lazy three.js) or CompactScene, which stays in the DOM as the text alternative. */
export const SceneBox = memo(function SceneBox({ c, status, projection, speed }: {
  c: number; status: RunStatus; projection: Projection | null; speed: number;
}) {
  const [mode, setMode] = useState<SceneState>('loading');
  const [camera, setCamera] = useState({ rot: 0, zoom: 1, resetNonce: 0 });
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<CanteenScene | null>(null);
  const wants3d = mode === 'loading' || mode === 'ready';

  const servers = projection?.servers ?? Array.from({ length: c }, (_, ordinal) => ({ ordinal, busyCustomerId: null as string | null, departureAt: null as number | null }));
  const counts = projection?.counts;
  const waiting = projection?.waitingSample ?? [];
  const customer = (id: string) => ({ id, manual: id.startsWith('m:') });
  const view: SceneView = {
    c: servers.length, live: projection !== null, runKey: projection?.runId ?? 'draft', speed, ...camera,
    waiting: waiting.slice(0, SCENE_SHOWN).map(customer),
    serving: servers.map(server => (server.busyCustomerId ? customer(server.busyCustomerId) : null)),
  };
  const latest = useRef(view);
  latest.current = view;

  useEffect(() => {
    if (!wants3d) return;
    if (!supportsWebGL()) { setMode('unsupported'); return; }
    let cancelled = false;
    let created: CanteenScene | null = null;
    import('../scene/canteen').then(module => {
      if (cancelled || !host.current) return;
      created = module.createCanteen(host.current, () => { if (!cancelled) setMode('failed'); });
      created.update(latest.current);
      scene.current = created;
      setMode('ready');
    }).catch(() => { if (!cancelled) setMode('failed'); });
    return () => {
      cancelled = true;
      created?.dispose();
      scene.current = null;
    };
    // Recreate only when the 3D view is switched on again.
  }, [wants3d]);

  useEffect(() => { scene.current?.update(view); });

  const shown3d = Math.min(SCENE_SHOWN, waiting.length);
  const summarized = wants3d ? (counts?.waiting ?? 0) - shown3d : projection?.summarizedWaiting ?? 0;
  const done = status === 'COMPLETED' && projection;
  const front = waiting.slice(0, 5);
  const busyCount = servers.filter(server => server.busyCustomerId).length;

  return (
    <>
      {(mode === 'unsupported' || mode === 'failed') && (
        <div className="callout info" role="status">
          <Icon name="cube" />
          <span>{mode === 'unsupported' ? 'Ruang 3D tidak didukung perangkat ini.' : 'Ruang 3D berhenti.'} Menampilkan tampilan ringkas; simulasi tidak terpengaruh.</span>
          {mode === 'failed' && <button type="button" className="button compact" onClick={() => setMode('loading')}>Coba 3D lagi</button>}
        </div>
      )}
      <div className="scene-box">
        <dl className="count-chips counts">
          <div><dt>Tiba</dt><dd>{formatCount(counts?.arrived ?? 0)}</dd></div>
          <div><dt>Menunggu</dt><dd>{formatCount(counts?.waiting ?? 0)}</dd></div>
          <div><dt>Dilayani</dt><dd>{formatCount(counts?.inService ?? 0)}</dd></div>
          <div><dt>Selesai</dt><dd>{formatCount(counts?.completed ?? 0)}</dd></div>
          {summarized > 0 && <div className="summarized">{formatCount(summarized)} pelanggan diringkas</div>}
        </dl>
        {wants3d && (
          <div className="scene-viewport">
            <div ref={host} className="scene-host" aria-hidden="true" />
            {mode === 'loading' && <p className="scene-loading">Memuat ruang 3D…</p>}
          </div>
        )}
        <div className={wants3d ? 'sr-only' : 'compact-scene'}>
          <ol className="counters" aria-label="Status loket">
            {servers.map(server => (
              <li key={server.ordinal} className="card counter">
                <div className="counter-head">
                  <span className="counter-name">Loket {server.ordinal + 1}</span>
                  <span className={`tag${server.busyCustomerId ? ' success' : ''}`}>{server.busyCustomerId ? 'Melayani' : 'Kosong'}</span>
                </div>
                <span className="counter-detail">{server.busyCustomerId
                  ? `${server.busyCustomerId} · selesai ${formatClock(server.departureAt ?? 0)}` : 'Menunggu pelanggan berikutnya'}</span>
              </li>
            ))}
          </ol>
          <div className="card queue-card">
            <p>{counts?.waiting
              ? `Antrean bersama: ${formatCount(counts.waiting)} pelanggan menunggu · terdepan ${front.join(', ')}${counts.waiting > front.length ? ' …' : ''}`
              : 'Antrean bersama kosong.'}</p>
            <div className="lane" aria-hidden="true">
              {waiting.map(id => <span key={id} className="marker waiting" />)}
            </div>
          </div>
        </div>
        {done && (
          <div className="done-banner">
            <Icon name="check" size={20} weight="fill" />
            <span>Run selesai · {formatCount(projection.counts.arrived)} pelanggan</span>
            <a href="#hasil">Ke hasil</a>
          </div>
        )}
      </div>
      <div className="stage-foot">
        <p className="legend">
          <span><span className="marker waiting" />Menunggu</span>
          <span><span className="marker serving" />Dilayani</span>
          <span><span className="marker manual" />Tambahan manual</span>
          <span><span className="marker idle" />Loket kosong</span>
          {mode === 'ready' && <span><Icon name="grab" size={14} />Seret untuk memutar · pinch atau Ctrl+scroll untuk zoom · klik ganda untuk reset</span>}
        </p>
        <div className="camera-controls">
          {([
            ['Putar kiri', 'rotateLeft', camera.rot <= -45, () => setCamera({ ...camera, rot: camera.rot - 15 })],
            ['Putar kanan', 'rotateRight', camera.rot >= 45, () => setCamera({ ...camera, rot: camera.rot + 15 })],
            ['Perkecil', 'zoomOut', camera.zoom <= 0.7, () => setCamera({ ...camera, zoom: +(camera.zoom - 0.15).toFixed(2) })],
            ['Perbesar', 'zoomIn', camera.zoom >= 1.6, () => setCamera({ ...camera, zoom: +(camera.zoom + 0.15).toFixed(2) })],
            ['Reset tampilan', 'frame', false, () => setCamera({ rot: 0, zoom: 1, resetNonce: camera.resetNonce + 1 })],
          ] as const).map(([label, icon, limit, onClick]) => (
            <button key={label} type="button" className="icon-button small" aria-label={label} title={label}
              disabled={mode !== 'ready' || limit} onClick={onClick}><Icon name={icon} size={16} /></button>
          ))}
          {mode !== 'unsupported' && (
            <button type="button" className="button compact" aria-pressed={!wants3d}
              onClick={() => setMode(wants3d ? 'compact' : 'loading')}>
              <Icon name={wants3d ? 'list' : 'cube'} size={15} />{wants3d ? 'Tampilan ringkas' : 'Tampilan 3D'}
            </button>
          )}
        </div>
      </div>
      <p className="sr-only">{`${servers.length} loket, ${busyCount} melayani, ${formatCount(counts?.waiting ?? 0)} menunggu.`}</p>
    </>
  );
});

function MetricItem({ label, value, unit, note, size }: { label: string; value: string; unit?: string; note?: ReactNode; size?: 'small' }) {
  return (
    <div className={`card metric${size ? ` ${size}` : ''}`}>
      <dt>{label}</dt>
      <dd>
        <span className="metric-value">{value}{unit && <> <span className="metric-unit">{unit}</span></>}</span>
        {note && <span className="metric-note">{note}</span>}
      </dd>
    </div>
  );
}

function QueueChart({ projection, horizonSec }: { projection: Projection | null; horizonSec: number | null }) {
  const series = projection?.queuePeaks;
  const peaks = series?.peaks ?? [];
  const peak = peaks.length ? Math.max(...peaks) : 0;
  const top = Math.max(4, peak);
  const horizon = projection?.configSnapshot.horizonSec ?? horizonSec ?? 0;
  const span = series?.spanSec ?? (horizon || 1);
  const x = (sec: number) => (sec / span) * 300;
  const y = (level: number) => 84 - (level / top) * 74;
  // Step line: each bin holds its peak until the next bin.
  const points = peaks.flatMap((level, bin) => [`${x(bin * series!.binSec).toFixed(1)},${y(level).toFixed(1)}`, `${x((bin + 1) * series!.binSec).toFixed(1)},${y(level).toFixed(1)}`]);
  const end = peaks.length ? x(peaks.length * series!.binSec) : 0;
  return (
    <figure className="card queue-chart" style={{ margin: 0 }}>
      <header><span>Panjang antrean</span><span className="mono">{projection ? `puncak ${formatCount(peak)} pelanggan` : 'belum ada data'}</span></header>
      <svg viewBox="0 0 300 88" preserveAspectRatio="none" role="img"
        aria-label={projection ? `Grafik panjang antrean, puncak ${peak} pelanggan` : 'Grafik panjang antrean, belum ada data'}>
        <line x1="0" y1="84" x2="300" y2="84" stroke="rgb(23 34 30 / 14%)" vectorEffect="non-scaling-stroke" />
        {points.length > 0 && <polygon points={`${points.join(' ')} ${end.toFixed(1)},84 0,84`} fill="rgb(46 139 108 / 16%)" />}
        {points.length > 0 && <polyline points={points.join(' ')} fill="none" stroke="#1f6f57" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
        <line x1={x(horizon)} x2={x(horizon)} y1="0" y2="88" stroke="#c8961e" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      </svg>
      <footer><span>00:00</span><span className="horizon">batas {formatClock(horizon)}</span><span>{formatClock(span)}</span></footer>
    </figure>
  );
}

export const Results = memo(function Results({ status, projection, horizonSec, onAssumptions, onEdit, onBaseline, onSave }: {
  status: RunStatus; projection: Projection | null; horizonSec: number | null; onAssumptions: () => void; onEdit: () => void; onBaseline: () => void; onSave: () => void;
}) {
  const live = status === 'RUNNING' || status === 'PAUSED';
  const invalid = INVALID.has(status);
  const shown = status === 'READY' ? null : projection;
  const result = shown?.result;
  let summary: ReactNode;
  if (!shown) {
    summary = (
      <dl className="metrics">
        {['Rata-rata tunggu', 'Menunggu saat ini', 'Selesai', 'Utilisasi'].map(label => <MetricItem key={label} label={label} value="—" note="Belum dijalankan" />)}
      </dl>
    );
  } else if (result) {
    const { cohortMetrics: m } = result;
    const n = shown.counts.arrived;
    const reason = metricReason(m.meanWaitSec);
    summary = (
      <>
        <dl className="hero" style={{ margin: 0 }}>
          <div className="metric">
            <dt>Rata-rata tunggu final</dt>
            <dd>
              <span className="metric-value">{metricParts(m.meanWaitSec).value}{m.meanWaitSec.value !== null && <> <span className="metric-unit">detik</span></>}</span>
              <span className="metric-note">{reason ?? `Final · ${formatCount(n)} pelanggan · rata-rata seluruh pelanggan setelah sisa selesai`}</span>
            </dd>
          </div>
        </dl>
        <h3 className="section-label">Seluruh pelanggan percobaan</h3>
        <dl className="metrics">
          <MetricItem label="P95 tunggu" {...metricParts(m.p95WaitSec)} note={metricReason(m.p95WaitSec) ?? '95% pelanggan menunggu ≤ nilai ini'} />
          <MetricItem label="Waktu di sistem" {...metricParts(m.meanTimeInSystemSec)} note="Rata-rata menunggu + dilayani" />
          <MetricItem label="Pelayanan aktual" {...metricParts(m.meanServiceSec)} note="Rata-rata per pelanggan" />
          <MetricItem label="Pelanggan" value={formatCount(n)} note={`${formatCount(shown.counts.automatic)} otomatis · ${formatCount(shown.counts.manual)} manual`} />
        </dl>
      </>
    );
  } else {
    const { counts, configSnapshot, integrals, simTimeSec, provisionalMeanWait: provisional } = shown;
    const elapsedH = Math.min(simTimeSec, configSnapshot.horizonSec);
    const busy = integrals.busyH.reduce((sum, value) => sum + value, 0);
    summary = (
      <dl className="metrics">
        <MetricItem label="Rata-rata tunggu sementara" {...metricParts(provisional.metric)}
          note={invalid ? 'Parsial · tidak digunakan sebagai hasil final'
            : metricReason(provisional.metric) ?? `Sementara · ${formatCount(provisional.started)} pelanggan sudah mulai dilayani`} />
        <MetricItem label="Menunggu saat ini" value={formatCount(counts.waiting)} unit="pelanggan" note={`${formatCount(counts.inService)} sedang dilayani`} />
        <MetricItem label="Selesai" value={formatCount(counts.completed)} unit="pelanggan"
          note={`dari ${formatCount(counts.arrived)} tiba · ${formatCount(counts.automatic)} otomatis, ${formatCount(counts.manual)} manual`} />
        <MetricItem label="Utilisasi sementara" value={elapsedH > 0 ? formatPercent(busy / (configSnapshot.c * elapsedH)) : 'N/A'}
          note={elapsedH > 0 ? `Hingga ${formatClock(elapsedH)}` : 'Belum ada waktu berjalan'} />
      </dl>
    );
  }

  const horizon = shown?.configSnapshot.horizonSec ?? 0;
  return (
    <section className="glass panel results area-results" id="hasil" aria-labelledby="results-title" tabIndex={-1}>
      <div className="panel-head">
        <h2 id="results-title">Hasil</h2>
        <span className={`tag${result ? ' success' : invalid ? ' danger' : live ? ' info' : ''}`}>
          {result ? 'Final' : invalid ? 'Tidak final' : live ? 'Sementara' : 'Belum dijalankan'}</span>
      </div>
      {summary}
      {result && shown && (
        <>
          <h3 className="section-label">Selama menerima pelanggan</h3>
          <dl className="metrics">
            <MetricItem size="small" label="Throughput" value={formatDecimal2(result.horizonMetrics.throughputPerMinute)} unit="pel/menit"
              note={`${formatCount(result.countsAtH.completed)} selesai sebelum kedatangan ditutup`} />
            <MetricItem size="small" label="Rata-rata antrean" value={formatDecimal2(result.horizonMetrics.meanQueue)} unit="pelanggan" note="Berbobot waktu; tidak termasuk yang dilayani" />
            <MetricItem size="small" label="Antrean maksimum" value={formatCount(result.horizonMetrics.maxQueue)} unit="pelanggan" note="Sebelum kedatangan ditutup" />
            <MetricItem size="small" label="Utilisasi loket" value={formatPercent(result.horizonMetrics.utilization)} note={`Dibagi ${shown.configSnapshot.c} × ${formatClock(horizon)}`} />
            <MetricItem size="small" label={`Pada batas ${formatClock(horizon)}`} value={`${formatCount(result.countsAtH.waiting)} / ${formatCount(result.countsAtH.inService)}`}
              note="Menunggu / sedang dilayani" />
            <MetricItem size="small" label="Menyelesaikan sisa" value={formatSeconds(result.drainDurationSec).replace(/ detik$/, '')} unit="detik"
              note={`Selesai pada ${formatClock(result.drainEndSec)}`} />
          </dl>
          <div className="card server-bars">
            <p>Utilisasi per loket · 0 sampai batas kedatangan</p>
            <ol>
              {result.horizonMetrics.utilizationByServer.map((value, index) => (
                <li key={index}>
                  <span>Loket {index + 1}</span>
                  <span className="progress" aria-hidden="true"><span style={{ width: `${(value * 100).toFixed(1)}%` }} /></span>
                  <span className="mono">{formatPercent(value)}</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
      <QueueChart projection={shown} horizonSec={horizonSec} />
      {invalid && shown?.stopReason && (
        <p className="callout danger"><Icon name="warning" /><span>{shown.stopReason.message} Tiba {formatCount(shown.counts.arrived)} pelanggan sebelum berhenti.</span></p>
      )}
      {result && (
        <div className="results-actions">
          <button type="button" className="button compact" onClick={onBaseline}><Icon name="scales" size={15} />Jadikan baseline A</button>
          <button type="button" className="button compact" onClick={onSave}><Icon name="save" size={15} />Simpan konfigurasi</button>
          <button type="button" className="button compact" onClick={onEdit}><Icon name="pencil" size={15} />Ubah skenario</button>
        </div>
      )}
      <p className="results-note">Eksperimen sintetis, belum dikalibrasi terhadap kantin nyata. <button type="button" onClick={onAssumptions}>Lihat asumsi model</button></p>
    </section>
  );
});

type LogRow = { key: string; atSimSec: number; count: number; tag: [string, string] };

export const InputLog = memo(function InputLog({ status, projection, draftSchedule }: {
  status: RunStatus; projection: Projection | null; draftSchedule: { id: string; atSimSec: number; count: number }[];
}) {
  const [shown, setShown] = useState(10);
  const ready = status === 'READY' || !projection;
  const pending = new Set(projection?.pendingManual.map(entry => entry.id));
  const rows: LogRow[] = [
    ...(ready ? draftSchedule : projection.configSnapshot.manualSchedule)
      .map(entry => ({ key: entry.id, atSimSec: entry.atSimSec, count: entry.count, tag: ['Terjadwal', 'schedule'] as [string, string] })),
    ...(ready ? [] : projection.inputLog).map(entry => ({
      key: entry.id, atSimSec: entry.atSimSec, count: entry.count,
      tag: (pending.has(entry.id) ? ['Menunggu diproses saat lanjut', 'warning'] : ['Saat run', 'success']) as [string, string],
    })),
  ];
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const config = projection && !ready ? projection.configSnapshot : null;
  return (
    <section className="glass panel log area-log" aria-labelledby="log-title">
      <div className="panel-head"><h2 id="log-title">Catatan pelanggan manual</h2>{total > 0 && <span className="mono muted">{formatCount(total)} pelanggan</span>}</div>
      {rows.length === 0 ? <p className="muted results-note">Belum ada tambahan pelanggan. Tambahan saat run dicatat pada waktu simulasi.</p> : (
        <>
          <ol className="entry-list">
            {rows.slice(0, shown).map(row => (
              <li key={row.key}>
                <span className="mono">{formatClock(row.atSimSec)}</span>
                <span>+{row.count} pelanggan</span>
                <span className={`tag ${row.tag[1]}`}>{row.tag[0]}</span>
              </li>
            ))}
          </ol>
          {rows.length > shown && (
            <button type="button" className="button quiet compact" onClick={() => setShown(shown + 10)}>Lihat catatan berikutnya</button>
          )}
        </>
      )}
      {config && projection && (
        <div className="snapshot">
          <h3>Snapshot percobaan</h3>
          <dl>
            <dt>Loket</dt><dd>{config.c}</dd>
            <dt>Kedatangan</dt><dd>{formatRate(config.lambdaPerMinute)} /menit</dd>
            <dt>Pelayanan</dt><dd>{config.serviceMinSec}–{config.serviceMaxSec} detik</dd>
            <dt>Durasi</dt><dd>{formatClock(config.horizonSec)} ({formatCount(config.horizonSec)} detik)</dd>
            <dt>Seed</dt><dd>{config.rootSeed}</dd>
            <dt>Model</dt><dd>{projection.versions.modelVersion}</dd>
            <dt>Engine</dt><dd>{projection.versions.engineVersion}</dd>
            <dt>RNG</dt><dd>{projection.versions.rngVersion}</dd>
          </dl>
        </div>
      )}
    </section>
  );
});
