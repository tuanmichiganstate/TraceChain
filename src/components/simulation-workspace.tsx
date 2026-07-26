import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

/**
 * Presentation boundary for the operational application used by the current
 * role. It deliberately owns no simulation state: stages continue to render
 * their existing commands, evidence, and projections inside it.
 */
export function RoleApplicationShell({
  eyebrow,
  title,
  description,
  statusLabel,
  status,
  children,
}: {
  readonly eyebrow: ReactNode;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly statusLabel: ReactNode;
  readonly status: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  const headingId = useId();

  return (
    <section className="role-application" aria-labelledby={headingId}>
      <header className="role-application__header">
        <div className="role-application__identity">
          <p className="eyebrow">{eyebrow}</p>
          <h3 id={headingId}>{title}</h3>
          <p>{description}</p>
        </div>
        <dl className="role-application__status">
          <div>
            <dt>{statusLabel}</dt>
            <dd>{status}</dd>
          </div>
        </dl>
      </header>
      <div className="role-application__body stack">{children}</div>
    </section>
  );
}

/**
 * A visually and semantically separate surface for technical evidence.
 * Transaction and ledger components remain responsible for the actual
 * computation and state they display.
 */
export function InspectorSurface({
  eyebrow,
  title,
  description,
  children,
}: {
  readonly eyebrow: ReactNode;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  const headingId = useId();

  return (
    <section className="inspector-surface" aria-labelledby={headingId}>
      <header className="inspector-surface__header">
        <p className="eyebrow">{eyebrow}</p>
        <h3 id={headingId}>{title}</h3>
        <p>{description}</p>
      </header>
      <div className="inspector-surface__body stack">{children}</div>
    </section>
  );
}

export interface CaseWorkspaceTab {
  readonly id: string;
  readonly label: string;
  readonly status: string;
  readonly content: ReactNode;
}

/**
 * Presentation-only navigation for a bounded professional case.
 *
 * Every panel remains mounted so an unfinished form draft survives tab
 * changes. The `hidden` attribute keeps inactive work out of the accessibility
 * tree. Simulation state still determines which actions are valid and which
 * phase a stage recommends.
 */
export function CaseWorkspaceTabs({
  label,
  initialTabId,
  tabs,
}: {
  readonly label: string;
  readonly initialTabId: string;
  readonly tabs: readonly CaseWorkspaceTab[];
}): ReactNode {
  const baseId = useId();
  const [activeId, setActiveId] = useState(initialTabId);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === activeId),
  );
  const selectedId = tabs[activeIndex]?.id ?? initialTabId;

  const focusTab = (index: number): void => {
    const target = tabs[index];
    if (target === undefined) return;
    setActiveId(target.id);
    tabRefs.current.get(target.id)?.focus();
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    const lastIndex = tabs.length - 1;
    const nextIndex =
      event.key === "ArrowRight"
        ? index === lastIndex
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? lastIndex
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? lastIndex
              : null;

    if (nextIndex === null) return;
    event.preventDefault();
    focusTab(nextIndex);
  };

  return (
    <div className="case-workspace">
      <div
        className="case-workspace__tabs"
        role="tablist"
        aria-label={label}
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-label={`${tab.label}, ${tab.status}`}
            aria-selected={selectedId === tab.id}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={selectedId === tab.id ? 0 : -1}
            className={`case-workspace__tab${
              selectedId === tab.id ? " case-workspace__tab--active" : ""
            }`}
            ref={(element) => {
              if (element !== null) tabRefs.current.set(tab.id, element);
            }}
            onClick={() => setActiveId(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span id={`${baseId}-label-${tab.id}`}>{tab.label}</span>
            <small>{tab.status}</small>
          </button>
        ))}
      </div>

      {tabs.map((tab) => (
        <section
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-label-${tab.id}`}
          tabIndex={0}
          hidden={selectedId !== tab.id}
          className="case-workspace__panel stack"
        >
          {tab.content}
        </section>
      ))}
    </div>
  );
}
