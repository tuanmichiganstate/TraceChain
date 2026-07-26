import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react";
import type { TranslationParameters } from "../../localization/i18n";
import { useTranslator } from "./locale-provider";

export type NotificationTone =
  | "info"
  | "success"
  | "warning"
  | "error";

export interface AppNotification {
  readonly notificationId: string;
  readonly tone: NotificationTone;
  readonly titleKey: string;
  readonly messageKey?: string;
  readonly interpolation?: TranslationParameters;
  readonly sourceCommandId?: string;
  readonly autoDismissMs?: number;
}

interface NotificationContextValue {
  readonly notifications: readonly AppNotification[];
  notify(notification: AppNotification): void;
  dismiss(notificationId: string): void;
}

const MAX_VISIBLE_NOTIFICATIONS = 3;
const DEFAULT_DISMISS_MS = 5_000;
const NotificationContext =
  createContext<NotificationContextValue | null>(null);

export function enqueueNotification(
  current: readonly AppNotification[],
  incoming: AppNotification,
  maximum = MAX_VISIBLE_NOTIFICATIONS,
): readonly AppNotification[] {
  const existingIndex = current.findIndex(
    (candidate) =>
      candidate.notificationId === incoming.notificationId ||
      (incoming.sourceCommandId !== undefined &&
        candidate.sourceCommandId === incoming.sourceCommandId),
  );
  const next =
    existingIndex < 0
      ? [...current, incoming]
      : current.map((candidate, index) =>
          index === existingIndex ? incoming : candidate,
        );
  return next.slice(-maximum);
}

export function NotificationProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactNode {
  const [notifications, setNotifications] = useState<
    readonly AppNotification[]
  >([]);
  const notify = useCallback((notification: AppNotification): void => {
    setNotifications((current) =>
      enqueueNotification(current, notification),
    );
  }, []);
  const dismiss = useCallback((notificationId: string): void => {
    setNotifications((current) =>
      current.filter(
        (notification) =>
          notification.notificationId !== notificationId,
      ),
    );
  }, []);
  const value = useMemo(
    () => ({ notifications, notify, dismiss }),
    [dismiss, notifications, notify],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationViewport
        notifications={notifications}
        dismiss={dismiss}
      />
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const value = useContext(NotificationContext);
  if (value === null) {
    throw new Error(
      "useNotifications must be used inside a NotificationProvider",
    );
  }
  return value;
}

export function useOptionalNotifications(): NotificationContextValue | null {
  return useContext(NotificationContext);
}

function NotificationViewport({
  notifications,
  dismiss,
}: {
  readonly notifications: readonly AppNotification[];
  readonly dismiss: (notificationId: string) => void;
}): ReactNode {
  const t = useTranslator();
  if (notifications.length === 0) return null;

  return (
    <aside
      className="notification-viewport"
      aria-label={t("notification.regionLabel")}
      role="status"
      aria-live="polite"
      aria-relevant="additions text"
    >
      <ol className="notification-list">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.notificationId}
            notification={notification}
            dismiss={dismiss}
          />
        ))}
      </ol>
    </aside>
  );
}

function NotificationItem({
  notification,
  dismiss,
}: {
  readonly notification: AppNotification;
  readonly dismiss: (notificationId: string) => void;
}): ReactNode {
  const t = useTranslator();
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const remainingRef = useRef(
    notification.autoDismissMs ?? DEFAULT_DISMISS_MS,
  );

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  const resumeTimer = useCallback((): void => {
    clearTimer();
    startedAtRef.current = Date.now();
    timerRef.current = window.setTimeout(
      () => dismiss(notification.notificationId),
      remainingRef.current,
    );
  }, [clearTimer, dismiss, notification.notificationId]);
  const pauseTimer = useCallback((): void => {
    if (timerRef.current === null) return;
    remainingRef.current = Math.max(
      0,
      remainingRef.current - (Date.now() - startedAtRef.current),
    );
    clearTimer();
  }, [clearTimer]);

  useEffect(() => {
    remainingRef.current =
      notification.autoDismissMs ?? DEFAULT_DISMISS_MS;
    resumeTimer();
    return clearTimer;
  }, [clearTimer, notification, resumeTimer]);

  const resumeAfterFocus = (
    event: FocusEvent<HTMLLIElement>,
  ): void => {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    resumeTimer();
  };
  const icon = {
    info: "i",
    success: "✓",
    warning: "⚠",
    error: "✕",
  }[notification.tone];

  return (
    <li
      className={`app-notification app-notification--${notification.tone}`}
      onPointerEnter={pauseTimer}
      onPointerLeave={resumeTimer}
      onFocusCapture={pauseTimer}
      onBlurCapture={resumeAfterFocus}
    >
      <span className="app-notification__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="app-notification__content">
        <p className="app-notification__title">
          {t(notification.titleKey, notification.interpolation)}
        </p>
        {notification.messageKey === undefined ? null : (
          <p className="app-notification__message">
            {t(notification.messageKey, notification.interpolation)}
          </p>
        )}
      </div>
      <button
        type="button"
        className="app-notification__dismiss"
        aria-label={t("notification.dismiss")}
        onClick={() => dismiss(notification.notificationId)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </li>
  );
}
