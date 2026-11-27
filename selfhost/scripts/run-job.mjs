// Runs one scheduled job against the server in this container (Coolify Scheduled Tasks,
// system cron, or any scheduler without Vercel Cron):
//
//   node selfhost/scripts/run-job.mjs newsletter | daily-cleanup | semantic-index
//
// CRON_SECRET is read from the environment and sent as `Authorization: Bearer …`, the same
// header Vercel Cron sends, so it never appears on a command line or in task logs.
const JOBS = new Set(["newsletter", "daily-cleanup", "semantic-index"]);
const job = process.argv[2];
if (!JOBS.has(job)) {
  console.error(`usage: node selfhost/scripts/run-job.mjs <${[...JOBS].join("|")}>`);
  process.exit(2);
}
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET is not set");
  process.exit(2);
}
const base = (
  process.env.JOB_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`
).replace(/\/+$/, "");
const response = await fetch(`${base}/api/public/jobs/${job}`, {
  headers: { Authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(10 * 60 * 1000),
});
const body = await response.text();
console.log(`${job}: HTTP ${response.status} ${body.slice(0, 500)}`);
process.exit(response.ok ? 0 : 1);
