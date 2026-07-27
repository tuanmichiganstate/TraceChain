# Hosted runtime profiles and deterministic outcomes

Status: implemented for the hosted single-learner platform.

## Runtime profile versus product configuration

`tutorial`, `standard`, `sandbox`, and `configured` remain immutable authored
runtime profiles. They control engine-level behavior; they are not the
learner-facing product taxonomy.

At assignment creation, the authoritative resolver combines the selected
profile with the exact pack and scenario to produce Configuration Schema V2:

```text
activity type
support profile
delivery purpose
outcome strategy
guidance, feedback, hints, retries, and decision policy
scoring, reporting, delivery, and content identity
```

The assignment stores that complete configuration and its canonical SHA-256.
Run creation repeats both in the first server event, and replay rejects a value
that differs from the exact published scenario profile.

## Authored profile behavior

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

An assignment also stores the fully resolved low-level profile rather than only
its name. Configuration Schema V2 and the profile serve different purposes and
are both exact replay inputs.

Every scenario declares one configuration for every supported mode. The
repository accepts only the current contract; development assignments and run
data are reset when that contract changes.

The standard coffee pack defines Tutorial, Standard, Sandbox, and Configured
behavior. Selecting a mode in the instructor interface selects that published
configuration; it does not activate undocumented application defaults.
The assignment form displays the resolved behavioral settings, including the
authored time limit, before creation and confirms the stored configuration
after creation. The display is read-only; it does not create a parallel source
of mode configuration.

## Assignment counterfactual controls

Assignments also store one resolved `counterfactualReplay` object. It enables
or disables replay, names the exact authored decision nodes, caps branches per
creator and decision from 1 through 20, selects learner availability, and
records whether reflection is required. There is no defaulting reader.

Learner access is valid only in Sandbox mode. Standard, Tutorial, and
Configured assignments may still allow the managing instructor to create
branches. The runtime intersects assignment choices with the immutable
scenario definition, using the lower branch cap and the stricter release
boundary.

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

Each model has a named random stream. Probabilistic resolution derives a
stable draw key from:

```text
scenario version
source seed
outcome model ID
random stream ID
semantic occurrence key
relevant entity ID
```

The result records the draw key, model, distribution, probability parameters,
exact draw, and realized outcome separately. `RANDOM_DRAW_MADE` and
`OUTCOME_REALIZED` events are appended before scenario evidence is released.
Replay recomputes the draw key, draw, and result and rejects disagreement.
Counterfactual branches therefore share a draw for the same semantic event
without suffering sequential draw drift.

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
