export function notificationsSupported(): boolean {
  return typeof Notification !== "undefined";
}

export function notificationsGranted(): boolean {
  return notificationsSupported() && Notification.permission === "granted";
}

export async function allowNotifications(): Promise<boolean> {
  if (!notificationsSupported() || Notification.permission === "denied") return false;
  if (Notification.permission === "granted") return true;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function sendNotice(title: string, body: string): void {
  if (!notificationsGranted()) return;
  try {
    const notice = new Notification(title, {
      body,
      tag: "focus-timer",
      silent: document.visibilityState === "visible",
      icon: new URL("icon-192.png", document.baseURI).href,
    });
    notice.onclick = () => {
      window.focus();
      notice.close();
    };
  } catch {
    // Safari throws when the system has notifications turned off.
  }
}
