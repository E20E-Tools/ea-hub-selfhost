import postgres from "postgres";
import { createHash } from "node:crypto";

let connection: ReturnType<typeof postgres> | undefined;
function database() {
  const url = process.env["POSTGRES_URL"];
  if (!url) throw Error("Newsletter database unavailable");
  return (connection ??= postgres(url, {
    prepare: false,
    max: 2,
    idle_timeout: 10,
    connect_timeout: 10,
  }));
}
const origin = () =>
  process.env["NEWSLETTER_ORIGIN"] || "https://www.e20e.tools";
const configured = () =>
  Boolean(process.env["RESEND_API_KEY"] && process.env["NEWSLETTER_FROM"]);
type Member = { id: string; email: string; language: string; token: string };
function manageLink(m: Member, action: string) {
  return (
    origin() +
    "/newsletter#" +
    new URLSearchParams({ token: m.token, action, lang: m.language })
  );
}
async function mail(to: string, subject: string, text: string, key: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env["RESEND_API_KEY"],
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify({
      from: process.env["NEWSLETTER_FROM"],
      to: [to],
      subject,
      text,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw Error("Newsletter provider status " + res.status);
}
async function confirmation(id: string) {
  if (!configured()) return false;
  return database().begin(async (tx) => {
    const [m] = await tx<
      Member[]
    >`select * from newsletter_members where id=${id} and state='pending' and confirmation_sent is null for update`;
    if (!m) return false;
    const ar = m.language === "ar";
    await mail(
      m.email,
      ar ? "تأكيد اشتراكك في EA-Hub" : "Confirm your EA-Hub subscription",
      (ar
        ? "لتصلك مستجدات EA-Hub شهريًا، أكّد اشتراكك خلال سبعة أيام."
        : "Confirm within seven days to receive monthly EA-Hub updates.") +
        "\n\n" +
        manageLink(m, "confirm"),
      "confirm-" + m.token,
    );
    await tx`update newsletter_members set confirmation_sent=now() where id=${id}`;
    return true;
  });
}
type Preferences = { general: boolean; products: string[] };
async function scheduleLaunches(id: string) {
  const sql = database();
  await sql`insert into newsletter_launch_alerts(member_id,product_id) select m.id,p.id from newsletter_members m join products p on p.id=any(m.products) where m.id=${id} and p.coming_soon and (p.publication_date is null or ((p.publication_date::date + case when p.id='archone' then time '09:00' else time '00:00' end) at time zone 'Asia/Riyadh')>now()) on conflict do nothing`;
}
export async function subscribe(
  email: string,
  lang: string,
  prefs: Preferences = { general: true, products: [] },
) {
  const sql = database();
  const rows = await sql<
    { id: string }[]
  >`insert into newsletter_members(email,language,general,products) values(${email},${lang},${prefs.general},array(select id from products where id in(select jsonb_array_elements_text(${JSON.stringify(prefs.products)}::jsonb))))
 on conflict(email) do update set state='pending',token=gen_random_uuid(),confirmed_at=null,requested_at=now(),confirmation_sent=null,language=excluded.language,general=excluded.general,products=excluded.products
 where newsletter_members.state='unsubscribed' or (newsletter_members.state='pending' and newsletter_members.requested_at < now()-interval '1 day') returning id`;
  if (rows[0]) {
    await scheduleLaunches(rows[0].id);
    await confirmation(rows[0].id).catch(() => false);
  } else if (configured()) {
    const [member] = await sql<
      Member[]
    >`update newsletter_members set preferences_sent=now() where email=${email} and state='active' and (preferences_sent is null or preferences_sent<now()-interval '1 day') returning *`;
    if (member)
      await mail(
        member.email,
        member.language === "ar"
          ? "تفضيلات اشتراك EA-Hub"
          : "EA-Hub preferences",
        manageLink(member, "preferences"),
        "prefs-" + member.id + "-" + new Date().toISOString().slice(0, 10),
      );
  }
  return { queued: !configured() };
}
export async function preferences(token: string, change?: Preferences) {
  const sql = database();
  if (change) {
    const [member] = await sql<
      { id: string }[]
    >`update newsletter_members set general=${change.general},products=array(select id from products where id in(select jsonb_array_elements_text(${JSON.stringify(change.products)}::jsonb))) where token=${token} and state='active' returning id`;
    if (!member) throw Error("Invalid link");
    await scheduleLaunches(member.id);
  }
  const [prefs] = await sql<
    Preferences[]
  >`select general,products from newsletter_members where token=${token} and state='active'`;
  if (!prefs) throw Error("Invalid link");
  return prefs;
}
export async function manage(token: string, action: string) {
  const sql = database();
  const updated =
    action === "confirm"
      ? await sql`update newsletter_members set state='active',confirmed_at=coalesce(confirmed_at,now()) where token=${token} and (state='active' or (state='pending' and confirmation_sent>now()-interval '7 days')) returning id`
      : await sql`update newsletter_members set state='unsubscribed' where token=${token} returning id`;
  return updated.length > 0;
}
export async function newsletterStatus() {
  const sql = database();
  const [counts] =
    await sql`select count(*) filter(where state='pending')::int as pending,count(*) filter(where state='active')::int as active from newsletter_members`;
  return {
    ready: configured(),
    pending: Number(counts?.["pending"] ?? 0),
    active: Number(counts?.["active"] ?? 0),
  };
}
export async function addUpdate(ar: string, en: string, path: string) {
  await database()`insert into newsletter_updates(title_ar,title_en,path) values(${ar},${en},${path})`;
}
type Entry = { ar: string; en: string; path: string; product: string | null };
async function issueEntries(
  from: string,
  to: string,
  query: ReturnType<typeof postgres> | postgres.TransactionSql = database(),
) {
  return await query<
    { ar: string; en: string; path: string; product: string | null }[]
  >`select title_ar ar,title_en en,path,case when path like '/product/%' then split_part(path,'/',3) end product from newsletter_updates where created_at >= ${from}::date::timestamp at time zone 'Asia/Riyadh' and created_at < ${to}::date::timestamp at time zone 'Asia/Riyadh'
 union all select name||' · '||coalesce(nullif(whats_new,''),description),name||' · '||coalesce(nullif(whats_new_en,''),nullif(description_en,''),name),'/product/'||id,id from products where updated_at >= ${from}::date::timestamp at time zone 'Asia/Riyadh' and updated_at < ${to}::date::timestamp at time zone 'Asia/Riyadh'`;
}
function issueText(entries: Entry[], lang: "ar" | "en") {
  return entries.map((r) => r[lang] + "\n" + origin() + r.path).join("\n\n");
}
function editorialBody(
  entries: Entry[],
  lang: "ar" | "en",
  approved?: string | null,
) {
  if (!approved) return issueText(entries, lang);
  const links = new Set(approved.match(/https?:\/\/[^\s]+/g) ?? []);
  const added = entries.filter((entry) => !links.has(origin() + entry.path));
  return [approved, issueText(added, lang)].filter(Boolean).join("\n\n");
}
function footer(member: Member) {
  const ar = member.language === "ar";
  return (
    "\n\n" +
    (ar ? "تفضيلات الاشتراك" : "Preferences") +
    ": " +
    manageLink(member, "preferences") +
    "\n" +
    (ar ? "إلغاء الاشتراك" : "Unsubscribe") +
    ": " +
    manageLink(member, "unsubscribe")
  );
}
export async function previewIssue(month: string) {
  const from = month + "-01",
    next = new Date(from + "T00:00:00Z");
  next.setUTCMonth(next.getUTCMonth() + 1);
  const [saved] = await database()<
    { body_ar: string; body_en: string }[]
  >`select body_ar,body_en from newsletter_issues where month=${from}`;
  const rows = saved
    ? []
    : await issueEntries(from, next.toISOString().slice(0, 10));
  const [editorial] = await database()<
    { body_ar: string | null; body_en: string | null }[]
  >`select body_ar,body_en from newsletter_editorial where month=${from}`;
  return {
    source: { ar: issueText(rows, "ar"), en: issueText(rows, "en") },
    locked: Boolean(saved),
    ar: saved?.body_ar ?? editorialBody(rows, "ar", editorial?.body_ar),
    en: saved?.body_en ?? editorialBody(rows, "en", editorial?.body_en),
    ready: configured(),
  };
}
export async function sendPreview(
  month: string,
  lang: "ar" | "en",
  email: string,
) {
  const preview = await previewIssue(month);
  if (!preview.ready || !preview[lang]) throw Error("Preview unavailable");
  await mail(
    email,
    (lang === "ar" ? "معاينة · مستجدات EA-Hub" : "Preview · EA-Hub updates") +
      " · " +
      month,
    preview[lang] +
      "\n\n" +
      (lang === "ar"
        ? "تفضيلات الاشتراك / إلغاء الاشتراك (معاينة)"
        : "Preferences / Unsubscribe (preview)"),
    "preview-" + crypto.randomUUID(),
  );
  return true;
}
async function launchAlerts(deadline: number) {
  const sql = database();
  const jobs = await sql<
    { member_id: string; product_id: string }[]
  >`select a.member_id,a.product_id from newsletter_launch_alerts a join newsletter_members m on m.id=a.member_id join products p on p.id=a.product_id where a.sent_at is null and m.state='active' and p.id=any(m.products) and (not p.coming_soon or ((p.publication_date::date+case when p.id='archone' then time '09:00' else time '00:00' end) at time zone 'Asia/Riyadh')<=now()) limit 100`;
  for (const job of jobs) {
    if (Date.now() > deadline) break;
    await sql
      .begin(async (tx) => {
        const [m] = await tx<
          (Member & { name: string })[]
        >`select m.*,p.name from newsletter_launch_alerts a join newsletter_members m on m.id=a.member_id join products p on p.id=a.product_id where a.member_id=${job.member_id} and a.product_id=${job.product_id} and a.sent_at is null and m.state='active' and p.id=any(m.products) for update of a,m skip locked`;
        if (!m) return;
        const title =
          m.name + (m.language === "ar" ? " متاح الآن" : " is now available");
        await mail(
          m.email,
          title,
          title +
            "\n" +
            origin() +
            "/product/" +
            encodeURIComponent(job.product_id) +
            footer(m),
          "launch-" + m.id + "-" + job.product_id,
        );
        await tx`update newsletter_launch_alerts set sent_at=now() where member_id=${m.id} and product_id=${job.product_id}`;
      })
      .catch(() => false);
  }
}
export async function sendDue() {
  if (!configured()) return { configured: false, confirmed: 0, delivered: 0 };
  const sql = database();
  const deadline = Date.now() + 42000;
  await launchAlerts(deadline);
  let confirmed = 0,
    delivered = 0;
  for (const m of await sql<
    { id: string }[]
  >`select id from newsletter_members where state='pending' and confirmation_sent is null order by requested_at limit 50`) {
    if (Date.now() > deadline) break;
    if (await confirmation(m.id).catch(() => false)) confirmed++;
  }
  if (process.env["NEWSLETTER_MONTHLY_ENABLED"] !== "true")
    return { configured: true, awaitingApproval: true, confirmed, delivered };
  const [period] = await sql<
    { start: string; end: string }[]
  >`select (date_trunc('month',now() at time zone 'Asia/Riyadh')-interval '1 month')::date::text as start,date_trunc('month',now() at time zone 'Asia/Riyadh')::date::text as end`;
  if (!period) throw Error("No newsletter month");
  const from = period.start,
    to = period.end;
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${from}))`;
    if (
      (await tx`select month from newsletter_issues where month=${from}`).length
    )
      return;
    const rows = await issueEntries(from, to, tx);
    if (!rows.length) return;
    const [editorial] = await tx<
      { body_ar: string | null; body_en: string | null }[]
    >`select body_ar,body_en from newsletter_editorial where month=${from}`;
    const body = (language: "ar" | "en") =>
      editorialBody(
        rows,
        language,
        language === "ar" ? editorial?.body_ar : editorial?.body_en,
      );
    const inserted =
      await tx`insert into newsletter_issues(month,body_ar,body_en,entries) values(${from},${body("ar")},${body("en")},${JSON.stringify(rows)}::jsonb) on conflict do nothing returning month`;
    if (inserted.length)
      await tx`insert into newsletter_deliveries(month,member_id) select ${from},id from newsletter_members where state='active' and confirmed_at < ${to}::date::timestamp at time zone 'Asia/Riyadh'`;
  });
  // Take a bounded work list so one rejected address cannot block other deliveries.
  const pending = await sql<
    { member_id: string; month: string }[]
  >`select d.member_id,d.month::text as month from newsletter_deliveries d join newsletter_members m on m.id=d.member_id where d.sent_at is null and m.state='active' and m.confirmed_at<(d.month+interval '1 month') at time zone 'Asia/Riyadh' order by d.month,d.member_id limit 250`;
  for (const job of pending) {
    if (Date.now() > deadline) break;
    const sent = await sql
      .begin(async (tx) => {
        const [m] = await tx<
          (Member & {
            month: string;
            body_ar: string;
            body_en: string;
            entries: Entry[];
            general: boolean;
            products: string[];
          })[]
        >`select m.*,d.month::text as month,i.body_ar,i.body_en,i.entries from newsletter_deliveries d join newsletter_members m on m.id=d.member_id join newsletter_issues i using(month) where d.member_id=${job.member_id} and d.month=${job.month} and d.sent_at is null and m.state='active' and m.confirmed_at<(d.month+interval '1 month') at time zone 'Asia/Riyadh' for update of m,d skip locked`;
        if (!m) return false;
        const ar = m.language === "ar";
        const body = m.general
          ? ar
            ? m.body_ar
            : m.body_en
          : issueText(
              m.entries.filter(
                (e) => e.product && m.products.includes(e.product),
              ),
              ar ? "ar" : "en",
            );
        if (!body) {
          await tx`delete from newsletter_deliveries where month=${m.month} and member_id=${m.id}`;
          return false;
        }
        await mail(
          m.email,
          (ar ? "مستجدات EA-Hub" : "EA-Hub updates") +
            " · " +
            m.month.slice(0, 7),
          body + footer(m),
          "monthly-" +
            createHash("sha256")
              .update(m.month + m.id)
              .digest("hex"),
        );
        await tx`update newsletter_deliveries set sent_at=now() where month=${m.month} and member_id=${m.id}`;
        return true;
      })
      .catch(() => false);
    if (sent) delivered++;
  }
  return { configured: true, confirmed, delivered };
}
export async function approveEditorial(
  month: string,
  lang: "ar" | "en",
  body: string,
) {
  const from = month + "-01",
    next = new Date(from + "T00:00:00Z");
  next.setUTCMonth(next.getUTCMonth() + 1);
  await database().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${from}))`;
    if (
      (await tx`select month from newsletter_issues where month=${from}`).length
    )
      throw Error("Issue already finalized");
    const entries = await issueEntries(
      from,
      next.toISOString().slice(0, 10),
      tx,
    );
    const urls = new Set(entries.map((e) => origin() + e.path));
    const included = new Set(body.match(/https?:\/\/[^\s]+/g) ?? []);
    if (
      !urls.size ||
      urls.size !== included.size ||
      [...urls].some((u) => !included.has(u))
    )
      throw Error("Keep source links");
    if (lang === "ar")
      await tx`insert into newsletter_editorial(month,body_ar) values(${from},${body}) on conflict(month) do update set body_ar=excluded.body_ar`;
    else
      await tx`insert into newsletter_editorial(month,body_en) values(${from},${body}) on conflict(month) do update set body_en=excluded.body_en`;
  });
}

