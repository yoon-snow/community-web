/** Mirrors the database guard; used again at API and Push delivery boundaries. */
export type NotificationRole = "guest" | "member" | "admin";
export type NotificationTarget = { kind: string; href: string };
export function notificationRequiresAdmin({
  kind,
  href,
}: NotificationTarget): boolean {
  return (
    kind.startsWith("admin_") ||
    [
      "guest_application",
      "new_guest_application",
      "guest_application_created",
      "guest_payment",
      "guest_payment_confirmed",
      "participant_list",
      "participant_roster",
      "daily_roster",
      "roster_ready",
    ].includes(kind) ||
    /^\/admin(?:[/?#]|$)/.test(href)
  );
}
export function canReceiveNotification(
  role: NotificationRole,
  notification: NotificationTarget,
): boolean {
  return (
    role === "admin" ||
    (role === "member" && !notificationRequiresAdmin(notification))
  );
}
