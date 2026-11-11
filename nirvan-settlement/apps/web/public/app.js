const app = document.querySelector("#app");
let flash = "";

const money = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED" });
const aed = (value) => money.format(Number(value || 0));

const ICONS = {
  home: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 9.2 10 3l7 6.2V17a1 1 0 0 1-1 1h-4.2v-4.6H8.2V18H4a1 1 0 0 1-1-1V9.2Z" stroke="currentColor" stroke-width="1.4"/></svg>',
  orders: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M6 8h8M6 11.5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  vendors: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="7" r="2.4" stroke="currentColor" stroke-width="1.4"/><path d="M4.5 16.2c.8-2.4 2.8-3.7 5.5-3.7s4.7 1.3 5.5 3.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  settlements: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="4" width="14" height="13" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M3 8h14M7 2.5v3M13 2.5v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  owner: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4"/></svg>',
  rules: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6 3.5h6.2L16 7.3V16.5H6v-13Z" stroke="currentColor" stroke-width="1.4"/></svg>',
  activity: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6 3.5h6.2L16 7.3V16.5H6v-13Z" stroke="currentColor" stroke-width="1.4"/><path d="M12 3.8V7.4H15.5M8 11h5M8 13.5h3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  system: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 16s5-2.8 5-6.4A2.6 2.6 0 0 0 12.2 7c-.9 0-1.7.4-2.2 1.1C9.5 7.4 8.7 7 7.8 7A2.6 2.6 0 0 0 5 9.6C5 13.2 10 16 10 16Z" stroke="currentColor" stroke-width="1.4"/></svg>',
};

const STATUS_LABEL = {
  qualified: "Payable",
  blocked: "Held",
  held: "Held",
  open: "Not ready",
  packed: "In settlement",
  pending_approval: "Needs approval",
  approved: "Approved",
  draft: "Needs review",
  executing: "Paying",
  transferred: "Paid",
  closed: "Finished",
  failed: "Failed",
  active: "Active",
  manual_paid: "Paid by bank",
  awaiting_manual_payment: "Awaiting bank",
  manual_bank: "Bank transfer",
  stripe_connect: "Stripe",
  vat: "VAT",
  ready: "Ready",
  missing: "Not set up",
  own: "Own sale",
  test: "Test",
  simulated: "Practice",
};

const ACTION_LABEL = {
  "pack.generated": "Settlement created",
  "pack.submitted": "Settlement sent for approval",
  "pack.approved": "Settlement approved",
  "transfer.executed": "Stripe vendor paid",
  "transfer.failed": "Stripe vendor payment failed",
  "manual_payment.recorded": "Manual bank payment recorded",
  "manual_payment.notified": "Approver told about a manual bank payment",
  "invoice.generated": "Payment advice created",
  "rule.drafted": "Rule draft saved",
  "rule.submitted": "Rule sent for approval",
  "rule.approved": "Rule approved",
  "order.ingested": "Order received from Shopify",
  "lines.requalified": "Orders checked again",
  "line.requalify.transferred_unchanged": "A paid amount was left unchanged",
  "email.failed": "Email failed",
  "email.blocked": "Email was not sent",
  shopify_oauth_connected: "Shopify connected",
  "payout.requested": "Bank payout requested",
  "payout.failed": "Bank payout failed",
  "payout.paid": "Bank payout completed",
  "payout.updated": "Bank payout updated",
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function when(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-AE", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" });
}

function dubaiMonth(date = new Date()) {
  if (date == null || date === "") return "";
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  return value.toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }).slice(0, 7);
}

function shiftMonth(yearMonth, delta) {
  const [year, month] = String(yearMonth || "").split("-").map(Number);
  if (!year || !month) return dubaiMonth();
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isYearMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));
}

function chosenMonth(name) {
  const value = route().query.get(name);
  if (!isYearMonth(value) || value > dubaiMonth()) return dubaiMonth();
  return value;
}

function recentMonths(count = 6) {
  const now = dubaiMonth();
  const months = [];
  for (let i = 0; i < count; i += 1) months.push(shiftMonth(now, -i));
  return months;
}

function shortMonth(yearMonth) {
  const [year, month] = String(yearMonth || "").split("-").map(Number);
  if (!year || !month) return yearMonth || "—";
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-AE", {
    timeZone: "Asia/Dubai",
    month: "short",
    year: "numeric",
  });
}

function monthSwitchHtml(selected) {
  const prev = shiftMonth(selected, -1);
  const next = shiftMonth(selected, 1);
  const laterBlocked = next > dubaiMonth();
  return `
    <div class="month-switch">
      <div class="month-nav">
        <button class="secondary" type="button" data-month="${esc(prev)}">Previous month</button>
        <strong>${esc(monthLabel(selected))}</strong>
        <button class="secondary" type="button" data-month="${esc(next)}" ${laterBlocked ? "disabled" : ""}>Next month</button>
      </div>
      <div class="month-picks" role="group" aria-label="Choose a month">
        ${recentMonths().map((month) => `<button class="month-pick" type="button" data-month="${esc(month)}" aria-pressed="${month === selected ? "true" : "false"}">${esc(shortMonth(month))}</button>`).join("")}
      </div>
    </div>
  `;
}

function goMonth(hash) {
  location.hash = hash;
}

function holdReason(reason) {
  const labels = {
    platform_own: "This is a Nirvan Earth product. It is listed under Own sales and is not paid to a vendor.",
    no_vendor: "No vendor is attached to this product.",
    cancelled: "The order was cancelled.",
    refunded: "The order was refunded.",
    unpaid: "The order is not paid.",
    not_fulfilled: "The order has not been delivered yet.",
    return_window: "The 14-day return window is still open.",
    open_adjustment: "A refund or dispute is still open.",
  };
  return labels[reason] || String(reason || "").replaceAll("_", " ");
}

function monthLabel(yearMonth) {
  const [year, month] = String(yearMonth || "").split("-").map(Number);
  if (!year || !month) return yearMonth || "—";
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-AE", {
    timeZone: "Asia/Dubai",
    month: "long",
    year: "numeric",
  });
}

