import { expect, test } from 'vitest';
import { calculateCohortMetrics, provisionalMeanWait } from './metrics';
import type { MetricCustomer } from './metrics';

function completed(wait: number, serviceSec = 10, arrivalAt = 0): MetricCustomer {
  return { arrivalAt, serviceStartAt: arrivalAt + wait, departureAt: arrivalAt + wait + serviceSec, serviceSec };
}

test.each([[1, 1], [2, 2], [20, 19], [21, 20]])('P95 uses nearest rank for N=%i', (count, expected) => {
  const customers = Array.from({ length: count }, (_, i) => completed(count - i));
  const copy = customers.slice();
  expect(calculateCohortMetrics(customers).p95WaitSec).toEqual({ value: expected, reason: null });
  expect(customers).toEqual(copy);
});

test('cohort mean uses all completed customers and satisfies the time identity', () => {
  const metrics = calculateCohortMetrics([completed(0, 10, 5), completed(10, 20, 10), completed(20, 30, 20)]);
  expect(metrics.meanWaitSec).toEqual({ value: 10, reason: null });
  expect(metrics.meanServiceSec).toEqual({ value: 20, reason: null });
  expect(metrics.meanTimeInSystemSec).toEqual({ value: 30, reason: null });
  expect(metrics.p95WaitSec).toEqual({ value: 20, reason: null });
  expect(metrics.meanTimeInSystemSec.value).toBe(metrics.meanWaitSec.value! + metrics.meanServiceSec.value!);
});

test('empty final cohort gives NO_CUSTOMERS for every metric', () => {
  for (const metric of Object.values(calculateCohortMetrics([]))) {
    expect(metric).toEqual({ value: null, reason: 'NO_CUSTOMERS' });
  }
});

test('nonempty cohort with no waiting has valid zero wait', () => {
  const metrics = calculateCohortMetrics([completed(0), completed(0)]);
  expect(metrics.meanWaitSec).toEqual({ value: 0, reason: null });
  expect(metrics.p95WaitSec).toEqual({ value: 0, reason: null });
});

test.each([
  { arrivalAt: 0, serviceStartAt: null, departureAt: null, serviceSec: 10 },
  { arrivalAt: 0, serviceStartAt: 5, departureAt: null, serviceSec: 10 },
])('final metrics reject incomplete customer %j', (customer) => {
  expect(() => calculateCohortMetrics([completed(0), customer])).toThrow(RangeError);
});

test('provisional denominator counts completed and in-service customers but excludes waiting', () => {
  const customers: MetricCustomer[] = [
    completed(10),
    { arrivalAt: 10, serviceStartAt: 30, departureAt: null, serviceSec: 10 },
    { arrivalAt: 0, serviceStartAt: null, departureAt: null, serviceSec: 10 },
  ];
  expect(provisionalMeanWait(customers)).toEqual({ metric: { value: 15, reason: null }, started: 2 });
});

test('provisional wait before any service starts is unavailable', () => {
  const expected = { metric: { value: null, reason: 'NOT_AVAILABLE_YET' }, started: 0 };
  expect(provisionalMeanWait([])).toEqual(expected);
  expect(provisionalMeanWait([{ arrivalAt: 0, serviceStartAt: null, departureAt: null, serviceSec: 10 }])).toEqual(expected);
});

const invalidCustomers: MetricCustomer[] = [
  { ...completed(0), arrivalAt: NaN },
  { ...completed(0), arrivalAt: Infinity },
  { ...completed(0), arrivalAt: -1 },
  { ...completed(0), serviceSec: 0 },
  { ...completed(0), serviceSec: -1 },
  { ...completed(0), serviceSec: NaN },
  { ...completed(0), serviceSec: Infinity },
  { ...completed(0), serviceStartAt: Infinity },
  { ...completed(0), serviceStartAt: NaN },
  { ...completed(0), serviceStartAt: -1 },
  { ...completed(0), serviceStartAt: null },
  { ...completed(0), departureAt: Infinity },
  { ...completed(0), departureAt: NaN },
  { ...completed(0), departureAt: 0 },
  { ...completed(0), departureAt: -1 },
  { ...completed(0), departureAt: 11 },
];

test.each(invalidCustomers)('rejects invalid numeric/timing data %j in final and provisional metrics', (customer) => {
  expect(() => calculateCohortMetrics([customer])).toThrow(RangeError);
  expect(() => provisionalMeanWait([customer])).toThrow(RangeError);
});

test('service mean uses actual elapsed service and tolerates binary64 rounding', () => {
  const customer = { arrivalAt: 0.1, serviceStartAt: 0.2, departureAt: 0.2 + 0.1, serviceSec: 0.1 };
  const metrics = calculateCohortMetrics([customer]);
  expect(metrics.meanServiceSec.value).toBe(customer.departureAt - customer.serviceStartAt);
  expect(metrics.meanTimeInSystemSec.value).toBeCloseTo(metrics.meanWaitSec.value! + metrics.meanServiceSec.value!, 14);
});
