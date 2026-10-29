// Manevia digital business cards. The maker (index.html) posts to the app's API; the viewer (404.html, GitHub Pages' catch-all)
// reads a card by the last path segment and renders it. The API also makes the QR code, vCard and Apple Wallet pass.
const API = "https://app.naamo.ai/api/public/cards";
const THEMES = [
  { id: "charcoal", name: "Charcoal", bg: "#2B2B2B", fg: "#FFFFFF", accent: "#B8863B", muted: "#9A9A9A", tile: "#FFFFFF", button: "#363636" },
  { id: "green",    name: "Green",    bg: "#064E3B", fg: "#FFFFFF", accent: "#F97316", muted: "#A7C4B5", tile: "#FFFFFF", button: "#0B5C46" },
  { id: "navy",     name: "Navy",     bg: "#1B2A4A", fg: "#FFFFFF", accent: "#F2C94C", muted: "#9FB0CC", tile: "#FFFFFF", button: "#25365C" },
  { id: "white",    name: "White",    bg: "#FFFFFF", fg: "#111827", accent: "#064E3B", muted: "#6B7280", tile: "#F3F4F6", button: "#F3F4F6" },
];
const theme = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/** This site's root: "/cards/" on manevia.github.io, "/" on its own domain. */
const ROOT = window.CARDS_ROOT || location.pathname.replace(/[^/]*$/, "") || "/";

