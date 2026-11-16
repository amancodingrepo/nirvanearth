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
  qualified: "Ready to Pay",
  blocked: "Waiting (Hold)",
  held: "Waiting",
  open: "Waiting",
  packed: "In Settlement",
  pending_approval: "Needs Approval",
  approved: "Approved",
  draft: "Review Draft",
  executing: "Paying...",
  transferred: "Paid",
  closed: "Completed",
  failed: "Failed",
  active: "Active",
  manual_paid: "Paid by Bank",
  awaiting_manual_payment: "Awaiting Bank",
  manual_bank: "Bank Transfer",
  stripe_connect: "Stripe",
  vat: "VAT Registered",
  ready: "Ready",
  missing: "Missing Setup",
  own: "Nirvan Hamper / Own",
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
  const [{ packs }, { vendors }, { lines }] = await Promise.all([
    api("/api/packs"),
    api("/api/vendors"),
    api("/api/orders"),
  ]);
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

  // Group month orders vendor-wise for clear table calculation
  const monthLines = (lines || []).filter((l) => !l.isPlatformOwn && dubaiMonth(l.paidAt) === month);
  const vendorMap = new Map();
  for (const v of vendors) {
    if (v.active !== false) {
      vendorMap.set(v.id, {
        vendorId: v.id,
        vendorName: v.name,
        vatRegistered: Boolean(v.vatRegistered),
        payoutMethod: v.payoutMethod || "stripe_connect",
        stripeAccountId: v.stripeAccountId || null,
        bankLabel: v.bankLabel || null,
        bankLast4: v.bankLast4 || null,
        lines: [],
        packLine: null,
      });
    }
  }

  if (pack?.lines) {
    for (const pl of pack.lines) {
      if (!vendorMap.has(pl.vendorId)) {
        vendorMap.set(pl.vendorId, {
          vendorId: pl.vendorId,
          vendorName: pl.vendorName,
          vatRegistered: Boolean(pl.vatRegistered),
          payoutMethod: pl.payoutMethod,
          stripeAccountId: pl.stripeAccountId,
          bankLabel: null,
          bankLast4: null,
          lines: [],
          packLine: pl,
        });
      } else {
        vendorMap.get(pl.vendorId).packLine = pl;
      }
    }
  }

  for (const line of monthLines) {
    if (!line.vendorId) continue;
    if (!vendorMap.has(line.vendorId)) {
      vendorMap.set(line.vendorId, {
        vendorId: line.vendorId,
        vendorName: line.vendorName || "Vendor",
        vatRegistered: Boolean(line.vatRegistered),
        payoutMethod: "stripe_connect",
        stripeAccountId: null,
        bankLabel: null,
        bankLast4: null,
        lines: [line],
        packLine: null,
      });
    } else {
      vendorMap.get(line.vendorId).lines.push(line);
    }
  }

  const activeVendorSummaries = Array.from(vendorMap.values())
    .filter((item) => item.lines.length > 0 || item.packLine != null)
    .sort((a, b) => a.vendorName.localeCompare(b.vendorName));

  const vendorRows = activeVendorSummaries.map((item) => {
    const count = item.lines.length || item.packLine?.orderLineCount || 0;
    const baseSales = item.lines.length > 0
      ? item.lines.reduce((sum, l) => sum + Number(l.commissionBase), 0)
      : (item.packLine ? Number(item.packLine.commissionBaseSum) : 0);
    const commission = item.lines.length > 0
      ? item.lines.reduce((sum, l) => sum + Number(l.commissionAmount), 0)
      : (item.packLine ? Number(item.packLine.commissionSum) : 0);
    const delivery = item.lines.length > 0
      ? item.lines.reduce((sum, l) => sum + Number(l.deliveryAllowance), 0)
      : (item.packLine ? Number(item.packLine.shippingSum) : 0);
    const vat = item.lines.length > 0
      ? item.lines.reduce((sum, l) => sum + Number(l.vendorVat), 0)
      : 0;
    const net = item.lines.length > 0
      ? item.lines.reduce((sum, l) => sum + Number(l.vendorNet), 0)
      : (item.packLine ? Number(item.packLine.vendorNetSum) : 0);
    const grossSold = item.lines.length > 0
      ? item.lines.reduce((sum, l) => sum + (Number(l.gross) - Number(l.discount)), 0)
      : (baseSales + delivery + vat);
    const status = item.packLine?.status || (item.lines.length > 0 && item.lines.every((l) => l.status === "qualified") ? "qualified" : "held");

    return {
      ...item,
      count,
      grossSold,
      baseSales,
      commission,
      delivery,
      vat,
      net,
      status,
    };
  });

  const totalOrders = vendorRows.reduce((sum, r) => sum + r.count, 0);
  const totalBase = vendorRows.reduce((sum, r) => sum + r.baseSales, 0);
  const totalCommission = vendorRows.reduce((sum, r) => sum + r.commission, 0);
  const totalDelivery = vendorRows.reduce((sum, r) => sum + r.delivery, 0);
  const totalVat = vendorRows.reduce((sum, r) => sum + r.vat, 0);
  const totalNet = vendorRows.reduce((sum, r) => sum + r.net, 0);

  app.innerHTML = shell(me, dash, health, `
    <div class="page-head">
      <div>
        <h1>${esc(monthLabel(month))}</h1>
        <p class="page-sub">Monthly overview and vendor settlement calculations. Choose another month using the buttons below.</p>
      </div>
      ${pack ? `<a class="primary" href="#/settlements/${esc(pack.id)}">Open Settlement Pack</a>` : `<a class="secondary" href="#/settlements?month=${esc(month)}">Create Settlement</a>`}
    </div>

    <!-- 10-year-old friendly guide callout -->
    <div class="simple-guide-box">
      <h3>👋 Welcome to Nirvan Earth Settlements</h3>
      <p>
        Here is how the money works: When shoppers buy items on Nirvan Earth, money comes in through Shopify.
        Nirvan Earth keeps a store fee (20%) to run the marketplace. The remaining 80%, plus any delivery allowance and VAT, belongs to the vendor.
        Every calculation below is simple arithmetic: <strong>Base Price − 20% Fee + Delivery + VAT = Vendor Payout</strong>.
      </p>
    </div>

    ${monthSwitchHtml(month)}
    <div class="metrics">
      <div class="metric">
        <div class="label">Total Owed to Vendors</div>
        <div class="value">${pack ? aed(pack.rulePayableTotal ?? pack.payableTotal) : aed(totalNet)}</div>
        <div class="subvalue">Net payout to partner sellers</div>
      </div>
      <div class="metric">
        <div class="label">Nirvan Earth Fee (20%)</div>
        <div class="value">${pack ? aed(pack.commissionTotal) : aed(totalCommission)}</div>
        <div class="subvalue">Retained store commission</div>
      </div>
      <div class="metric">
        <div class="label">Settlement Status</div>
        <div class="value">${pack ? badge(pack.status) : badge("missing")}</div>
        <div class="subvalue">${pack ? "Monthly pack generated" : "No pack created yet"}</div>
      </div>
      <div class="metric">
        <div class="label">Total Order Items</div>
        <div class="value">${totalOrders}</div>
        <div class="subvalue">Across ${vendorRows.length} active vendors</div>
      </div>
    </div>

    <!-- Easy math formula banner for complete clarity -->
    <div class="calc-callout">
      <div>
        <strong>💡 Easy Math: How Vendor Payout is Calculated (Step-by-Step)</strong>
        <p class="page-sub" style="margin:2px 0 6px;">Every column in the table below adds and subtracts directly so you can verify each amount with simple math:</p>
        <div class="calc-formula">
          <span class="pill-math base">Base Product Price</span>
          <span style="font-size:16px">−</span>
          <span class="pill-math minus">20% Nirvan Earth Fee</span>
          <span style="font-size:16px">+</span>
          <span class="pill-math plus">Delivery in Price</span>
          <span style="font-size:16px">+</span>
          <span class="pill-math plus">Vendor VAT</span>
          <span style="font-size:16px">=</span>
          <span class="pill-math equals">Vendor Net Payout</span>
        </div>
      </div>
    </div>

    <!-- Vendor-wise calculations table -->
    <section class="card">
      <div class="card-head" style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span>Vendor Settlement Table (${esc(monthLabel(month))})</span>
          <span class="muted" style="display:block;font-size:12px;font-weight:normal;margin-top:2px;">
            Click <strong>View Orders</strong> to see individual customer order items for each vendor.
          </span>
        </div>
        ${pack ? `<a class="ghost" href="#/settlements/${esc(pack.id)}">Open Settlement Pack →</a>` : ""}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Vendor</th>
              <th class="num">Orders</th>
              <th class="num">Base Product</th>
              <th class="num">20% Nirvan Fee (-)</th>
              <th class="num">Delivery in Price (+)</th>
              <th class="num">Vendor VAT (+)</th>
              <th class="num">Vendor Payout (=)</th>
              <th>Status</th>
              <th>Orders</th>
            </tr>
          </thead>
          <tbody>
            ${vendorRows.length > 0 ? vendorRows.map((r) => `
              <tr>
                <td class="wrap">
                  <strong>${esc(r.vendorName)}</strong>
                  <div style="margin-top:2px;">
                    ${r.vatRegistered ? badge("vat") : `<span class="badge">No VAT</span>`}
                    ${badge(r.payoutMethod === "manual_bank" ? "manual_bank" : "stripe_connect")}
                  </div>
                </td>
                <td class="num"><strong>${r.count}</strong></td>
                <td class="num">${aed(r.baseSales)}</td>
                <td class="num" style="color:var(--critical)">- ${aed(r.commission)}</td>
                <td class="num" style="color:var(--info)">+ ${aed(r.delivery)}</td>
                <td class="num" style="color:var(--info)">+ ${aed(r.vat)}</td>
                <td class="num" style="font-weight:700;color:var(--success);font-size:14px;">= ${aed(r.net)}</td>
                <td>${badge(r.status)}</td>
                <td>
                  <button class="ghost" type="button" data-toggle-vendor-orders="${esc(r.vendorId)}" data-count="${r.count}" aria-expanded="false" style="font-size:12px;padding:4px 8px;">
                    View Orders (${r.count}) ▾
                  </button>
                </td>
              </tr>
              <tr class="vendor-orders-row" data-vendor-orders="${esc(r.vendorId)}" hidden>
                <td colspan="9">
                  <div style="padding:4px 8px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                      <strong>Orders for ${esc(r.vendorName)} in ${esc(monthLabel(month))}:</strong>
                      <a class="ghost" href="#/orders?vendor=${encodeURIComponent(r.vendorName)}&month=${encodeURIComponent(month)}" style="font-size:12px;">
                        Open in Orders screen →
                      </a>
                    </div>
                    ${r.lines.length > 0 ? `
                      <table class="sub-table">
                        <thead>
                          <tr>
                            <th>Order #</th>
                            <th>Item Title</th>
                            <th>Paid Date</th>
                            <th class="num">Base Price</th>
                            <th class="num">20% Fee (-)</th>
                            <th class="num">Delivery (+)</th>
                            <th class="num">VAT (+)</th>
                            <th class="num">Vendor Gets (=)</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${r.lines.map((ol) => `
                            <tr>
                              <td><strong>${esc(ol.orderNumber || ol.shopifyOrderId)}</strong></td>
                              <td>${esc(ol.title)} ${ol.quantity > 1 ? `<span class="muted">× ${ol.quantity}</span>` : ""}</td>
                              <td>${when(ol.paidAt)}</td>
                              <td class="num">${aed(ol.commissionBase)}</td>
                              <td class="num" style="color:var(--critical)">- ${aed(ol.commissionAmount)}</td>
                              <td class="num" style="color:var(--info)">+ ${aed(ol.deliveryAllowance)}</td>
                              <td class="num" style="color:var(--info)">+ ${aed(ol.vendorVat)}</td>
                              <td class="num" style="font-weight:700;color:var(--success)">= ${aed(ol.vendorNet)}</td>
                              <td>${badge(ol.status)}</td>
                            </tr>
                          `).join("")}
                        </tbody>
                      </table>
                    ` : `<div class="empty">Order line details are archived in the settlement pack.</div>`}
                  </div>
                </td>
              </tr>
            `).join("") : `
              <tr>
                <td colspan="9">
                  <div class="empty">No vendor orders found for ${esc(monthLabel(month))}. Once orders are placed in Shopify, they will appear here with calculations.</div>
                </td>
              </tr>
            `}
          </tbody>
          ${vendorRows.length > 0 ? `
            <tfoot>
              <tr>
                <td><strong>TOTAL (${vendorRows.length} vendors)</strong></td>
                <td class="num"><strong>${totalOrders}</strong></td>
                <td class="num"><strong>${aed(totalBase)}</strong></td>
                <td class="num" style="color:var(--critical)"><strong>- ${aed(totalCommission)}</strong></td>
                <td class="num" style="color:var(--info)"><strong>+ ${aed(totalDelivery)}</strong></td>
                <td class="num" style="color:var(--info)"><strong>+ ${aed(totalVat)}</strong></td>
                <td class="num" style="color:var(--success);font-size:14px"><strong>= ${aed(totalNet)}</strong></td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          ` : ""}
        </table>
      </div>
    </section>

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
  for (const button of app.querySelectorAll("[data-toggle-vendor-orders]")) {
    button.addEventListener("click", () => {
      const vendorId = button.dataset.toggleVendorOrders;
      const row = app.querySelector(`tr[data-vendor-orders="${vendorId}"]`);
      if (row) {
        const isHidden = row.hidden;
        row.hidden = !isHidden;
        button.setAttribute("aria-expanded", isHidden ? "true" : "false");
        button.textContent = isHidden ? `Hide Orders (${button.dataset.count}) ▴` : `View Orders (${button.dataset.count}) ▾`;
      }
    });
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
  const totOrders = lines.reduce((s, l) => s + l.orderLineCount, 0);
  const totBase = lines.reduce((s, l) => s + l.commissionBaseSum, 0);
  const totComm = lines.reduce((s, l) => s + l.commissionSum, 0);
  const totDeliv = lines.reduce((s, l) => s + l.shippingSum, 0);
  const totNet = lines.reduce((s, l) => s + (l.ruleNetSum ?? l.vendorNetSum), 0);
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Vendor</th>
            <th>How they are paid</th>
            <th class="num">Orders</th>
            <th class="num">Base Sales</th>
            <th class="num">20% Fee (-)</th>
            <th class="num">Delivery (+)</th>
            <th class="num">Vendor Payout (=)</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${lines.map((line) => `
            <tr>
              <td class="wrap">
                <strong>${esc(line.vendorName)}</strong>
                <div style="margin-top:2px;">${line.vatRegistered ? badge("vat") : `<span class="badge">No VAT</span>`}</div>
              </td>
              <td class="wrap">
                ${badge(line.payoutMethod === "manual_bank" ? "manual_bank" : "stripe_connect")}
                <div class="muted">${line.payoutMethod === "manual_bank" ? "You pay this vendor from the bank" : (line.stripeAccountId ? `Stripe account saved` : "Add a Stripe account before paying")}</div>
                ${line.stripeAccountId ? `<div class="muted">Account ${esc(line.stripeAccountId)}</div>` : ""}
              </td>
              <td class="num"><strong>${line.orderLineCount}</strong></td>
              <td class="num">${aed(line.commissionBaseSum)}</td>
              <td class="num" style="color:var(--critical)">- ${aed(line.commissionSum)}</td>
              <td class="num" style="color:var(--info)">+ ${aed(line.shippingSum)}</td>
              <td class="num" style="font-weight:700;color:var(--success);font-size:14px;">= ${aed(line.ruleNetSum ?? line.vendorNetSum)}${line.ruleNetSum != null && Math.abs(line.ruleNetSum - line.vendorNetSum) > 0.001 ? `<div class="muted" style="font-weight:normal;font-size:11px;">Already paid ${aed(line.vendorNetSum)}</div>` : ""}</td>
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
        <tfoot>
          <tr>
            <td colspan="2"><strong>TOTAL</strong></td>
            <td class="num"><strong>${totOrders}</strong></td>
            <td class="num"><strong>${aed(totBase)}</strong></td>
            <td class="num" style="color:var(--critical)"><strong>- ${aed(totComm)}</strong></td>
            <td class="num" style="color:var(--info)"><strong>+ ${aed(totDeliv)}</strong></td>
            <td class="num" style="color:var(--success);font-size:14px;"><strong>= ${aed(totNet)}</strong></td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
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
    const deliveryAllowance = Number(line.deliveryAllowance || 0);
    const vendorVat = Number(line.vendorVat || 0);
    const commissionAmount = Number(line.commissionAmount || 0);
    const commissionBase = Number(line.commissionBase || 0);
    const vendorNet = Number(line.vendorNet || 0);

    return `
      <tr data-line="${esc(line.id)}" data-payable="${flags.payable}" data-held="${flags.held}" data-own="${flags.own}" data-month="${esc(dubaiMonth(line.paidAt))}" data-vendor="${esc(line.isPlatformOwn ? "Nirvan Earth" : (line.vendorName || ""))}" data-search="${esc(search)}">
        <td><button class="ghost" type="button" data-toggle="${esc(line.id)}" aria-expanded="false">Details ▾</button></td>
        <td><strong>${esc(line.orderNumber || line.shopifyOrderId)}</strong></td>
        <td class="wrap">${esc(line.title)} ${line.quantity > 1 ? `<span class="muted">× ${line.quantity}</span>` : ""}</td>
        <td>${line.isPlatformOwn ? "🎁 Nirvan Earth" : `<strong>${esc(line.vendorName || "—")}</strong>`}</td>
        <td class="num" style="font-weight:700;color:var(--success);font-size:14px;">${line.isPlatformOwn ? "—" : aed(line.vendorNet)}</td>
        <td>${badge(line.status)}${line.isPlatformOwn ? ` ${badge("own")}` : ""}</td>
      </tr>
      <tr class="detail" data-detail="${esc(line.id)}" hidden>
        <td colspan="6">
          <div class="receipt-card">
            <div class="receipt-head">
              <div>
                <strong>🧾 Calculation Breakdown for Order #${esc(line.orderNumber || line.shopifyOrderId)}</strong>
                <div class="muted">Customer item: ${esc(line.title)} (${line.quantity} item${line.quantity > 1 ? "s" : ""}) · Sold on ${when(line.paidAt)}</div>
              </div>
              <div>
                ${line.isPlatformOwn ? `<span class="badge info">🎁 Nirvan Earth Hamper (100% Retained)</span>` : `<span class="badge success">Vendor Payout: ${aed(vendorNet)}</span>`}
              </div>
            </div>

            ${line.isPlatformOwn ? `
              <div class="receipt-note" style="border-left-color: #2563eb;">
                🎁 <strong>Nirvan Earth Hamper / Own Product:</strong> All earnings from this item (${aed(line.gross)}) stay directly with Nirvan Earth. No commission is deducted and no vendor payout is made.
              </div>
            ` : `
              <!-- Visual math equation pill line -->
              <div class="calc-formula" style="margin-bottom: 16px;">
                <span class="pill-math base">Base Price: ${aed(commissionBase)}</span>
                <span style="color:var(--critical);font-weight:bold;">−</span>
                <span class="pill-math minus">Nirvan Fee: ${aed(commissionAmount)}</span>
                <span style="color:var(--info);font-weight:bold;">+</span>
                <span class="pill-math plus">Delivery in Price: ${aed(deliveryAllowance)}</span>
                <span style="color:var(--info);font-weight:bold;">+</span>
                <span class="pill-math plus">Vendor VAT: ${aed(vendorVat)}</span>
                <span style="color:var(--success);font-weight:bold;">=</span>
                <span class="pill-math equals">Vendor Payout: ${aed(vendorNet)}</span>
              </div>

              <div class="receipt-math-grid">
                <div>
                  <span class="muted" style="font-size:11.5px;text-transform:uppercase;">1. Product Sale</span>
                  <div style="font-size:16px;font-weight:700;">${aed(line.gross)}</div>
                  ${Number(line.discount) > 0 ? `<div class="muted" style="font-size:11px;">Includes -${aed(line.discount)} customer discount</div>` : ""}
                </div>
                <div>
                  <span class="muted" style="font-size:11.5px;text-transform:uppercase;color:var(--critical);">2. Store Fee (Nirvan Earth)</span>
                  <div style="font-size:16px;font-weight:700;color:var(--critical);">- ${aed(commissionAmount)}</div>
                  <div class="muted" style="font-size:11px;">Platform & processing fee</div>
                </div>
                <div>
                  <span class="muted" style="font-size:11.5px;text-transform:uppercase;color:var(--info);">3. Delivery in Price</span>
                  <div style="font-size:16px;font-weight:700;color:var(--info);">+ ${aed(deliveryAllowance)}</div>
                  <div class="muted" style="font-size:11px;">${deliveryAllowance > 0 ? "Paid to vendor for dispatch" : "No delivery in product price"}</div>
                </div>
                <div>
                  <span class="muted" style="font-size:11.5px;text-transform:uppercase;color:var(--info);">4. Vendor VAT (Taxes)</span>
                  <div style="font-size:16px;font-weight:700;color:var(--info);">+ ${aed(vendorVat)}</div>
                  <div class="muted" style="font-size:11px;">${line.vatRegistered ? "Vendor is VAT registered" : "Vendor has no VAT"}</div>
                </div>
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 12px;">
                  <span class="muted" style="font-size:11.5px;text-transform:uppercase;color:var(--success);">5. Final Vendor Payout</span>
                  <div style="font-size:18px;font-weight:800;color:var(--success);">= ${aed(vendorNet)}</div>
                  <div class="muted" style="font-size:11px;color:var(--success);">Sent to vendor in settlement pack</div>
                </div>
              </div>

              <div class="receipt-note">
                💡 <strong>Order Timing & Status:</strong>
                ${line.fulfilledAt ? `Delivered to customer on <strong>${when(line.fulfilledAt)}</strong>.` : "Not marked delivered in Shopify yet."}
                ${line.returnWindowEndsAt ? ` The 14-day customer return window ends on <strong>${when(line.returnWindowEndsAt)}</strong>. Once that day passes without customer returns, this payout is fully unlocked for payment.` : ""}
                ${line.blockReason ? `<div style="color:var(--critical);font-weight:600;margin-top:6px;">⚠️ Reason currently held: ${esc(holdReason(line.blockReason))}</div>` : ""}
              </div>
            `}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function ordersHash(view, month, vendor) {
  const params = new URLSearchParams();
  if (view && view !== "all") params.set("view", view);
  if (month) params.set("month", month);
  if (vendor) params.set("vendor", vendor);
  const query = params.toString();
  return query ? `#/orders?${query}` : "#/orders";
}