/** People following a coming-soon product (confirmed or awaiting confirmation). */
export async function waitlistCount(productId: string): Promise<number> {
  const sql = database();
  const [row] = await sql<
    { n: number }[]
  >`select count(*)::int as n from newsletter_members where ${productId}=any(products) and state in ('active','pending')`;
  return row?.n ?? 0;
}

/** Waitlist size for every coming-soon product, largest first. */
export async function waitlistSizes(): Promise<
  { id: string; name: string; members: number }[]
> {
  const sql = database();
  return sql<
    { id: string; name: string; members: number }[]
  >`select p.id, p.name, (select count(*)::int from newsletter_members m where p.id=any(m.products) and m.state in ('active','pending')) as members from products p where p.coming_soon order by members desc, p.sort_order`;
}

/**
 * Adds an email to a coming-soon product's waitlist. Active subscribers get the product
 * added straight away (they already confirmed their address); everyone else goes through
 * the normal double opt-in with only this product selected.
 */
export async function joinWaitlist(
  email: string,
  lang: string,
  productId: string,
): Promise<{ ok: boolean; confirm: boolean }> {
  const sql = database();
  const [product] = await sql<
    { id: string }[]
  >`select id from products where id=${productId} and coming_soon`;
  if (!product) return { ok: false, confirm: false };
  const [active] = await sql<
    { id: string }[]
  >`update newsletter_members set products=array(select distinct unnest(products||array[${productId}]::text[])) where email=${email} and state='active' returning id`;
  if (active) {
    await scheduleLaunches(active.id);
    return { ok: true, confirm: false };
  }
  // A recent pending signup keeps its confirmation link; just add the product to it.
  const [pending] = await sql<
    { id: string }[]
  >`update newsletter_members set products=array(select distinct unnest(products||array[${productId}]::text[])) where email=${email} and state='pending' and requested_at >= now()-interval '1 day' returning id`;
  if (pending) {
    await scheduleLaunches(pending.id);
    return { ok: true, confirm: true };
  }
  await subscribe(email, lang, { general: false, products: [productId] });
  return { ok: true, confirm: true };
}
