# Collection Ops Unification Design

Date: 2026-06-17  
Topic: `collection-ops-unification`
Scope: First-phase unification of collection operations for mixed users through a dual-entry model (web guidance + terminal execution), with state transparency as the primary goal and soft compatibility with existing flows.

## 1. Summary

OutEye currently supports multiple collection paths, but each path exposes a different operational model and status source:

- Bookmarklet intake writes to `raw_comments`
- Agent/VPS execution uses `task_queue`
- Agent callback import uses `agent_data`
- Keyword search uses `search_tasks` and `search_results`
- P0 reads some of these directly and exposes them separately

The system already collects data, but operations are fragmented. A user cannot reliably answer one simple question: **what happened during this collection run, where is it now, and what should I do next?**

This design adds a new unifying layer above the existing tables:

- `collection_runs`: one row per collection operation
- `collection_run_events`: structured event timeline for each run

Existing flows remain in place. They are attached to a run and progressively migrated behind a unified operational view.

## 2. Goals

1. Make collection status transparent across all major entry points.
2. Support a dual-entry workflow:
   - web UI for guidance, visibility, diagnosis, and recovery actions
   - terminal/worker for execution and deep troubleshooting
3. Preserve existing scripts and tables during phase 1.
4. Provide a soft migration path from fragmented status tables to a unified operational model.
5. Make common failures actionable through stable error codes, stage tracking, and recovery hints.

## 3. Non-goals

Phase 1 does not:

- rewrite Playwright, VPS, or crawler core logic
- collapse all collection tables into a single new storage model
- redesign the whole P0 information architecture
- introduce a full multi-user permission system
- fully webify all collection execution
- replace all old APIs immediately

## 4. Current State

The current collection system has multiple valid but disconnected paths:

### 4.1 Bookmarklet intake
- bookmarklet writes collected data to `raw_comments`
- later linking/import moves data into `comments`
- status is local to `raw_comments.status`

### 4.2 Agent/VPS task execution
- the UI creates rows in `task_queue`
- workers claim tasks through `claim_next_task`
- workers update task status through `/api/agent/tasks`
- uploaded collection payloads are stored in `agent_data`
- import into `comments` happens in `/api/agent/data`

### 4.3 Keyword search
- search jobs write to `search_tasks`
- results are materialized in `search_results`
- these records are useful, but they are not exposed as part of a single operational timeline

### 4.4 Local operations view
- P0 directly reads some task data and local logs
- there is no unified run identity across the system
- failures are mostly free-text messages instead of stable operational states

## 5. Proposed Architecture

Introduce an operational layer that becomes the single source of truth for user-facing collection state.

### 5.1 Core model

#### `collection_runs`
Represents one collection operation initiated by any supported entry point.

Each run stores:

- `id`
- `project_id`
- `platform` (`bilibili` or `xhs`)
- `source` (`bookmarklet`, `playwright`, `vps`, `agent`, `search`)
- `mode` (`direct_url`, `keyword_search`, `raw_intake`, `deep_scrape`)
- `initiator` (`ui`, `cli`, `system`)
- `target_type` (`url`, `keyword`, `source_id`, `task`, `mixed`)
- `target_value`
- `status`
- `current_stage`
- `failure_code`
- `latest_error`
- `latest_hint`
- `received_count`
- `imported_count`
- `duplicate_count`
- `filtered_count`
- `failed_count`
- `heartbeat_at`
- `started_at`
- `finished_at`
- `created_at`
- `updated_at`

#### `collection_run_events`
Represents structured timeline events for a run.

Each event stores:

- `id`
- `collection_run_id`
- `stage`
- `level`
- `code`
- `message`
- `details_json`
- `hint`
- `created_at`

### 5.2 Existing tables remain authoritative for domain details

The new layer does not replace domain tables. Instead:

- `raw_comments` remains the intake store for bookmarklet payloads
- `task_queue` remains the executable queue for agents/workers
- `agent_data` remains the staged callback payload log
- `search_tasks` and `search_results` remain the search cache and result model
- `comments` remains the main imported analysis dataset

The new operational layer becomes the user-facing truth about run lifecycle and diagnostics.

## 6. Data Model Changes

### 6.1 New tables

#### `collection_runs`

Required indexes:

- `(project_id, created_at desc)`
- `(status, created_at desc)`
- `(platform, created_at desc)`
- `(heartbeat_at)`

#### `collection_run_events`

Required indexes:

- `(collection_run_id, created_at asc)`
- `(code, created_at desc)`
- `(stage, created_at desc)`

### 6.2 Additive changes to existing tables

Add nullable `collection_run_id` foreign keys to:

- `raw_comments`
- `task_queue`
- `agent_data`
- `search_tasks`

Constraints:

- `ON DELETE SET NULL`
- phase 1 keeps them nullable to preserve backward compatibility

### 6.3 No destructive migration in phase 1

No existing table is removed or renamed. No existing workflow is blocked from writing if it does not yet provide a run reference.

## 7. Unified Status Model

The UI must stop exposing internal table-specific statuses directly as the main operational state.

### 7.1 User-facing run statuses