function payoutFor(yearMonth) {
  const [year, month] = yearMonth.split("-").map(Number);
  const payout = new Date(Date.UTC(year, month, 10));
  const key = payout.toISOString().slice(0, 10);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
  return {
    label: payout.toLocaleDateString("en-AE", { timeZone: "Asia/Dubai", day: "numeric", month: "long", year: "numeric" }),
    ready: today >= key,
  };
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  let body = undefined;
  if (options.body !== undefined) {
    headers["content-type"] = headers["content-type"] || "application/json";
    body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  } else if (options.method && ["POST", "PUT", "PATCH"].includes(options.method.toUpperCase())) {
    headers["content-type"] = "application/json";
    body = "{}";
  }
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers,
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function route() {
  const hash = location.hash || "#/";
  const [pathPart, queryString] = hash.replace(/^#/, "").split("?");
  const pieces = pathPart.replace(/^\//, "").split("/").filter(Boolean);
  return {
    path: pieces[0] || "home",
    id: pieces[1],
    query: new URLSearchParams(queryString || ""),
  };
}

function badge(status) {
  const key = String(status || "open");
  const tone = ["qualified", "approved", "transferred", "closed", "active", "manual_paid", "vat", "ready"].includes(key)
    ? "success"
    : ["blocked", "failed", "held", "missing"].includes(key)
      ? "critical"
      : ["pending_approval", "executing", "draft", "open", "packed", "awaiting_manual_payment", "manual_bank"].includes(key)
        ? "warning"
        : "info";
  const label = STATUS_LABEL[key] || key.replaceAll("_", " ");
  return `<span class="badge ${tone}">${esc(label)}</span>`;
}

function navKey(path) {
  if (path === "packs") return "settlements";
  if (path === "audit") return "activity";
  if (path === "health") return "system";
  return path;
}

function testBanner(dash, health) {
  const stripeTest = dash.mode === "stripe-test" || health?.stripe?.mode === "stripe-test";
  const liveBlocked = health?.liveBlocked !== false;
  if (!stripeTest && !liveBlocked) return "";
  const text = "Practice mode. Paying here does not move real money.";
  return `<div class="mode-banner" role="status">${esc(text)}</div>`;
}

function shell(me, dash, health, body) {
  const current = navKey(route().path);
  const item = (href, key, label, icon) =>
    `<a href="${href}" ${current === key ? 'aria-current="page"' : ""}>${ICONS[icon]}<span>${label}</span></a>`;
  const titles = {
    home: "Home",
    orders: "Orders",
    vendors: "Vendors",
    settlements: "Settlements",
    owner: "Own sales",
    rules: "Rules",
    activity: "Activity",
    system: "System",
  };
  return `
    <div class="admin">
      <aside class="nav">
        <div class="shop">
          <div class="mark">NE</div>
          <div><strong>Nirvan Earth</strong><span>Settlements</span></div>
        </div>
        ${item("#/", "home", "Home", "home")}
        ${item("#/orders", "orders", "Orders", "orders")}
        ${item("#/vendors", "vendors", "Vendors", "vendors")}
        ${item("#/settlements", "settlements", "Settlements", "settlements")}
        ${item("#/owner", "owner", "Own sales", "owner")}
        ${item("#/rules", "rules", "Rules", "rules")}
        ${item("#/activity", "activity", "Activity", "activity")}
        ${item("#/system", "system", "System", "system")}
        <div class="spacer"></div>
        <button class="link" id="logout" type="button">Sign out</button>
      </aside>
      <div class="frame">
        <header class="topbar">
          <div class="crumb"><strong>${esc(titles[current] || "Home")}</strong></div>
          <div class="top-meta">
            <span>${esc(me.email)}</span>
          </div>
        </header>
        ${testBanner(dash, health)}
        <div class="page">${body}</div>
      </div>
    </div>
  `;
}

function nextStep(pack, me) {
  if (pack.status === "draft") {
    return {
      title: "Check the amounts, then send for approval",
      text: "Nobody is paid until this is sent, approved, and then paid.",
    };
  }
  if (pack.status === "pending_approval") {
    return me.approver
      ? { title: "This is waiting for your approval", text: "Approving does not pay anyone. Paying is the step after that." }
      : { title: "Waiting for the approver", text: "Only the approver can approve and pay." };
  }
  if (pack.status === "approved" || pack.status === "executing") {
    return {
      title: "Pay the Stripe vendors",
      text: "That button pays only vendors who are paid through Stripe. For a bank vendor, pay them yourself and then choose I have paid the bank.",
    };
  }
  if (pack.status === "closed") {
    return { title: "This month is finished", text: "Paid amounts stay as they are. You can still download a payment advice." };
  }
  return { title: "Review this settlement", text: "Check each vendor before you continue." };
}

function actionHint(status, approver) {
  if (status === "draft") return "Approve and Pay stay off until you send this for approval.";
  if (status === "pending_approval" && approver) return "Send is already done. Pay stays off until you approve.";
  if (status === "pending_approval") return "An approver has to approve this before anyone is paid.";
  if (status === "approved" || status === "executing") return "Send and Approve are already done. Bank vendors are marked paid in the list below.";
  if (status === "closed") return "This settlement is finished, so it cannot be paid again.";
  return "";
}

function ask(title, text, okLabel) {
  return new Promise((resolve) => {
    const node = document.createElement("div");
    node.className = "modal";
    node.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">${esc(title)}</h2>
        <p>${esc(text)}</p>
        <div id="modal-extra"></div>
        <div class="modal-actions">
          <button class="secondary" type="button" id="modal-cancel">Cancel</button>
          <button class="primary" type="button" id="modal-ok">${esc(okLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(node);
    const close = (value) => { node.remove(); resolve(value); };
    node.querySelector("#modal-cancel").addEventListener("click", () => close(false));
    node.querySelector("#modal-ok").addEventListener("click", () => close(true));
    node.querySelector("#modal-ok").focus();
  });
}

function askReference() {
  return new Promise((resolve) => {
    const node = document.createElement("div");
    node.className = "modal";
    node.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">Record the bank payment</h2>
        <p>This notes that you already paid the vendor from the bank. It does not send a Stripe payment.</p>
        <div class="field">
          <label for="modal-ref">Bank reference</label>
          <input id="modal-ref" placeholder="Transfer number, if you have one" autocomplete="off" />
        </div>
        <p class="page-sub">Leave this blank and a reference is written for you.</p>
        <div class="modal-actions">
          <button class="secondary" type="button" id="modal-cancel">Cancel</button>
          <button class="primary" type="button" id="modal-ok">Save payment</button>
        </div>
      </div>
    `;
    document.body.appendChild(node);
    const close = (value) => { node.remove(); resolve(value); };
    node.querySelector("#modal-cancel").addEventListener("click", () => close(null));
    node.querySelector("#modal-ok").addEventListener("click", () => close(node.querySelector("#modal-ref").value.trim()));
    node.querySelector("#modal-ref").focus();
  });
}

function loginView(error = "") {
  app.innerHTML = `
    <div class="login-screen">
      <form class="login-card" id="login-form">
        <div class="shop" style="padding:0 0 12px">
          <div class="mark">NE</div>
          <div><strong>Nirvan Earth</strong><span>Settlements</span></div>
        </div>
        <h1>Log in</h1>
        <p class="page-sub">For the person who approves settlements. Vendors do not sign in here.</p>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" autocomplete="username" value="admin@nirvanearth.com" required />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required />
        </div>
        <p class="msg">${esc(error)}</p>
        <button class="primary" type="submit">Log in</button>
      </form>
    </div>
  `;
  app.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: { email: form.email.value, password: form.password.value },
      });
      location.hash = "#/";
      await render();
    } catch (err) {
      loginView(err.message);
    }
  });
}

async function ensureUser() {
  try {
    return await api("/api/auth/me");
  } catch {
    loginView();
    return null;
  }
}

async function chrome(me) {
  const [dash, health] = await Promise.all([api("/api/dashboard"), api("/api/health")]);
  return { me, dash, health };
}

function bindChrome() {
  const logout = document.querySelector("#logout");
  if (!logout) return;
  logout.addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" });
    loginView();
  });
}

function helpRules() {
  return `
    <details class="help">
      <summary>How a settlement is worked out</summary>
      <div class="card-body">
        <ul class="rules">
          <li><strong>20%</strong> of the product after discount, excluding vendor VAT.</li>
          <li><strong>Shipping</strong> is kept on the order and is not part of the 20%.</li>
          <li><strong>Own products and gift hampers</strong> are Nirvan Earth sales, not vendor payouts.</li>
          <li><strong>Stripe fees</strong> stay with Nirvan Earth. They are not taken off the vendor amount.</li>
          <li><strong>Payable</strong> only after delivery, the return window, and no open refund or dispute.</li>
          <li><strong>Pay</strong> on or after the 10th of the next month, and only after approval.</li>
        </ul>
      </div>
    </details>
  `;
}

async function renderHome(me) {
  const { dash, health } = await chrome(me);
  const [{ packs }, { vendors }] = await Promise.all([api("/api/packs"), api("/api/vendors")]);
  const month = chosenMonth("month");
  const pack = packs.find((item) => item.yearMonth === month);
  const missing = vendors.filter((vendor) => vendor.active !== false && !vendorPayoutReady(vendor));
  const attention = [];
  if (health.shopify && !health.shopify.connected) {
    attention.push({ href: "#/system", title: "Shopify is not connected", text: "New orders will not arrive until Shopify is connected." });
  }
  if (missing.length) {
    attention.push({
      href: "#/vendors",
      title: `${missing.length} vendor${missing.length === 1 ? "" : "s"} missing payout details`,
      text: "Set VAT and how they are paid before the first settlement.",
    });
  }
  if (!pack) {
    attention.push({
      href: `#/settlements?month=${encodeURIComponent(month)}`,
      title: `No settlement for ${monthLabel(month)}`,
      text: "Create it when the orders for this month are ready to review.",
    });
  } else if (pack.status === "draft") {
    attention.push({ href: `#/settlements/${pack.id}`, title: `${monthLabel(month)} is ready to review`, text: `Payable ${aed(pack.payableTotal)}.` });
  } else if (pack.status === "pending_approval") {
    attention.push({ href: `#/settlements/${pack.id}`, title: `${monthLabel(month)} needs approval`, text: `Payable ${aed(pack.payableTotal)}. Nothing is paid until you approve and then pay.` });
  } else if (pack.status === "approved" || pack.status === "executing") {
    attention.push({ href: `#/settlements/${pack.id}`, title: `${monthLabel(month)} can be paid`, text: "Stripe vendors are paid from here. Bank vendors are marked paid after you send the bank payment." });
  }
  if (dash.blocked) {
    attention.push({
      href: "#/orders?view=held",
      title: `${dash.blocked} product${dash.blocked === 1 ? "" : "s"} held`,
      text: "Held products are not included in the amount you pay.",
    });
  }
  const previous = shiftMonth(dubaiMonth(), -1);
  const previousPack = packs.find((item) => item.yearMonth === previous);
  if (month === dubaiMonth() && previousPack && previousPack.status !== "closed") {
    attention.push({
      href: `#/settlements/${previousPack.id}`,
      title: `${monthLabel(previous)} is not finished`,
      text: "Open it to review, approve, or pay what is still outstanding.",
    });
  }
  app.innerHTML = shell(me, dash, health, `
    <div class="page-head">
      <div>
        <h1>${esc(monthLabel(month))}</h1>
        <p class="page-sub">What can be paid to vendors. Choose another month if this one is empty.</p>
      </div>
      ${pack ? `<a class="secondary" href="#/settlements/${esc(pack.id)}">Open settlement</a>` : `<a class="secondary" href="#/settlements?month=${esc(month)}">Create settlement</a>`}
    </div>
    ${monthSwitchHtml(month)}
    <div class="metrics">
      <div class="metric"><div class="label">Payable</div><div class="value">${pack ? aed(pack.payableTotal) : "—"}</div></div>
      <div class="metric"><div class="label">Held</div><div class="value">${pack ? aed(pack.heldTotal) : "—"}</div></div>
      <div class="metric"><div class="label">Settlement</div><div class="value">${pack ? badge(pack.status) : badge("missing")}</div></div>
      <div class="metric"><div class="label">All orders on file</div><div class="value">${dash.orders}</div></div>
    </div>
    <section class="card">
      <div class="card-head">Needs attention</div>
      <div class="attn">
        ${attention.map((item) => `<a href="${esc(item.href)}"><strong>${esc(item.title)}</strong><span class="muted">${esc(item.text)}</span></a>`).join("")
          || `<div class="empty">Nothing needs attention.</div>`}
      </div>
    </section>
    ${helpRules()}
  `);
  bindChrome();
  for (const button of app.querySelectorAll("[data-month]")) {
    button.addEventListener("click", () => goMonth(`#/?month=${encodeURIComponent(button.dataset.month)}`));
  }
}

function settlementSteps(status) {
  const current = status === "draft" ? "review"
    : status === "pending_approval" ? "approve"
      : status === "approved" || status === "executing" ? "pay"
        : status === "closed" ? "done" : "review";
  const item = (key, name, text) => {
    const done = current === "done" || (current === "approve" && key === "review") || (current === "pay" && key !== "pay");
    const now = current === key;
    return `<li class="${done ? "done" : ""}" ${now ? 'aria-current="step"' : ""}><span class="k">${esc(name)}</span><strong>${esc(text)}</strong></li>`;
  };
  return `<ol class="steps">
    ${item("review", "1 · Review", status === "draft" ? "Check the amounts" : "Amounts checked")}
    ${item("approve", "2 · Approve", status === "pending_approval" ? "Waiting for approval" : current === "review" ? "After review" : "Approved")}
    ${item("pay", "3 · Pay", current === "done" ? "Finished" : "Pay Stripe vendors, then mark bank payments")}
  </ol>`;
}

async function renderSettlements(me) {
  const { dash, health } = await chrome(me);
  const { packs } = await api("/api/packs");
  const month = chosenMonth("month");
  const existing = packs.find((pack) => pack.yearMonth === month);
  app.innerHTML = shell(me, dash, health, `
    <div class="page-head">
      <div>
        <h1>Settlements</h1>
        <p class="page-sub">One settlement for each month. Review it, approve it, then pay.</p>
      </div>
    </div>
    <form id="gen">
      ${monthSwitchHtml(month)}
      <button class="primary" type="submit">${existing ? `Open ${esc(monthLabel(month))}` : `Create ${esc(monthLabel(month))}`}</button>
    </form>
    <p class="msg" id="msg"></p>
    <section class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Status</th><th class="num">To pay</th><th class="num">Waiting</th><th class="num">Pay by Stripe</th><th class="num">Pay by bank</th><th>Pay on</th><th></th></tr></thead>
          <tbody>
            ${packs.map((pack) => `<tr>
              <td><a class="rowlink" href="#/settlements/${esc(pack.id)}">${esc(monthLabel(pack.yearMonth))}</a></td>
              <td>${badge(pack.status)}</td>
              <td class="num">${aed(pack.payableTotal)}</td>
              <td class="num">${aed(pack.heldTotal)}</td>
              <td class="num">${aed(pack.connectPayableTotal || 0)}</td>
              <td class="num">${aed(pack.manualPayableTotal || 0)}</td>
              <td>${esc(payoutFor(pack.yearMonth).label)}</td>
              <td><a href="#/settlements/${esc(pack.id)}">Open</a></td>
            </tr>`).join("") || `<tr><td colspan="8"><div class="empty">No settlements yet. Create one for a month that already has orders.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `);
  bindChrome();
  const say = (error) => { app.querySelector("#msg").textContent = error?.message || error || ""; };
  for (const button of app.querySelectorAll("[data-month]")) {
    button.addEventListener("click", () => goMonth(`#/settlements?month=${encodeURIComponent(button.dataset.month)}`));
  }
  app.querySelector("#gen").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (existing) {
      location.hash = `#/settlements/${existing.id}`;
      return;
    }
    try {
      const result = await api("/api/packs/generate", {
        method: "POST",
        body: { yearMonth: month },
      });
      location.hash = `#/settlements/${result.pack.id}`;
      await render();
    } catch (error) {
      say(error);
    }
  });
}

function payRows(lines, payoutsEnabled) {
  if (!lines.length) return `<div class="empty">Nobody in this list.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Vendor</th><th>How they are paid</th><th class="num">Orders</th>
            <th class="num">Vendor amount</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${lines.map((line) => `
            <tr>
              <td class="wrap">
                <strong>${esc(line.vendorName)}</strong>
                <div>${line.vatRegistered ? badge("vat") : `<span class="badge">No VAT</span>`}</div>
                <div class="muted">Before commission ${aed(line.commissionBaseSum)} · Nirvan Earth keeps ${aed(line.commissionSum)} · Delivery ${aed(line.shippingSum)}</div>
              </td>
              <td class="wrap">
                ${badge(line.payoutMethod === "manual_bank" ? "manual_bank" : "stripe_connect")}
                <div class="muted">${line.payoutMethod === "manual_bank" ? "You pay this vendor from the bank" : (line.stripeAccountId ? `Stripe account saved` : "Add a Stripe account before paying")}</div>
                ${line.stripeAccountId ? `<div class="muted">Account ${esc(line.stripeAccountId)}</div>` : ""}
              </td>
              <td class="num">${line.orderLineCount}</td>
              <td class="num">${aed(line.ruleNetSum ?? line.vendorNetSum)}${line.ruleNetSum != null && Math.abs(line.ruleNetSum - line.vendorNetSum) > 0.001 ? `<div class="muted">Already paid ${aed(line.vendorNetSum)}</div>` : ""}</td>
              <td>${badge(line.status)}</td>
              <td class="wrap">
                ${line.invoiceNumber ? `<div><a href="/api/lines/${esc(line.id)}/invoice">Download payment advice</a></div>` : ""}
                ${line.payoutMethod === "manual_bank" && line.status === "awaiting_manual_payment" ? `<div><button class="secondary" type="button" data-mark-paid="${esc(line.id)}">I have paid the bank</button></div>` : ""}
                ${line.manualReference ? `<div class="muted">Bank reference ${esc(line.manualReference)}</div>` : ""}
                ${line.stripeTransferId ? `<div class="muted">Stripe reference ${esc(line.stripeTransferId)}</div>` : ""}
                ${payoutsEnabled && line.status === "transferred" ? `<div><button class="secondary" type="button" data-payout="${esc(line.id)}">Send this to their bank</button></div>` : ""}
                ${line.bankPayoutStatus ? `<div class="muted">${esc(line.bankPayoutStatus)}</div>` : ""}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function renderPack(me) {
  const { id } = route();
  const { dash, health } = await chrome(me);
  const { pack } = await api(`/api/packs/${id}`);
  const payable = pack.lines.filter((line) => line.kind === "payable");
  const held = pack.lines.filter((line) => line.kind === "held");
  const connect = payable.filter((line) => line.payoutMethod !== "manual_bank");
  const manual = payable.filter((line) => line.payoutMethod === "manual_bank");
  const payout = payoutFor(pack.yearMonth);
  const canSubmit = pack.status === "draft";
  const canApprove = pack.status === "pending_approval" && me.approver;
  const canExecute = (pack.status === "approved" || pack.status === "executing") && me.approver;
  const step = nextStep(pack, me);
  app.innerHTML = shell(me, dash, health, `
    <div class="page-head">
      <div>
        <p class="page-sub"><a href="#/settlements">Settlements</a></p>
        <h1>${esc(monthLabel(pack.yearMonth))}</h1>
        <p class="page-sub">${me.approver ? "Three steps: review, approve, then pay." : "Only the approver can approve and pay."}</p>
      </div>
      <div>${badge(pack.status)}</div>
    </div>
    ${settlementSteps(pack.status)}
    <div class="banner info">
      <div>
        <strong>${esc(step.title)}</strong>
        ${esc(step.text)}
      </div>
    </div>
    <div class="banner ${payout.ready ? "info" : "warning"}">
      <div>
        <strong>${payout.ready ? "The pay date has passed" : "Too early to pay"}</strong>
        Pay on or after ${esc(payout.label)}. You can approve before that day. In practice mode, Pay does not wait and does not move real money.
      </div>
    </div>
    <div class="metrics">
      <div class="metric"><div class="label">To pay vendors</div><div class="value">${aed(pack.rulePayableTotal ?? pack.payableTotal)}</div>${Math.abs((pack.rulePayableTotal ?? pack.payableTotal) - pack.payableTotal) > 0.001 ? `<div class="muted">Already paid ${aed(pack.payableTotal)}</div>` : ""}</div>
      <div class="metric"><div class="label">Pay by Stripe</div><div class="value">${aed(pack.connectPayableTotal || 0)}</div></div>
      <div class="metric"><div class="label">Pay by bank</div><div class="value">${aed(pack.manualPayableTotal || 0)}</div></div>
      <div class="metric"><div class="label">Waiting</div><div class="value">${aed(pack.heldTotal)}</div></div>
    </div>
    <div class="banner info"><div><strong>Card fees stay with Nirvan Earth</strong>They are not taken off the vendor amount. Nirvan Earth's commission on what you can pay is ${aed(pack.commissionTotal || 0)}.</div></div>
    <div class="actions" style="margin-bottom:8px">
      <button class="secondary" id="submit" type="button" ${canSubmit ? "" : "disabled"}>Send for approval</button>
      <button class="primary" id="approve" type="button" ${canApprove ? "" : "disabled"}>Approve</button>
      <button class="primary" id="execute" type="button" ${canExecute ? "" : "disabled"}>Pay Stripe vendors</button>
    </div>
    <p class="page-sub" style="margin-bottom:16px">${esc(actionHint(pack.status, me.approver))}</p>
    <p class="msg" id="msg"></p>
    <section class="card">
      <div class="card-head">Pay by Stripe <span class="muted">Use Pay Stripe vendors. This does not pay bank vendors.</span></div>
      ${payRows(connect, dash.payoutTriggerEnabled)}
    </section>
    <section class="card">
      <div class="card-head">Pay by bank <span class="muted">Pay the vendor yourself, then choose I have paid the bank.</span></div>
      ${payRows(manual, false)}
    </section>
    <section class="card">
      <div class="card-head">Waiting <span class="muted">Not part of this payment</span></div>
      ${payRows(held, false)}
    </section>
  `);
  bindChrome();
  const say = (error) => { app.querySelector("#msg").textContent = error?.message || error || ""; };
  app.querySelector("#submit").addEventListener("click", async () => {
    try { await api(`/api/packs/${id}/submit`, { method: "POST" }); await render(); } catch (error) { say(error); }
  });
  app.querySelector("#approve").addEventListener("click", async () => {
    const ok = await ask("Approve this settlement?", `Approve ${aed(pack.payableTotal)} for ${monthLabel(pack.yearMonth)}. Nobody is paid until you choose Pay Stripe vendors.`, "Approve");
    if (!ok) return;
    try { await api(`/api/packs/${id}/approve`, { method: "POST", body: {} }); await render(); } catch (error) { say(error); }
  });
  app.querySelector("#execute").addEventListener("click", async () => {
    const ok = await ask("Pay the Stripe vendors?", "Each Stripe vendor is paid once. Bank vendors are not paid here. Choosing this again does not pay a Stripe vendor twice.", "Pay Stripe vendors");
    if (!ok) return;
    try {
      const result = await api(`/api/packs/${id}/execute`, { method: "POST" });
      const failed = result.results.filter((item) => item.status === "failed");
      await render();
      if (failed.length) app.querySelector("#msg").textContent = failed.map((item) => `${item.vendorName}: ${item.error}`).join(" · ");
    } catch (error) { say(error); }
  });
  for (const button of app.querySelectorAll("[data-mark-paid]")) {
    button.addEventListener("click", async () => {
      const reference = await askReference();
      if (reference == null) return;
      try { await api(`/api/lines/${button.dataset.markPaid}/mark-paid`, { method: "POST", body: { reference } }); await render(); } catch (error) { say(error); }
    });
  }
  for (const button of app.querySelectorAll("[data-payout]")) {
    button.addEventListener("click", async () => {
      const ok = await ask("Send this Stripe payment to their bank?", "The vendor was already paid inside Stripe. This asks Stripe to send that money to the vendor's bank. It does not pay them again.", "Send to their bank");
      if (!ok) return;
      try { await api(`/api/lines/${button.dataset.payout}/payout`, { method: "POST" }); await render(); } catch (error) { say(error); }
    });
  }
}

function orderFlags(line) {
  const settled = ["packed", "transferred", "manual_paid", "awaiting_manual_payment"].includes(line.status);
  return {
    payable: !line.isPlatformOwn && line.status === "qualified",
    own: Boolean(line.isPlatformOwn),
    held: Boolean(
      (!line.isPlatformOwn && !settled && line.status !== "qualified")
      || (line.isPlatformOwn && (Boolean(line.blockReason) || ["blocked", "held", "open"].includes(line.status))),
    ),
  };
}

function orderPairs(lines) {
  return lines.map((line) => {
    const search = `${line.orderNumber || ""} ${line.shopifyOrderId} ${line.title} ${line.vendorName || ""}`.toLowerCase();
    const flags = orderFlags(line);
    return `
      <tr data-line="${esc(line.id)}" data-payable="${flags.payable}" data-held="${flags.held}" data-own="${flags.own}" data-month="${esc(dubaiMonth(line.paidAt))}" data-search="${esc(search)}">
        <td><button class="ghost" type="button" data-toggle="${esc(line.id)}" aria-expanded="false">Details</button></td>
        <td>${esc(line.orderNumber || line.shopifyOrderId)}</td>
        <td class="wrap">${esc(line.title)}</td>
        <td>${line.isPlatformOwn ? "Nirvan Earth" : esc(line.vendorName || "—")}</td>
        <td class="num">${aed(line.vendorNet)}</td>
        <td>${badge(line.status)}${line.isPlatformOwn ? ` ${badge("own")}` : ""}</td>
      </tr>
      <tr class="detail" data-detail="${esc(line.id)}" hidden>
        <td colspan="6">
          <div class="facts">
            <div><span>Quantity</span><strong>${line.quantity}</strong></div>
            <div><span>Sold for</span><strong>${aed(line.gross)}</strong></div>
            <div><span>Discount</span><strong>${aed(line.discount)}</strong></div>
            <div><span>Vendor VAT</span><strong>${line.vatRegistered ? aed(line.vendorVat) : "No VAT"}</strong></div>
            <div><span>Delivery in the price</span><strong>${aed(line.deliveryAllowance || 0)}</strong><span>${Number(line.deliveryAllowance) > 0 ? "Paid to the vendor" : "None on this product"}</span></div>
            <div><span>Delivery the customer paid</span><strong>${aed(line.orderShippingTotal)}</strong><span>Kept by Nirvan Earth</span></div>
            <div><span>Nirvan Earth delivery</span><strong>${aed(line.expectedOwnDelivery || 0)}</strong><span>AED 19 when Nirvan Earth products are under AED 199, otherwise free</span></div>
            <div><span>Amount the 20% uses</span><strong>${aed(line.commissionBase)}</strong></div>
            <div><span>Nirvan Earth keeps</span><strong>${aed(line.commissionAmount)}</strong></div>
            <div><span>Delivered</span><strong>${when(line.fulfilledAt)}</strong></div>
            <div><span>Can be paid after</span><strong>${when(line.returnWindowEndsAt)}</strong></div>
          </div>
          ${line.blockReason ? `<p class="page-sub">${esc(holdReason(line.blockReason))}</p>` : ""}
        </td>
      </tr>
    `;
  }).join("");
}

function ordersHash(view, month) {
  const params = new URLSearchParams();
  if (view && view !== "all") params.set("view", view);
  if (month) params.set("month", month);
  const query = params.toString();
  return query ? `#/orders?${query}` : "#/orders";
}

async function renderOrders(me) {
  const { dash, health } = await chrome(me);
  const { lines } = await api("/api/orders");
  const view = route().query.get("view") || "all";
  const month = route().query.get("month") || "";
  const months = [...new Set(lines.map((line) => dubaiMonth(line.paidAt)).filter(Boolean))].sort().reverse();
  if (isYearMonth(month) && !months.includes(month)) months.unshift(month);
  const tab = (key, label) => `<button type="button" data-tab="${key}" aria-selected="${view === key ? "true" : "false"}">${label}</button>`;
  app.innerHTML = shell(me, dash, health, `
    <div class="page-head">
      <div>
        <h1>Orders</h1>
        <p class="page-sub">Paid orders arrive from Shopify. Ready to pay can go into a settlement. Waiting is not ready yet. Nirvan Earth products are not paid to a vendor.</p>
      </div>
      <div class="page-actions">
        <button class="secondary" id="qualify" type="button">Check which orders are ready</button>
        <button class="secondary" id="sync" type="button">Refresh from Shopify</button>
      </div>
    </div>
    <p class="msg" id="msg"></p>
    <section class="card">
      <div class="tabs" role="tablist">
        ${tab("all", "All")}
        ${tab("payable", "Ready to pay")}
        ${tab("held", "Waiting")}
        ${tab("own", "Nirvan Earth")}
      </div>
      <div class="month-picks order-months" role="group" aria-label="Choose a month">
        <button class="month-pick" type="button" data-order-month="" aria-pressed="${month ? "false" : "true"}">All months</button>
        ${months.map((item) => `<button class="month-pick" type="button" data-order-month="${esc(item)}" aria-pressed="${month === item ? "true" : "false"}">${esc(shortMonth(item))}</button>`).join("")}
      </div>
      <div class="filters">
        <input id="filter" placeholder="Search order, product, or vendor" aria-label="Search orders" />
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th></th><th>Order</th><th>Product</th><th>Vendor</th><th class="num">Paid to vendor</th><th>Status</th></tr></thead>
          <tbody id="order-rows">
            ${orderPairs(lines) || `<tr data-static="empty"><td colspan="6"><div class="empty">No orders yet. They appear after Shopify sends a paid order.</div></td></tr>`}
            <tr id="filter-empty" hidden><td colspan="6"><div class="empty">Nothing matches this month or search.</div></tr>
          </tbody>
        </table>
      </div>
    </section>
  `);
  bindChrome();
  const say = (error) => { app.querySelector("#msg").textContent = error?.message || error || ""; };
  const applyFilter = () => {
    const selected = app.querySelector('.tabs button[aria-selected="true"]')?.dataset.tab || "all";
    const picked = app.querySelector(".order-months [aria-pressed='true']")?.dataset.orderMonth || "";
    const query = app.querySelector("#filter").value.trim().toLowerCase();
    let visible = 0;
    for (const row of app.querySelectorAll("#order-rows tr[data-line]")) {
      const text = row.dataset.search || "";
      const show = (selected === "all" || row.dataset[selected] === "true")
        && (!picked || row.dataset.month === picked)
        && text.includes(query);
      row.hidden = !show;
      if (show) visible += 1;
      const detail = app.querySelector(`tr[data-detail="${row.dataset.line}"]`);
      if (detail) {
        detail.hidden = !show || app.querySelector(`[data-toggle="${row.dataset.line}"]`)?.getAttribute("aria-expanded") !== "true";
        if (!show) detail.hidden = true;
      }
    }
    const empty = app.querySelector("#filter-empty");
    if (empty) empty.hidden = visible !== 0 || !app.querySelector("#order-rows tr[data-line]");
  };
  for (const button of app.querySelectorAll(".tabs button")) {
    button.addEventListener("click", () => {
      for (const other of app.querySelectorAll(".tabs button")) other.setAttribute("aria-selected", "false");
      button.setAttribute("aria-selected", "true");
      const picked = app.querySelector(".order-months [aria-pressed='true']")?.dataset.orderMonth || "";
      history.replaceState(null, "", ordersHash(button.dataset.tab, picked));
      applyFilter();
    });
  }
  for (const button of app.querySelectorAll("[data-order-month]")) {
    button.addEventListener("click", () => {
      for (const other of app.querySelectorAll("[data-order-month]")) other.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-pressed", "true");
      const selected = app.querySelector('.tabs button[aria-selected="true"]')?.dataset.tab || "all";
      history.replaceState(null, "", ordersHash(selected, button.dataset.orderMonth || ""));
      applyFilter();
    });
  }
  for (const button of app.querySelectorAll("[data-toggle]")) {
    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", open ? "false" : "true");
      button.textContent = open ? "Details" : "Hide";
      const detail = app.querySelector(`tr[data-detail="${button.dataset.toggle}"]`);
      if (detail) detail.hidden = open;
    });
  }
  app.querySelector("#filter").addEventListener("input", applyFilter);
  applyFilter();
  app.querySelector("#sync").addEventListener("click", async () => {
    try {
      const result = await api("/api/sync", { method: "POST" });
      flash = `Shopify refresh finished. ${result.imported} orders updated.`;
      await render();
    } catch (error) { say(error); }
  });
  app.querySelector("#qualify").addEventListener("click", async () => {
    try {
      const result = await api("/api/requalify", { method: "POST" });
      const held = result.transferredUnchanged?.length
        ? ` ${result.transferredUnchanged.length} already paid product${result.transferredUnchanged.length === 1 ? "" : "s"} kept the paid amount.`
        : "";
      flash = `Checked ${result.updated} product${result.updated === 1 ? "" : "s"}.${held}`;
      await render();
    } catch (error) { say(error); }
  });
}

function vendorPayoutReady(vendor) {
  if (vendor.payoutMethod === "manual_bank") {
    return Boolean((vendor.bankLabel || "").trim() && /^\d{4}$/.test(vendor.bankLast4 || ""));
  }
  return Boolean(vendor.stripeAccountId && String(vendor.stripeAccountId).startsWith("acct_"));
}

function adviceRows(vendors) {
  return vendors.flatMap((vendor) => (vendor.invoices || []).map((invoice) => `<tr>
    <td>${esc(vendor.name)}</td>
    <td>${esc(invoice.number)}</td>
    <td class="num">${aed(invoice.amount)}</td>
    <td><a href="/api/lines/${esc(invoice.settlementLineId)}/invoice">Download statement</a></td>
  </tr>`)).join("");
}

async function renderVendors(me) {
  const { dash, health } = await chrome(me);
  const { vendors } = await api("/api/vendors");
  const advice = route().id === "advice";
  app.innerHTML = shell(me, dash, health, `
    <div class="page-head">
      <div>
        <h1>Vendors</h1>
        <p class="page-sub">Sellers arrive with their Shopify orders. Set VAT and how they are paid before the first settlement. The full bank account number is not stored.</p>
      </div>
      ${advice ? "" : `<button class="primary" id="add-vendor" type="button">Add vendor</button>`}
    </div>
    <nav class="tabs" aria-label="Vendor sections">
      <a href="#/vendors" aria-selected="${advice ? "false" : "true"}">Vendors</a>
      <a href="#/vendors/advice" aria-selected="${advice ? "true" : "false"}">Payment advice</a>
    </nav>
    ${advice ? `
      <section class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Vendor</th><th>Advice</th><th class="num">Net paid</th><th></th></tr></thead>
            <tbody>
              ${adviceRows(vendors) || `<tr><td colspan="4"><div class="empty">No payment advice yet. One is created after a payment.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    ` : `
      <section class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Seller id</th><th>VAT</th><th>How they are paid</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${vendors.map((vendor) => `
                <tr>
                  <td><strong>${esc(vendor.name)}</strong>${vendor.active ? "" : `<div class="muted">Inactive</div>`}</td>
                  <td>${esc(vendor.webkulSellerId || vendor.externalKey || "—")}</td>
                  <td>${vendor.vatRegistered ? badge("vat") : `<span class="badge">No VAT</span>`}</td>
                  <td>${badge(vendor.payoutMethod === "manual_bank" ? "manual_bank" : "stripe_connect")}</td>
                  <td>${vendorPayoutReady(vendor) ? badge("ready") : badge("missing")}</td>
                  <td><button class="secondary" type="button" data-edit-vendor="${esc(vendor.id)}">Edit</button></td>
                </tr>
              `).join("") || `<tr><td colspan="6"><div class="empty">No vendors yet. A new seller is added when Shopify sends their first order.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `}
    <div class="drawer-back" id="vendor-drawer" hidden>
      <form class="drawer" id="vendor-form">
        <div class="drawer-head">
          <h2 id="vendor-form-title">Edit vendor</h2>
          <button class="secondary" id="vendor-close" type="button">Close</button>
        </div>
        <p class="page-sub">Set VAT and payout before the first settlement. Sellers do not log in here.</p>
        <section class="drawer-section">
          <h3>Profile</h3>
          <div class="field"><label for="v-name">Name</label><input id="v-name" name="name" required /></div>
          <div class="field"><label for="v-seller">Seller id</label><input id="v-seller" name="webkulSellerId" /></div>
          <div class="field"><label for="v-email">Email</label><input id="v-email" name="email" type="email" /></div>
          <label class="check"><input id="v-active" name="active" type="checkbox" checked /> Active</label>
        </section>
        <section class="drawer-section">
          <h3>VAT</h3>
          <label class="check"><input id="v-vat" name="vatRegistered" type="checkbox" /> VAT registered</label>
          <p class="page-sub">Off until you confirm it. Shopify tax is not treated as vendor VAT while this is off.</p>
        </section>
        <section class="drawer-section">
          <h3>Payout</h3>
          <div class="field"><label for="v-method">How they are paid</label>
            <select id="v-method" name="payoutMethod">
              <option value="stripe_connect">Stripe</option>
              <option value="manual_bank">Bank transfer</option>
            </select>
          </div>
          <div id="payout-connect">
            <div class="field"><label for="v-acct">Stripe account</label><input id="v-acct" name="stripeAccountId" placeholder="acct_…" autocomplete="off" /></div>
            <p class="page-sub">Use this when Stripe pays the vendor. The account starts with acct_.</p>
          </div>
          <div id="payout-manual" hidden>
            <div class="field"><label for="v-bank">Bank name</label><input id="v-bank" name="bankLabel" placeholder="Bank name" autocomplete="off" /></div>
            <div class="field"><label for="v-last4">Last 4 digits</label><input id="v-last4" name="bankLast4" inputmode="numeric" maxlength="4" autocomplete="off" /></div>
            <p class="page-sub">You pay this vendor yourself, then mark the settlement as paid.</p>
          </div>
        </section>
        <p class="msg" id="msg"></p>
        <div class="drawer-actions">
          <button class="primary" type="submit">Save</button>
        </div>
      </form>
    </div>
  `);
  bindChrome();
  const byId = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const drawer = app.querySelector("#vendor-drawer");
  const form = app.querySelector("#vendor-form");

  function showPayoutFields() {
    const manual = form.payoutMethod.value === "manual_bank";
    app.querySelector("#payout-connect").hidden = manual;
    app.querySelector("#payout-manual").hidden = !manual;
  }

  function openVendor(vendor) {
    form.dataset.id = vendor?.id || "";
    app.querySelector("#vendor-form-title").textContent = vendor ? "Edit vendor" : "Add vendor";
    form.name.value = vendor?.name || "";
    form.webkulSellerId.value = vendor?.webkulSellerId || vendor?.externalKey || "";
    form.email.value = vendor?.email || "";
    form.active.checked = vendor ? vendor.active !== false : true;
    form.vatRegistered.checked = Boolean(vendor?.vatRegistered);
    form.payoutMethod.value = vendor?.payoutMethod === "manual_bank" ? "manual_bank" : "stripe_connect";
    form.stripeAccountId.value = vendor?.stripeAccountId || "";
    form.bankLabel.value = vendor?.bankLabel || "";
    form.bankLast4.value = vendor?.bankLast4 || "";
    app.querySelector("#msg").textContent = "";
    showPayoutFields();
    drawer.hidden = false;
    form.name.focus();
  }

  function closeVendor() {
    drawer.hidden = true;
  }

  app.querySelector("#add-vendor")?.addEventListener("click", () => openVendor(null));
  for (const button of app.querySelectorAll("[data-edit-vendor]")) {
    button.addEventListener("click", () => openVendor(byId.get(button.dataset.editVendor)));
  }
  app.querySelector("#vendor-close").addEventListener("click", closeVendor);
  drawer.addEventListener("click", (event) => {
    if (event.target === drawer) closeVendor();
  });
  form.payoutMethod.addEventListener("change", showPayoutFields);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const manual = form.payoutMethod.value === "manual_bank";
    const body = {
      name: form.name.value,
      webkulSellerId: form.webkulSellerId.value,
      email: form.email.value,
      active: form.active.checked,
      vatRegistered: form.vatRegistered.checked,
      payoutMethod: manual ? "manual_bank" : "stripe_connect",
      stripeAccountId: manual ? undefined : form.stripeAccountId.value,
      bankLabel: manual ? form.bankLabel.value : undefined,
      bankLast4: manual ? form.bankLast4.value : undefined,
    };
    const id = form.dataset.id;
    try {
      await api(id ? `/api/vendors/${id}` : "/api/vendors", { method: id ? "PATCH" : "POST", body });
      closeVendor();
      await render();
    } catch (error) {
      app.querySelector("#msg").textContent = error.message;
    }
  });
}

