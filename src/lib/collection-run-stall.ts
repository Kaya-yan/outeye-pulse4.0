const QUEUED_THRESHOLD_MS = 10 * 60 * 1000;
const RUNNING_THRESHOLD_MS = 15 * 60 * 1000;

export function detectRunStall(input: {
  status: string;
  heartbeat_at: string | null;
  now: string;
}) {
  if (!['queued', 'running', 'awaiting_input', 'importing'].includes(input.status)) {
    return { stalled: false, failure_code: null, thresholdMs: null };
  }

  const thresholdMs = input.status === 'queued' ? QUEUED_THRESHOLD_MS : RUNNING_THRESHOLD_MS;
  if (!input.heartbeat_at) {
    return { stalled: false, failure_code: null, thresholdMs };
  }

  const elapsedMs = new Date(input.now).getTime() - new Date(input.heartbeat_at).getTime();
  if (elapsedMs > thresholdMs) {
    return { stalled: true, failure_code: 'RUN_STALLED', thresholdMs };
  }

  return { stalled: false, failure_code: null, thresholdMs };
}
