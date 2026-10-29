// Manevia digital business cards — one static page, no database.
// A card's details live inside its own link: cards…/#c=<base64url JSON>. The page renders it (viewer), makes a new one
// (maker) or edits one (#edit=…). The QR code and the vCard are made right here in the browser. Only the Apple Wallet
// pass is signed by a server (PASS_API), because that needs a private key; it is stateless too.
const PASS_API = "https://app.naamo.ai/api/public/wallet-pass";
const THEMES = [
  { id: "charcoal", name: "Charcoal", bg: "#2B2B2B", fg: "#FFFFFF", accent: "#B8863B", muted: "#9A9A9A", tile: "#FFFFFF", button: "#363636" },
  { id: "green",    name: "Green",    bg: "#064E3B", fg: "#FFFFFF", accent: "#F97316", muted: "#A7C4B5", tile: "#FFFFFF", button: "#0B5C46" },
  { id: "navy",     name: "Navy",     bg: "#1B2A4A", fg: "#FFFFFF", accent: "#F2C94C", muted: "#9FB0CC", tile: "#FFFFFF", button: "#25365C" },
  { id: "white",    name: "White",    bg: "#FFFFFF", fg: "#111827", accent: "#064E3B", muted: "#6B7280", tile: "#F3F4F6", button: "#F3F4F6" },
];
const theme = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const EMPTY = { name: "", title: "", company: "", phone: "", email: "", website: "", location: "", theme: "charcoal", logo: "" };
const KEYS = { name: "n", title: "t", company: "c", phone: "p", email: "e", website: "w", location: "l", theme: "th", logo: "lg" };
const MAX = { name: 60, title: 60, company: 60, phone: 30, email: 120, website: 200, location: 80, logo: 300 };

