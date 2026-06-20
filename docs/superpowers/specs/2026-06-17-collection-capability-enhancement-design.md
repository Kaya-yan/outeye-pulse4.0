# Collection Capability Enhancement Design

Date: 2026-06-17  
Topic: `collection-capability-enhancement`
Scope: Product and architecture design for strengthening OutEye's B站 / 小红书 data collection capability, with priority on research completeness, especially XHS comment coverage and metadata completeness.

## 1. Summary

OutEye already has a strong multi-track collection foundation:

- B站 keyword search, direct collection, batch collection, deep collection scripts, local agent execution, and lightweight browser capture
- 小红书 keyword search via VPS / MCP / cached results, local Playwright scraping, and lightweight browser capture
- A newly unified operational layer built on `collection_runs` and `collection_run_events`

The current problem is not lack of collection mechanisms. The problem is that the platform still behaves like a set of powerful but fragmented collection tools rather than a single coherent research-grade acquisition system.

The biggest asymmetry is clear:

- B站 already has near-productized deep collection capability
- 小红书 still depends too heavily on environmental conditions (cookies, VPS, MCP, local Playwright) and lacks a clear product-level deep collection main path

This design proposes a collection strategy that turns the platform into a more complete research system by organizing collection around three explicit layers:

1. broad recall
2. deep acquisition
3. gap-filling backfill

The recommendation is to use this layered product model while focusing implementation effort on strengthening 小红书 deep acquisition first.

## 2. Goals

1. Improve research completeness, not just convenience.
2. Increase comment coverage depth for selected items, especially on 小红书.
3. Improve metadata completeness for both platforms.
4. Turn existing fragmented collection routes into a coherent collection workflow.
5. Make collection quality measurable through explicit completeness and usability metrics.
6. Preserve current multi-track paths while clarifying their roles.

## 3. Non-goals

This design does not:

- add entirely new content platforms
- replace the existing collection-run operational model
- rewrite every existing scraper immediately
- solve all long-term anti-bot challenges permanently
- prioritize general-purpose scraping breadth over research-grade depth

## 4. Current State Assessment

### 4.1 B站 strengths

B站 already has:

- keyword search via WBI-backed search API
- direct productized collection path from pasted URL to comments import
- batch collection for multiple videos
- deep local collection via Playwright API usage and curl_cffi collector
- subtitle extraction and metadata enrichment
- local agent execution and cloud orchestration

B站's weakness is not capability. Its weakness is that these capabilities are not yet fully exposed as a coherent collection strategy inside the platform.

### 4.2 小红书 strengths

小红书 already has:

- multi-source search fallback (VPS → MCP → cached search results)
- local Playwright-based API interception scraping
- lightweight browser-based bookmarklet intake
- the beginnings of a unified operational model through collection runs

### 4.3 小红书 weaknesses

小红书 lacks a clear productized deep-acquisition mainline comparable to B站's direct collection path.

Current gaps include:

- no clearly dominant deep collection engine inside the product
- too much reliance on environment readiness (cookies, VPS, MCP)
- search results are easier to get than deep comment coverage
- metadata enrichment and completeness evaluation are not strong enough
- too many collection paths are presented as parallel mechanisms rather than primary path + fallback path

### 4.4 Platform-wide structural weakness

The platform has many ways to collect data, but it still does not make it obvious:

- when the user should search
- when the user should deep-collect
- when the user should backfill
- how complete the collected material actually is
- which collected items are strong enough to enter the main research dataset

## 5. Recommended Product Model

The platform should be reorganized around three explicit collection layers.

## 5.1 Layer 1 — Broad Recall

Purpose: maximize candidate discovery.

This layer should:

- query multiple backends per platform
- merge, normalize, and deduplicate results
- avoid immediate deep collection
- output candidates into a candidate pool

The user-facing question this layer answers is:

> What content is worth collecting more deeply?

## 5.2 Layer 2 — Deep Acquisition

Purpose: maximize comment and metadata completeness for selected items.

This is the platform's main value layer.