function activitySentence(event) {
  const payload = event.payloadJson && typeof event.payloadJson === "object" ? event.payloadJson : {};
  const base = ACTION_LABEL[event.action] || String(event.action || "Recorded").replaceAll(".", " ").replaceAll("_", " ");
  const extra = payload.yearMonth ? ` · ${monthLabel(payload.yearMonth)}` : payload.subject ? ` · ${payload.subject}` : "";
  return `${base}${extra}`;
}

function mailState(delivery) {
  if (delivery === "sent") return `<span class="badge success">Sent</span>`;
  if (delivery === "sent_unconfirmed") return `<span class="badge warning">Sent, not confirmed</span>`;
  if (delivery === "failed") return `<span class="badge critical">Failed</span>`;
  if (delivery === "blocked") return `<span class="badge warning">Not sent</span>`;
  if (delivery === "outbox") return `<span class="badge info">Saved here only</span>`;
  return badge(delivery);
}

async function renderAudit(me) {
  const { dash, health } = await chrome(me);
  const { events, emails } = await api("/api/audit");
  app.innerHTML = shell(me, dash, health, `
    <div class="page-head">
      <div>
        <h1>Activity</h1>
        <p class="page-sub">What happened, and whether the approver email was sent. Mail goes to ${esc(dash.notifyEmail)}.</p>
      </div>
    </div>
    <section class="card">
      <div class="card-head">What happened</div>
      <ol class="timeline">
        ${events.map((event) => `
          <li>
            <time>${when(event.createdAt)}</time>
            <div><strong>${esc(activitySentence(event))}</strong><div class="muted">${esc(actorName(event.actorEmail))}</div></div>
          </li>
        `).join("") || `<li><div class="empty">Nothing recorded yet.</div></li>`}
      </ol>
    </section>
    <section class="card">
      <div class="card-head">Email to the approver</div>
      ${emails.map((email) => `
        <article class="mail">
          <div>${mailState(email.delivery)} <span class="muted">${when(email.createdAt)} · ${esc(email.toEmail)}</span></div>
          <strong>${esc(email.subject)}</strong>
          <details class="fold"><summary>Read message</summary><div class="card-body"><pre>${esc(email.body)}</pre></div></details>
        </article>
      `).join("") || `<div class="empty">No email yet. Sending a settlement for approval writes the first one.</div>`}
    </section>
  `);
  bindChrome();
}

