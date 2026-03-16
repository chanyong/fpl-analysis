# CODEBASE_ONBOARDING

## Scope

This document reflects the current state of `C:\Dropbox\80_Python\00_AI_Project\fpl-analysis` as of 2026-03-16.

Observed contents:

- `information.txt`

No source code, package manifest, test suite, CI config, deployment config, or Git metadata is present in this folder.

## Project Purpose

Based on `information.txt`, this appears to be an early planning workspace for an FPL (Fantasy Premier League) analysis project, not an implemented application yet.

The intended product direction seems to be:

- Use official FPL public APIs to collect player, manager, gameweek, and fixture data.
- Reconstruct a manager's weekly history from an FPL entry URL or entry ID.
- Compute derived performance metrics such as:
  - bench points loss
  - captain loss
  - transfer net gain
  - chip ROI
  - rolling performance
  - position-level decision quality
  - budget efficiency
  - squad structure efficiency
- Potentially combine current official API data with historical snapshots from `vaastav/Fantasy-Premier-League` for backtesting.

## Current Repository State

This folder is not yet a normal code repository:

- no `.git` directory
- no application source files
- no dependency manifests (`package.json`, `pyproject.toml`, `requirements.txt`, etc.)
- no test files
- no deployment files

Practical implication:

- there is nothing runnable in the current directory
- all execution, testing, and deployment procedures are still undefined

## Documented Data Sources

`information.txt` lists the following external data sources:

- Official FPL API
  - `https://fantasy.premierleague.com/api/bootstrap-static/`
  - `https://fantasy.premierleague.com/api/element-summary/{player_id}/`
  - `https://fantasy.premierleague.com/api/event/{gw_number}/live/`
  - `https://fantasy.premierleague.com/api/entry/{id}/history/`
  - `https://fantasy.premierleague.com/api/entry/{id}/event/{gw_number}/picks/`
  - `https://fantasy.premierleague.com/api/fixtures/?event={gw_number}`
- FPL fixture difficulty page
  - `https://fantasy.premierleague.com/fixtures/fdr`
- Historical snapshot archive for backtesting
  - `https://github.com/vaastav/Fantasy-Premier-League`

## Expected Data Flow

No implementation exists, but the intended flow can be inferred from the note:

1. Input an FPL manager entry ID or entry URL.
2. Fetch manager history from `entry/{id}/history/`.
3. For each gameweek, fetch picks from `entry/{id}/event/{gw}/picks/`.
4. Resolve player IDs and static metadata from `bootstrap-static/`.
5. Fetch player-level detail from `element-summary/{player_id}/` when deeper analysis is needed.
6. Fetch gameweek live data and fixtures as supplementary context.
7. Join current-season API responses with historical snapshot datasets for retrospective analysis or backtesting.
8. Compute derived metrics and present reports.

## Expected Core Modules

These modules do not exist yet, but they are the natural system boundaries implied by the notes:

- API client
  - wraps FPL endpoints
- Manager history collector
  - pulls season and gameweek-specific manager data
- Player metadata mapper
  - resolves `player_id -> player info`
- Historical archive loader
  - ingests `vaastav` snapshot files
- Metrics engine
  - computes decision-quality and ROI metrics
- Reporting/output layer
  - exports tables, charts, or summaries

## Technology Stack

Confirmed:

- plain text planning note only

Not confirmed:

- programming language
- framework
- database
- job runner
- frontend stack
- hosting platform

Inference:

- The project will likely be script-driven first, because the current notes focus on public HTTP endpoints and offline metric derivation.
- Python is plausible given the parent workspace name and neighboring projects, but that is not evidence for this folder specifically.

## Run / Test / Deploy

Current state:

- Run: not available
- Test: not available
- Deploy: not available

Missing prerequisites before these can be documented:

- source tree
- dependency manifest
- entrypoint script or app
- test framework
- deployment target

## Environment Variables and External Dependencies

Confirmed environment variables:

- none

Likely external dependencies once implemented:

- outbound HTTPS access to `fantasy.premierleague.com`
- optional access to GitHub-hosted historical data

Unknowns:

- whether authentication, rate limiting, caching, retries, or proxy handling will be needed
- whether a local database or file cache will be introduced

## Code Rules and Cautions

No project-local coding standards or lint rules are present.

Operational cautions inferred from the problem domain:

- FPL official API schemas can change without notice.
- Historical backtesting requires point-in-time data, not current player state.
- Manager picks and transfer interpretation can be subtle around chips such as wildcard, free hit, bench boost, and triple captain.
- Derived metrics can be wrong if gameweek deadlines, auto-subs, captaincy rules, or hit costs are modeled incorrectly.

## TODO / FIXME / Technical Debt / Risks

Current TODOs implied by the note:

- choose implementation language and repository structure
- build API ingestion layer
- define storage strategy for snapshots and computed metrics
- define report outputs
- formalize metric definitions
- validate historical data strategy

Current technical debt:

- the project exists only as an idea note
- requirements are not formalized into code, tests, or schema definitions

Current risks:

- ambiguity in metric formulas
- dependency on third-party unofficial archival conventions
- lack of clear season scope and output format
- no reproducibility plan
- no test oracle for validating FPL-specific edge cases

## Unclear Points Requiring Follow-up

These should be resolved before implementation starts:

- Is this intended to be a CLI, notebook workflow, backend service, or web app?
- What is the primary output: CSV, dashboard, markdown report, database tables, or API?
- Which season(s) must be supported?
- Is analysis limited to one manager or many managers?
- Should the tool operate only on public manager data?
- How should historical snapshots be stored locally?
- Are chips modeled only historically, or also for simulation?
- What is the expected deployment target, if any?
- What level of test coverage is required for metric correctness?

## Recommended Next Read

Before any implementation work, read:

1. `information.txt`
2. Official FPL API endpoint samples and response schemas
3. The `vaastav/Fantasy-Premier-League` repository structure for historical datasets

## Immediate Recommendation

The next practical step is not coding yet, but converting the planning note into a minimal technical spec covering:

- target users
- supported analyses
- chosen runtime and storage
- exact metric formulas
- sample inputs and expected outputs
