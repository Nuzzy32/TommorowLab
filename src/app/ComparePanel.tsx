import { useEffect, useRef, useState } from 'react';
import type { ComparisonState, SimulationController } from '../controller/client';
import { promoteManualLog } from '../domain/config';
import type { ManualEntry, ScenarioConfig } from '../domain/config';
import { configSignature, PAIRS, paramChanges } from '../simulation/comparison';
import type { ComparisonSummary, Verdict } from '../simulation/comparison';
import { buildConfig, draftReducer, fieldValue, initialDraft } from './draft';
import type { Draft, DraftAction, FieldName } from './draft';
import { formatClock, formatCount, formatDecimal2, formatPercent, formatRate } from './format';
import { Icon, NumberField } from './ui';

export type Baseline = { config: ScenarioConfig; source: string; log: ManualEntry[] };

const LABEL: Record<'c' | 'serviceMinSec' | 'serviceMaxSec', string> = { c: 'Loket', serviceMinSec: 'Pelayanan minimum', serviceMaxSec: 'Pelayanan maksimum' };
const VERDICT: Record<Verdict, { tone: string; text: string }> = {
  IDENTICAL: { tone: 'info', text: 'Skenario identik: A dan B memakai parameter dan permintaan yang sama.' },
  B_LOWER: { tone: 'success', text: 'Waktu tunggu rata-rata B lebih rendah pada eksperimen ini.' },
  B_HIGHER: { tone: 'warning', text: 'Waktu tunggu rata-rata B lebih tinggi pada eksperimen ini.' },
  INCONCLUSIVE: { tone: 'info', text: 'Arah perbedaan belum meyakinkan pada percobaan ini.' },
  INSUFFICIENT_DATA: { tone: 'warning', text: 'Data pelanggan tidak cukup untuk interval.' },
};
const ACTIVE = new Set<ComparisonState['status']>(['starting', 'running', 'suspended']);

const seconds = (value: number | null) => (value === null ? 'N/A' : `${formatDecimal2(value).replace('-', '−')} detik`);
const signed = (value: number | null) => (value === null ? 'N/A' : `${value > 0 ? '+' : ''}${formatDecimal2(value).replace('-', '−')}`);
const service = (config: ScenarioConfig) => (config.serviceMinSec === config.serviceMaxSec
  ? `tetap ${config.serviceMinSec} detik` : `${config.serviceMinSec}–${config.serviceMaxSec} detik`);
const schedulePeople = (config: ScenarioConfig) => config.manualSchedule.reduce((sum, entry) => sum + entry.count, 0);

/** Interval view: zero line, CI bar and mean marker on an axis that always contains 0 and both limits. */
function IntervalChart({ summary }: { summary: ComparisonSummary }) {
  const [lo, hi] = summary.ci95!;
  const span = Math.max(Math.abs(lo), Math.abs(hi), 0.5) * 1.25;
  const x = (value: number) => 150 + (value / span) * 140;
  return (
    <svg className="interval-chart" viewBox="0 0 300 44" role="img"
      aria-label={`Interval 95% selisih dari ${formatDecimal2(lo)} sampai ${formatDecimal2(hi)} detik; garis nol di tengah.`}>
      <line x1="10" x2="290" y1="22" y2="22" stroke="rgb(23 34 30 / 18%)" />
      <line x1="150" x2="150" y1="6" y2="38" stroke="#45544e" strokeDasharray="3 3" />
      <line x1={x(lo)} x2={x(hi)} y1="22" y2="22" stroke="#17221e" strokeWidth="3" strokeLinecap="round" />
      <line x1={x(lo)} x2={x(lo)} y1="15" y2="29" stroke="#17221e" strokeWidth="2" />
      <line x1={x(hi)} x2={x(hi)} y1="15" y2="29" stroke="#17221e" strokeWidth="2" />
      <circle cx={x(summary.meanDeltaSec!)} cy="22" r="5" fill="#fff" stroke="#17221e" strokeWidth="2" />
      <text x="150" y="44" textAnchor="middle" fontSize="9" fill="#45544e">0</text>
    </svg>
  );
}

