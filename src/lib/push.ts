import "server-only";
import webpush from "web-push";
import { serviceClient } from "./supabase/server";
import { canReceiveNotification } from "./notification-policy";
export async function deliverPush() {
  if (
    !process.env.VAPID_PUBLIC_KEY ||
    !process.env.VAPID_PRIVATE_KEY ||
    !process.env.VAPID_SUBJECT
  )
    return { configured: false, sent: 0, failed: 0 };
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  const db = serviceClient();
  const { data: jobs, error } = await db.rpc("claim_push_jobs");
  if (error) throw error;
  let sent = 0,
    failed = 0;
  for (const job of jobs || []) {
    const { data: n, error: notificationError } = await db
      .from("notifications")
      .select("*")
      .eq("id", job.notification_id)
      .single();
    if (notificationError) throw notificationError;
    if (!n) continue;
    // Recheck current active role at delivery time, including subscriptions retained after withdrawal.
    const { data: member, error: memberError } = await db
      .from("members")
      .select("id,status")
      .eq("user_id", n.user_id)
      .eq("status", "active")
      .maybeSingle();
    if (memberError) throw memberError;
    const { data: admin, error: adminError } = member
      ? await db
          .from("admins")
          .select("member_id")
          .eq("member_id", member.id)
          .maybeSingle()
      : { data: null, error: null };
    if (adminError) throw adminError;
    if (
      !canReceiveNotification(
        member ? (admin ? "admin" : "member") : "guest",
        n,
      )
    ) {
      await db
        .from("push_outbox")
        .update({
          delivered_at: new Date().toISOString(),
          last_error: "recipient no longer eligible",
        })
        .eq("id", job.id);
      continue;
    }
    const { data: subscriptions, error: subscriptionError } = await db
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", n.user_id);
    if (subscriptionError) throw subscriptionError;
    let retry = false;
    for (const s of subscriptions || []) {
      // Restrict endpoints to real push services to avoid service-role SSRF.
      if (!isPushEndpoint(s.endpoint)) {
        await db.from("push_subscriptions").delete().eq("id", s.id);
        continue;
      }
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({
            id: n.id,
            title: n.title,
            body: n.body,
            href: n.href,
          }),
          { TTL: 3600, timeout: 5000 },
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410)
          await db.from("push_subscriptions").delete().eq("id", s.id);
        else retry = true;
        failed++;
      }
    }
    await db
      .from("push_outbox")
      .update({
        delivered_at: retry ? null : new Date().toISOString(),
        claimed_until: retry
          ? new Date(
              Date.now() + Math.min(job.attempts * 60000, 300000),
            ).toISOString()
          : null,
        last_error: retry ? "delivery failed" : null,
      })
      .eq("id", job.id);
  }
  return { configured: true, sent, failed };
}
export function isPushEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === "https:" &&
      u.port === "" &&
      (/(^|\.)push\.apple\.com$/.test(u.hostname) ||
        [
          "fcm.googleapis.com",
          "updates.push.services.mozilla.com",
          "wns2-db5p.notify.windows.com",
        ].includes(u.hostname) ||
        /^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname))
    );
  } catch {
    return false;
  }
}
