// Tiny scheduler for Docker Compose (replaces Vercel Cron). Runs the same three jobs at the
// same times as upstream vercel.json (UTC):
//   06:00 newsletter · 02:30 daily-cleanup · 03:15 semantic-index
// Each run calls the app with CRON_SECRET, exactly like Vercel Cron did.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const JOBS = [
  { name: "newsletter", hour: 6, minute: 0 },
  { name: "daily-cleanup", hour: 2, minute: 30 },
  { name: "semantic-index", hour: 3, minute: 15 },
];
const runner = fileURLToPath(new URL("./run-job.mjs", import.meta.url));
const running = new Set();

function run(name) {
  if (running.has(name)) return;
  running.add(name);
  const child = spawn(process.execPath, [runner, name], { stdio: "inherit" });
  child.on("exit", () => running.delete(name));
}

console.log(`[cron] scheduled (UTC): ${JOBS.map((j) => `${j.name} ${String(j.hour).padStart(2, "0")}:${String(j.minute).padStart(2, "0")}`).join(", ")}`);
let last = "";
setInterval(() => {
  const now = new Date();
  const stamp = `${now.getUTCHours()}:${now.getUTCMinutes()}`;
  if (stamp === last) return;
  last = stamp;
  for (const job of JOBS)
    if (now.getUTCHours() === job.hour && now.getUTCMinutes() === job.minute) run(job.name);
}, 20_000);

if (process.argv[2]) run(process.argv[2]);
