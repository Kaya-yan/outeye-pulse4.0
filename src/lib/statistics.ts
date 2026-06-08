import { mean, variance } from 'simple-statistics';

export interface TTestResult {
  t: number;
  p: number;
  df: number;
  cohensD: number;
  mean1: number;
  mean2: number;
  significance: '***' | '**' | '*' | '?' | 'ns';
}

/**
 * Welch's t-test for independent samples with unequal variances
 */
export function welchTTest(sample1: number[], sample2: number[]): TTestResult {
  const n1 = sample1.length;
  const n2 = sample2.length;

  if (n1 < 2 || n2 < 2) {
    return { t: 0, p: 1, df: 0, cohensD: 0, mean1: 0, mean2: 0, significance: 'ns' };
  }

  const m1 = mean(sample1);
  const m2 = mean(sample2);
  const v1 = variance(sample1);
  const v2 = variance(sample2);

  // Welch's t-test statistic
  const se1 = v1 / n1;
  const se2 = v2 / n2;
  const sed = Math.sqrt(se1 + se2);

  if (sed === 0) {
    return { t: 0, p: 1, df: 0, cohensD: 0, mean1: m1, mean2: m2, significance: 'ns' };
  }

  const t = (m1 - m2) / sed;

  // Welch-Satterthwaite degrees of freedom
  const df = Math.pow(se1 + se2, 2) / (Math.pow(se1, 2) / (n1 - 1) + Math.pow(se2, 2) / (n2 - 1));

  // p-value approximation (two-tailed)
  const p = 2 * (1 - cumulativeStudentT(Math.abs(t), df));

  // Cohen's d (effect size)
  const pooledStd = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  const cohensD = pooledStd === 0 ? 0 : Math.abs((m1 - m2) / pooledStd);

  // Significance level
  let significance: TTestResult['significance'];
  if (p < 0.001) significance = '***';
  else if (p < 0.01) significance = '**';
  else if (p < 0.05) significance = '*';
  else if (p < 0.10) significance = '?';
  else significance = 'ns';

  return { t, p, df, cohensD, mean1: m1, mean2: m2, significance };
}

/**
 * Cumulative Student's t-distribution (approximation)
 * Uses the regularized incomplete beta function approximation
 */
function cumulativeStudentT(t: number, df: number): number {
  const x = df / (df + t * t);
  const a = df / 2;
  const b = 0.5;

  // Use beta distribution approximation
  const betaInc = regularizedIncompleteBeta(x, a, b);

  return 1 - 0.5 * betaInc;
}

/**
 * Regularized incomplete beta function (approximation)
 */
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x === 0) return 0;
  if (x === 1) return 1;

  // Simple approximation using continued fraction
  const maxIter = 200;
  const eps = 1e-10;

  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);

  let result = 0;
  let term = 1;

  for (let n = 0; n < maxIter; n++) {
    if (n === 0) {
      term = Math.pow(x, a) * Math.pow(1 - x, b) / (a * Math.exp(lnBeta));
    } else {
      const m = Math.floor(n / 2);
      let numerator: number;
      if (n % 2 === 0) {
        numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
      } else {
        numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
      }
      term *= numerator;
    }

    result += term;

    if (Math.abs(term) < eps) break;
  }

  return result * a;
}

/**
 * Log gamma function (Stirling's approximation)
 */
function lnGamma(z: number): number {
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }

  z -= 1;
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }

  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Calculate Mann-Whitney U test for non-parametric comparison
 */
export function mannWhitneyU(sample1: number[], sample2: number[]): { u: number; z: number; p: number } {
  const n1 = sample1.length;
  const n2 = sample2.length;
  const N = n1 + n2;

  // Combine and rank
  const combined = [
    ...sample1.map((v, i) => ({ value: v, group: 1 as const, index: i })),
    ...sample2.map((v, i) => ({ value: v, group: 2 as const, index: i })),
  ].sort((a, b) => a.value - b.value);

  // Assign ranks (handle ties with average rank)
  const ranks: number[] = new Array(N);
  let i = 0;
  while (i < N) {
    let j = i;
    while (j < N && combined[j].value === combined[i].value) j++;
    const avgRank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) {
      const idx = combined[k].group === 1 ? combined[k].index : n1 + combined[k].index;
      ranks[idx] = avgRank;
    }
    i = j;
  }

  // Calculate U statistics
  const r1 = ranks.slice(0, n1).reduce((a, b) => a + b, 0);
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);

  // Normal approximation for p-value
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt((n1 * n2 * (N + 1)) / 12);
  const z = sigma === 0 ? 0 : (u - mu) / sigma;
  const p = 2 * (1 - normalCDF(Math.abs(z)));

  return { u, z, p };
}

/**
 * Standard normal CDF approximation
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}