The user-facing question this layer answers is:

> For the content I care about, how close am I to a research-usable acquisition?

## 5.3 Layer 3 — Gap-Filling Backfill

Purpose: repair the missing parts of otherwise useful acquisitions.

This includes:

- bookmarklet / console collection
- CSV import
- partial reruns
- metadata-only reruns
- child-comment-only补采

The user-facing question this layer answers is:

> What is missing, and what is the fastest safe way to fill it?

## 6. Search Enhancement Design

## 6.1 Introduce a search orchestrator

Search should stop being treated as a single endpoint response and become an orchestrated candidate discovery process.

### B站 search sources

- WBI search results
- alternate orderings (e.g. relevance / newest / popularity)
- optional later expansion to related videos, author videos, or tag-adjacent videos

### 小红书 search sources

- VPS search
- MCP search
- cached `search_results`
- optional later expansion to author pages, topics, or similar-note expansion

The orchestrator should combine these sources into a unified candidate set instead of trusting any one source as the full truth.

## 6.2 Candidate pool

All search results should enter a candidate pool before deep collection.

Each candidate should at minimum carry:

- platform
- title and summary text
- URL and platform ID
- author
- interaction metrics
- publish time
- tags or topics when available
- recall source(s)
- recall reason(s)
- estimated collection value

## 6.3 Candidate scoring

Introduce a collection-priority score that reflects research utility, not just platform popularity.

Suggested scoring inputs:

- keyword relevance
- comment depth potential
- interaction intensity
- freshness
- topical representativeness
- novelty relative to existing collected items

This turns search from a result list into a decision-support tool for deep acquisition.

## 6.4 Multi-pass search strategy

To improve recall completeness, search should support multiple passes:

- primary keyword
- synonym / alias groups
- person + event combinations
- time-sliced search windows

This matters especially on 小红书, where search result stability is weaker and keyword behavior can fluctuate.

## 7. Acquisition Enhancement Design

## 7.1 Standardize B站 as the reference model

B站 already has a strong deep collection foundation. The next step is not major rewriting but formalizing its capability model.

Every B站 deep acquisition should produce a completeness report including:

- estimated total comments
- main comment count acquired
- child comment count acquired
- duplicates removed
- items filtered
- rate-limit interruptions
- subtitle availability
- whether the run reached a research-usable threshold

This makes B站 the standard that 小红书 should move toward.

## 7.2 Establish a clear 小红书 deep-acquisition main engine

小红书 should adopt a main engine + fallback model.

The main engine for the next implementation cycle is explicitly:

- Playwright-driven note loading
- comment API interception
- pagination control for main comments
- child-comment expansion where exposed by the intercepted API
- metadata refresh in the same run

### Main engine

Playwright + comment API interception + pagination control

Its goals:

- collect main comments as fully as possible
- recurse into child comments where feasible
- enrich note metadata at the same time
- support checkpoint recovery
- support incremental re-collection
- surface session health and cookie problems explicitly

### Fallback layers

If the main engine fails, the platform should step down in a clear order:

1. MCP detail path
2. VPS collector path
3. bookmarklet / console backfill
4. CSV import backfill

This gives 小红书 a coherent strategy rather than many loosely related tools.

## 7.3 Metadata enrichment

Deep acquisition must enrich more than comments.

For both platforms, every deep acquisition should attempt to capture:

- title
- main text / description
- publish time
- author name and platform identifier when available
- likes / comments / favorites / views
- cover image
- tags / topics
- source URL / platform ID
- collection method
- collection time
- completeness indicators

B站 can additionally enrich:

- subtitle text
- video description
- partition / tags

小红书 can additionally enrich:

- note detail content
- xsec_token-linked detail context
- topics / tags if derivable
- author page basics when available

## 7.4 Acquisition quality classification

Each collected item should be classified by acquisition quality, not just success/failure.

Suggested grades:

- `full` — comment and metadata completeness are both high
- `high` — main body is strong, with only minor missing areas
- `medium` — useful but with clear coverage gaps
- `low` — usable only as a lead, not as a core research sample

