const app = document.querySelector("#app");

const money = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED" });
const aed = (value) => money.format(Number(value || 0));

const ICONS = {
  home: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 9.2 10 3l7 6.2V17a1 1 0 0 1-1 1h-4.2v-4.6H8.2V18H4a1 1 0 0 1-1-1V9.2Z" stroke="currentColor" stroke-width="1.4"/></svg>',
  orders: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M6 8h8M6 11.5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  vendors: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="7" r="2.4" stroke="currentColor" stroke-width="1.4"/><path d="M4.5 16.2c.8-2.4 2.8-3.7 5.5-3.7s4.7 1.3 5.5 3.7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  audit: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6 3.5h6.2L16 7.3V16.5H6v-13Z" stroke="currentColor" stroke-width="1.4"/><path d="M12 3.8V7.4H15.5M8 11h5M8 13.5h3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  health: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 16s5-2.8 5-6.4A2.6 2.6 0 0 0 12.2 7c-.9 0-1.7.4-2.2 1.1C9.5 7.4 8.7 7 7.8 7A2.6 2.6 0 0 0 5 9.6C5 13.2 10 16 10 16Z" stroke="currentColor" stroke-width="1.4"/></svg>',
  rules: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6 3.5h6.2L16 7.3V16.5H6v-13Z" stroke="currentColor" stroke-width="1.4"/></svg>',
  owner: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1.5" stroke="currentColor" stroke-width="1.4"/></svg>',
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
  const raw = hash.replace(/^#\/?/, "");
  const [pathAndQuery, id] = raw.split("/");
  const path = (pathAndQuery || "home").split("?")[0];
  return { path, id: id ? id.split("?")[0] : undefined };
}

function badge(status) {
  const key = String(status || "open");
  const tone = ["qualified", "approved", "transferred", "closed", "active"].includes(key)
    ? "success"
    : ["blocked", "failed", "held"].includes(key)
      ? "critical"
      : ["pending_approval", "executing", "draft", "open", "packed"].includes(key)
        ? "warning"
        : "info";
  return `<span class="badge ${tone}">${esc(key.replaceAll("_", " "))}</span>`;
}

function shell(me, dash, body) {
  const { path } = route();
  const mode = dash.mode === "stripe-test" ? "Stripe test" : "Simulated";
  const item = (href, key, label, icon) =>
    `<a href="${href}" ${path === key ? 'aria-current="page"' : ""}>${ICONS[icon]}<span>${label}</span></a>`;
  return `
    <div class="admin">
      <aside class="nav">
        <div class="shop">
          <div class="mark">NE</div>
          <div><strong>Nirvan Earth</strong><span>Settlement</span></div>
        </div>
        ${item("#/", "home", "Home", "home")}
        ${item("#/orders", "orders", "Orders", "orders")}
        ${item("#/vendors", "vendors", "Vendors", "vendors")}
        ${item("#/owner", "owner", "Own sales", "owner")}
        ${item("#/rules", "rules", "Rules", "rules")}
        ${item("#/audit", "audit", "Audit", "audit")}
        ${item("#/health", "health", "Health", "health")}
        <div class="spacer"></div>
        <button class="link" id="logout" type="button">Sign out</button>
      </aside>
      <div class="frame">
        <header class="topbar">
          <div class="crumb">Settlement <strong>admin</strong></div>
          <div class="top-meta">
            <span>${esc(dash.shop)}</span>
            ${badge(dash.mode === "stripe-test" ? "test" : "simulated")}
            <span>${esc(me.email)}</span>
            <span class="muted">${esc(mode)}</span>
          </div>
        </header>
        <div class="page">${body}</div>
      </div>
    </div>
  `;
}

function ask(title, text, okLabel) {
  return new Promise((resolve) => {
    const node = document.createElement("div");
    node.className = "modal";
    node.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">${esc(title)}</h2>
        <p>${esc(text)}</p>
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

function loginView(error = "") {
  app.innerHTML = `
    <div class="login-screen">
      <form class="login-card" id="login-form">
        <div class="shop" style="padding:0 0 12px">
          <div class="mark">NE</div>
          <div><strong>Nirvan Earth</strong><span>Settlement admin</span></div>
        </div>
        <h1>Log in</h1>
        <p class="page-sub">Internal tool. Vendors stay in Webkul. Only the Nirvan Earth approver signs in here.</p>
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

function bindChrome() {
  const logout = document.querySelector("#logout");
  if (!logout) return;
  logout.addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" });
    loginView();
  });
}

async function renderHome(me) {
  const [dash, packs] = await Promise.all([api("/api/dashboard"), api("/api/packs")]);
  const month = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }).slice(0, 7);
  app.innerHTML = shell(me, dash, `
    <div class="page-head">
      <div>
        <h1>Home</h1>
        <p class="page-sub">Paid Shopify orders become a vendor statement. You approve it. Stripe Transfer runs after that.</p>
      </div>
      <form id="gen" class="page-actions">
        <input id="yearMonth" value="${esc(month)}" aria-label="Month" style="width:120px" />
        <button class="primary" type="submit">Generate pack</button>
      </form>
    </div>
    ${dash.mode === "simulated"
      ? `<div class="banner warning"><div><strong>Simulated transfers</strong>No Stripe test key is set. Execute records a transfer id and does not move money.</div></div>`
      : `<div class="banner info"><div><strong>Stripe test mode</strong>Transfers use the test platform balance only. Live keys stay blocked.</div></div>`}
    <div class="metrics">
      <div class="metric"><div class="label">Orders</div><div class="value">${dash.orders}</div></div>
      <div class="metric"><div class="label">Vendors</div><div class="value">${dash.vendors}</div></div>
      <div class="metric"><div class="label">Qualified lines</div><div class="value">${dash.qualified}</div></div>
      <div class="metric"><div class="label">Blocked lines</div><div class="value">${dash.blocked}</div></div>
    </div>
    <section class="card">
      <div class="card-head">Money rules</div>
      <div class="card-body">
        <ul class="rules">
          <li><strong>20%</strong> of product value after discount, excluding vendor VAT.</li>
          <li><strong>Shipping</strong> is stored on the order and is not in the 20%.</li>
          <li><strong>Own products and gift hampers</strong> never get a vendor payout.</li>
          <li><strong>Stripe fees</strong> stay with Nirvan Earth and are not deducted from vendor net.</li>
          <li><strong>Qualify</strong> only after fulfilment, the return window, and no open refund, chargeback, or dispute.</li>
          <li><strong>Pay</strong> on or after the 10th of the next month, and only after approval.</li>
        </ul>
      </div>
    </section>
    <p class="msg" id="msg"></p>
    <section class="card">
      <div class="card-head">Month packs <span class="muted">One pack per Dubai calendar month</span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Month</th><th>Status</th><th class="num">Payable</th><th class="num">Held</th><th>Payout from</th><th></th></tr></thead>
          <tbody>
            ${packs.packs.map((pack) => {
              const payout = payoutFor(pack.yearMonth);
              return `<tr>
                <td><a class="rowlink" href="#/packs/${esc(pack.id)}">${esc(pack.yearMonth)}</a></td>
                <td>${badge(pack.status)}</td>
                <td class="num">${aed(pack.payableTotal)}</td>
                <td class="num">${aed(pack.heldTotal)}</td>
                <td>${esc(payout.label)}</td>
                <td><a href="#/packs/${esc(pack.id)}">View statement</a></td>
              </tr>`;
            }).join("") || `<tr><td colspan="6"><div class="empty">No packs yet. Generate a month to build vendor statements.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `);
  bindChrome();
  const say = (error) => { app.querySelector("#msg").textContent = error?.message || error || ""; };
  app.querySelector("#gen").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await api("/api/packs/generate", {
        method: "POST",
        body: { yearMonth: app.querySelector("#yearMonth").value },
      });
      location.hash = `#/packs/${result.pack.id}`;
      await render();
    } catch (error) {
      say(error);
    }
  });
}

async function renderPack(me) {
  const { id } = route();
  const [{ pack }, dash] = await Promise.all([api(`/api/packs/${id}`), api("/api/dashboard")]);
  const payable = pack.lines.filter((line) => line.kind === "payable");
  const held = pack.lines.filter((line) => line.kind === "held");
  const payout = payoutFor(pack.yearMonth);
  const canSubmit = pack.status === "draft";
  const canApprove = pack.status === "pending_approval" && me.approver;
  const canExecute = (pack.status === "approved" || pack.status === "executing") && me.approver;
  app.innerHTML = shell(me, dash, `
    <div class="page-head">
      <div>
        <p class="page-sub"><a href="#/">Home</a> / Month pack</p>
        <h1>${esc(pack.yearMonth)}</h1>
        <p class="page-sub">Vendor statement. Submit, then only admin@nirvanearth.com can approve. Transfers run after approval.</p>
      </div>
      <div>${badge(pack.status)}</div>
    </div>
    <div class="banner ${payout.ready ? "info" : "warning"}">
      <div>
        <strong>${payout.ready ? "Payout window is open" : "Before the payout date"}</strong>
        Approved amounts are payable on or after ${esc(payout.label)}. ${payout.ready ? "The 10th has passed for this month." : "You can still approve now. In test mode, Execute records the transfer without waiting."}
      </div>
    </div>
    <div class="metrics">
      <div class="metric"><div class="label">Vendor net payable</div><div class="value">${aed(pack.payableTotal)}</div></div>
      <div class="metric"><div class="label">Commission 20%</div><div class="value">${aed(pack.commissionTotal)}</div></div>
      <div class="metric"><div class="label">Held, not payable</div><div class="value">${aed(pack.heldTotal)}</div></div>
      <div class="metric"><div class="label">Vendors in pack</div><div class="value">${pack.lines.length}</div></div>
    </div>
    <div class="actions" style="margin-bottom:16px">
      <button class="secondary" id="submit" type="button" ${canSubmit ? "" : "disabled"}>Submit for approval</button>
      <button class="primary" id="approve" type="button" ${canApprove ? "" : "disabled"}>Approve</button>
      <button class="primary" id="execute" type="button" ${canExecute ? "" : "disabled"}>Execute transfers</button>
    </div>
    <p class="msg" id="msg"></p>
    <section class="card">
      <div class="card-head">Qualified <span class="muted">These amounts can transfer</span></div>
      ${settlementTable(payable, dash.payoutTriggerEnabled)}
    </section>
    <section class="card">
      <div class="card-head">Blocked or held <span class="muted">Return window, refund, or missing account</span></div>
      ${settlementTable(held, false)}
    </section>
  `);
  bindChrome();
  const say = (error) => { app.querySelector("#msg").textContent = error?.message || error || ""; };
  app.querySelector("#submit").addEventListener("click", async () => {
    try { await api(`/api/packs/${id}/submit`, { method: "POST" }); await render(); } catch (error) { say(error); }
  });
  app.querySelector("#approve").addEventListener("click", async () => {
    const ok = await ask("Approve this pack?", `Approve ${aed(pack.payableTotal)} for ${pack.yearMonth}. Nothing moves until you execute.`, "Approve");
    if (!ok) return;
    try { await api(`/api/packs/${id}/approve`, { method: "POST", body: {} }); await render(); } catch (error) { say(error); }
  });
  app.querySelector("#execute").addEventListener("click", async () => {
    const ok = await ask("Execute transfers?", "Each approved vendor line is sent once. Running this again will not pay twice.", "Execute");
    if (!ok) return;
    try {
      const result = await api(`/api/packs/${id}/execute`, { method: "POST" });
      const failed = result.results.filter((item) => item.status === "failed");
      await render();
      if (failed.length) app.querySelector("#msg").textContent = failed.map((item) => `${item.vendorName}: ${item.error}`).join(" · ");
    } catch (error) { say(error); }
  });
  for (const button of app.querySelectorAll("[data-payout]")) {
    button.addEventListener("click", async () => {
      const ok = await ask("Request bank payout?", "This asks Stripe to pay the connected account out to its bank. It does not send another transfer.", "Request payout");
      if (!ok) return;
      try { await api(`/api/lines/${button.dataset.payout}/payout`, { method: "POST" }); await render(); } catch (error) { say(error); }
    });
  }
}

function settlementTable(lines, payoutsEnabled) {
  if (!lines.length) return `<div class="empty">None.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Vendor</th><th>VAT</th><th>Stripe account</th><th class="num">Lines</th>
            <th class="num">Base ex VAT</th><th class="num">Commission 20%</th><th class="num">Shipping</th>
            <th class="num">Vendor net</th><th>Status</th><th>Transfer</th>
          </tr>
        </thead>
        <tbody>
          ${lines.map((line) => `
            <tr>
              <td>
                <div class="stack">
                  <strong>${esc(line.vendorName)}</strong>
                  <span class="muted">${esc(line.feeNotes || "Stripe fees stay with Nirvan Earth")}</span>
                </div>
              </td>
              <td>${line.vatRegistered ? badge("vat") : `<span class="muted">No</span>`}</td>
              <td>${line.stripeAccountId ? esc(line.stripeAccountId) : `<span class="muted">No account</span>`}</td>
              <td class="num">${line.orderLineCount}</td>
              <td class="num">${aed(line.commissionBaseSum)}</td>
              <td class="num">${aed(line.commissionSum)}</td>
              <td class="num">${aed(line.shippingSum)}</td>
              <td class="num">${aed(line.vendorNetSum)}</td>
              <td>${badge(line.status)}${line.bankPayoutStatus ? `<div class="muted">${esc(line.bankPayoutStatus)}</div>` : ""}</td>
              <td>${line.stripeTransferId ? esc(line.stripeTransferId) : "—"}${line.invoiceNumber ? `<div><a href="/api/lines/${esc(line.id)}/invoice">Download statement</a></div>` : ""}${payoutsEnabled && line.status === "transferred" ? `<div><button type="button" data-payout="${esc(line.id)}">Request bank payout</button></div>` : ""}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function renderOrders(me) {
  const [{ lines }, dash] = await Promise.all([api("/api/orders"), api("/api/dashboard")]);
  app.innerHTML = shell(me, dash, `
    <div class="page-head">
      <div>
        <h1>Orders</h1>
        <p class="page-sub">Lines synced from Shopify. Seller comes from Webkul. Own products are excluded from payout.</p>
      </div>
      <div class="page-actions">
        <button class="secondary" id="qualify" type="button">Requalify</button>
        <button class="primary" id="sync" type="button">Sync Shopify</button>
      </div>
    </div>
    <p class="msg" id="msg"></p>
    <section class="card">
      <div class="tabs" role="tablist">
        <button type="button" data-tab="all" aria-selected="true">All</button>
        <button type="button" data-tab="qualified">Qualified</button>
        <button type="button" data-tab="blocked">Blocked</button>
        <button type="button" data-tab="own">Own products</button>
      </div>
      <div class="filters">
        <input id="filter" placeholder="Search product, order, or seller" aria-label="Search orders" />
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order</th><th>Product</th><th class="num">Qty</th><th>Seller</th>
              <th class="num">Gross</th><th class="num">Discount</th><th class="num">VAT</th>
              <th>Own</th><th class="num">Shipping</th><th class="num">Base</th><th class="num">20%</th>
              <th class="num">Net</th><th>Fulfilled</th><th>Return window</th><th>Status</th>
            </tr>
          </thead>
          <tbody id="order-rows">
            ${lines.map((line) => orderRow(line)).join("") || `<tr><td colspan="15"><div class="empty">No lines yet. Sync needs a Shopify Admin API token.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `);
  bindChrome();
  const say = (error) => { app.querySelector("#msg").textContent = error?.message || error || ""; };
  const applyFilter = () => {
    const tab = app.querySelector('.tabs button[aria-selected="true"]')?.dataset.tab || "all";
    const query = app.querySelector("#filter").value.trim().toLowerCase();
    for (const row of app.querySelectorAll("#order-rows tr[data-status]")) {
      const text = row.dataset.search || "";
      const tabOk = tab === "all"
        || (tab === "own" && row.dataset.own === "true")
        || row.dataset.status === tab;
      row.hidden = !(tabOk && text.includes(query));
    }
  };
  for (const button of app.querySelectorAll(".tabs button")) {
    button.addEventListener("click", () => {
      for (const other of app.querySelectorAll(".tabs button")) other.setAttribute("aria-selected", "false");
      button.setAttribute("aria-selected", "true");
      applyFilter();
    });
  }
  app.querySelector("#filter").addEventListener("input", applyFilter);
  app.querySelector("#sync").addEventListener("click", async () => {
    try {
      const result = await api("/api/sync", { method: "POST" });
      say({ message: `Imported ${result.imported} orders, ${result.linesUpserted} lines.` });
      await render();
    } catch (error) { say(error); }
  });
  app.querySelector("#qualify").addEventListener("click", async () => {
    try {
      const result = await api("/api/qualify", { method: "POST" });
      say({ message: `${result.qualified} lines qualified.` });
      await render();
    } catch (error) { say(error); }
  });
}

function orderRow(line) {
  const search = `${line.orderNumber || ""} ${line.shopifyOrderId} ${line.title} ${line.vendorName || ""}`.toLowerCase();
  return `
    <tr data-status="${esc(line.status)}" data-own="${line.isPlatformOwn}" data-search="${esc(search)}">
      <td>${esc(line.orderNumber || line.shopifyOrderId)}</td>
      <td>${esc(line.title)}</td>
      <td class="num">${line.quantity}</td>
      <td>${line.isPlatformOwn ? "Nirvan Earth" : esc(line.vendorName || "—")}</td>
      <td class="num">${aed(line.gross)}</td>
      <td class="num">${aed(line.discount)}</td>
      <td class="num">${line.vatRegistered ? aed(line.vendorVat) : "—"}</td>
      <td>${line.isPlatformOwn ? badge("own") : `<span class="muted">No</span>`}</td>
      <td class="num">${aed(line.orderShippingTotal)} <span class="muted">${esc(line.shippingAllocation)}</span></td>
      <td class="num">${aed(line.commissionBase)}</td>
      <td class="num">${aed(line.commissionAmount)}</td>
      <td class="num">${aed(line.vendorNet)}</td>
      <td>${when(line.fulfilledAt)}</td>
      <td>${when(line.returnWindowEndsAt)}</td>
      <td><div class="stack">${badge(line.status)}<span class="muted">${esc(line.blockReason || "")}</span></div></td>
    </tr>
  `;
}

async function renderVendors(me) {
  const [{ vendors }, dash] = await Promise.all([api("/api/vendors"), api("/api/dashboard")]);
  app.innerHTML = shell(me, dash, `
    <div class="page-head">
      <div>
        <h1>Vendors</h1>
        <p class="page-sub">Sellers do not log in here. VAT registered means VAT is taken out of the commission base. Stripe account is the Custom connected account.</p>
      </div>
    </div>
    <section class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Webkul id</th><th>Email</th><th>Active</th><th>VAT</th><th>Stripe account</th><th></th></tr>
          </thead>
          <tbody>
            ${vendors.map((vendor) => `
              <tr data-id="${esc(vendor.id)}">
                <td><strong>${esc(vendor.name)}</strong></td>
                <td>${esc(vendor.webkulSellerId || vendor.externalKey || "—")}</td>
                <td><input class="email" type="email" value="${esc(vendor.email || "")}" aria-label="Email for ${esc(vendor.name)}" /></td>
                <td><label class="check"><input class="active" type="checkbox" ${vendor.active ? "checked" : ""} /> Active</label></td>
                <td><label class="check"><input class="vat" type="checkbox" ${vendor.vatRegistered ? "checked" : ""} /> VAT</label></td>
                <td><input class="acct" type="text" value="${esc(vendor.stripeAccountId || "")}" placeholder="acct_…" aria-label="Stripe account for ${esc(vendor.name)}" /></td>
                <td><button class="secondary save" type="button">Save</button></td>
              </tr>
            `).join("") || `<tr><td colspan="7"><div class="empty">No vendors yet. They are created when an order sync finds a seller.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
    <section class="card">
      <div class="card-head">Add vendor</div>
      <div class="card-body">
        <form id="new-vendor" class="form-grid">
          <div class="field"><label for="v-name">Name</label><input id="v-name" name="name" required /></div>
          <div class="field"><label for="v-email">Email</label><input id="v-email" name="email" type="email" /></div>
          <div class="field"><label for="v-acct">Stripe account</label><input id="v-acct" name="stripeAccountId" placeholder="acct_test_…" /></div>
          <label class="check"><input name="vatRegistered" type="checkbox" /> VAT</label>
          <button class="primary" type="submit">Add vendor</button>
        </form>
        <p class="msg" id="msg"></p>
      </div>
    </section>
    <section class="card">
      <div class="card-head">Payment advice</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Vendor</th><th>Advice</th><th class="num">Net paid</th><th></th></tr></thead>
          <tbody>
            ${vendors.flatMap((vendor) => (vendor.invoices || []).map((invoice) => `<tr>
              <td>${esc(vendor.name)}</td>
              <td>${esc(invoice.number)}</td>
              <td class="num">${aed(invoice.amount)}</td>
              <td><a href="/api/lines/${esc(invoice.settlementLineId)}/invoice">Download statement</a></td>
            </tr>`)).join("") || `<tr><td colspan="4"><div class="empty">No payment advice yet. One is created after a transfer.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `);
  bindChrome();
  for (const row of app.querySelectorAll("tr[data-id]")) {
    row.querySelector(".save").addEventListener("click", async () => {
      try {
        await api(`/api/vendors/${row.dataset.id}`, {
          method: "PATCH",
          body: {
            email: row.querySelector(".email").value,
            active: row.querySelector(".active").checked,
            vatRegistered: row.querySelector(".vat").checked,
            stripeAccountId: row.querySelector(".acct").value,
          },
        });
        app.querySelector("#msg").textContent = "Saved. Requalify orders before the next pack so VAT is recalculated.";
      } catch (error) {
        app.querySelector("#msg").textContent = error.message;
      }
    });
  }
  app.querySelector("#new-vendor").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api("/api/vendors", {
        method: "POST",
        body: {
          name: form.name.value,
          email: form.email.value,
          stripeAccountId: form.stripeAccountId.value,
          vatRegistered: form.vatRegistered.checked,
        },
      });
      await render();
    } catch (error) {
      app.querySelector("#msg").textContent = error.message;
    }
  });
}

async function renderAudit(me) {
  const [{ events, emails }, dash] = await Promise.all([api("/api/audit"), api("/api/dashboard")]);
  app.innerHTML = shell(me, dash, `
    <div class="page-head">
      <div>
        <h1>Audit</h1>
        <p class="page-sub">Submit, approve, and execute are logged. Mail goes to ${esc(dash.notifyEmail)}. Without a mail key it stays in this outbox.</p>
      </div>
    </div>
    <section class="card">
      <div class="card-head">Email to the approver</div>
      ${emails.map((email) => `
        <article class="mail">
          <div class="muted">${when(email.createdAt)} · ${esc(email.delivery)} · ${esc(email.toEmail)}</div>
          <strong>${esc(email.subject)}</strong>
          <pre>${esc(email.body)}</pre>
        </article>
      `).join("") || `<div class="empty">No mail yet. Submit a pack to write the first one.</div>`}
    </section>
    <section class="card">
      <div class="card-head">Events</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>When</th><th>Action</th><th>Actor</th></tr></thead>
          <tbody>
            ${events.map((event) => `
              <tr>
                <td>${when(event.createdAt)}</td>
                <td>${esc(event.action)}</td>
                <td>${esc(event.actorEmail || "—")}</td>
              </tr>
            `).join("") || `<tr><td colspan="3"><div class="empty">No events yet.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `);
  bindChrome();
}

async function renderHealth(me) {
  const [health, dash] = await Promise.all([api("/api/health"), api("/api/dashboard")]);
  app.innerHTML = shell(me, dash, `
    <div class="page-head">
      <div>
        <h1>Health</h1>
        <p class="page-sub">Database and Stripe. This app sits beside Shopify, Webkul, and Stripe. It does not replace them.</p>
      </div>
    </div>
    <div class="metrics">
      <div class="metric"><div class="label">Database</div><div class="value">${health.db.ok ? "OK" : "Down"}</div></div>
      <div class="metric"><div class="label">Stripe</div><div class="value">${health.stripe.ok ? esc(health.stripe.mode) : "Down"}</div></div>
      <div class="metric"><div class="label">AED available</div><div class="value">${health.stripe.availableAed == null ? "—" : aed(health.stripe.availableAed)}</div></div>
      <div class="metric"><div class="label">Live transfers</div><div class="value">${health.liveBlocked ? "Blocked" : "Allowed"}</div></div>
      <div class="metric"><div class="label">Shopify</div><div class="value">${health.shopify && health.shopify.connected ? "Connected" : "Not connected"}</div></div>
      <div class="metric"><div class="label">Webkul sellers</div><div class="value">${health.webkul && health.webkul.sellersInLedger ? health.webkul.sellersInLedger : "None stored"}</div></div>
      <div class="metric"><div class="label">Rules</div><div class="value">${esc((health.rulesVersion) || "—")}</div></div>
    </div>
    <p class="msg">${health.shopify && !health.shopify.connected ? "Shopify auth path: " + esc(health.shopify.authPath || "/shopify/auth") : ""}</p>
    <p class="msg">${esc(health.db.error || health.stripe.error || "")}</p>
  `);
  bindChrome();
}

async function render() {
  const { path } = route();
  if (path === "login") return loginView();
  const me = await ensureUser();
  if (!me) return;
  if (path === "health") return renderHealth(me);
  if (path === "orders") return renderOrders(me);
  if (path === "vendors") return renderVendors(me);
  if (path === "audit") return renderAudit(me);
  if (path === "packs") return renderPack(me);
  if (path === "owner") return renderOwner(me);
  if (path === "rules") return renderRules(me);
  return renderHome(me);
}

async function renderOwner(me) {
  const period = new URLSearchParams(location.hash.split("?")[1] || "").get("period")
    || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }).slice(0, 7);
  const [report, dash] = await Promise.all([api(`/api/reports/owner?period=${encodeURIComponent(period)}`), api("/api/dashboard")]);
  app.innerHTML = shell(me, dash, `
    <div class="page-head">
      <div>
        <h1>Platform own sales</h1>
        <p class="page-sub">Gift hampers and Nirvan Earth products. These amounts are not paid to vendors and have no Stripe transfer.</p>
      </div>
      <a class="secondary" href="/api/reports/owner?period=${esc(period)}&format=csv">Download CSV</a>
    </div>
    <div class="metrics">
      <div class="metric"><div class="label">Period</div><div class="value">${esc(report.period)}</div></div>
      <div class="metric"><div class="label">Gross</div><div class="value">${aed(report.gross)}</div></div>
      <div class="metric"><div class="label">Discounts</div><div class="value">${aed(report.discount)}</div></div>
      <div class="metric"><div class="label">Tax</div><div class="value">${aed(report.tax)}</div></div>
    </div>
    <section class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Order</th><th>Product</th><th class="num">Gross</th><th class="num">Discount</th><th class="num">Tax</th></tr></thead>
          <tbody>
            ${(report.lines || []).map((line) => `<tr><td>${esc(line.orderNumber)}</td><td>${esc(line.title)}</td><td class="num">${aed(line.gross)}</td><td class="num">${aed(line.discount)}</td><td class="num">${aed(line.tax)}</td></tr>`).join("") || `<tr><td colspan="5"><div class="empty">No own-product lines in this month.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `);
  bindChrome();
}

async function renderRules(me) {
  const [{ versions }, dash] = await Promise.all([api("/api/rules"), api("/api/dashboard")]);
  const active = versions.find((version) => version.status === "active");
  const payload = active && active.payload ? active.payload : {};
  app.innerHTML = shell(me, dash, `
    <div class="page-head">
      <div>
        <h1>Calculation rules</h1>
        <p class="page-sub">A new version applies only after admin@nirvanearth.com approves it. Closed packs keep the version stored when they were generated.</p>
      </div>
    </div>
    <form id="rule-form" class="card" style="padding:16px">
      <div class="filters">
        <input name="versionLabel" value="${esc(payload.rulesVersion || "2026-10-28")}" aria-label="Version label" />
        <input name="commissionRate" value="${esc(payload.commissionRate ?? 0.2)}" aria-label="Commission rate" />
        <input name="returnWindowDays" value="${esc(payload.returnWindowDays ?? 14)}" aria-label="Return window days" />
      </div>
      <div class="filters">
        <input name="platformOwnTags" value="${esc((payload.platformOwnTags || []).join(", "))}" aria-label="Own product tags" style="min-width:240px" />
        <input name="platformOwnVendorNames" value="${esc((payload.platformOwnVendorNames || []).join(", "))}" aria-label="Own vendor names" style="min-width:240px" />
      </div>
      <label><input type="checkbox" name="includeVendorVatInNet" ${payload.includeVendorVatInNet === false ? "" : "checked"} /> Add vendor VAT back into net</label>
      <label><input type="checkbox" name="excludeDeliveryAllowanceFromCommissionBase" ${payload.excludeDeliveryAllowanceFromCommissionBase === false ? "" : "checked"} /> Exclude delivery allowance from commission base</label>
      <div class="filters">
        <input name="effectiveFrom" value="${esc(payload.effectiveFrom || "")}" aria-label="Effective from" placeholder="Effective from YYYY-MM-DD" />
        <input name="notes" value="${esc(payload.notes || "")}" aria-label="Notes" placeholder="Notes" style="min-width:280px" />
      </div>
      <div class="page-actions" style="margin-top:12px"><button class="primary" type="submit">Save draft</button></div>
      <p class="msg" id="msg"></p>
    </form>
    <section class="card">
      <div class="table-wrap">
        <table>
          <thead><tr><th>Version</th><th>Status</th><th>Rate</th><th></th></tr></thead>
          <tbody>
            ${versions.map((version) => `<tr>
              <td>${esc(version.versionLabel)}</td>
              <td>${badge(version.status)}</td>
              <td>${esc(version.payload && version.payload.commissionRate != null ? version.payload.commissionRate : "")}</td>
              <td>
                ${version.status === "draft" ? `<button type="button" data-submit="${esc(version.id)}">Submit</button>` : ""}
                ${version.status === "pending_approval" && me.approver ? `<button type="button" data-approve="${esc(version.id)}">Approve</button>` : ""}
              </td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `);
  bindChrome();
  const say = (error) => { app.querySelector("#msg").textContent = error?.message || error || ""; };
  app.querySelector("#rule-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = {
      versionLabel: form.versionLabel.value,
      commissionRate: Number(form.commissionRate.value),
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
      try { await api(`/api/rules/${button.dataset.approve}/approve`, { method: "POST" }); await render(); } catch (error) { say(error); }
    });
  }
}

window.addEventListener("hashchange", () => {
  render().catch((error) => { app.innerHTML = `<p class="msg">${esc(error.message)}</p>`; });
});
render().catch((error) => { app.innerHTML = `<p class="msg">${esc(error.message)}</p>`; });
