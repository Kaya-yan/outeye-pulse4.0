function buildBookmarkletConsoleCommand(runId: string) {
  return [
    `window.__outeye_collection_run_id = '${runId}';`,
    `/* OutEye bookmarklet session */`,
    `/* Ensure generated rows include collection_run_id: '${runId}' before posting to raw_comments */`,
    `collection_run_id = '${runId}';`,
  ].join('\n');
}

export function buildRunCommand(input: {
  id: string;
  source: string;
  mode: string;
  target_type: string;
  target_value: string | null;
}) {
  if (input.source === 'bookmarklet' && input.mode === 'raw_intake') {
    return {
      kind: 'console',
      command: buildBookmarkletConsoleCommand(input.id),
    };
  }

  return {
    kind: 'shell',
    command: 'python scripts/agent/agent.py',
  };
}
