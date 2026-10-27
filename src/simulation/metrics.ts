export type Metric = {
  value: number | null;
  reason: 'NO_CUSTOMERS' | 'NOT_AVAILABLE_YET' | 'INVALID_RUN' | null;
};

export type MetricCustomer = {
  arrivalAt: number;
  serviceStartAt: number | null;
  departureAt: number | null;
  serviceSec: number;
};

export type CohortMetrics = {
  meanWaitSec: Metric;
  p95WaitSec: Metric;
  meanTimeInSystemSec: Metric;
  meanServiceSec: Metric;
};

function validateCustomer(customer: MetricCustomer): void {
  const { arrivalAt, serviceStartAt, departureAt, serviceSec } = customer;
  if (!Number.isFinite(arrivalAt) || arrivalAt < 0 || !Number.isFinite(serviceSec) || serviceSec <= 0) {
    throw new RangeError('Customer arrival and positive service must be finite');
  }
  if (serviceStartAt !== null && (!Number.isFinite(serviceStartAt) || serviceStartAt < arrivalAt)) {
    throw new RangeError('Service start must be finite and at or after arrival');
  }
  if (departureAt !== null) {
    if (serviceStartAt === null || !Number.isFinite(departureAt) || departureAt <= serviceStartAt) {
      throw new RangeError('Departure requires a service start and must be finite and later');
    }
    const expected = serviceStartAt + serviceSec;
    const tolerance = Math.max(1e-8, 1e-10 * Math.max(Math.abs(expected), Math.abs(departureAt)));
    if (!Number.isFinite(expected) || Math.abs(departureAt - expected) > tolerance) {
      throw new RangeError('Departure must equal service start plus service duration');
    }
  }
}

function measured(value: number): Metric {
  if (!Number.isFinite(value)) throw new RangeError('Metric must be finite');
  return { value, reason: null };
}

export function calculateCohortMetrics(customers: readonly MetricCustomer[]): CohortMetrics {
  if (customers.length === 0) {
    return {
      meanWaitSec: { value: null, reason: 'NO_CUSTOMERS' },
      p95WaitSec: { value: null, reason: 'NO_CUSTOMERS' },
      meanTimeInSystemSec: { value: null, reason: 'NO_CUSTOMERS' },
      meanServiceSec: { value: null, reason: 'NO_CUSTOMERS' },
    };
  }
  const waits: number[] = [];
  let totalSystem = 0;
  let totalService = 0;
  for (const customer of customers) {
    validateCustomer(customer);
    const { arrivalAt, serviceStartAt, departureAt } = customer;
    if (serviceStartAt === null || departureAt === null) {
      throw new RangeError('Final cohort metrics require every customer to complete');
    }
    waits.push(serviceStartAt - arrivalAt);
    totalSystem += departureAt - arrivalAt;
    totalService += departureAt - serviceStartAt;
  }
  waits.sort((a, b) => a - b);
  return {
    meanWaitSec: measured(waits.reduce((sum, wait) => sum + wait, 0) / customers.length),
    p95WaitSec: measured(waits[Math.ceil(0.95 * customers.length) - 1]),
    meanTimeInSystemSec: measured(totalSystem / customers.length),
    meanServiceSec: measured(totalService / customers.length),
  };
}

export function provisionalMeanWait(customers: readonly MetricCustomer[]): { metric: Metric; started: number } {
  let totalWait = 0;
  let started = 0;
  for (const customer of customers) {
    validateCustomer(customer);
    if (customer.serviceStartAt !== null) {
      totalWait += customer.serviceStartAt - customer.arrivalAt;
      started++;
    }
  }
  return {
    metric: started === 0 ? { value: null, reason: 'NOT_AVAILABLE_YET' } : measured(totalWait / started),
    started,
  };
}