// ---------------------------------------------------------------- the link
const b64 = {
  enc: (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: (s) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/")))),
};
function pack(f) {
  const o = {};
  for (const k in KEYS) if (f[k] && k !== "theme") o[KEYS[k]] = f[k];
  if (f.theme && f.theme !== "charcoal") o.th = f.theme;
  return b64.enc(JSON.stringify(o));
}
function unpack(data) {
  try {
    const o = JSON.parse(b64.dec(data));
    const f = { ...EMPTY };
    for (const k in KEYS) if (typeof o[KEYS[k]] === "string") f[k] = o[KEYS[k]].slice(0, MAX[k] || 60);
    f.theme = theme(o.th).id;
    if (f.logo && !/^https:\/\/[^\s"'<>]+$/i.test(f.logo)) f.logo = "";
    if (f.website && !/^https?:\/\//i.test(f.website)) f.website = "https://" + f.website;
    return f.name.trim().length > 1 ? f : null;
  } catch { return null; }
}
const SITE = location.origin + location.pathname.replace(/[^/]*$/, "");
const cardUrl = (f) => SITE + "#c=" + pack(f);
const editUrl = (f) => SITE + "#edit=" + pack(f);
const tel = (phone) => { const d = (phone || "").replace(/\D/g, ""); return d.length < 7 ? "" : "+" + (d.length === 10 ? "1" + d : d); };

// ---------------------------------------------------------------- vCard and QR, made here
function vcard(f) {
  const v = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const [first, ...rest] = f.name.trim().split(/\s+/);
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${v(rest.join(" "))};${v(first)};;;`, `FN:${v(f.name.trim())}`];
  if (f.company) lines.push(`ORG:${v(f.company)}`);
  if (f.title) lines.push(`TITLE:${v(f.title)}`);
  const t = tel(f.phone); if (t) lines.push(`TEL;TYPE=CELL,VOICE:${t}`);
  if (f.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${v(f.email)}`);
  if (f.website) lines.push(`URL:${v(f.website)}`);
  lines.push(`URL;TYPE=card:${v(cardUrl(f))}`);
  if (f.location) lines.push(`ADR;TYPE=WORK:;;;${v(f.location)};;;`);
  lines.push("END:VCARD");
  return lines.join("\r\n") + "\r\n";
}
function vcardHref(f) { return URL.createObjectURL(new Blob([vcard(f)], { type: "text/vcard" })); }
function qrPng(text, pixels) {
  const q = qrcode(0, "M"); q.addData(text); q.make();
  const n = q.getModuleCount(), quiet = 2, cell = Math.floor(pixels / (n + quiet * 2)), size = cell * (n + quiet * 2);
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
  const g = canvas.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, size, size); g.fillStyle = "#1A1A1A";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  return canvas.toDataURL("image/png");
}

// ---------------------------------------------------------------- the card
function cardHtml(f, t, opts = {}) {
  const initial = ((f.company || f.name || "N").trim()[0] || "N").toUpperCase();
  const tile = f.logo ? `<img src="${esc(f.logo)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${esc(initial)}',style:'color:${t.bg === "#FFFFFF" ? t.accent : t.bg}'}))">`
    : `<span style="color:${t.bg === "#FFFFFF" ? t.accent : t.bg}">${esc(initial)}</span>`;
  const sub = [f.company, f.location].filter(Boolean).join(" · ");
  const rows = [];
  if (f.phone) rows.push(`<span style="color:${t.muted}">Phone</span><b>${esc(f.phone)}</b>`);
  if (f.email) rows.push(`<span style="color:${t.muted}">Email</span><b>${esc(f.email)}</b>`);
  if (f.website) rows.push(`<span style="color:${t.muted}">Web</span><b>${esc(f.website.replace(/^https?:\/\//, ""))}</b>`);
  if (!rows.length) rows.push(`<span style="color:${t.muted}">Phone</span><b style="color:${t.muted}">+1 …</b>`);
  let actions = "";
  if (opts.actions) {
    const first = esc((f.name || "").trim().split(/\s+/)[0]), d = tel(f.phone);
    const btn = (href, label, small, primary, extra = "") =>
      `<a class="act" href="${href}" ${extra} style="background:${primary ? t.accent : t.button};color:${primary ? (t.bg === "#FFFFFF" ? "#fff" : "#1A1A1A") : t.fg}"><span>${label}</span><small style="color:${primary ? (t.bg === "#FFFFFF" ? "#CDE6DA" : "#3A2D16") : t.muted}">${small}</small></a>`;
    actions += btn(vcardHref(f), "Save contact", `Adds ${first} to your phone`, true, `download="${esc(slug(f.name))}.vcf"`);
    if (d) actions += btn("tel:" + d, `Call ${first}`, esc(f.phone)) + btn("sms:" + d, `Text ${first}`, esc(f.phone));
    if (f.email) actions += btn("mailto:" + esc(f.email), "Email", esc(f.email));
    if (f.website) actions += btn(esc(f.website), esc(f.website.replace(/^https?:\/\//, "").replace(/\/$/, "")), "Website");
    actions += `<a class="wallet" href="${PASS_API}?c=${pack(f)}&u=${encodeURIComponent(cardUrl(f))}"><span class="wi"></span>Add to Apple Wallet</a>`;
    actions = `<div class="actions">${actions}</div>`;
  }
  return `<section class="card" style="background:${t.bg};color:${t.fg}"><div class="top"><div>
      <h1 class="name">${esc(f.name) || "Your name"}</h1><p class="role" style="color:${t.accent}">${esc(f.title) || "Your title"}</p>
      ${sub ? `<p class="sub" style="color:${t.muted}">${esc(sub)}</p>` : ""}</div>
      <div class="tile" style="background:${t.tile};box-shadow:0 0 0 2px ${t.accent}">${tile}</div></div>
      <div class="rows">${rows.join("")}</div>${actions}</section>`;
}
const slug = (name) => name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "card";

// ---------------------------------------------------------------- the viewer
function viewer(el, f) {
  document.title = f.name;
  document.body.dataset.page = "viewer";
  el.innerHTML = `<main class="viewer">${cardHtml(f, theme(f.theme), { actions: true })}
    <div class="foot"><a href="https://manevia.us"><img src="assets/manevia-logo.png" alt="Manevia"></a>
    <p>Card made with Manevia. <a href="${SITE}">Make yours, free</a></p>
    <p>Manevia builds AI that works for your business. <a href="https://manevia.us">manevia.us</a></p></div></main>`;
}

// ---------------------------------------------------------------- the maker
function maker(el, editing) {
  const f = editing ? { ...editing } : { ...EMPTY };
  let err = "", made = null, copied = false;
  const valid = () => f.name.trim().length > 1 && f.title.trim() && (tel(f.phone) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()));
  const field = (k, label, opt, attrs) => `<label class="row"><span>${label}${opt ? " <em>optional</em>" : ""}</span><input name="${k}" value="${esc(f[k])}" maxlength="${MAX[k] || 60}" ${attrs}></label>`;
  const preview = () => cardHtml(f, theme(f.theme)) + `<p class="caption">${made ? "What people see when they open your link." : "Live preview. This is what people see when they open your link."}</p>`;
  function render() {
    if (made) {
      const url = cardUrl(f), qr = qrPng(url, 1800);
      el.innerHTML = `<div class="grid"><div class="result">
        <h2 style="margin:0;font-size:28px">${editing ? "Your card is updated." : "Your card is ready."}</h2>
        <div class="link"><a href="${esc(url)}">${esc(SITE.replace(/^https?:\/\//, ""))}#c=…</a><button type="button" id="copy">${copied ? "Copied" : "Copy link"}</button></div>
        <div class="qr"><img src="${qr}" alt="QR code"><p>Put this QR code on your printed cards, your email signature or a slide. Anyone who scans it gets your card, can save your contact and add it to their phone.</p></div>
        <div class="downloads">
          <a href="${qr}" download="${esc(slug(f.name))}-qr.png">QR code<small>PNG, print quality</small></a>
          <a href="${PASS_API}?c=${pack(f)}&u=${encodeURIComponent(url)}">Apple Wallet pass<small>Open on an iPhone to add</small></a>
          <a href="${vcardHref(f)}" download="${esc(slug(f.name))}.vcf">Save contact<small>.vcf, any phone</small></a>
          <a href="${esc(editUrl(f))}">Edit this card<small>Opens this form with your details</small></a>
        </div>
        <p class="fine">Your details live inside the link itself: nothing is stored anywhere, so there is nothing to delete. To change the card, make a new link and share that one.</p>
        <div class="pitch"><h3>Want AI working for your business?</h3><p>Manevia builds and runs AI for companies of every size: customer service, operations, automation.</p><a class="btn" href="https://manevia.us">Talk to Manevia</a></div>
      </div><div class="sticky">${preview()}</div></div>`;
      el.querySelector("#copy").onclick = async () => { try { await navigator.clipboard.writeText(url); copied = true; render(); setTimeout(() => { copied = false; render(); }, 1500); } catch {} };
      return;
    }
    el.innerHTML = `<div class="grid"><form novalidate>
      ${editing ? `<p class="fine" style="margin:0">Editing your card. Saving makes a new link; share that one.</p>` : ""}
      ${field("name", "Your name", false, 'autocomplete="name" placeholder="Jordan Lee" required')}
      ${field("title", "Title", false, 'autocomplete="organization-title" placeholder="Owner" required')}
      ${field("company", "Company", true, 'autocomplete="organization" placeholder="Brightwater Dental"')}
      ${field("phone", "Phone", false, 'type="tel" autocomplete="tel" placeholder="+1 (317) 555-0100"')}
      ${field("email", "Email", false, 'type="email" autocomplete="email" placeholder="jordan@brightwaterdental.com"')}
      ${field("website", "Website", true, 'type="url" autocomplete="url" placeholder="https://brightwaterdental.com"')}
      ${field("location", "City", true, 'autocomplete="address-level2" placeholder="Indianapolis, Indiana"')}
      ${field("logo", "Logo image link", true, 'type="url" placeholder="https://yoursite.com/logo.png"')}
      <div class="row"><span>Colour</span><div class="themes">${THEMES.map((x) => `<button type="button" class="theme" data-theme="${x.id}" aria-label="${x.name}" aria-pressed="${f.theme === x.id}" style="background:linear-gradient(135deg,${x.bg} 60%,${x.accent} 60%)"></button>`).join("")}</div></div>
      ${err ? `<p class="err" role="alert">${esc(err)}</p>` : ""}
      <button class="btn btn-primary" ${valid() ? "" : "disabled"}>${editing ? "Make the new link" : "Make my card"}</button>
      <p class="fine">Free, no account, nothing stored. Your details are encoded in the link you share, and shown to anyone who opens it.</p>
    </form><div class="sticky">${preview()}</div></div>`;
    const form = el.querySelector("form");
    form.addEventListener("input", (e) => {
      const i = e.target; if (!i.name) return;
      f[i.name] = i.value;
      el.querySelector(".sticky").innerHTML = preview();
      form.querySelector(".btn-primary").disabled = !valid();
    });
    form.querySelectorAll(".theme").forEach((b) => b.onclick = () => { f.theme = b.dataset.theme; render(); });
    form.onsubmit = (e) => {
      e.preventDefault(); if (!valid()) return;
      if (f.logo && !/^https:\/\/[^\s"'<>]+$/i.test(f.logo.trim())) { err = "The logo link must start with https://"; render(); return; }
      if (f.website && !/^https?:\/\//i.test(f.website.trim())) f.website = "https://" + f.website.trim();
      for (const k in f) if (typeof f[k] === "string") f[k] = f[k].trim();
      err = ""; made = true; render(); window.scrollTo({ top: 0, behavior: "smooth" });
    };
  }
  render();
}

document.addEventListener("DOMContentLoaded", () => {
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  const shown = h.get("c") && unpack(h.get("c"));
  if (shown) { document.querySelector("header").remove(); document.querySelector("main.maker").remove(); document.querySelector("footer").remove(); viewer(document.getElementById("app"), shown); return; }
  maker(document.getElementById("maker"), h.get("edit") ? unpack(h.get("edit")) : null);
});