function ResultView({ result, stale, onAssumptions }: { result: ComparisonState; stale: boolean; onAssumptions: () => void }) {
  const summary = result.summary!;
  const verdict = VERDICT[summary.verdict];
  const rows: [string, (side: ComparisonSummary['a']) => string, string][] = [
    ['Rata-rata tunggu (rata-rata per replikasi)', side => seconds(side.meanWaitSec), signed(summary.meanDeltaSec)],
    ['Rata-rata P95 tunggu per replikasi', side => seconds(side.meanP95WaitSec),
      signed(summary.a.meanP95WaitSec === null || summary.b.meanP95WaitSec === null ? null : summary.b.meanP95WaitSec - summary.a.meanP95WaitSec)],
    ['Throughput', side => `${formatDecimal2(side.throughputPerMinute)} pel/menit`, signed(summary.b.throughputPerMinute - summary.a.throughputPerMinute)],
    ['Utilisasi loket', side => formatPercent(side.utilization), `${signed((summary.b.utilization - summary.a.utilization) * 100)} poin`],
    ['Rata-rata antrean maksimum', side => `${formatDecimal2(side.maxQueue)} pelanggan`, signed(summary.b.maxQueue - summary.a.maxQueue)],
  ];
  return (
    <section className="glass panel compare-result" id="hasil-perbandingan" aria-labelledby="compare-result-title" tabIndex={-1}>
      <div className="panel-head">
        <h2 id="compare-result-title">Hasil perbandingan</h2>
        <span className={`tag ${stale ? 'warning' : 'success'}`}>{stale ? 'Hasil dari konfigurasi sebelumnya' : 'Final'}</span>
      </div>
      {stale && (
        <p className="callout warning"><Icon name="warning" />
          <span>Angka ini berasal dari A ({result.a.c} loket, {service(result.a)}) dan B ({result.b.c} loket, {service(result.b)}). Jalankan ulang untuk konfigurasi sekarang.</span></p>
      )}
      <p className={`callout ${verdict.tone} verdict`} role="status"><Icon name={summary.verdict === 'B_LOWER' ? 'check' : 'info'} /><span>{verdict.text}</span></p>
      <dl className="compare-hero">
        <div className="card metric">
          <dt>Selisih rata-rata tunggu (B − A)</dt>
          <dd><span className="metric-value">{signed(summary.meanDeltaSec)}{summary.meanDeltaSec !== null && <> <span className="metric-unit">detik</span></>}</span>
            <span className="metric-note">{summary.percentChange === null ? 'Persentase N/A' : `${signed(summary.percentChange)}% dari rata-rata A`}</span></dd>
        </div>
        <div className="card metric">
          <dt>Interval 95% rata-rata selisih</dt>
          <dd><span className="metric-value small-value">{summary.ci95 ? `[${signed(summary.ci95[0])}; ${signed(summary.ci95[1])}]` : 'N/A'}{summary.ci95 && <> <span className="metric-unit">detik</span></>}</span>
            <span className="metric-note">{summary.ci95 ? 'Ketidakpastian rata-rata selisih, bukan rentang tunggu pelanggan' : `${formatCount(summary.emptyPairs)} pasangan tanpa pelanggan; interval tidak dihitung`}</span></dd>
        </div>
      </dl>
      {summary.ci95 && <IntervalChart summary={summary} />}
      <table className="compare-table">
        <caption className="sr-only">Rata-rata metrik per replikasi untuk A dan B</caption>
        <thead><tr><th scope="col">Metrik</th><th scope="col">A · Baseline</th><th scope="col">B · Kandidat</th><th scope="col">B − A</th></tr></thead>
        <tbody>
          {rows.map(([label, value, delta]) => (
            <tr key={label}><th scope="row">{label}</th><td data-label="A">{value(summary.a)}</td><td data-label="B">{value(summary.b)}</td><td data-label="B − A">{delta}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="results-note">Estimasi dari {PAIRS} pasangan replikasi sintetis dengan permintaan yang sama; rata-rata dihitung per replikasi, bukan gabungan pelanggan. Interval hanya untuk selisih rata-rata tunggu. <button type="button" onClick={onAssumptions}>Lihat asumsi model</button></p>
      <details className="pair-details">
        <summary>Detail {PAIRS} pasangan</summary>
        <table className="compare-table">
          <thead><tr><th scope="col">Pasangan</th><th scope="col">Pelanggan</th><th scope="col">Tunggu A</th><th scope="col">Tunggu B</th><th scope="col">B − A</th></tr></thead>
          <tbody>
            {result.pairs.map(pair => (
              <tr key={pair.r}><th scope="row">Pasangan {pair.r + 1}</th><td data-label="Pelanggan">{formatCount(pair.a.n)}</td><td data-label="Tunggu A">{seconds(pair.a.meanWaitSec)}</td><td data-label="Tunggu B">{seconds(pair.b.meanWaitSec)}</td>
                <td data-label="B − A">{pair.a.meanWaitSec === null || pair.b.meanWaitSec === null ? 'N/A' : signed(pair.b.meanWaitSec - pair.a.meanWaitSec)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

export function ComparePanel({ controller, comparison, lastComparison, baseline, onSetBaseline, onOpenSimulation, onAssumptions, announce, onNotice }: {
  controller: SimulationController | null; comparison: ComparisonState | null; lastComparison: ComparisonState | null;
  baseline: Baseline | null; onSetBaseline: () => void; onOpenSimulation: () => void; onAssumptions: () => void;
  announce: (text: string) => void; onNotice: (text: string) => void;
}) {
  // The parent keys this panel by baseline, so a new baseline starts B as an identical copy (FR-16).
  const [includeLog, setIncludeLog] = useState(false);
  const [candidate, setCandidate] = useState<Draft | null>(() => (baseline ? initialDraft(baseline.config) : null));
  const [busy, setBusy] = useState(false);
  const active = comparison !== null && ACTIVE.has(comparison.status);

  // Announce state changes once and progress only every 5 pairs (CMP-10).
  const announced = useRef('');
  useEffect(() => {
    if (!comparison) return;
    const { status, completedPairs } = comparison;
    const key = status === 'running' ? `running:${Math.floor(completedPairs / 5)}` : status;
    if (announced.current === `${comparison.batchId}:${key}`) return;
    announced.current = `${comparison.batchId}:${key}`;
    if (status === 'running') announce(`${completedPairs} dari ${PAIRS} pasangan selesai.`);
    else if (status === 'completed') announce('Perbandingan selesai. Hasil tersedia.');
    else if (status === 'suspended') announce('Perbandingan dijeda karena tab tidak aktif.');
    else if (status === 'cancelled') announce('Perbandingan dibatalkan; hasil sebelumnya tetap ditampilkan.');
    else if (status === 'invalid') announce('Perbandingan dihentikan karena tidak valid.');
  }, [comparison, announce]);

  if (!baseline || !candidate) {
    return (
      <section className="glass panel compare-empty" aria-labelledby="compare-title">
        <div className="compare-empty-icon" aria-hidden="true"><Icon name="scales" size={30} /></div>
        <h2 id="compare-title">Belum ada baseline A</h2>
        <p>Jadikan skenario di tab Simulasi sebagai baseline A. Kandidat B dibuat identik, lalu ubah loket atau waktu pelayanan dan jalankan {PAIRS} pasangan replikasi dengan permintaan yang sama.</p>
        <div className="results-actions">
          <button type="button" className="button primary" onClick={onSetBaseline}><Icon name="scales" />Jadikan skenario sekarang baseline A</button>
          <button type="button" className="button" onClick={onOpenSimulation}><Icon name="back" />Kembali ke Simulasi</button>
        </div>
      </section>
    );
  }

  const a = includeLog && baseline.log.length ? promoteManualLog(baseline.config, baseline.log) : baseline.config;
  const built = buildConfig({ ...candidate, schedule: a.manualSchedule });
  const b: ScenarioConfig | null = 'config' in built
    ? { ...a, id: `${a.id}-b`, name: `${a.name} · B`, c: built.config.c, serviceMinSec: built.config.serviceMinSec, serviceMaxSec: built.config.serviceMaxSec }
    : null;
  const changes = b ? paramChanges(a, b) : [];
  const dispatch = (action: DraftAction) => setCandidate(current => draftReducer(current!, action));
  const field = (name: FieldName, label: string, unit: string, extra: Partial<Parameters<typeof NumberField>[0]> = {}) => (
    <NumberField id={`b-${name}`} label={label} unit={unit} value={candidate.fields[name]} error={candidate.errors[name]} disabled={active}
      onChange={value => dispatch({ type: 'edit', name, value })} onCommit={() => dispatch({ type: 'commit', name })} {...extra} />
  );
  const c = fieldValue(candidate.fields, 'c');
  const shown = lastComparison?.summary ? lastComparison : null;
  const stale = shown !== null && (!b || configSignature(shown.a) !== configSignature(a) || configSignature(shown.b) !== configSignature(b));

  async function act(task: () => Promise<{ accepted: boolean; message?: string } | null>) {
    if (busy || !controller) return;
    setBusy(true);
    try {
      const ack = await task();
      if (ack && !ack.accepted) onNotice(ack.message ?? 'Perbandingan tidak dapat diproses.');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function start() {
    if (!b) {
      setCandidate(current => ({ ...current!, errors: 'errors' in built ? built.errors : {} }));
      document.getElementById(`b-${(['c', 'serviceMin', 'serviceMax'] as const).find(name => 'errors' in built && built.errors[name]) ?? 'c'}`)?.focus();
      return;
    }
    void act(() => controller!.startComparison(a, b));
  }

  return (
    <>
      <section className="glass panel compare-setup" aria-labelledby="compare-title">
        <div className="panel-head">
          <div>
            <h2 id="compare-title">Bandingkan A/B</h2>
            <p className="panel-sub">{PAIRS} pasangan replikasi · sumber A: {baseline.source}</p>
          </div>
          <button type="button" className="button compact" disabled={active} onClick={onSetBaseline}><Icon name="replay" size={15} />Ganti baseline A</button>
        </div>

        <div className="compare-grid">
          <div className="card compare-side">
            <h3><span className="series series-a" aria-hidden="true">A</span>Baseline</h3>
            <dl className="kv">
              <dt>Loket</dt><dd>{a.c}</dd>
              <dt>Pelayanan</dt><dd>{service(a)}</dd>
            </dl>
            <p className="field-hint">Snapshot referensi; tidak dapat diedit di sini.</p>
          </div>
          <div className="card compare-side">
            <h3><span className="series series-b" aria-hidden="true">B</span>Kandidat</h3>
            {field('c', 'Loket aktif', '', {
              className: 'stepper', aside: '1–6',
              before: <button type="button" className="icon-button" aria-label="Kurangi loket kandidat B" disabled={active || c === null || c <= 1}
                onClick={() => dispatch({ type: 'step', name: 'c', delta: -1 })}><Icon name="minus" size={16} /></button>,
              after: <button type="button" className="icon-button" aria-label="Tambah loket kandidat B" disabled={active || c === null || c >= 6}
                onClick={() => dispatch({ type: 'step', name: 'c', delta: 1 })}><Icon name="plus" size={16} /></button>,
            })}
            <div className="pair">
              {field('serviceMin', 'Minimum', 'detik')}
              {field('serviceMax', 'Maksimum', 'detik')}
            </div>
          </div>
        </div>

        <div className="card compare-demand">
          <h3><Icon name="lock" size={15} />Permintaan bersama</h3>
          <dl className="kv">
            <dt>Kedatangan otomatis</dt><dd>{formatRate(a.lambdaPerMinute)} pelanggan/menit</dd>
            <dt>Durasi menerima</dt><dd>{formatClock(a.horizonSec)}</dd>
            <dt>Seed</dt><dd className="mono">{a.rootSeed}</dd>
            <dt>Jadwal manual</dt><dd>{formatCount(a.manualSchedule.length)} entri · {formatCount(schedulePeople(a))} pelanggan</dd>
            <dt>Model</dt><dd className="mono">{a.modelVersion}</dd>
          </dl>
          {baseline.log.length > 0 && (
            <label className="check">
              <input type="checkbox" checked={includeLog} disabled={active} onChange={event => setIncludeLog(event.target.checked)} />
              <span>Sertakan tambahan pelanggan dari run ({formatCount(baseline.log.length)} entri, {formatCount(baseline.log.reduce((sum, entry) => sum + entry.count, 0))} pelanggan) sebagai jadwal bersama</span>
            </label>
          )}
          <p className="field-hint">A dan B memakai kedatangan, durasi, seed, jadwal dan versi model yang sama, jadi setiap pasangan melayani pelanggan yang sama. Untuk mengubahnya, edit skenario di tab Simulasi lalu ganti baseline A.</p>
        </div>

        <div className="compare-diff" aria-live="polite">
          <p className="tag success"><Icon name="check" size={13} />Permintaan sama</p>
          {changes.length === 0
            ? <p className="muted">Belum ada parameter yang diubah · Skenario identik.</p>
            : <ul>{changes.map(change => <li key={change.field}>{LABEL[change.field]}: {change.a} → {change.b}</li>)}</ul>}
        </div>

        <div className="compare-run">
          {!active && (
            <button type="button" id="compare-action" className="button primary" disabled={!controller} aria-disabled={busy || undefined}
              onClick={start}><Icon name="play" weight="fill" />Jalankan {PAIRS} pasangan</button>
          )}
          {active && comparison && (
            <>
              <div className="compare-progress">
                <label htmlFor="compare-progress">{comparison.status === 'suspended' ? 'Perbandingan dijeda saat tab tidak aktif' : `${comparison.completedPairs} dari ${PAIRS} pasangan selesai`}</label>
                <progress id="compare-progress" max={PAIRS} value={comparison.completedPairs} />
              </div>
              {comparison.status === 'suspended' && (
                <button type="button" className="button primary" onClick={() => void act(() => controller!.resumeComparison())}><Icon name="play" weight="fill" />Lanjutkan perbandingan</button>
              )}
              <button type="button" className="button danger" onClick={() => void act(() => controller!.cancelComparison())}><Icon name="stop" />Batalkan perbandingan</button>
            </>
          )}
        </div>
        {comparison?.status === 'cancelled' && (
          <p className="callout warning"><Icon name="warning" /><span>Perbandingan belum selesai. Hasil sebagian tidak dipakai{shown ? '; hasil lengkap sebelumnya tetap ditampilkan' : ''}.</span></p>
        )}
        {comparison?.status === 'invalid' && (
          <p className="callout danger" role="alert"><Icon name="warning" /><span>Perbandingan dihentikan dan tidak valid. {comparison.message}</span></p>
        )}
        <p className="field-hint">Selama perbandingan berjalan, run di tab Simulasi tidak dapat dijalankan dan pengaturan A/B dikunci.</p>
      </section>

      {shown
        ? <ResultView result={shown} stale={stale} onAssumptions={onAssumptions} />
        : <section className="glass panel compare-result" aria-label="Hasil perbandingan"><p className="muted">Belum ada hasil perbandingan. Hasil final muncul setelah {PAIRS} pasangan selesai.</p></section>}
    </>
  );
}