- `draft`
- `queued`
- `running`
- `awaiting_input`
- `importing`
- `completed`
- `partial_success`
- `failed`
- `cancelled`

### 7.2 Stage model

Each run also carries a current stage:

- `init`
- `queue`
- `claim`
- `crawl`
- `receive`
- `import`
- `finalize`

### 7.3 Mapping principle

Existing low-level states remain internal:

- `task_queue.status`
- `raw_comments.status`
- `agent_data.status`
- `search_tasks.status`

These values are mapped into the run status/stage model instead of being shown raw in the main operations view.

## 8. Event and Failure Model

### 8.1 Event levels

- `info`
- `warning`
- `error`

### 8.2 Standard event codes

Phase 1 must support stable codes for at least these cases:

- `RUN_CREATED`
- `ENV_CHECKED`
- `TASK_ENQUEUED`
- `TASK_CLAIMED`
- `CRAWL_STARTED`
- `CRAWL_PROGRESS`
- `RAW_RECEIVED`
- `IMPORT_STARTED`
- `IMPORT_COMPLETED`
- `ANALYSIS_TRIGGERED`
- `COOKIE_EXPIRED`
- `RATE_LIMITED`
- `VPS_OFFLINE`
- `AGENT_NOT_CLAIMING`
- `RAW_INTAKE_EMPTY`
- `IMPORT_ZERO_INSERTED`
- `POST_AUTO_CREATE_FAILED`
- `RUN_STALLED`
- `ANALYSIS_TRIGGER_FAILED`
- `RUN_CANCELLED`

### 8.3 Failure representation

Runs use both:

- `failure_code`
- `latest_error`

`failure_code` is the stable machine-readable reason. `latest_error` is the operator-readable detail. `latest_hint` tells the UI what next step to recommend.

## 9. Heartbeat and Stall Detection

### 9.1 Heartbeat behavior

Long-running collection flows update `heartbeat_at` whenever meaningful progress occurs:

- worker claims task
- crawl starts
- page or batch progresses
- data upload starts or finishes
- import starts or finishes

### 9.2 Stall rule

A run is considered stalled when:

- it is in `queued`, `running`, or `importing`
- and `heartbeat_at` is older than the configured threshold for its mode

Phase 1 behavior:

- the UI shows a warning when the threshold is exceeded
- a scheduled maintenance check or explicit operator action can mark the run failed with `RUN_STALLED`

Threshold defaults:

- `queued`: 10 minutes without claim
- `running`: 15 minutes without heartbeat
- `importing`: 10 minutes without update

These defaults are operational constants, not user-facing settings in phase 1.

## 10. Entry Point Design

### 10.1 Web entry responsibilities

P0 becomes the collection operations console.

Its responsibilities are:

1. create runs
2. guide the user toward the right execution path
3. display unified status and timeline
4. expose recovery actions

P0 does not need to execute collection itself. It orchestrates and observes.

### 10.2 Terminal/worker responsibilities

The execution side remains script- and worker-based.

All execution paths must converge on a shared reporting protocol:

- create or accept a `run_id`
- emit run events
- update aggregate counters and heartbeat
- finalize the run outcome

Phase 1 does not require replacing every existing script entry point. It requires wrapping or adapting them so they can participate in run tracking.

## 11. Phase 1 Flow Definitions

### 11.1 UI-created agent run

1. User creates a collection run from P0.
2. The system inserts a `collection_runs` row with `status=queued`, `current_stage=queue`.
3. The system inserts a `task_queue` row linked by `collection_run_id`.
4. A worker claims the task.
5. The worker updates the run to `running`, `current_stage=claim` then `crawl`.
6. The worker uploads payloads through `/api/agent/data`.
7. The callback inserts `agent_data` linked to the run.
8. Import starts and updates the run to `importing`.
9. Import summary updates aggregate counters.
10. If import succeeds fully, the run becomes `completed`.
11. If some data is valid but some fails, the run becomes `partial_success`.
12. If nothing useful is imported, the run becomes `failed` with a stable failure code.

### 11.2 Bookmarklet run

1. User creates a pending run from P0.
2. The run records `source=bookmarklet`, `mode=raw_intake`.
3. Bookmarklet writes `raw_comments` rows with `collection_run_id`.
4. UI or helper action links/imports those rows.
5. Import updates the same run timeline and summary.
6. The user sees one continuous run instead of separate intake and import states.

### 11.3 Keyword search run

1. User creates a run from P0 using keyword search.
2. The system inserts `collection_runs`.
3. The system inserts `search_tasks` linked by `collection_run_id`.
4. Search results populate `search_results`.
5. The run timeline records creation, progress, and completion.
6. Optional downstream collection can reference the originating run.

## 12. API Changes

Phase 1 favors additive APIs and compatibility with existing endpoints.

### 12.1 Existing endpoints to adapt

#### `/api/agent/tasks`
On task creation:

- either create a run first or accept a `collection_run_id` from the caller
- write a `TASK_ENQUEUED` event

On task update:

- map `running`, `completed`, `failed` changes into run status/stage/event updates
- update heartbeat

#### `/api/agent/data`
On callback import:

