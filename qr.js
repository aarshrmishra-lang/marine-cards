/* QR code contents -> contact fields.
   Understands vCard, MECARD, BIZCARD, plain links and plain text.
   Works in the browser (window.CardQR) and in Node (module.exports) for testing. */
(function (root) {
  "use strict";

  function unescapeV(s) { return String(s || "").replace(/\\n/gi, "\n").replace(/\\([,;:\\])/g, "$1").trim(); }
  function qpDecode(s) {
    try {
      const bytes = [];
      s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})|([^=])/gi, (m, hex, ch) => { if (hex) bytes.push(parseInt(hex, 16)); else bytes.push(...new TextEncoder().encode(ch)); return ""; });
      return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
    } catch (_) { return s; }
  }
  const join = (arr) => [...new Set(arr.map(x => x.trim()).filter(Boolean))].join(" / ");

  function parseVCard(text) {
    // unfold continuation lines
    const raw = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
    const out = { name: "", title: "", department: "", company_full: "", phone: "", mobile: "", fax: "", email: "", website: "", address: "", country: "", notes: "" };
    const tel = { phone: [], mobile: [], fax: [] }, emails = [], urls = [], notes = [];
    let n = null;
    raw.split("\n").forEach(line => {
      const i = line.indexOf(":"); if (i < 1) return;
      let head = line.slice(0, i), val = line.slice(i + 1);
      const parts = head.split(";"); let key = parts[0].toUpperCase().replace(/^item\d+\./i, "");
      const params = parts.slice(1).join(";").toUpperCase();
      if (/ENCODING=QUOTED-PRINTABLE/.test(params)) val = qpDecode(val);
      switch (key) {
        case "FN": out.name = unescapeV(val); break;
        case "N": n = val.split(";").map(unescapeV); break;
        case "ORG": { const o = val.split(";").map(unescapeV).filter(Boolean); out.company_full = o[0] || ""; if (o[1]) out.department = o.slice(1).join(", "); break; }
        case "TITLE": out.title = unescapeV(val); break;
        case "ROLE": if (!out.title) out.title = unescapeV(val); break;
        case "TEL": {
          const v = unescapeV(val).replace(/^tel:/i, "");
          if (/FAX/.test(params)) tel.fax.push(v); else if (/CELL|MOBILE|IPHONE/.test(params)) tel.mobile.push(v); else tel.phone.push(v);
          break;
        }
        case "EMAIL": emails.push(unescapeV(val).replace(/^mailto:/i, "")); break;
        case "URL": urls.push(unescapeV(val)); break;
        case "ADR": {
          const a = val.split(";").map(unescapeV); // pobox;ext;street;city;region;postcode;country
          const seen = new Set();
          const addr = [a[0], a[1], a[2], a[3], a[4], a[5], a[6]].filter(x => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).join(", ");
          if (addr && !out.address) out.address = addr;
          if (a[6] && !out.country) out.country = a[6];
          break;
        }
        case "NOTE": notes.push(unescapeV(val)); break;
        case "X-SOCIALPROFILE": urls.push(unescapeV(val)); break;
      }
    });
    const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
    if (n && CJK.test(n.join(""))) { const local = (n[0] + n[1]).trim(); out.name_local = local; if (!out.name || CJK.test(out.name)) out.name = out.name && !CJK.test(out.name) ? out.name : local; }
    else if (!out.name && n) out.name = [n[3], n[1], n[2], n[0], n[4]].filter(Boolean).join(" ").trim();
    out.phone = join(tel.phone); out.mobile = join(tel.mobile); out.fax = join(tel.fax);
    out.email = join(emails);
    const web = urls.filter(u => !/linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|wa\.me/i.test(u));
    const social = urls.filter(u => !web.includes(u));
    out.website = join(web);
    if (social.length) notes.push(social.join(" · "));
    out.notes = notes.join(" · ");
    return out;
  }

  function splitKV(body, sep) {
    // MECARD/BIZCARD: KEY:value; pairs, with \ escapes
    const out = []; let cur = "", esc = false;
    for (const ch of body) {
      if (esc) { cur += ch; esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === sep) { if (cur) out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    if (cur) out.push(cur);
    return out.map(p => { const i = p.indexOf(":"); return i > 0 ? [p.slice(0, i).toUpperCase(), p.slice(i + 1).trim()] : null; }).filter(Boolean);
  }
  function parseMeCard(text) {
    const out = { name: "", title: "", company_full: "", phone: "", mobile: "", fax: "", email: "", website: "", address: "", notes: "" };
    const tel = [], mob = [], em = [], url = [], notes = [];
    splitKV(text.replace(/^MECARD:/i, ""), ";").forEach(([k, v]) => {
      if (k === "N") { const p = v.split(","); out.name = p.length > 1 ? (p[1] + " " + p[0]).trim() : v; }
      else if (k === "TEL") (/^(\+?65)?[89]\d{7}$/.test(v.replace(/\D/g, "")) ? mob : tel).push(v);
      else if (k === "TEL-AV" || k === "CELL") mob.push(v);
      else if (k === "EMAIL") em.push(v);
      else if (k === "URL") url.push(v);
      else if (k === "ADR") out.address = v.split(",").map(s => s.trim()).filter(Boolean).join(", ");
      else if (k === "NOTE" || k === "MEMO") notes.push(v);
      else if (k === "ORG") out.company_full = v;
      else if (k === "TITLE") out.title = v;
    });
    out.phone = join(tel); out.mobile = join(mob); out.email = join(em); out.website = join(url); out.notes = notes.join(" · ");
    return out;
  }
  function parseBizCard(text) {
    const out = { name: "", title: "", company_full: "", phone: "", mobile: "", fax: "", email: "", address: "", website: "", notes: "" };
    let first = "", last = "";
    splitKV(text.replace(/^BIZCARD:/i, ""), ";").forEach(([k, v]) => {
      if (k === "N") first = v; else if (k === "X") last = v; else if (k === "T") out.title = v; else if (k === "C") out.company_full = v;
      else if (k === "A") out.address = v; else if (k === "B") out.phone = v; else if (k === "M") out.mobile = v; else if (k === "F") out.fax = v; else if (k === "E") out.email = v;
    });
    out.name = (first + " " + last).trim();
    return out;
  }

  /* Returns {kind, fields, summary} — kind: "contact" | "link" | "text" | "other" */
  function parseQR(text) {
    const t = String(text || "").trim();
    if (!t) return { kind: "other", fields: {}, summary: "" };
    if (/BEGIN:VCARD/i.test(t)) { const f = parseVCard(t); return { kind: "contact", fields: f, summary: f.name || f.company_full || "contact" }; }
    if (/^MECARD:/i.test(t)) { const f = parseMeCard(t); return { kind: "contact", fields: f, summary: f.name || "contact" }; }
    if (/^BIZCARD:/i.test(t)) { const f = parseBizCard(t); return { kind: "contact", fields: f, summary: f.name || "contact" }; }
    if (/^mailto:/i.test(t)) { const e = t.replace(/^mailto:/i, "").split("?")[0]; return { kind: "contact", fields: { email: decodeURIComponent(e) }, summary: e }; }
    if (/^tel:/i.test(t)) { const p = t.replace(/^tel:/i, ""); return { kind: "contact", fields: { phone: p }, summary: p }; }
    if (/^(https?:\/\/|www\.)\S+$/i.test(t)) {
      const social = /linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|wa\.me|wechat|line\.me/i.test(t);
      return { kind: "link", fields: social ? { notes: t } : { website: t }, summary: t };
    }
    if (/^WIFI:/i.test(t)) return { kind: "other", fields: {}, summary: "a Wi-Fi network" };
    return { kind: "text", fields: { notes: t.slice(0, 500) }, summary: t.slice(0, 80) };
  }

  const api = { parseQR };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.CardQR = api;
})(typeof self !== "undefined" ? self : this);