function actorName(email) {
  const labels = {
    "shopify-webhook": "Shopify",
    schedule: "Automatic check",
    system: "Automatic",
    shopify_oauth: "Shopify",
    "stripe-webhook": "Stripe",
  };
  return labels[email] || email || "Automatic";
}

function healthCard(title, ok, body) {
  return `<section class="card"><h2>${esc(title)} ${ok ? badge("ready") : badge("missing")}</h2>${body}</section>`;
}

async function renderHealth(me) {
  const { dash, health } = await chrome(me);
  const shopifyOk = Boolean(health.shopify && health.shopify.connected);
  const email = health.email || {};
  const emailOk = email.provider === "resend" && email.fromConfigured;
  app.innerHTML = shell(me, dash, health, `
    <div class="page-head">
      <div>
        <h1>System</h1>
        <p class="page-sub">Check this only when orders stop arriving or a payment cannot be sent. Rules in use: ${esc(health.rulesVersion || "—")}.</p>
      </div>
    </div>
    <div class="health-grid">
      ${healthCard("Records", health.db.ok, `<p>${health.db.ok ? "Orders and settlements can be saved." : "Orders and settlements cannot be saved right now."}</p><p class="msg">${esc(health.db.error || "")}</p>`)}
      ${healthCard("Shopify", shopifyOk, `
        <p>${shopifyOk ? "Connected. New paid orders arrive on their own." : "Not connected. New orders will not arrive."}</p>
        <p class="muted">Shop ${esc(health.shopify?.shop || dash.shop)}</p>
        ${shopifyOk ? "" : `<p><a href="${esc(health.shopify?.authPath || "/shopify/auth")}">Connect Shopify</a></p>`}
      `)}
      ${healthCard("Stripe", health.stripe.ok, `
        <p>${health.stripe.ok ? (health.stripe.mode === "stripe-test" ? "Practice mode. Stripe answered." : "Stripe answered.") : "Stripe did not answer."}</p>
        <p>Available to pay ${health.stripe.availableAed == null ? "—" : aed(health.stripe.availableAed)}</p>
        <p>${health.liveBlocked || health.stripe.liveTransfersBlocked ? `<span class="badge warning">Real payouts are off</span>` : `<span class="badge success">Real payouts are on</span>`}</p>
        <p class="msg">${esc(health.stripe.error || "")}</p>
      `)}
      ${healthCard("New orders", shopifyOk, `
        <p>${shopifyOk ? "Paid, changed, and refunded orders are picked up automatically." : "Connect Shopify before new orders can arrive."}</p>
      `)}
      ${healthCard("Email", emailOk, `
        <p>${email.provider === "resend" ? "Approval emails can be sent." : "Messages are saved in Activity and are not emailed."}</p>
        <p>To ${esc(email.notifyEmail || dash.notifyEmail || "—")}</p>
        <p class="muted">${email.fromConfigured ? "The sending address is set." : "The sending address is not a real mailbox yet."}</p>
      `)}
      <section class="card">
        <h2>Sellers saved ${badge(health.webkul && health.webkul.sellersInLedger ? "ready" : "missing")}</h2>
        <p>${health.webkul && health.webkul.sellersInLedger ? health.webkul.sellersInLedger : "None yet"}</p>
        <p class="muted">A seller is saved from the Shopify order. There is no separate seller login.</p>
      </section>
    </div>
  `);
  bindChrome();
}

