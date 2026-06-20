export interface XhsInitResponse {
  postId: string;
  note_title: string;
  metadata_completeness: 'high' | 'medium' | 'low';
  has_author_context: boolean;
  has_topics: boolean;
  sourceUrl?: string;
  project_id?: string | null;
  noteId?: string;
}

export interface XhsRunSnapshot {
  status: string;
  current_stage: string;
  received_count: number;
  imported_count: number;
  duplicate_count: number;
  filtered_count: number;
  failed_count: number;
  latest_hint: string | null;
  latest_error: string | null;
  latest_event?: { code?: string } | null;
}

export interface XhsCollectSummary {
  success: boolean;
  postId: string;
  noteTitle: string;
  collectedMainComments: number;
  collectedSubComments: number;
  imported: number;
  duplicates: number;
  filtered: number;
  failed: number;
  metadataCompleteness: 'high' | 'medium' | 'low';
  coverageScore: 'high' | 'medium' | 'low';
  needBackfill: boolean;
  error: string | null;
  analysisTriggered?: boolean;
  queued?: boolean;
}

export interface XhsCollectProgress {
  phase: 'init' | 'fetching' | 'importing' | 'done' | 'error';
  message: string;
  collected: number;
  estimated?: number;
}

export function isTerminalRunStatus(status: string) {
  return ['completed', 'failed', 'cancelled'].includes(status);
}

export function buildXhsTaskRequest(input: {
  init: XhsInitResponse & { sourceUrl: string; project_id: string | null; noteId: string };
  maxComments: number;
}) {
  return {
    platform: 'xhs',
    target_url: input.init.sourceUrl,
    max_comments: input.maxComments,
    project_id: input.init.project_id,
    config_json: {
      post_id: input.init.postId,
      note_id: input.init.noteId,
      source: 'collect-xhs',
      metadata_completeness: input.init.metadata_completeness,
    },
  };
}

export function buildXhsCollectSummary(input: {
  init: XhsInitResponse;
  run: XhsRunSnapshot;
}): XhsCollectSummary {
  const received = input.run.received_count || 0;
  const imported = input.run.imported_count || 0;
  const ratio = received > 0 ? imported / received : 0;
  const coverageScore = ratio >= 0.8 ? 'high' : ratio >= 0.4 ? 'medium' : 'low';
  const needBackfill = input.run.status !== 'completed' || coverageScore !== 'high' || input.init.metadata_completeness === 'low' || Boolean(input.run.latest_hint);

  return {
    success: input.run.status === 'completed',
    postId: input.init.postId,
    noteTitle: input.init.note_title,
    collectedMainComments: received,
    collectedSubComments: 0,
    imported,
    duplicates: input.run.duplicate_count || 0,
    filtered: input.run.filtered_count || 0,
    failed: input.run.failed_count || 0,
    metadataCompleteness: input.init.metadata_completeness,
    coverageScore,
    needBackfill,
    error: input.run.latest_error || null,
  };
}

