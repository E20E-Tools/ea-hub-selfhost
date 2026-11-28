// k6 load test for an EA-Hub site: public pages, the admin sign-in page, health and static
// assets, ramping to 25 virtual users. Run:
//   docker run --rm -i --network host -e BASE_URL=http://localhost:8080 grafana/k6 run - < selfhost/loadtest/k6.js
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:8080";

export const options = {
  stages: [
    { duration: "20s", target: 10 },
    { duration: "40s", target: 25 },
    { duration: "40s", target: 25 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{page:home}": ["p(95)<2500"],
    "http_req_duration{page:admin}": ["p(95)<2500"],
    "http_req_duration{page:health}": ["p(95)<500"],
  },
};

export default function () {
  const home = http.get(`${BASE}/`, { tags: { page: "home" } });
  check(home, { "home 200": (r) => r.status === 200 });
  const admin = http.get(`${BASE}/admin`, { tags: { page: "admin" } });
  check(admin, { "admin 200": (r) => r.status === 200 });
  const health = http.get(`${BASE}/healthz`, { tags: { page: "health" } });
  check(health, { "health ok": (r) => r.status === 200 && r.body.includes('"ok":true') });
  sleep(1);
}