async function renderOwner(me) {
  const { dash, health } = await chrome(me);
  const period = chosenMonth("period");
  const report = await api(`/api/reports/owner?period=${encodeURIComponent(period)}`);
  let earlier = null;
  if (!report.lineCount) {
    const previous = shiftMonth(period, -1);
    try {
      const previousReport = await api(`/api/reports/owner?period=${encodeURIComponent(previous)}`);
      if (previousReport.lineCount) earlier = previousReport;
    } catch {
      earlier = null;
    }
  }
  app.innerHTML = shell(me, dash, health, `
    <div class="page-head">
      <div>
        <h1>Own sales</h1>
        <p class="page-sub">Nirvan Earth products and gift hampers. These are not paid to a vendor.</p>
      </div>
      <a class="secondary" href="/api/reports/owner?period=${esc(period)}&format=csv">Download list</a>
    </div>
    ${monthSwitchHtml(period)}
    ${earlier ? `<div class="banner info"><div><strong>${esc(monthLabel(earlier.period))} has ${earlier.lineCount} own sale${earlier.lineCount === 1 ? "" : "s"}</strong>${esc(monthLabel(period))} has none. The total in ${esc(monthLabel(earlier.period))} is ${aed(earlier.gross)}. <button class="secondary" type="button" id="show-earlier">Show ${esc(monthLabel(earlier.period))}</button></div></div>` : ""}
    <div class="metrics">
      <div class="metric"><div class="label">Month</div><div class="value" style="font-size:18px">${esc(monthLabel(report.period || period))}</div></div>
      <div class="metric"><div class="label">Gross</div><div class="value">${aed(report.gross)}</div></div>
      <div class="metric"><div class="label">Discounts</div><div class="value">${aed(report.discount)}</div></div>
      <div class="metric"><div class="label">Tax</div><div class="value">${aed(report.tax)}</div></div>
    </div>
    <section class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Order</th><th>Product</th><th class="num">Gross</th><th class="num">Discount</th><th class="num">Tax</th></tr></thead>
          <tbody>
            ${(report.lines || []).map((line) => `<tr><td>${esc(line.orderNumber)}</td><td class="wrap">${esc(line.title)}</td><td class="num">${aed(line.gross)}</td><td class="num">${aed(line.discount)}</td><td class="num">${aed(line.tax)}</td></tr>`).join("") || `<tr><td colspan="5"><div class="empty">No Nirvan Earth sales in ${esc(monthLabel(period))}.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `);
  bindChrome();
  for (const button of app.querySelectorAll("[data-month]")) {
    button.addEventListener("click", () => goMonth(`#/owner?period=${encodeURIComponent(button.dataset.month)}`));
  }
  app.querySelector("#show-earlier")?.addEventListener("click", () => {
    goMonth(`#/owner?period=${encodeURIComponent(earlier.period)}`);
  });
}

