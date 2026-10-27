import { memo, useState } from 'react';
import type { ReactNode } from 'react';
import type { RunStatus } from '../simulation/engine';
import type { Metric } from '../simulation/metrics';
import type { Projection } from '../workers/protocol';
import {
  formatClock, formatCount, formatDecimal2, formatPercent, formatRate, formatSeconds, metricReason, metricText, spokenClock,
} from './format';
import { Icon } from './ui';
import type { IconName } from './ui';

export const STATUS_LABEL: Record<RunStatus, string> = {
  READY: 'Siap dijalankan', RUNNING: 'Berjalan', PAUSED: 'Dijeda', COMPLETED: 'Selesai · hasil final',
  ERROR: 'Perhitungan dihentikan', LIMIT_REACHED: 'Batas percobaan tercapai', CANCELLED: 'Run dibatalkan',
};
const STATUS_TONE: Record<RunStatus, [string, IconName]> = {
  READY: ['neutral', 'play'], RUNNING: ['info', 'play'], PAUSED: ['warning', 'pause'], COMPLETED: ['success', 'check'],
  ERROR: ['danger', 'warning'], LIMIT_REACHED: ['danger', 'warning'], CANCELLED: ['neutral', 'stop'],
};
const INVALID = new Set<RunStatus>(['ERROR', 'LIMIT_REACHED', 'CANCELLED']);

export function StatusStrip({ status, phase, simTimeSec, horizonSec, fastMode, pauseReason }: {
  status: RunStatus; phase: 'arrivalsOpen' | 'draining'; simTimeSec: number; horizonSec: number | null;
  fastMode: boolean; pauseReason: string | null;
}) {
  const [tone, icon] = STATUS_TONE[status];
  const label = fastMode && status === 'RUNNING' ? 'Menyelesaikan run…' : STATUS_LABEL[status];
  const phaseLabel = status === 'READY' ? 'Belum dijalankan'
    : status === 'COMPLETED' ? 'Semua pelanggan selesai'
      : INVALID.has(status) ? 'Run berhenti'
        : phase === 'draining' ? 'Menyelesaikan sisa pelanggan' : 'Kedatangan dibuka';
  return (
    <section className={`status-strip tone-${tone}`} aria-label="Status simulasi">
      <span className="status-badge"><Icon name={icon} size={16} />{label}
        {status === 'PAUSED' && pauseReason === 'hidden' && <span className="muted"> · tab tidak aktif</span>}</span>
      <span className="status-item">{phaseLabel}</span>
      <span className="status-item">
        <span className="muted">Waktu simulasi </span>
        <span className="timer" aria-label={spokenClock(simTimeSec)}>{formatClock(simTimeSec)}</span>
      </span>
      {horizonSec !== null && <span className="status-item muted">Kedatangan ditutup pada {formatClock(horizonSec)}</span>}
    </section>
  );
}

/** CompactScene: a DOM floor plan that carries every fact the 3D scene will show. */
export const Stage = memo(function Stage({ c, projection }: { c: number; projection: Projection | null }) {
  const servers = projection?.servers ?? Array.from({ length: c }, (_, ordinal) => ({ ordinal, busyCustomerId: null, departureAt: null }));
  const counts = projection?.counts;
  return (
    <section className="panel stage" aria-labelledby="stage-title">
      <div className="panel-head">
        <h2 id="stage-title">Kantin</h2>
        <span className="tag">Tampilan ringkas</span>
      </div>
      <div className="floor">
        <ol className="counters" aria-label="Status loket">
          {servers.map(server => (
            <li key={server.ordinal} className={server.busyCustomerId ? 'counter busy' : 'counter'}>
              <span className="counter-name">Loket {server.ordinal + 1}</span>
              <span className="counter-state">
                <span className="marker serving" aria-hidden="true" />
                {server.busyCustomerId ? <>Melayani <span className="mono">{server.busyCustomerId}</span></> : 'Kosong'}
              </span>
            </li>
          ))}
        </ol>
        <div className="queue">
          <p className="queue-label">
            Antrean bersama · <strong>{formatCount(counts?.waiting ?? 0)}</strong> menunggu
            {projection && projection.summarizedWaiting > 0 && <span className="muted"> · {formatCount(projection.summarizedWaiting)} pelanggan diringkas</span>}
          </p>
          <div className="lane" aria-hidden="true">
            {projection?.waitingSample.map(id => <span key={id} className="marker waiting" title={id} />)}
          </div>
        </div>
      </div>
      <dl className="counts">
        <div><dt>Tiba</dt><dd>{formatCount(counts?.arrived ?? 0)}</dd></div>
        <div><dt>Menunggu</dt><dd>{formatCount(counts?.waiting ?? 0)}</dd></div>
        <div><dt>Dilayani</dt><dd>{formatCount(counts?.inService ?? 0)}</dd></div>
        <div><dt>Selesai</dt><dd>{formatCount(counts?.completed ?? 0)}</dd></div>
      </dl>
      <p className="legend" aria-hidden="true">
        <span><span className="marker waiting" /> menunggu</span><span><span className="marker serving" /> dilayani</span>
      </p>
    </section>
  );
});

