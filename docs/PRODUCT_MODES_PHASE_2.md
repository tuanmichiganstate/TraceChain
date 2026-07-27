# Product Modes Phase 2: Shared Workspace Benchmarks

Status: implemented as development-only coded prototypes; broad screen
conversion is deliberately blocked on benchmark review.

## Boundary

Phase 2 implements the shared visual architecture required by the configurable
product-mode roadmap without changing simulation commands, event processing,
scoring, persistence, hosted APIs, SCORM behavior, or any live learner route.

The review surface is available only from the Vite development server:

```text
http://localhost:5173/workspace-prototypes
http://localhost:5173/workspace-prototypes?locale=en
```

The route is guarded by `import.meta.env.DEV`. It is not linked from the
learner, instructor, author, administrator, hosted portal, or SCORM
applications. Its controls are explicitly labelled as non-authoritative
prototype interactions.

## Reused foundations

The repository already had several Phase 2 foundations:

- `StageShell` provides the current learning mission, progress, required
  actions, hints, and active-role context.
- `RoleApplicationShell` provides a bounded operational application for the
  current simulated role.
- `InspectorSurface` separates technical evidence from operational work.
- `CaseWorkspaceTabs` provides keyboard-operable, draft-preserving case
  navigation.
- `KnowledgeCheckPanel` already distinguishes academic checks from
  professional decisions.
- `NotificationProvider` provides bounded immediate acknowledgements while
  existing transaction results remain in the document.

Phase 2 reuses those boundaries rather than introducing a parallel application
or redesigning all existing stages before review.

## New shared primitives

`src/components/product-mode-workspaces.tsx` adds presentation-only components:

- `LearningShell`
- `AuditWorkbenchShell`
- `BlockchainInspector`
- `ProfessionalDecisionConsole`
- `AuditFindingBuilder`
- `LearningCheckpoint`
- `PersistentResult`

These components do not import the simulation provider, persistence adapters,
SCORM, hosted APIs, or scoring. Commands and authoritative state remain with
the existing orchestration layers.

The audit workbench is evidence-first and exposes no operational transaction
controls. The professional decision console is visually and semantically
distinct from the academic checkpoint. Toasts acknowledge an action once;
`PersistentResult` remains in the document with the resulting ledger and
business effects.

## Eight benchmark screens

The development route contains the required benchmarks:

1. Practice certificate verification
2. Practice discrepancy management
3. Audit ledger investigation
4. Audit finding builder
5. Audit conclusion
6. Blockchain inspector
7. Mobile logistics handoff
8. Mobile audit finding

Only one benchmark is shown at a time. Desktop navigation uses a compact grid;
mobile navigation uses a horizontally scrollable strip. Audit and logistics
mobile frames override viewport-level desktop layout rules so their content is
reviewed at the intended compact width even on a desktop screen.

## Accessibility and localization

- All visible copy is in the English and Vietnamese localization catalogues.
- Regions are named by visible headings.
- Audit and case navigation uses the existing ARIA tab implementation.
- Draft fields remain mounted across tab changes.
- Verdicts use text and glyphs, never color alone.
- Technical identifiers wrap at narrow widths.
- The mobile layouts avoid the broad desktop column structure.
- Notification announcements are transient; persistent results are not
  repeatedly announced as live regions.

Automated component tests cover the workspace landmarks, separation of
professional and academic layers, finding evidence requirements, persistent
results, benchmark switching, notification integration, and draft retention.
Real screen-reader review remains an external human gate as documented in
`AGENTS.md`.

## Review gate

This phase does not authorize broad conversion of current learner screens.
Before a later rollout:

1. Review all eight benchmarks with learners and instructors.
2. Run the existing recognition-study protocol.
3. Record confusion about role, task, system layer, evidence, and action.
4. Confirm keyboard, text-zoom, screen-reader, Vietnamese-content, and mobile
   behavior with human reviewers.
5. Amend the shared primitives, then convert live screens incrementally.

Operations Practice content, Audit Activity content, and Technical Laboratory
mode expansion remain later roadmap phases. Phase 2 adds no new score, scenario
branch, transaction type, migration layer, or product mode.
