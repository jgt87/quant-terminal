// Browser notifications (Notification API). Permission is only ever requested from a user
// click (the "Enable desktop notifications" button), never automatically.

export type NotifyPermission = "unsupported" | NotificationPermission;

export function notifyPermission(): NotifyPermission {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

/** Call only from a click handler. */
export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (typeof Notification === "undefined") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Show a desktop notification; clicking it focuses this window and runs `onClick`. */
export function showDesktopNotification(title: string, body: string, tag: string, onClick: () => void): void {
  if (notifyPermission() !== "granted") return;
  try {
    const n = new Notification(title, { body, tag });
    n.onclick = () => {
      window.focus();
      onClick();
      n.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}