function MetricItem({ label, value, note, size = 'small' }: { label: string; value: ReactNode; note?: ReactNode; size?: 'large' | 'small' }) {
  return (
    <div className={`metric ${size}`}>
      <dt>{label}</dt>
      <dd><span className="metric-value">{value}</span>{note && <span className="metric-note">{note}</span>}</dd>
    </div>
  );
}

const finalNote = (metric: Metric, n: number) => metricReason(metric) ?? `Final · ${formatCount(n)} pelanggan`;

export const Results = memo(function Results({ status, projection, onAssumptions }: {
  status: RunStatus; projection: Projection | null; onAssumptions: () => void;
}) {
  const live = status === 'RUNNING' || status === 'PAUSED';
  const invalid = INVALID.has(status);
  const result = projection?.result;
  let summary: ReactNode;
  if (!projection || status === 'READY') {
    summary = (
      <dl className="metrics">
        <MetricItem size="large" label="Rata-rata tunggu" value="—" note="Belum dijalankan" />
        <MetricItem label="Menunggu saat ini" value="—" note="Belum dijalankan" />
        <MetricItem label="Selesai dilayani" value="—" note="Belum dijalankan" />
        <MetricItem label="Utilisasi loket" value="—" note="Belum dijalankan" />
      </dl>
    );
  } else {
    const { counts, configSnapshot, integrals, simTimeSec } = projection;
    const provisional = projection.provisionalMeanWait;
    const elapsedH = Math.min(simTimeSec, configSnapshot.horizonSec);
    const busy = integrals.busyH.reduce((sum, value) => sum + value, 0);
    const mean = result ? result.cohortMetrics.meanWaitSec : provisional.metric;
    summary = (
      <dl className="metrics">
        <MetricItem size="large" label="Rata-rata tunggu" value={metricText(mean)}
          note={result ? finalNote(mean, counts.arrived)
            : invalid ? 'Parsial · tidak digunakan sebagai hasil final'
              : metricReason(mean) ?? `Sementara · ${formatCount(provisional.started)} pelanggan sudah mulai dilayani`} />
        <MetricItem label="Menunggu saat ini" value={formatCount(counts.waiting)} note={live ? 'Saat ini' : undefined} />
        <MetricItem label="Selesai dilayani" value={formatCount(counts.completed)}
          note={`dari ${formatCount(counts.arrived)} tiba${counts.manual > 0 ? ` (${formatCount(counts.automatic)} otomatis, ${formatCount(counts.manual)} manual)` : ''}`} />
        <MetricItem label="Utilisasi loket" value={result ? formatPercent(result.horizonMetrics.utilization) : elapsedH > 0 ? formatPercent(busy / (configSnapshot.c * elapsedH)) : 'N/A'}
          note={result ? 'Selama menerima pelanggan' : elapsedH > 0 ? 'Sementara · selama menerima pelanggan' : 'Belum ada waktu berjalan'} />
      </dl>
    );
  }

  return (
    <section className="panel results" id="hasil" aria-labelledby="results-title" tabIndex={-1}>
      <div className="panel-head">
        <h2 id="results-title">Hasil</h2>
        <span className={`tag${result ? ' success' : ''}`}>{result ? 'Final' : invalid ? 'Tidak final' : live ? 'Sementara' : 'Belum ada'}</span>
      </div>
      {summary}
      {result && projection && (
        <>
          <h3>Seluruh pelanggan percobaan</h3>
          <dl className="metrics compact">
            <MetricItem label="P95 tunggu" value={metricText(result.cohortMetrics.p95WaitSec)}
              note={result.cohortMetrics.p95WaitSec.value === null ? metricReason(result.cohortMetrics.p95WaitSec) : '95% pelanggan menunggu ≤ nilai ini'} />
            <MetricItem label="Rata-rata waktu di sistem" value={metricText(result.cohortMetrics.meanTimeInSystemSec)} note="Menunggu + dilayani" />
            <MetricItem label="Rata-rata waktu layanan" value={metricText(result.cohortMetrics.meanServiceSec)} />
          </dl>
          <h3>Selama menerima pelanggan</h3>
          <dl className="metrics compact">
            <MetricItem label="Throughput" value={`${formatDecimal2(result.horizonMetrics.throughputPerMinute)} /menit`} note={`${formatCount(result.countsAtH.completed)} selesai sebelum kedatangan ditutup`} />
            <MetricItem label="Rata-rata antrean" value={formatDecimal2(result.horizonMetrics.meanQueue)} note="Berbobot waktu; tidak termasuk yang dilayani" />
            <MetricItem label="Antrean maksimum" value={formatCount(result.horizonMetrics.maxQueue)} />
            <MetricItem label="Utilisasi agregat" value={formatPercent(result.horizonMetrics.utilization)}
              note={result.horizonMetrics.utilizationByServer.map((value, index) => `Loket ${index + 1} ${formatPercent(value)}`).join(' · ')} />
            <MetricItem label="Saat kedatangan ditutup" value={`${formatCount(result.countsAtH.waiting)} menunggu`}
              note={`${formatCount(result.countsAtH.inService)} dilayani · ${formatCount(result.countsAtH.completed)} selesai`} />
          </dl>
          <h3>Menyelesaikan sisa pelanggan</h3>
          <dl className="metrics compact">
            <MetricItem label="Durasi penyelesaian" value={formatSeconds(result.drainDurationSec)} note={`Selesai pada ${formatClock(result.drainEndSec)}`} />
          </dl>
        </>
      )}
      {invalid && projection?.stopReason && (
        <p className="callout danger"><Icon name="warning" /><span>{projection.stopReason.message} Tiba {formatCount(projection.counts.arrived)} pelanggan sebelum berhenti.</span></p>
      )}
      {projection && status !== 'READY' && <SnapshotDetails projection={projection} onAssumptions={onAssumptions} />}
    </section>
  );
});