- resolve the associated run from `collection_run_id` or linked task
- write `RAW_RECEIVED`, `IMPORT_STARTED`, `IMPORT_COMPLETED` or failure events
- update counts on `collection_runs`
- write `ANALYSIS_TRIGGERED` or `ANALYSIS_TRIGGER_FAILED` when applicable

### 12.2 New operational endpoints

#### `POST /api/collection/runs`
Creates a new run and optional linked execution artifact.

Supported creation modes in phase 1:

- agent task run
- bookmarklet intake run
- keyword search run

#### `GET /api/collection/runs`
Returns recent runs with filters:

- project
- platform
- status
- source

#### `GET /api/collection/runs/:id`
Returns one run with recent events and aggregate metrics.

#### `POST /api/collection/runs/:id/retry`
Creates a new run cloned from the original run configuration.

#### `POST /api/collection/runs/:id/cancel`
Marks a run cancelled if it is not already terminal.

#### `GET /api/collection/runs/:id/command`
Returns a canonical terminal command for the chosen execution mode.

## 13. P0 UI Changes

Phase 1 updates P0 without replacing its existing sections.

### 13.1 New collection operations panel

Add a run-centric panel showing:

- recent runs
- current status
- current stage
- last heartbeat
- summary counts
- latest failure code
- latest hint
- latest events timeline

### 13.2 Keep existing sections, but downgrade them to detailed tools

The following sections remain available:

- environment check
- file scan/import
- agent task creation
- FAQ and operational instructions

However, they are no longer the primary state view. The run list becomes the primary operational surface.

### 13.3 Recovery actions in UI

For each eligible run the UI can expose:

- retry same configuration
- clone run
- regenerate command
- cancel run
- view low-level linked records

## 14. CLI and Worker Integration Rules

Phase 1 does not require a complete command runner rewrite, but it does require a standard integration contract.

Any collection executor participating in the new model must be able to:

1. accept a `run_id` or fetch one from a created task
2. update heartbeat periodically
3. emit event codes at meaningful stage boundaries
4. finalize with counts and terminal status

This can be done either by:

- extending existing scripts directly
- or adding a thin wrapper around them

The choice is implementation-specific and does not affect the design.

## 15. Migration Strategy

### 15.1 Migration principles

- additive first
- no destructive rename or removal in phase 1
- old entry points continue to work
- new UI prefers run-centric APIs

### 15.2 Phase 1 attachment priority

#### Priority 1
UI-created task → `task_queue` → worker → `agent_data` → `comments`

This path is the first run flow to fully attach because it already resembles a proper operations lifecycle.

#### Priority 2
Bookmarklet → `raw_comments` → linking/import

This path most benefits from run identity because intake and import are currently disconnected.

#### Priority 3
Keyword search → `search_tasks` / `search_results`

This path attaches later in phase 1 after the first two flows establish the run model.

### 15.3 Backfill policy

Existing historical rows do not need full backfill in phase 1. The new model starts being authoritative for newly created runs. Optional future backfill can be added later.

## 16. Testing Strategy

### 16.1 Unit tests

Test pure logic for:

- run state transitions
- failure code to hint mapping
- aggregate count updates
- heartbeat stall detection

### 16.2 Integration tests

Test endpoint flows for:

- run creation
- task creation with linked run
- worker status updates mapping into run events
- agent callback import updating run summary
- bookmarklet-linked import updating the correct run

### 16.3 UI verification

Verify that P0 can:

- list recent runs
- show stage and status correctly
- show last events in order
- display failure code and hint
- expose recovery actions for failed or stalled runs

## 17. Acceptance Criteria

Phase 1 is complete when all of the following are true:

1. Every newly created agent collection task is linked to a `collection_run`.
2. Agent callback import updates run status, stage, heartbeat, counters, and timeline.
3. Bookmarklet intake can attach to a run and remain visible through import completion.
4. P0 shows collection operations by run rather than exposing raw table states as the main view.
5. At least five common failure cases surface stable codes and actionable hints.
6. Existing entry points remain usable during the migration.

## 18. Risks and Mitigations

### Risk: duplicated state creates confusion
Mitigation: user-facing UI reads `collection_runs`; table-specific statuses are only used for implementation detail and drill-down.

### Risk: phase 1 touches too many flows at once
Mitigation: attach flows in strict priority order and keep keyword search third.

### Risk: older scripts cannot emit event-rich updates immediately
Mitigation: accept partial integration first, but require run association and terminal status updates before a flow is considered migrated.

### Risk: bookmarklet runs still feel split between intake and import
Mitigation: require `collection_run_id` at intake time so the split becomes one visible run in the UI.

## 19. Rollout Decision

Phase 1 should be implemented in this order:

1. add schema and operational service layer
2. adapt agent task path
3. adapt agent callback import path
4. add P0 run panel
5. adapt bookmarklet intake and linking path
6. adapt keyword search path
7. add retry/cancel/command regeneration actions

## 20. Final Recommendation

Implement the collection run operational layer as the new user-facing source of truth, while keeping existing domain tables and execution paths intact. This gives OutEye a single observable lifecycle for collection operations without forcing a risky full rewrite.
