export interface StatSample {
  values: number[];
  missingCount: number;
  filteredCount: number;
  zeroCount: number;
}

export interface StatSampleInput {
  values: number[];
  missingCount: number;
  filteredCount: number;
  zeroCount: number;
}

type StatComment = { analysis?: Record<string, unknown> | null };

export function buildStatSample(
  comments: ReadonlyArray<StatComment>,
  dim: string,
  options?: { shouldInclude?: (c: StatComment) => boolean }
): StatSample {
  const values: number[] = [];
  let missingCount = 0;
  let filteredCount = 0;
  let zeroCount = 0;

  for (const c of comments) {
    if (options?.shouldInclude && !options.shouldInclude(c)) {
      filteredCount += 1;
      continue;
    }

    const raw = c.analysis?.[dim];
    if (raw === null || raw === undefined) {
      missingCount += 1;
      continue;
    }

    const num = Number(raw);
    if (Number.isNaN(num)) {
      missingCount += 1;
      continue;
    }

    if (num === 0) {
      zeroCount += 1;
    }
    values.push(num);
  }

  return { values, missingCount, filteredCount, zeroCount };
}

export function summarizeStatInput(
  sample: Pick<StatSampleInput, 'values' | 'missingCount' | 'filteredCount'>,
  totalComments: number
) {
  const accounted = sample.values.length + sample.missingCount + sample.filteredCount;
  const total = totalComments >= 0 ? totalComments : accounted;
  return {
    total,
    valid: sample.values.length,
    missing: sample.missingCount,
    filtered: sample.filteredCount,
  };
}