function SnapshotDetails({ projection, onAssumptions }: { projection: Projection; onAssumptions: () => void }) {
  const { configSnapshot: config, versions } = projection;
  return (
    <details className="snapshot">
      <summary>Detail percobaan</summary>
      <dl>
        <div><dt>Loket</dt><dd>{config.c}</dd></div>
        <div><dt>Kedatangan otomatis</dt><dd>{formatRate(config.lambdaPerMinute)} pelanggan/menit</dd></div>
        <div><dt>Pelayanan</dt><dd>{config.serviceMinSec}–{config.serviceMaxSec} detik</dd></div>
        <div><dt>Durasi menerima</dt><dd>{config.horizonSec / 60} menit = {formatCount(config.horizonSec)} detik</dd></div>
        <div><dt>Seed</dt><dd className="mono">{config.rootSeed}</dd></div>
        <div><dt>Jadwal awal</dt><dd>{config.manualSchedule.length} entry · tambahan run {projection.inputLog.length} entry</dd></div>
        <div><dt>Versi</dt><dd className="mono">{versions.modelVersion} · {versions.engineVersion} · {versions.rngVersion}</dd></div>
      </dl>
      <button type="button" className="button quiet compact" onClick={onAssumptions}><Icon name="info" />Asumsi model</button>
    </details>
  );
}

export const InputLog = memo(function InputLog({ status, projection }: { status: RunStatus; projection: Projection | null }) {
  const [shown, setShown] = useState(10);
  const log = status === 'READY' ? [] : projection?.inputLog ?? [];
  const pending = new Set(projection?.pendingManual.map(entry => entry.id));
  return (
    <section className="panel log" aria-labelledby="log-title">
      <h2 id="log-title">Tambahan pelanggan selama run</h2>
      {log.length === 0 ? <p className="muted">Belum ada tambahan pelanggan pada run ini.</p> : (
        <>
          <ol className="entry-list">
            {[...log].reverse().slice(0, shown).map(entry => (
              <li key={entry.id}>
                <span className="mono">{formatClock(entry.atSimSec)}</span>
                <span>{entry.count} pelanggan</span>
                <span className={`tag${pending.has(entry.id) ? ' warning' : ''}`}>{pending.has(entry.id) ? 'Menunggu diproses saat lanjut' : 'Manual'}</span>
              </li>
            ))}
          </ol>
          {log.length > shown && (
            <button type="button" className="button quiet compact" onClick={() => setShown(shown + 10)}>Lihat catatan berikutnya</button>
          )}
        </>
      )}
    </section>
  );
});
