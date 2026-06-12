/**
 * Client-side analysis runner.
 * Drives the batch loop by calling POST /api/analysis repeatedly.
 */

export interface AnalysisRunnerCallbacks {
  onProgress: (processed: number, total: number, progress: number) => void;
  onDone: (processed: number, failed: number, total: number) => void;
  onError: (error: string) => void;
}

let abortController: AbortController | null = null;

/**
 * Start a full analysis run.
 * 1. POST to create a log (start mode)
 * 2. Loop: POST with logId to process each batch
 * 3. Call callbacks on progress/completion/error
 */
export async function runAnalysis(
  projectId: string,
  postId: string | undefined,
  callbacks: AnalysisRunnerCallbacks,
): Promise<void> {
  // Abort any previous run
  if (abortController) abortController.abort();
  abortController = new AbortController();
  const signal = abortController.signal;

  try {
    // Step 1: Start — create analysis log
    const startBody: Record<string, unknown> = { projectId };
    if (postId) startBody.postId = postId;

    const startRes = await fetch('/api/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(startBody),
      signal,
    });
    const startData = await startRes.json();

    if (startData.error) {
      callbacks.onError(startData.error);
      return;
    }

    if (!startData.logId || startData.total === 0) {
      callbacks.onDone(0, 0, 0);
      return;
    }

    const logId = startData.logId;
    const total = startData.total;

    // Step 2: Process batches in a loop
    let done = false;
    let retries = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;

    while (!done && !signal.aborted) {
      try {
        const batchRes = await fetch('/api/analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logId, projectId }),
          signal,
        });
        const batchData = await batchRes.json();

        if (batchData.error) {
          retries++;
          if (retries >= MAX_CONSECUTIVE_ERRORS) {
            callbacks.onError(`连续 ${MAX_CONSECUTIVE_ERRORS} 次失败: ${batchData.error}`);
            return;
          }
          // Wait before retry
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        retries = 0; // reset on success
        callbacks.onProgress(batchData.processed, total, batchData.progress || 0);

        done = batchData.done;

        if (!done) {
          // Small delay between batches to avoid overwhelming the API
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (err) {
        if (signal.aborted) return;
        retries++;
        if (retries >= MAX_CONSECUTIVE_ERRORS) {
          callbacks.onError(`网络错误，连续 ${MAX_CONSECUTIVE_ERRORS} 次失败`);
          return;
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!signal.aborted) {
      // Fetch final log state
      const logRes = await fetch(`/api/analysis?logId=${logId}`);
      const logData = await logRes.json();
      const log = logData.log;
      callbacks.onDone(
        log?.processed_comments || 0,
        log?.failed_comments || 0,
        log?.total_comments || total,
      );
    }
  } catch (err) {
    if (!signal.aborted) {
      callbacks.onError(err instanceof Error ? err.message : String(err));
    }
  }
}

/**
 * Cancel the current analysis run.
 */
export function cancelAnalysis(): void {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}