function percent(rate) {
  const number = Number(rate);
  if (!Number.isFinite(number)) return "—";
  return `${Math.round(number * 1000) / 10}%`.replace(/\.0%$/, "%");
}

async function renderRules(me) {
  const { dash, health } = await chrome(me);
  const { versions } = await api("/api/rules");
  const active = versions.find((version) => version.status === "active");
  const payload = active && active.payload ? active.payload : {};
  app.innerHTML = shell(me, dash, health, `
    <div class="page-head">
      <div>
        <h1>Rules</h1>
        <p class="page-sub">The rules used for new settlements. A change applies only after ${esc(dash.notifyEmail || "the approver")} approves it.</p>
      </div>
      <div>${active ? badge("active") : badge("missing")}</div>
    </div>
    <div class="banner warning"><div><strong>Closed settlements stay as they were</strong>Approving a new version does not change a closed settlement and does not change money already paid.</div></div>
    <div class="metrics">
      <div class="metric"><div class="label">Version</div><div class="value" style="font-size:18px">${esc(active?.versionLabel || payload.rulesVersion || "—")}</div></div>
      <div class="metric"><div class="label">Commission</div><div class="value">${esc(percent(payload.commissionRate ?? 0.2))}</div></div>
      <div class="metric"><div class="label">Return window</div><div class="value">${esc(payload.returnWindowDays ?? 14)} days</div></div>
      <div class="metric"><div class="label">Vendor VAT in the amount</div><div class="value" style="font-size:16px">${payload.includeVendorVatInNet === false ? "Left out" : "Added"}</div></div>
    </div>
    <section class="card">
      <div class="card-body">
        <p>Delivery already included in a product price is paid to the vendor and is not part of the commission. Delivery a customer pays on a Nirvan Earth product stays with Nirvan Earth: AED 19 when those products are under AED 199, and free from AED 199. Other vendors' products do not add that charge.</p>
        <p class="muted">Own-product tags: ${esc((payload.platformOwnTags || []).join(", ") || "—")}</p>
        <p class="muted">Own-product names: ${esc((payload.platformOwnVendorNames || []).join(", ") || "—")}</p>
      </div>
    </section>
    <details class="fold">
      <summary>Propose a new version</summary>
      <form id="rule-form" class="propose">
        <div class="form-grid">
          <div class="field"><label for="rule-version">Name for this version</label><input id="rule-version" name="versionLabel" value="${esc(payload.rulesVersion || "2026-11-11")}" /></div>
          <div class="field"><label for="rule-rate">Commission percent</label><input id="rule-rate" name="commissionRate" value="${esc(Math.round(Number(payload.commissionRate ?? 0.2) * 1000) / 10)}" inputmode="decimal" /></div>
          <div class="field"><label for="rule-window">Return window, in days</label><input id="rule-window" name="returnWindowDays" value="${esc(payload.returnWindowDays ?? 14)}" inputmode="numeric" /></div>
        </div>
        <div class="form-grid" style="margin-top:12px">
          <div class="field"><label for="rule-tags">Own-product tags</label><input id="rule-tags" name="platformOwnTags" value="${esc((payload.platformOwnTags || []).join(", "))}" /></div>
          <div class="field"><label for="rule-names">Own-product vendor names</label><input id="rule-names" name="platformOwnVendorNames" value="${esc((payload.platformOwnVendorNames || []).join(", "))}" /></div>
        </div>
        <p class="page-sub">Type 20 for a 20% commission. Separate tags and names with commas.</p>
        <label class="check"><input type="checkbox" name="includeVendorVatInNet" ${payload.includeVendorVatInNet === false ? "" : "checked"} /> Add vendor VAT back into the vendor amount</label>
        <label class="check"><input type="checkbox" name="excludeDeliveryAllowanceFromCommissionBase" ${payload.excludeDeliveryAllowanceFromCommissionBase === false ? "" : "checked"} /> Leave delivery allowance out of the commission base</label>
        <div class="form-grid" style="margin-top:12px">
          <div class="field"><label for="rule-from">Starts on</label><input id="rule-from" name="effectiveFrom" type="date" value="${esc(String(payload.effectiveFrom || "").slice(0, 10))}" /></div>
          <div class="field"><label for="rule-notes">Why this change</label><input id="rule-notes" name="notes" value="${esc(payload.notes || "")}" /></div>
        </div>
        <div class="page-actions" style="margin-top:12px"><button class="primary" type="submit">Save this change</button></div>
        <p class="msg" id="msg"></p>
      </form>
    </details>
    <section class="card">
      <div class="card-head">Version history</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Version</th><th>Status</th><th>Commission</th><th></th></tr></thead>
          <tbody>
            ${versions.map((version) => `<tr>
              <td>${esc(version.versionLabel)}</td>
              <td>${badge(version.status)}</td>
              <td>${esc(version.payload && version.payload.commissionRate != null ? percent(version.payload.commissionRate) : "")}</td>
              <td>
                ${version.status === "draft" ? `<button class="secondary" type="button" data-submit="${esc(version.id)}">Send for approval</button>` : ""}
                ${version.status === "pending_approval" && me.approver ? `<button class="primary" type="button" data-approve="${esc(version.id)}">Approve</button>` : ""}
              </td>
            </tr>`).join("") || `<tr><td colspan="4"><div class="empty">No rule versions yet.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `);
  bindChrome();
  const say = (error) => {
    const node = app.querySelector("#msg");
    if (node) node.textContent = error?.message || error || "";
  };
  app.querySelector("#rule-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = {
      versionLabel: form.versionLabel.value,
      commissionRate: Number(form.commissionRate.value) / 100,
      returnWindowDays: Number(form.returnWindowDays.value),
      platformOwnTags: form.platformOwnTags.value.split(",").map((item) => item.trim()).filter(Boolean),
      platformOwnVendorNames: form.platformOwnVendorNames.value.split(",").map((item) => item.trim()).filter(Boolean),
      includeVendorVatInNet: form.includeVendorVatInNet.checked,
      excludeDeliveryAllowanceFromCommissionBase: form.excludeDeliveryAllowanceFromCommissionBase.checked,
      effectiveFrom: form.effectiveFrom.value,
      notes: form.notes.value,
      rulesVersion: form.versionLabel.value,
    };
    try { await api("/api/rules", { method: "POST", body }); await render(); } catch (error) { say(error); }
  });
  for (const button of app.querySelectorAll("[data-submit]")) {
    button.addEventListener("click", async () => {
      try { await api(`/api/rules/${button.dataset.submit}/submit`, { method: "POST" }); await render(); } catch (error) { say(error); }
    });
  }
  for (const button of app.querySelectorAll("[data-approve]")) {
    button.addEventListener("click", async () => {
      const ok = await ask("Approve this rule?", "New settlements use it after approval. Closed settlements and money already paid stay as they are.", "Approve");
      if (!ok) return;
      try { await api(`/api/rules/${button.dataset.approve}/approve`, { method: "POST" }); await render(); } catch (error) { say(error); }
    });
  }
}

function showFlash() {
  const node = app.querySelector("#msg");
  if (!node || !flash) return;
  node.textContent = flash;
  flash = "";
}

async function render() {
  const { path, id } = route();
  if (path === "login") return loginView();
  const me = await ensureUser();
  if (!me) return;
  if (path === "health" || path === "system") await renderHealth(me);
  else if (path === "orders") await renderOrders(me);
  else if (path === "vendors") await renderVendors(me);
  else if (path === "audit" || path === "activity") await renderAudit(me);
  else if (path === "packs" || path === "settlements") await (id ? renderPack(me) : renderSettlements(me));
  else if (path === "owner") await renderOwner(me);
  else if (path === "rules") await renderRules(me);
  else await renderHome(me);
  showFlash();
}

window.addEventListener("hashchange", () => {
  render().catch((error) => { app.innerHTML = `<p class="msg">${esc(error.message)}</p>`; });
});
render().catch((error) => { app.innerHTML = `<p class="msg">${esc(error.message)}</p>`; });