async function renderOrders(me) {
  const { dash, health } = await chrome(me);
  const { lines } = await api("/api/orders");
  const view = route().query.get("view") || "all";
  const month = route().query.get("month") || "";
  const vendorParam = route().query.get("vendor") || "";
  const months = [...new Set(lines.map((line) => dubaiMonth(line.paidAt)).filter(Boolean))].sort().reverse();
  if (isYearMonth(month) && !months.includes(month)) months.unshift(month);
  const vendorList = [...new Set(lines.map((l) => l.isPlatformOwn ? "Nirvan Earth" : (l.vendorName || "")).filter(Boolean))].sort();
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
      <div class="filters" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <input id="filter" placeholder="Search order, product, or vendor" aria-label="Search orders" style="flex:1;min-width:200px;" />
        <select id="vendor-filter" aria-label="Filter by vendor" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:white;font-size:13px;">
          <option value="">All vendors (${vendorList.length})</option>
          ${vendorList.map((v) => `<option value="${esc(v)}" ${vendorParam.toLowerCase() === v.toLowerCase() ? "selected" : ""}>${esc(v)}</option>`).join("")}
        </select>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th></th><th>Order</th><th>Product</th><th>Vendor</th><th class="num">Paid to vendor</th><th>Status</th></tr></thead>
          <tbody id="order-rows">
            ${orderPairs(lines) || `<tr data-static="empty"><td colspan="6"><div class="empty">No orders yet. They appear after Shopify sends a paid order.</div></td></tr>`}
            <tr id="filter-empty" hidden><td colspan="6"><div class="empty">Nothing matches this month, vendor, or search.</div></tr>
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
    const pickedVendor = (app.querySelector("#vendor-filter")?.value || "").trim().toLowerCase();
    const query = app.querySelector("#filter").value.trim().toLowerCase();
    let visible = 0;
    for (const row of app.querySelectorAll("#order-rows tr[data-line]")) {
      const text = row.dataset.search || "";
      const matchesVendor = !pickedVendor || (row.dataset.vendor || "").toLowerCase() === pickedVendor;
      const show = (selected === "all" || row.dataset[selected] === "true")
        && (!picked || row.dataset.month === picked)
        && matchesVendor
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
  app.querySelector("#filter")?.addEventListener("input", applyFilter);
  app.querySelector("#vendor-filter")?.addEventListener("change", () => {
    const selected = app.querySelector('.tabs button[aria-selected="true"]')?.dataset.tab || "all";
    const picked = app.querySelector(".order-months [aria-pressed='true']")?.dataset.orderMonth || "";
    const vendor = app.querySelector("#vendor-filter")?.value || "";
    history.replaceState(null, "", ordersHash(selected, picked, vendor));
    applyFilter();
  });
  for (const button of app.querySelectorAll(".tabs button")) {
    button.addEventListener("click", () => {
      for (const other of app.querySelectorAll(".tabs button")) other.setAttribute("aria-selected", "false");
      button.setAttribute("aria-selected", "true");
      const picked = app.querySelector(".order-months [aria-pressed='true']")?.dataset.orderMonth || "";
      const vendor = app.querySelector("#vendor-filter")?.value || "";
      history.replaceState(null, "", ordersHash(button.dataset.tab, picked, vendor));
      applyFilter();
    });
  }
  for (const button of app.querySelectorAll("[data-order-month]")) {
    button.addEventListener("click", () => {
      for (const other of app.querySelectorAll("[data-order-month]")) other.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-pressed", "true");
      const selected = app.querySelector('.tabs button[aria-selected="true"]')?.dataset.tab || "all";
      const vendor = app.querySelector("#vendor-filter")?.value || "";
      history.replaceState(null, "", ordersHash(selected, button.dataset.orderMonth || "", vendor));
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
        <h1>Partner Vendors</h1>
        <p class="page-sub">Independent sellers and brands offering items on Nirvan Earth. Configure their VAT rates, delivery allowances, and payout channels.</p>
      </div>
      ${advice ? "" : `<button class="primary" id="add-vendor" type="button">+ Add Vendor</button>`}
    </div>

    <!-- 10-year-old friendly guide callout -->
    <div class="simple-guide-box">
      <h3>🏪 What is a Partner Vendor?</h3>
      <p>
        Vendors are partner creators (like artisanal candle makers, honey producers, or organic skincare brands) who sell on Nirvan Earth.
        Whenever a shopper buys their item, Nirvan keeps a standard 20% platform fee and sends the vendor their net payout.
        Below, you can customize each vendor's VAT (5%), custom delivery fee, or agreed commission rate!
      </p>
    </div>

    <nav class="tabs" aria-label="Vendor sections">
      <a href="#/vendors" aria-selected="${advice ? "false" : "true"}">All Vendors (${vendors.length})</a>
      <a href="#/vendors/advice" aria-selected="${advice ? "true" : "false"}">Payment Statements</a>
    </nav>
    ${advice ? `
      <section class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Vendor</th><th>Statement / Advice #</th><th class="num">Net Paid</th><th></th></tr></thead>
            <tbody>
              ${adviceRows(vendors) || `<tr><td colspan="4"><div class="empty">No payment statements yet. They are generated automatically after a settlement is paid.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    ` : `
      <section class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vendor Name</th>
                <th>Seller ID</th>
                <th>VAT Setting</th>
                <th class="num">Delivery Allowance</th>
                <th class="num">Store Commission</th>
                <th>Payout Channel</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${vendors.map((vendor) => `
                <tr>
                  <td>
                    <strong>${esc(vendor.name)}</strong>
                    ${vendor.active ? "" : `<span class="badge warning" style="margin-left:6px;font-size:10px;">Inactive</span>`}
                    ${vendor.email ? `<div class="muted" style="font-size:11px;">${esc(vendor.email)}</div>` : ""}
                  </td>
                  <td><code>${esc(vendor.webkulSellerId || vendor.externalKey || "—")}</code></td>
                  <td>
                    ${vendor.vatRegistered
                      ? (vendor.vatRate != null ? `<span class="badge success">${(vendor.vatRate * 100).toFixed(0)}% VAT</span>` : badge("vat"))
                      : `<span class="badge">No VAT</span>`}
                  </td>
                  <td class="num">
                    ${vendor.defaultDeliveryAllowance != null ? `AED ${Number(vendor.defaultDeliveryAllowance).toFixed(2)}` : `<span class="muted">—</span>`}
                  </td>
                  <td class="num">
                    ${vendor.commissionRate != null ? `<span class="badge info">${(vendor.commissionRate * 100).toFixed(0)}% (Custom)</span>` : `<span class="badge">20% (Default)</span>`}
                  </td>
                  <td>${badge(vendor.payoutMethod === "manual_bank" ? "manual_bank" : "stripe_connect")}</td>
                  <td>${vendorPayoutReady(vendor) ? badge("ready") : badge("missing")}</td>
                  <td><button class="secondary" type="button" data-edit-vendor="${esc(vendor.id)}">Edit</button></td>
                </tr>
              `).join("") || `<tr><td colspan="8"><div class="empty">No vendors yet. A new seller is automatically registered when Shopify sends their first order.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    `}
    <div class="drawer-back" id="vendor-drawer" hidden>
      <form class="drawer" id="vendor-form">
        <div class="drawer-head">
          <h2 id="vendor-form-title">Edit Vendor</h2>
          <button class="secondary" id="vendor-close" type="button">Close</button>
        </div>
        <p class="page-sub">Configure seller payout options and tax rules. Sellers do not log in to this admin dashboard.</p>
        <section class="drawer-section">
          <h3>1. Basic Profile</h3>
          <div class="field"><label for="v-name">Vendor or Brand Name</label><input id="v-name" name="name" required placeholder="e.g. Desert Honey Co." /></div>
          <div class="field"><label for="v-seller">Shopify / Webkul Seller ID</label><input id="v-seller" name="webkulSellerId" placeholder="e.g. 52" /></div>
          <div class="field"><label for="v-email">Contact Email</label><input id="v-email" name="email" type="email" placeholder="vendor@example.com" /></div>
          <label class="check"><input id="v-active" name="active" type="checkbox" checked /> Active (receives orders)</label>
        </section>

        <section class="drawer-section">
          <h3>2. VAT & Tax Settings</h3>
          <label class="check"><input id="v-vat" name="vatRegistered" type="checkbox" /> VAT Registered Seller</label>
          <p class="page-sub">When unchecked, Shopify taxes are ignored for this vendor. When checked, VAT is passed through to the vendor.</p>
          <div class="field" id="vat-rate-field" style="margin-top:10px;">
            <label for="v-vat-rate">Custom VAT Rate (%)</label>
            <input id="v-vat-rate" name="vatRate" type="number" min="0" max="100" step="0.01" placeholder="e.g. 5 for 5%" />
            <p class="page-sub">Enter 5 for standard UAE 5% VAT. Leave blank to use Shopify tax line values directly.</p>
          </div>
        </section>

        <section class="drawer-section">
          <h3>3. Delivery Allowance</h3>
          <div class="field">
            <label for="v-delivery">Default Delivery in Product Price (AED)</label>
            <input id="v-delivery" name="defaultDeliveryAllowance" type="number" min="0" step="0.01" placeholder="e.g. 20" />
            <p class="page-sub">If this vendor includes delivery in their product prices, enter the AED amount here. It will be excluded from the 20% commission and paid 100% to the vendor.</p>
          </div>
        </section>

        <section class="drawer-section">
          <h3>4. Custom Commission Rate</h3>
          <div class="field">
            <label for="v-commission">Custom Store Fee (%)</label>
            <input id="v-commission" name="commissionRate" type="number" min="0" max="100" step="0.1" placeholder="Leave empty for marketplace default (20%)" />
            <p class="page-sub">Leave blank to use the standard 20% platform fee. If this vendor has a negotiated rate (e.g. 15%), enter 15.</p>
          </div>
        </section>

        <section class="drawer-section">
          <h3>5. Payout Channel</h3>
          <div class="field"><label for="v-method">How should this vendor be paid?</label>
            <select id="v-method" name="payoutMethod">
              <option value="stripe_connect">Stripe Connect (Automated Transfer)</option>
              <option value="manual_bank">Direct Bank Transfer (Manual)</option>
            </select>
          </div>
          <div id="payout-connect">
            <div class="field"><label for="v-acct">Stripe Connected Account ID</label><input id="v-acct" name="stripeAccountId" placeholder="acct_1..." autocomplete="off" /></div>
            <p class="page-sub">When approved, Nirvan transfers money directly to their Stripe account in 1 click.</p>
          </div>
          <div id="payout-manual" hidden>
            <div class="field"><label for="v-bank">Bank Name & Branch</label><input id="v-bank" name="bankLabel" placeholder="e.g. Emirates NBD" autocomplete="off" /></div>
            <div class="field"><label for="v-last4">Bank Account Last 4 Digits</label><input id="v-last4" name="bankLast4" inputmode="numeric" maxlength="4" placeholder="e.g. 4821" autocomplete="off" /></div>
            <p class="page-sub">You pay this vendor through your corporate bank portal, then click "I have paid" in the settlement.</p>
          </div>
        </section>
        <p class="msg" id="msg"></p>
        <div class="drawer-actions">
          <button class="primary" type="submit">Save Vendor Settings</button>
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
    app.querySelector("#vendor-form-title").textContent = vendor ? "Edit Vendor" : "Add Vendor";
    form.name.value = vendor?.name || "";
    form.webkulSellerId.value = vendor?.webkulSellerId || vendor?.externalKey || "";
    form.email.value = vendor?.email || "";
    form.active.checked = vendor ? vendor.active !== false : true;
    form.vatRegistered.checked = Boolean(vendor?.vatRegistered);
    form.vatRate.value = vendor?.vatRate != null ? (Number(vendor.vatRate) * 100).toFixed(2).replace(/\.00$/, "") : "";
    form.defaultDeliveryAllowance.value = vendor?.defaultDeliveryAllowance != null ? String(Number(vendor.defaultDeliveryAllowance)) : "";
    form.commissionRate.value = vendor?.commissionRate != null ? (Number(vendor.commissionRate) * 100).toFixed(2).replace(/\.00$/, "") : "";
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
      vatRate: form.vatRate.value.trim() !== "" ? Number(form.vatRate.value) / 100 : null,
      defaultDeliveryAllowance: form.defaultDeliveryAllowance.value.trim() !== "" ? Number(form.defaultDeliveryAllowance.value) : null,
      commissionRate: form.commissionRate.value.trim() !== "" ? Number(form.commissionRate.value) / 100 : null,
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
  const netEarnings = Math.max(0, Number(report.gross || 0) - Number(report.discount || 0));

  app.innerHTML = shell(me, dash, health, `
    <div class="page-head">
      <div>
        <h1>🎁 Nirvan Products & Gift Hampers</h1>
        <p class="page-sub">Exclusive products and gift hampers sold directly by Nirvan Earth. 100% of these sales stay with Nirvan Earth — zero vendor payouts!</p>
      </div>
      <a class="secondary" href="/api/reports/owner?period=${esc(period)}&format=csv">Download CSV Report</a>
    </div>

    <!-- 10-year-old friendly guide callout -->
    <div class="simple-guide-box">
      <h3>🎁 What are Own Sales & Gift Hampers?</h3>
      <p>
        These are gift boxes, hampers, and special collections created directly by Nirvan Earth.
        Because there is no third-party seller involved, <strong>zero commission is charged and no vendor payout is made</strong>.
        All proceeds from these sales remain 100% with Nirvan Earth!
      </p>
    </div>

    ${monthSwitchHtml(period)}
    ${earlier ? `<div class="banner info"><div><strong>${esc(monthLabel(earlier.period))} has ${earlier.lineCount} own sale${earlier.lineCount === 1 ? "" : "s"}</strong>${esc(monthLabel(period))} has none. The total in ${esc(monthLabel(earlier.period))} is ${aed(earlier.gross)}. <button class="secondary" type="button" id="show-earlier">Show ${esc(monthLabel(earlier.period))}</button></div></div>` : ""}
    <div class="metrics">
      <div class="metric">
        <div class="label">Gross Sales</div>
        <div class="value">${aed(report.gross)}</div>
        <div class="subvalue">${report.lineCount || 0} hamper/own items sold</div>
      </div>
      <div class="metric">
        <div class="label">Customer Discounts</div>
        <div class="value">${aed(report.discount)}</div>
        <div class="subvalue">Coupons & cart discounts</div>
      </div>
      <div class="metric">
        <div class="label">Taxes (VAT)</div>
        <div class="value">${aed(report.tax)}</div>
        <div class="subvalue">Taxes collected</div>
      </div>
      <div class="metric">
        <div class="label">Net Kept by Nirvan Earth</div>
        <div class="value" style="color:var(--success);font-size:24px;">${aed(netEarnings)}</div>
        <div class="subvalue">100% retained revenue</div>
      </div>
    </div>
    <section class="card">
      <div class="card-head">Items Sold in ${esc(monthLabel(report.period || period))}</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Order #</th><th>Item Title</th><th class="num">Sold For</th><th class="num">Discount</th><th class="num">Tax</th><th class="num">Net Kept (=)</th></tr></thead>
          <tbody>
            ${(report.lines || []).map((line) => {
              const itemNet = Math.max(0, Number(line.gross || 0) - Number(line.discount || 0));
              return `<tr>
                <td><strong>${esc(line.orderNumber)}</strong></td>
                <td class="wrap">${esc(line.title)}</td>
                <td class="num">${aed(line.gross)}</td>
                <td class="num" style="color:var(--critical)">${Number(line.discount) > 0 ? `- ${aed(line.discount)}` : "—"}</td>
                <td class="num">${aed(line.tax)}</td>
                <td class="num" style="font-weight:700;color:var(--success);">= ${aed(itemNet)}</td>
              </tr>`;
            }).join("") || `<tr><td colspan="6"><div class="empty">No Nirvan Earth own sales or hampers in ${esc(monthLabel(period))}.</div></td></tr>`}
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
  const currentCommPct = Math.round(Number(payload.commissionRate ?? 0.2) * 1000) / 10;
  const currentWindowDays = Number(payload.returnWindowDays ?? 14);

  app.innerHTML = shell(me, dash, health, `
    <div class="page-head">
      <div>
        <h1>Marketplace Rules</h1>
        <p class="page-sub">The core rules governing how much Nirvan Earth keeps, when vendors get paid, and how gift hampers are handled.</p>
      </div>
      <div>${active ? badge("active") : badge("missing")}</div>
    </div>

    <!-- 10-year-old friendly guide callout -->
    <div class="simple-guide-box">
      <h3>⚙️ How Do Marketplace Rules Work? (Simple Explanation)</h3>
      <p>
        Think of Nirvan Earth like a big friendly shopping mall:
      </p>
      <ul>
        <li><strong>Store Commission (Default 20%):</strong> When a partner sells something for AED 100, Nirvan Earth keeps AED 20 to run the store, process card payments, and market products. The seller receives the remaining AED 80 (+ VAT & delivery).</li>
        <li><strong>Return Window (Default 14 Days):</strong> When a customer gets an item, they have 14 days to make sure it's perfect. Nirvan safely holds the seller's money during these 14 days so nobody loses money if there's a return!</li>
        <li><strong>Gift Hampers:</strong> Gift hampers made by Nirvan Earth are 100% our own — zero commission or vendor payouts!</li>
      </ul>
    </div>

    <!-- Direct 1-Click Editable Rules Card -->
    <section class="rules-editor-card">
      <h2>✏️ Quick Rule Settings (Instant Update)</h2>
      <p class="page-sub">You can adjust the store-wide commission percentage, customer return window, and delivery rules below. Click Save to activate immediately for all future settlements.</p>

      <form id="quick-rule-form" style="margin-top:16px;">
        <div class="form-grid">
          <div class="field">
            <label for="qr-commission">Store Commission Rate (%)</label>
            <input id="qr-commission" type="number" min="0" max="100" step="0.5" value="${currentCommPct}" required />
            <span class="hint">Standard store fee (e.g. 20 for 20%)</span>
          </div>
          <div class="field">
            <label for="qr-window">Customer Return Window (Days)</label>
            <input id="qr-window" type="number" min="0" max="90" step="1" value="${currentWindowDays}" required />
            <span class="hint">Days to hold payout before order is ready (e.g. 14)</span>
          </div>
          <div class="field">
            <label for="qr-tags">Own-Product Tags</label>
            <input id="qr-tags" value="${esc((payload.platformOwnTags || ["nirvan-own", "gift-hamper"]).join(", "))}" />
            <span class="hint">Comma-separated Shopify tags for 100% Nirvan items</span>
          </div>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:20px;margin-top:16px;padding:12px 16px;background:#ffffff;border:1px solid #bfdbfe;border-radius:8px;">
          <label class="check">
            <input id="qr-vat" type="checkbox" ${payload.includeVendorVatInNet === false ? "" : "checked"} />
            Include Vendor VAT in Vendor Payout (Recommended)
          </label>
          <label class="check">
            <input id="qr-delivery" type="checkbox" ${payload.excludeDeliveryAllowanceFromCommissionBase === false ? "" : "checked"} />
            Pay Included Delivery Allowance to Vendor without Commission (Recommended)
          </label>
        </div>

        <!-- Live interactive calculation preview -->
        <div class="live-preview-box">
          <h4>🧮 Live Calculation Preview (Try Changing Commission Above)</h4>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <span>Sample customer item price: <strong>AED 100.00</strong></span>
            <span>→</span>
            <span id="preview-commission" style="color:var(--critical);font-weight:700;">Nirvan Fee: -AED 20.00 (20%)</span>
            <span>→</span>
            <span id="preview-net" style="color:var(--success);font-weight:750;font-size:15px;">Vendor Payout: = AED 80.00</span>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:12px;margin-top:18px;">
          <button class="primary" id="btn-save-quick-rule" type="submit" style="height:38px;padding:0 20px;font-size:13.5px;background:#15803d;border-color:#15803d;">
            💾 Save &amp; Activate Rules Immediately
          </button>
          <span class="msg" id="quick-rule-msg" style="margin:0;"></span>
        </div>
      </form>
    </section>

    <!-- Current active summary -->
    <div class="metrics">
      <div class="metric"><div class="label">Active Ruleset</div><div class="value" style="font-size:18px">${esc(active?.versionLabel || payload.rulesVersion || "—")}</div></div>
      <div class="metric"><div class="label">Platform Commission</div><div class="value">${esc(percent(payload.commissionRate ?? 0.2))}</div></div>
      <div class="metric"><div class="label">Return Holding Period</div><div class="value">${esc(payload.returnWindowDays ?? 14)} days</div></div>
      <div class="metric"><div class="label">Vendor VAT in Payout</div><div class="value" style="font-size:16px">${payload.includeVendorVatInNet === false ? "Excluded" : "Added to Payout"}</div></div>
    </div>

    <!-- Rule Versions Audit Table -->
    <section class="card">
      <div class="card-head">Rules History &amp; Audit Log</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Version Label</th><th>Status</th><th>Commission Rate</th><th>Return Window</th><th>Actions</th></tr></thead>
          <tbody>
            ${versions.map((version) => `<tr>
              <td><strong>${esc(version.versionLabel)}</strong></td>
              <td>${badge(version.status)}</td>
              <td>${esc(version.payload && version.payload.commissionRate != null ? percent(version.payload.commissionRate) : "20%")}</td>
              <td>${esc(version.payload?.returnWindowDays != null ? `${version.payload.returnWindowDays} days` : "14 days")}</td>
              <td>
                ${version.status === "draft" ? `<button class="secondary" type="button" data-submit="${esc(version.id)}">Send for approval</button>` : ""}
                ${version.status === "pending_approval" && me.approver ? `<button class="primary" type="button" data-approve="${esc(version.id)}">Approve</button>` : ""}
                ${version.status === "active" ? `<span class="badge success">In Use</span>` : ""}
              </td>
            </tr>`).join("") || `<tr><td colspan="5"><div class="empty">No rule versions recorded yet.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `);
  bindChrome();

  const commInput = app.querySelector("#qr-commission");
  const previewComm = app.querySelector("#preview-commission");
  const previewNet = app.querySelector("#preview-net");
  const updatePreview = () => {
    const rate = Math.max(0, Math.min(100, Number(commInput.value || 0)));
    const fee = (100 * (rate / 100)).toFixed(2);
    const net = (100 - fee).toFixed(2);
    if (previewComm) previewComm.textContent = `Nirvan Fee: -AED ${fee} (${rate}%)`;
    if (previewNet) previewNet.textContent = `Vendor Payout: = AED ${net}`;
  };
  commInput?.addEventListener("input", updatePreview);

  const quickForm = app.querySelector("#quick-rule-form");
  quickForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const msgNode = app.querySelector("#quick-rule-msg");
    const commRateVal = Number(app.querySelector("#qr-commission").value) / 100;
    const windowDaysVal = Number(app.querySelector("#qr-window").value);
    const tagsVal = app.querySelector("#qr-tags").value.split(",").map((s) => s.trim()).filter(Boolean);
    const vatVal = app.querySelector("#qr-vat").checked;
    const delivVal = app.querySelector("#qr-delivery").checked;

    if (msgNode) {
      msgNode.className = "msg";
      msgNode.textContent = "Saving and activating rules...";
    }

    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      await api("/api/rules/active", {
        method: "PUT",
        body: {
          rulesVersion: `v-${todayStr}`,
          commissionRate: commRateVal,
          returnWindowDays: windowDaysVal,
          includeVendorVatInNet: vatVal,
          excludeDeliveryAllowanceFromCommissionBase: delivVal,
          platformOwnTags: tagsVal,
          notes: `Updated directly by ${me.email} on ${todayStr}`,
        },
      });
      if (msgNode) {
        msgNode.className = "msg success";
        msgNode.textContent = "✅ Rules saved & activated successfully!";
      }
      setTimeout(() => render(), 700);
    } catch (err) {
      if (msgNode) {
        msgNode.className = "msg";
        msgNode.textContent = err.message || "Failed to update rules.";
      }
    }
  });

  for (const button of app.querySelectorAll("[data-submit]")) {
    button.addEventListener("click", async () => {
      try { await api(`/api/rules/${button.dataset.submit}/submit`, { method: "POST" }); await render(); } catch (error) { alert(error.message); }
    });
  }
  for (const button of app.querySelectorAll("[data-approve]")) {
    button.addEventListener("click", async () => {
      const ok = await ask("Approve this rule?", "New settlements will use it. Closed settlements and money already paid stay as they are.", "Approve");
      if (!ok) return;
      try { await api(`/api/rules/${button.dataset.approve}/approve`, { method: "POST" }); await render(); } catch (error) { alert(error.message); }
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