export async function collectXhsComments(
  params: { url: string; projectId?: string; maxComments?: number },
  onProgress: (progress: XhsCollectProgress) => void,
  deps?: {
    fetchImpl?: typeof fetch;
    sleepImpl?: (ms: number) => Promise<void>;
  }
): Promise<XhsCollectSummary> {
  const fetchImpl = deps?.fetchImpl || fetch;
  const sleepImpl = deps?.sleepImpl || ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
  const maxComments = params.maxComments || 5000;

  onProgress({ phase: 'init', message: '初始化小红书笔记信息...', collected: 0 });
  const initRes = await fetchImpl('/api/collect/xhs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: params.url, project_id: params.projectId || null }),
  });
  const initData = await initRes.json() as XhsInitResponse & { error?: string; success?: boolean };
  if (initData.error || !initData.postId || !initData.noteId || !initData.sourceUrl) {
    return {
      success: false,
      postId: '',
      noteTitle: '',
      collectedMainComments: 0,
      collectedSubComments: 0,
      imported: 0,
      duplicates: 0,
      filtered: 0,
      failed: 0,
      metadataCompleteness: 'low',
      coverageScore: 'low',
      needBackfill: true,
      error: initData.error || '小红书初始化失败',
      analysisTriggered: false,
    };
  }

  onProgress({ phase: 'fetching', message: '已创建小红书深采任务，等待主引擎执行...', collected: 0 });
  const taskRes = await fetchImpl('/api/agent/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildXhsTaskRequest({
      init: {
        ...initData,
        sourceUrl: initData.sourceUrl,
        project_id: initData.project_id || null,
        noteId: initData.noteId,
      },
      maxComments,
    })),
  });
  const taskData = await taskRes.json() as { error?: string; collection_run_id?: string };
  if (taskData.error || !taskData.collection_run_id) {
    return {
      success: false,
      postId: initData.postId,
      noteTitle: initData.note_title,
      collectedMainComments: 0,
      collectedSubComments: 0,
      imported: 0,
      duplicates: 0,
      filtered: 0,
      failed: 0,
      metadataCompleteness: initData.metadata_completeness,
      coverageScore: 'low',
      needBackfill: true,
      error: taskData.error || '创建小红书深采任务失败',
      analysisTriggered: false,
    };
  }

  let lastSeenRun: ({ id: string } & XhsRunSnapshot) | null = null;

  for (let attempt = 0; attempt < 120; attempt++) {
    const runsRes = await fetchImpl(`/api/collection/runs?limit=100${initData.project_id ? `&projectId=${initData.project_id}` : ''}`);
    const runsData = await runsRes.json() as { runs?: Array<{ id: string } & XhsRunSnapshot> };
    const run = (runsData.runs || []).find(r => r.id === taskData.collection_run_id) || null;

    if (run) {
      lastSeenRun = run;
      onProgress({
        phase: isTerminalRunStatus(run.status) ? 'done' : (run.current_stage === 'import' || run.current_stage === 'finalize' ? 'importing' : 'fetching'),
        message: `小红书深采进行中：${run.current_stage}`,
        collected: run.received_count || 0,
      });

      if (isTerminalRunStatus(run.status)) {
        const summary = buildXhsCollectSummary({ init: initData, run });
        summary.analysisTriggered = run.latest_event?.code === 'ANALYSIS_TRIGGERED';
        if (!summary.success && !summary.error) {
          summary.error = run.latest_error || '小红书采集未成功完成';
        }
        return summary;
      }

      if (attempt >= 4 && ['queued', 'awaiting_input', 'running'].includes(run.status)) {
        return {
          success: false,
          postId: initData.postId,
          noteTitle: initData.note_title,
          collectedMainComments: run.received_count || 0,
          collectedSubComments: 0,
          imported: run.imported_count || 0,
          duplicates: run.duplicate_count || 0,
          filtered: run.filtered_count || 0,
          failed: run.failed_count || 0,
          metadataCompleteness: initData.metadata_completeness,
          coverageScore: 'low',
          needBackfill: false,
          error: null,
          analysisTriggered: false,
          queued: true,
        };
      }
    }

    await sleepImpl(3000);
  }

  return {
    success: false,
    postId: initData.postId,
    noteTitle: initData.note_title,
    collectedMainComments: lastSeenRun?.received_count || 0,
    collectedSubComments: 0,
    imported: lastSeenRun?.imported_count || 0,
    duplicates: lastSeenRun?.duplicate_count || 0,
    filtered: lastSeenRun?.filtered_count || 0,
    failed: lastSeenRun?.failed_count || 0,
    metadataCompleteness: initData.metadata_completeness,
    coverageScore: 'low',
    needBackfill: true,
    error: '小红书深采超时，建议使用 run 面板继续跟踪或转入补录',
    analysisTriggered: false,
  };
}
