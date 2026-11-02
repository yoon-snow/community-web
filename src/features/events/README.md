# Events and attendance

Mobile calendar, event details, RSVP and admin attendance screens are in `src/components/club/`. API: `src/app/api/club/[...path]/route.ts`. The database stores RSVP independently from actual attendance; only admins can verify attendance after event end. Guest counts include only admin-verified payments. Every time is rendered in Asia/Seoul.
