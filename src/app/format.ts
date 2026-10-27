import type { Metric } from '../simulation/metrics';

// Display only; the engine keeps full precision and decisions never use these strings.
const fixed = (digits: number) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const two = fixed(2);
const one = fixed(1);
const upToOne = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const count = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

export const formatCount = (value: number) => count.format(value);
export const formatRate = (value: number) => upToOne.format(value);
export const formatPercent = (ratio: number) => `${one.format(ratio * 100)}%`;
export const formatDecimal2 = (value: number) => two.format(value);

/** Seconds with two decimals; a nonzero value that would round to zero is shown as "<0,01". */
export function formatSeconds(value: number) {
  if (value !== 0 && Math.abs(value) < 0.005) return `${value < 0 ? '>−' : '<'}0,01 detik`;
  return `${two.format(value).replace('-', '−')} detik`;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** mm:ss, or hh:mm:ss past 59:59. Drain can run past the horizon, so the clock never caps. */
export function formatClock(sec: number) {
  const whole = Math.floor(sec);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(whole % 60)}` : `${pad(minutes)}:${pad(whole % 60)}`;
}

export function spokenClock(sec: number) {
  const whole = Math.floor(sec);
  const minutes = Math.floor(whole / 60);
  return minutes > 0 ? `${minutes} menit ${whole % 60} detik` : `${whole % 60} detik`;
}

export function metricText(metric: Metric, format: (value: number) => string = formatSeconds) {
  return metric.value === null ? 'N/A' : format(metric.value);
}

export function metricReason(metric: Metric) {
  switch (metric.reason) {
    case 'NO_CUSTOMERS': return 'Tidak ada pelanggan pada percobaan ini';
    case 'NOT_AVAILABLE_YET': return 'Belum ada pelanggan mulai dilayani';
    case 'INVALID_RUN': return 'Run tidak valid';
    default: return null;
  }
}

/** A metric split into number and unit, so the unit can be set smaller next to the value. */
export function metricParts(metric: Metric): { value: string; unit?: string } {
  if (metric.value === null) return { value: 'N/A' };
  return { value: formatSeconds(metric.value).replace(/ detik$/, ''), unit: 'detik' };
}