This matters especially for 小红书, where successful capture and sufficiently complete capture are not the same thing.

## 8. Completeness and Research-Usability Model

## 8.1 Recall completeness

At the candidate discovery layer, track:

- how many sources were queried
- whether time ranges were covered adequately
- whether different content types / authors were represented
- whether recall is overly biased toward a single backend or ranking mode

## 8.2 Acquisition completeness

At the item level, track:

- main-comment coverage
- child-comment coverage
- number of pages traversed
- duplicates removed
- items filtered
- rate-limit interruptions
- restarts / resume count
- metadata completion rate

## 8.3 Research usability

At the dataset-admission layer, decide whether an item belongs in the main study set.

Inputs should include:

- whether it reaches a minimum comment threshold
- whether metadata is sufficient to interpret the comment context
- whether the run has severe missing-page or missing-comment gaps
- whether the source and collection method remain reproducible and traceable

## 8.4 Explicit quality surfaces

Introduce visible platform-level metrics such as:

- `coverage_score`
- `metadata_score`
- `stability_score`
- `research_grade` (A/B/C/D)

These scores should not be cosmetic. They should support decisions like:

- collect more now
- backfill missing parts
- accept into main dataset
- keep only as an auxiliary sample

## 9. Recommended Implementation Strategy

## Phase 1 — Make 小红书 deep acquisition a first-class product path

Primary objective:

- strengthen comment depth on 小红书
- make the main collection engine explicit
- add completeness reporting for each deep acquisition

This is the single most important near-term step because it addresses the platform's biggest asymmetry.

## Phase 2 — Turn search into a candidate pool

Primary objective:

- unify search output across B站 and 小红书
- score candidates
- make search a precursor to deep acquisition rather than an end state

## Phase 3 — Connect recall → acquisition → backfill into one product workflow

Primary objective:

- let a user move from broad discovery to deep collection to gap-filling in one visible flow
- stop exposing collection mechanisms as a disconnected tool list

## Phase 4 — Add a research-quality middle layer

Primary objective:

- make completeness, stability, and traceability first-class platform concepts
- turn raw collection output into research-usable material assessment

## Phase 5 — Add continuous observation

Primary objective:

- introduce watchlists, repeated collection, and incremental refresh for high-value targets
- support temporal research questions after the base acquisition system is already strong enough

## 10. Structural Improvements Recommended Alongside Capability Work

These are not separate projects; they should be folded into future collection work where relevant.

### 10.1 Reduce role confusion between paths

Current collection paths should be explicitly categorized in the UI and docs as one of:

- broad recall
- deep acquisition
- gap-filling backfill
- continuous observation

### 10.2 Strengthen route/service boundaries

The project now has a much better unified run model, but collection logic still spans page code, API routes, and script-specific assumptions.

Future work should continue to move platform-agnostic lifecycle logic into reusable service helpers, keeping UI and route layers thinner.

### 10.3 Converge bookmarklet variants

The project currently has both a static bookmarklet reference and a richer console-based script generation path. The richer, run-aware version should become the primary maintained path to avoid behavioral drift.

## 11. Risks and Trade-offs

### 11.1 XHS anti-bot volatility

A stronger 小红书 deep-acquisition path will always carry maintenance cost. This is acceptable, but the design must keep fallbacks and quality visibility explicit.

### 11.2 Over-optimization of search recall

Searching more broadly can create a large low-value candidate pool. Candidate scoring must stay tightly tied to research utility.

### 11.3 Tool richness vs product clarity

The platform should not hide powerful tools, but it must stop presenting them as an unstructured list. Capability richness must be reorganized rather than simply expanded.

## 12. Final Recommendation

Use a three-layer collection model as the platform-wide product strategy:

- broad recall
- deep acquisition
- gap-filling backfill

Within that strategy, prioritize a strong 小红书 deep-acquisition main engine as the immediate technical focus. This approach best matches the user's goal of improving research completeness without expanding platform scope.
