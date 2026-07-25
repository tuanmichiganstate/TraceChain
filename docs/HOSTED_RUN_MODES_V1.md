# Hosted run modes and deterministic outcomes V1

Status: implemented for the hosted single-learner platform.

## Authored mode behavior

Every supported hosted mode has one validated
`HostedRunModeConfigurationV1` in the exact published scenario version:

```text
allowHints
allowRetry
allowBacktracking
feedbackTiming
showScores
outcomeStrategy
seedPolicy
timeLimitMinutes
allowCommunication
allowEvidenceRequests
outcomeModelId
forcedOutcomeCode
```

An assignment stores the fully resolved configuration rather than only the mode
name. A run event stores that assignment configuration and replay rejects a
configuration that differs from the immutable scenario version.

Migration `0004` backfills each pre-Phase-5 assignment with a bounded,
mode-matched forced-outcome configuration. Exact coffee packs and run streams
published before mode configuration was authored remain readable only through
the registered `tracechain-coffee-v2` compatibility adapter. Their original
state hashes are verified against the pre-Phase-5 state shape; no published
pack, event, or hash is rewritten. Generic and newly authored scenarios receive
no fallback and must declare one configuration for every supported mode.

The standard coffee pack defines Tutorial, Standard, Sandbox, and Configured
behavior. Selecting a mode in the instructor interface selects that published
configuration; it does not activate undocumented application defaults.

## Authored run time limits

The run starts at the authoritative `RUN_CREATED` server timestamp. When a mode
defines `timeLimitMinutes`, its deadline is that timestamp plus the authored
number of minutes. A command received before the deadline may proceed; a
command received exactly at or after the deadline cannot change business or
ledger state.

The first late submitted command creates one `RUN_TIME_LIMIT_EXCEEDED` audit
event. It records the attempted command type and derived deadline, increments
only the hosted event-stream version, and is included in assignment rejection
evidence. It creates no simulation event, ledger transaction, or asset-version
change. Further late command IDs are rejected without growing the event stream.
The learner projection retains the current action for review, reports the
server-observed expired status, and disables submission. Modes with no authored
limit remain unlimited.

## Outcome engine

Scenario packs may define:

- Bernoulli models with one probability and true/false outcome codes; and
- weighted categorical models with unique positive-weight outcome codes.

Each model has a named random stream. Probabilistic resolution seeds the
existing deterministic random source with:

```text
scenarioSeed + ":" + randomStreamId
```

The result records the model, distribution, probability parameters, exact draw,
and realized outcome separately. `RANDOM_DRAW_MADE` and `OUTCOME_REALIZED`
events are appended before scenario evidence is released. Replay recomputes the
draw and result and rejects disagreement.

A forced outcome must be one of the model's authored result codes and consumes
no random draw. This keeps standardized cases fixed while retaining the same
outcome model.

## Visibility and scoring

Learners receive the non-secret mode behavior needed by the interface. The
scenario seed, draw, and hidden case outcome remain outside the learner
projection. They are available in the authoritative event history and
instructor evidence.

Probability parameters and realized business outcomes do not alter rubric
ratings or the existing 100-point SCORM score contract.