function cardHtml(c, t, opts = {}) {
  const initial = ((c.company || c.name || "N").trim()[0] || "N").toUpperCase();
  const tile = c.logoUrl || c.logo
    ? `<img src="${esc(c.logoUrl || c.logo)}" alt="">`
    : `<span style="color:${t.bg === "#FFFFFF" ? t.accent : t.bg}">${esc(initial)}</span>`;
  const sub = [c.company, c.location].filter(Boolean).join(" · ");
  const rows = [];
  if (c.phone) rows.push(`<span style="color:${t.muted}">Phone</span><b>${esc(c.phone)}</b>`);
  if (c.email) rows.push(`<span style="color:${t.muted}">Email</span><b>${esc(c.email)}</b>`);
  if (c.website) rows.push(`<span style="color:${t.muted}">Web</span><b>${esc(c.website.replace(/^https?:\/\//, ""))}</b>`);
  if (!rows.length) rows.push(`<span style="color:${t.muted}">Phone</span><b style="color:${t.muted}">+1 …</b>`);
  let actions = "";
  if (opts.actions) {
    const first = esc((c.name || "").trim().split(/\s+/)[0]);
    const btn = (href, label, small, primary, extra = "") =>
      `<a class="act" href="${href}" ${extra} style="background:${primary ? t.accent : t.button};color:${primary ? (t.bg === "#FFFFFF" ? "#fff" : "#1A1A1A") : t.fg}"><span>${label}</span><small style="color:${primary ? (t.bg === "#FFFFFF" ? "#CDE6DA" : "#3A2D16") : t.muted}">${small}</small></a>`;
    actions += btn(esc(c.vcfUrl), "Save contact", `Adds ${first} to your phone`, true, "download");
    if (c.tel) actions += btn("tel:" + esc(c.tel), `Call ${first}`, esc(c.phone)) + btn("sms:" + esc(c.tel), `Text ${first}`, esc(c.phone));
    if (c.email) actions += btn("mailto:" + esc(c.email), "Email", esc(c.email));
    if (c.website) actions += btn(esc(c.website), esc(c.website.replace(/^https?:\/\//, "").replace(/\/$/, "")), "Website");
    if (c.passUrl) actions += `<a class="wallet" href="${esc(c.passUrl)}"><span class="wi"></span>Add to Apple Wallet</a>`;
    actions = `<div class="actions">${actions}</div>`;
  }
  return `<section class="card" style="background:${t.bg};color:${t.fg}"><div class="top"><div>
      <h1 class="name">${esc(c.name) || "Your name"}</h1><p class="role" style="color:${t.accent}">${esc(c.title) || "Your title"}</p>
      ${sub ? `<p class="sub" style="color:${t.muted}">${esc(sub)}</p>` : ""}</div>
      <div class="tile" style="background:${t.tile};box-shadow:0 0 0 2px ${t.accent}">${tile}</div></div>
      <div class="rows">${rows.join("")}</div>${actions}</section>`;
}

// ---------------------------------------------------------------- the viewer
async function viewer(el) {
  const slug = location.pathname.replace(/\/$/, "").split("/").pop();
  const ok = /^[a-z0-9-]{3,60}$/.test(slug);
  try {
    const r = ok ? await fetch(`${API}/${slug}/view`) : null;
    if (!r || !r.ok) throw new Error("nf");
    const c = await r.json();
    document.title = c.name;
    el.innerHTML = cardHtml(c, theme(c.theme), { actions: true });
  } catch {
    document.title = "No such card";
    el.innerHTML = `<div class="panel"><h2 style="margin:0 0 6px">No such card.</h2><p class="fine">The link may be mistyped, or the card was removed.</p></div>`;
  }
}

// ---------------------------------------------------------------- the maker
function maker(el) {
  const q = new URLSearchParams(location.search);
  const edit = q.get("edit") && q.get("token") ? { slug: q.get("edit"), token: q.get("token") } : null;
  const f = { name: "", title: "", company: "", phone: "", email: "", website: "", location: "", theme: "charcoal", logo: "", hp: "" };
  let busy = false, err = "", made = null, removed = false, copied = false;
  const valid = () => f.name.trim().length > 1 && f.title.trim() && (f.phone.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()));

  const field = (k, label, opt, attrs) => `<label class="row"><span>${label}${opt ? " <em>optional</em>" : ""}</span><input name="${k}" value="${esc(f[k])}" ${attrs}></label>`;
  function render() {
    const t = theme(f.theme);
    const preview = `<div class="sticky">${cardHtml(f, t)}<p class="caption">${made ? "What people see when they open your link." : "Live preview. This is what people see when they open your link."}</p></div>`;
    if (removed) { el.innerHTML = `<div class="panel"><h2 style="margin:0 0 6px">Card removed.</h2><p class="fine">Its link no longer works. You can make a new one any time.</p></div>`; return; }
    if (made) {
      el.innerHTML = `<div class="grid"><div class="result">
        <h2 style="margin:0;font-size:28px">${edit ? "Your card is updated." : "Your card is live."}</h2>
        <div class="link"><a href="${esc(made.url)}">${esc(made.url.replace(/^https?:\/\//, ""))}</a><button type="button" id="copy">${copied ? "Copied" : "Copy link"}</button></div>
        <div class="qr"><img src="${esc(made.qrUrl)}" alt="QR code"><p>Put this QR code on your printed cards, your email signature or a slide. Anyone who scans it gets your card, can save your contact and add it to their phone.</p></div>
        <div class="downloads">
          <a href="${esc(made.qrUrl)}" download>QR code<small>PNG, print quality</small></a>
          ${made.passUrl ? `<a href="${esc(made.passUrl)}">Apple Wallet pass<small>Open on an iPhone to add</small></a>` : ""}
          <a href="${esc(made.vcfUrl)}">Save contact<small>.vcf, any phone</small></a>
          <a href="${esc(made.editUrl)}">Edit this card<small>Keep this link private</small></a>
        </div>
        <p class="fine">Your card stays up as long as you want it. The edit link is the only way to change or remove it, so keep it.</p>
        <div class="pitch"><h3>Want AI working for your business?</h3><p>Manevia builds and runs AI for companies of every size: customer service, operations, automation.</p><a class="btn" href="https://manevia.us">Talk to Manevia</a></div>
      </div>${preview}</div>`;
      el.querySelector("#copy").onclick = async () => { try { await navigator.clipboard.writeText(made.url); copied = true; render(); setTimeout(() => { copied = false; render(); }, 1500); } catch {} };
      return;
    }
    el.innerHTML = `<div class="grid"><form novalidate>
      ${edit ? `<p class="fine" style="margin:0">Editing your card. Changes show on the same link, QR code and pass.</p>` : ""}
      ${field("name", "Your name", false, 'autocomplete="name" placeholder="Jordan Lee" maxlength="60" required')}
      ${field("title", "Title", false, 'autocomplete="organization-title" placeholder="Owner" maxlength="60" required')}
      ${field("company", "Company", true, 'autocomplete="organization" placeholder="Brightwater Dental" maxlength="60"')}
      ${field("phone", "Phone", false, 'type="tel" autocomplete="tel" placeholder="+1 (317) 555-0100" maxlength="30"')}
      ${field("email", "Email", false, 'type="email" autocomplete="email" placeholder="jordan@brightwaterdental.com" maxlength="120"')}
      ${field("website", "Website", true, 'type="url" autocomplete="url" placeholder="https://brightwaterdental.com" maxlength="120"')}
      ${field("location", "City", true, 'autocomplete="address-level2" placeholder="Indianapolis, Indiana" maxlength="80"')}
      <div class="row"><span>Colour</span><div class="themes">${THEMES.map((x) => `<button type="button" class="theme" data-theme="${x.id}" aria-label="${x.name}" aria-pressed="${f.theme === x.id}" style="background:linear-gradient(135deg,${x.bg} 60%,${x.accent} 60%)"></button>`).join("")}</div></div>
      <div class="row"><span>Logo <em>optional, PNG or JPG</em></span><div style="display:flex;gap:12px;align-items:center;font-weight:500;font-size:14px;color:var(--muted)"><input type="file" name="logofile" accept="image/png,image/jpeg,image/webp">${f.logo ? '<button type="button" class="btn-link" id="nologo" style="color:var(--muted)">Remove</button>' : ""}</div></div>
      <label class="hp" aria-hidden="true"><input name="hp" tabindex="-1" autocomplete="off" value="${esc(f.hp)}"></label>
      ${err ? `<p class="err" role="alert">${esc(err)}</p>` : ""}
      <button class="btn btn-primary" ${valid() && !busy ? "" : "disabled"}>${busy ? (edit ? "Saving…" : "Making your card…") : edit ? "Save changes" : "Make my card"}</button>
      ${edit ? `<button type="button" class="btn-link" id="remove" ${busy ? "disabled" : ""}>Remove this card</button>` : ""}
      <p class="fine">Free, no account. The details you enter are shown to anyone who opens your card link. We never sell them.</p>
    </form>${preview}</div>`;
    const form = el.querySelector("form");
    form.addEventListener("input", (e) => {
      const i = e.target; if (!i.name || i.type === "file") return;
      f[i.name] = i.value;
      el.querySelector(".sticky").innerHTML = cardHtml(f, theme(f.theme)) + `<p class="caption">Live preview. This is what people see when they open your link.</p>`;
      form.querySelector(".btn-primary").disabled = !valid() || busy;
    });
    form.querySelectorAll(".theme").forEach((b) => b.onclick = () => { f.theme = b.dataset.theme; render(); });
    form.querySelector('[name=logofile]').onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      if (file.size > 2 * 1024 * 1024) { err = "The logo must be under 2 MB."; render(); return; }
      const r = new FileReader(); r.onload = () => { f.logo = String(r.result); err = ""; render(); }; r.readAsDataURL(file);
    };
    const nologo = form.querySelector("#nologo"); if (nologo) nologo.onclick = () => { f.logo = ""; render(); };
    const rm = form.querySelector("#remove"); if (rm) rm.onclick = async () => {
      if (!confirm("Remove this card? Its link, QR code and Wallet pass stop working.")) return;
      busy = true; render();
      try { const r = await fetch(`${API}/${encodeURIComponent(edit.slug)}?token=${encodeURIComponent(edit.token)}`, { method: "DELETE" }); if (!r.ok) throw new Error("We couldn't remove the card. Try again in a minute."); removed = true; }
      catch (ex) { err = ex.message; } busy = false; render();
    };
    form.onsubmit = async (e) => {
      e.preventDefault(); if (!valid() || busy) return;
      busy = true; err = ""; render();
      try {
        const r = edit
          ? await fetch(`${API}/${encodeURIComponent(edit.slug)}?token=${encodeURIComponent(edit.token)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) })
          : await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, source: location.host + ROOT }) });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error((j && j.error) || "Something went wrong. Try again in a minute.");
        made = j;
      } catch (ex) { err = ex.message; }
      busy = false; render();
    };
  }
  render();
  if (edit) fetch(`${API}/${encodeURIComponent(edit.slug)}?token=${encodeURIComponent(edit.token)}`)
    .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "This edit link doesn't work."); return j; })
    .then((j) => { Object.assign(f, { name: j.name, title: j.title, company: j.company, phone: j.phone, email: j.email, website: j.website, location: j.location, theme: j.theme, logo: j.logo || "" }); render(); })
    .catch((ex) => { err = ex.message; render(); });
}

document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("app");
  if (document.body.dataset.page === "viewer") viewer(el); else maker(el);
});
