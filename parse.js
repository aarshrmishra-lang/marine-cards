/* Card text parser: turns text read from a business card photo into contact fields.
   Works in the browser (window.CardParser) and in Node (module.exports) for testing. */
(function (root) {
  "use strict";

  const FREEMAIL = /^(gmail|yahoo|hotmail|outlook|icloud|live|qq|163|126|naver|hanmail|singnet|me|aol|msn|sina|foxmail)\./i;
  const CORP = /\b(pte\.?|ltd\.?|limited|co\.?,?\s*ltd|corp\.?|corporation|inc\.?|gmbh|llc|l\.l\.c|s\.a\.?|b\.v\.?|plc|k\.k\.|group|holdings|shipyards?|fzco|fze|sdn\.?\s*bhd|bhd|ag|a\/s|as|oy|ab|spa|s\.r\.l|kaisha|kyokai|register|godo)\b/i;
  const TITLE = /\b(manager|director|engineer|executive|officer|president|superintendent|sales|captain|capt\.?|chief|head|assistant|specialist|coordinator|co-ordinator|supervisor|ceo|cfo|coo|cto|gm|vp|chairman|partner|consultant|surveyor|technician|representative|associate|admin|administrator|accountant|analyst|leader|lead|agent|operator|owner|founder|principal|advisor|adviser|inspector|marketing|business development|procurement|purchasing|purchaser|buyer|trainee|staff|clerk|secretary|general affairs|c\/e|master)\b/i;
  const DEPT = /\b(department|dept\.?|division|section|team|group|unit|office|center|centre|headquarters|branch)\b/i;
  const ADDR = /\b(road|rd\.?|street|st\.|avenue|ave\.?|drive|dr\.?|lane|ln\.?|way|crescent|cres|link|loop|walk|building|bldg\.?|tower|floor|fl\.?|blk|block|district|city|ku|shi|cho|machi|province|prefecture|industrial|estate|park|centre|center|plaza|mansion|harbour|harbor|boulevard|blvd|zone|county|town|village|jalan|post\s*code|postal|p\.?o\.?\s*box|unit|suite|room|level)\b|#\s?\d{1,3}-\d{1,4}|\b\d{5,6}\b/i;
  const COUNTRIES = [
    ["Singapore", /singapore|\+\s?65\b/i], ["Japan", /japan|tokyo|osaka|kobe|yokohama|hiroshima|nagasaki|\+\s?81\b/i],
    ["China", /china|p\.?\s?r\.?\s?c|shanghai|beijing|qingdao|dalian|ningbo|zhoushan|shenzhen|guangzhou|tianjin|weihai|zhenjiang|nantong|\+\s?86\b/i],
    ["South Korea", /korea|busan|seoul|ulsan|\+\s?82\b/i], ["Hong Kong", /hong\s?kong|\+\s?852\b/i],
    ["Philippines", /philippines|manila|makati|cebu|\+\s?63\b/i], ["Malaysia", /malaysia|kuala lumpur|johor|\+\s?60\b/i],
    ["India", /india|mumbai|chennai|\+\s?91\b/i], ["United Arab Emirates", /u\.?a\.?e\.?\b|dubai|abu dhabi|sharjah|\+\s?971\b/i],
    ["Thailand", /thailand|bangkok|\+\s?66\b/i], ["Vietnam", /vietnam|viet nam|ho chi minh|\+\s?84\b/i],
    ["Indonesia", /indonesia|jakarta|batam|\+\s?62\b/i], ["Taiwan", /taiwan|\+\s?886\b/i],
    ["Germany", /germany|deutschland|hamburg|\+\s?49\b/i], ["Netherlands", /netherlands|rotterdam|\+\s?31\b/i],
    ["Belgium", /belgium|antwerp|\+\s?32\b/i], ["Norway", /norway|oslo|\+\s?47\b/i], ["Greece", /greece|piraeus|athens|\+\s?30\b/i],
    ["United Kingdom", /united kingdom|\bu\.?k\.?\b|london|\+\s?44\b/i], ["United States", /\busa\b|united states|\+\s?1\b/i],
    ["Panama", /panama|\+\s?507\b/i], ["Latvia", /latvia|riga|\+\s?371\b/i], ["Estonia", /estonia|tallinn|\+\s?372\b/i]
  ];
  const GENERIC = new Set("the and of pte ltd limited co corp corporation inc group holdings international intl marine maritime service services engineering shipping singapore asia pacific global solutions technology technologies trading industries industry heavy company systems system offshore ship ships s pte. ltd. co., hd".split(" "));

  function clean(s) { return s.replace(/[|_~`^"“”‘’]+/g, " ").replace(/\s{2,}/g, " ").trim(); }

  function normalise(text) {
    return text
      .replace(/\r/g, "")
      .replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl")
      .replace(/\s*@\s*/g, "@")
      .replace(/\s*\(at\)\s*/gi, "@")
      .replace(/[：]/g, ":");
  }

  function digitsOf(s) { return (s.match(/\d/g) || []).join(""); }

  function isMobileNumber(num) {
    let d = digitsOf(num.replace(/\(0\)/g, ""));
    d = d.replace(/^00/, "");
    if (/^49(1[5-7]\d{8,9})$/.test(d) || /^01[5-7]\d{8,9}$/.test(d)) return true;              // Germany
    if (/^316\d{8}$/.test(d) || /^06\d{8}$/.test(d)) return true;                                // Netherlands
    if (/^3249\d{7}$/.test(d) || /^324[5-9]\d{7}$/.test(d)) return true;                         // Belgium
    if (/^9715\d{8}$/.test(d) || /^05\d{8}$/.test(d)) return true;                               // UAE
    if (/^4407\d{9}$/.test(d) || /^447\d{9}$/.test(d)) return true;                              // UK
    if (/^47[49]\d{7}$/.test(d)) return true;                                                    // Norway
    if (/^30 ?69\d{8}$/.test(d)) return true;                                                    // Greece
    if (/^66[689]\d{8}$/.test(d)) return true;                                                   // Thailand
    if (/^84[39]\d{8}$/.test(d)) return true;                                                    // Vietnam
    if (/^628\d{8,10}$/.test(d)) return true;                                                    // Indonesia
    if (/^8529\d{7}$|^852[5-9]\d{7}$/.test(d)) return true;                                     // Hong Kong
    if (/^09\d{9}$/.test(d)) return true;                                                        // Philippines local
    if (/^(?:65)?[89]\d{7}$/.test(d) && (d.length === 8 || d.startsWith("65"))) return true;   // Singapore
    if (/^(?:86)?1[3-9]\d{9}$/.test(d)) return true;                                          // China
    if (/^(?:81|0)?[789]0\d{8}$/.test(d)) return true;                                        // Japan
    if (/^(?:63|0)?9\d{9}$/.test(d)) return true;                                             // Philippines
    if (/^(?:82|0)?10\d{7,8}$/.test(d)) return true;                                          // Korea
    if (/^(?:91)?[6-9]\d{9}$/.test(d) && d.length >= 10) return true;                        // India
    if (/^(?:60)?1\d{8,9}$/.test(d)) return true;                                             // Malaysia
    return false;
  }

  // Find phone-like numbers with their label (the word just before them).
  const NUM_RE = /(\+?\s?\(?\+?\d{1,4}\)?[\d\s().\-\/]{5,}\d)(\s*(?:ext\.?|extn\.?|ex\.?|x)\s*\d{1,5})?/gi;
  function labelFor(before) {
    const b = before.slice(-18).toLowerCase();
    if (/(mobile|mob\.?|cell|h\.?\/?p\.?|hand ?phone|whatsapp|手机|携帯|\bm\b|\bm\.)\s*[:.)\-]?\s*\(?$/.test(b)) return "mobile";
    if (/(fax|\bf\b|\bf\.|传真)\s*[:.)\-]?\s*\(?$/.test(b)) return "fax";
    if (/(tel|phone|direct|did|office|main|\bt\b|\bt\.|\bd\b|\bd\.|\bo\b|电话|24 ?hrs?)\s*[:.)\-]?\s*\(?$/.test(b)) return "phone";
    return "";
  }

  function parseCard(text, opts) {
    opts = opts || {};
    const known = opts.companies || [];          // index company names already in the register
    const domains = opts.domains || {};          // email domain -> index company
    const raw = normalise(text || "");
    let lines = raw.split("\n").map(clean).filter(l => (l.match(/[A-Za-z0-9぀-鿿가-힯]/g) || []).length >= 2);
    const out = { name: "", title: "", department: "", company: "", company_full: "", phone: "", mobile: "", fax: "", email: "", website: "", address: "", country: "" };
    const phones = [], mobiles = [], faxes = [];

    // Emails
    const emails = [];
    lines = lines.map(l => l.replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/g, m => { emails.push(m.replace(/[.,;]+$/, "").toLowerCase()); return " "; }));
    out.email = [...new Set(emails)].join(" / ");

    // Websites
    const sites = [];
    lines = lines.map(l => l.replace(/\b(?:https?:\/\/)?(?:www\d?\.)[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+(?:\/[^\s,;]*)?|\bhttps?:\/\/[^\s,;]+/gi, m => { sites.push(m.replace(/[.,;]+$/, "").toLowerCase()); return " "; }));
    if (!sites.length) emails.forEach(e => { const d = e.split("@")[1]; if (d && !FREEMAIL.test(d)) sites.push("www." + d); });
    out.website = [...new Set(sites)].slice(0, 2).join(" / ");

    // Phone numbers
    const LABEL_TAIL = /(mobile|mob\.?|cell|h\.?\/?p\.?|hand ?phone|whatsapp|fax|tel\.?|phone|direct|did|office|main|24 ?hrs?|手机|电话|传真|\b[mtfdo]\b\.?)\s*[:.)\-]?\s*\(?\s*$/i;
    lines = lines.map(l => {
      const cuts = [];
      let m;
      NUM_RE.lastIndex = 0;
      while ((m = NUM_RE.exec(l))) {
        const d = digitsOf(m[1]);
        if (d.length < 7 || d.length > 15) continue;
        if (/^\d{4}[\s\-\/]\d{1,2}[\s\-\/]\d{1,2}$/.test(m[1].trim())) continue; // dates
        if (/^\d{3}-\d{4}$/.test(m[1].trim())) continue;                          // Japanese postcode
        if (/^\d{5}\s*-\s*\d{3}$/.test(m[1].trim())) continue;                    // other postcodes
        if (/\b(zip|post(al)?\s*code|p\.?o\.?\s*box|〒|邮编)\s*[:.]?\s*$/i.test(l.slice(0, m.index))) continue;
        const before = l.slice(0, m.index);
        let lab = labelFor(before);
        const mob = isMobileNumber(m[1]);
        // single-letter labels are often misread icons; trust the number's shape
        if (lab === "phone" && mob && /(^|\s)[tdo]\.?\s*[:.)\-]?\s*\(?$/i.test(before.slice(-6))) lab = "mobile";
        if (!lab) lab = mob ? "mobile" : "phone";
        const num = (m[1] + (m[2] || "")).replace(/\s{2,}/g, " ").trim().replace(/^\(\s*(?=\+)/, "");
        (lab === "mobile" ? mobiles : lab === "fax" ? faxes : phones).push(num);
        const lm = before.match(LABEL_TAIL);
        cuts.push([lm ? m.index - lm[0].length : m.index, m.index + m[0].length]);
      }
      let s = l;
      for (let k = cuts.length - 1; k >= 0; k--) s = s.slice(0, cuts[k][0]) + " " + s.slice(cuts[k][1]);
      s = s.replace(/\b(tel|fax|mobile|mob|hp|h\/p|phone|email|e-mail|web|website)\s*[:.]?\s*$/i, "")
           .replace(/^\s*(e-?mail|e|w|web)\s*[:.]\s*/i, "");
      return clean(s.replace(/^[^A-Za-z0-9぀-鿿가-힯#(]+|[^A-Za-z0-9぀-鿿가-힯.)]+$/g, ""));
    }).filter(l => (l.match(/[A-Za-z぀-鿿가-힯]/g) || []).length >= 2);
    out.phone = [...new Set(phones)].join(" / ");
    out.mobile = [...new Set(mobiles)].join(" / ");
    out.fax = [...new Set(faxes)].join(" / ");

    const fullText = raw.toLowerCase();

    // Company: email domain we've seen before, then known company names, then corporate-suffix lines
    const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const keyToks = k => k.toLowerCase().replace(/[()\/&,.]/g, " ").split(/\s+/).filter(t => t.length > 1 && !GENERIC.has(t));
    const knownIn = s => {           // best known company whose distinctive words all appear in s
      let best = "", bestLen = 0;
      known.forEach(k => {
        const toks = keyToks(k);
        if (toks.length && toks.every(t => new RegExp("\\b" + esc(t) + "\\b", "i").test(s))) {
          const len = toks.join(" ").length;
          if (len > bestLen) { best = k; bestLen = len; }
        }
      });
      return best;
    };
    const used = new Set();
    // 1) the line that carries a company suffix (Pte Ltd, Co., Inc ...)
    const corpLines = [];
    lines.forEach((l, i) => {
      if (CORP.test(l) && l.length <= 90 && !TITLE.test(l.replace(/\b(register|group|sales)\b/gi, "")) && !/\b(approved|certified|member|agent for|agents for|authori[sz]ed)\b/i.test(l)) corpLines.push(i);
    });
    const compLine = corpLines.find(i => !ADDR.test(lines[i].replace(CORP, ""))) ?? corpLines[0] ?? -1;
    if (compLine > -1) {
      out.company_full = lines[compLine]
        .replace(/^(?:[^A-Za-z぀-鿿]+|\S*[)\]]\s+|[a-z]\S*\s+|\d+\s+)+/, "")   // leading junk like "9 ", "hours) ", "P M C] "
        .replace(/^[A-Z](?:\s+[A-Z]){1,3}\]?\s+/, "")
        .trim();
      used.add(compLine);
      // "GROUP" / "LTD" alone: the name is on the line above
      const distinct = out.company_full.toLowerCase().replace(CORP, " ").split(/[^a-z]+/).filter(w => w.length >= 3 && !GENERIC.has(w) && !COUNTRIES.some(([c]) => c.toLowerCase() === w));
      if (!distinct.length && compLine > 0 && !used.has(compLine - 1) && !/\d/.test(lines[compLine - 1]) && lines[compLine - 1].length <= 50) {
        out.company_full = lines[compLine - 1] + " " + out.company_full;
        used.add(compLine - 1);
      }
    }
    // 2) decide the index company: known email domain > known name on the company line > known name anywhere
    let idx = "";
    for (const e of emails) { const d = e.split("@")[1]; if (d && domains[d]) { idx = domains[d]; break; } }
    if (!idx && out.company_full) idx = knownIn(out.company_full);
    if (!idx && !out.company_full) {
      const mentionFree = lines.filter(l => !/\b(approved|certified|member|agent for|agents for|authori[sz]ed|class|classification)\b/i.test(l)).join("\n");
      idx = knownIn(mentionFree);
      if (idx) {
        const t0 = keyToks(idx)[0] || idx.toLowerCase();
        const li = lines.findIndex((l, i) => !used.has(i) && l.toLowerCase().includes(t0));
        if (li > -1) { out.company_full = lines[li]; used.add(li); }
      }
    }
    const shortName = s => s.replace(/\b(pte\.?|ltd\.?|limited|private|co\.?,?|inc\.?|corp\.?|corporation|gmbh|llc|l\.l\.c|b\.v\.?|s\.a\.?|fzco|fze|sdn\.?\s*bhd|bhd)\b\.?/gi, "")
      .replace(/[\s,.()\-&]+$/g, "").replace(/\s{2,}/g, " ").trim();
    const titleCase = s => s === s.toUpperCase() ? s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\b(Of|And|The)\b/g, w => w.toLowerCase()) : s;
    out.company = idx || (out.company_full ? titleCase(shortName(out.company_full)) : "");
    if (!out.company && emails.length) {
      const d = (emails.map(e => e.split("@")[1]).find(x => x && !FREEMAIL.test(x)) || "");
      if (d) {
        const stem = d.split(".")[0];
        // a known company hidden in the domain, e.g. rmsmarineservice.com -> RMS Marine Service
        let best = "", bestLen = 0;
        known.forEach(k => { const t = keyToks(k).filter(x => x.length >= 3); if (t.length && t.every(x => stem.includes(x)) && t.join("").length > bestLen) { best = k; bestLen = t.join("").length; } });
        out.company = best || stem.charAt(0).toUpperCase() + stem.slice(1);
      }
    }

    // Title / department lines
    const titleIdx = [];
    lines.forEach((l, i) => {
      if (used.has(i)) return;
      if (TITLE.test(l) && l.length <= 70 && !ADDR.test(l) && !CORP.test(l.replace(/\b(sales|group)\b/gi, ""))) titleIdx.push(i);
    });
    const deptIdx = [];
    lines.forEach((l, i) => { if (!used.has(i) && !titleIdx.includes(i) && DEPT.test(l) && !ADDR.test(l) && l.length <= 60) deptIdx.push(i); });

    // Name: score remaining short alphabetic lines
    const localParts = emails.map(e => e.split("@")[0].toLowerCase().replace(/[^a-z]/g, " "));
    const localJoined = emails.map(e => e.split("@")[0].toLowerCase().replace(/[^a-z]/g, "")).join(" ");
    // Words that tie a candidate to the company rather than a person
    const companyWords = new Set();
    [out.company_full, idx, ...emails.map(e => e.split("@")[1] || ""), ...sites].join(" ").toLowerCase()
      .split(/[^a-z]+/).filter(w => w.length >= 3).forEach(w => companyWords.add(w));
    const NOT_NAME = new Set("regional business development premises number support division center centre department section global sales marketing service services technical customer general manager director engineer executive officer assistant senior junior chief head of the and for by our your powering trust earned quality since expert member approved certified headquarters solution provider finance world trade dept suppliers supply solutions system systems marine maritime offshore shipping ship ships engineering trading company limited singapore china japan korea philippines india asia pacific international overseas branch office tel fax mobile email web website address road street avenue building tower floor unit level www com net org http https co ltd pte inc corp group holdings".split(" "));
    const isNameWord = w => /^(?:[A-Z][a-zA-Z'\-]*|[A-Z]\.|l[a-z]{2,}|Mc[A-Z][a-z]+|O'[A-Z][a-z]+|bin|binti|van|von|de|der|den|da|del|dos|le|la)\.?$/.test(w);
    const hasVowel = w => /[aeiouyAEIOUY]/.test(w) || /^[A-Z]\.?$/.test(w);
    let bestName = -1, bestScore = -99, bestText = "";
    lines.forEach((l, i) => {
      if (used.has(i)) return;
      const words = l.replace(/^(mr|ms|mrs|miss|dr|capt|c\/e)\.?\s+/i, "").replace(/[(（].*$/, "").split(/[\s,|•·]+/).filter(Boolean);
      // try every run of 1-4 name-like words in the line
      for (let a = 0; a < words.length; a++) {
        for (let b = a + 1; b <= Math.min(words.length, a + 4); b++) {
          const span = words.slice(a, b);
          if (!span.every(isNameWord) || !span.every(hasVowel)) break;
          const lw = span.map(w => w.toLowerCase().replace(/^l(?=[a-z]{2})/, "i").replace(/[^a-z]/g, "")).filter(w => w.length >= 2);
          if (!lw.length) continue;
          let s = 0;
          const strong = lw.filter(w => w.length >= 3 && localJoined.includes(w)).length;
          s += strong * 3;
          if (lw.some(w => localParts.some(p => p.split(" ").includes(w)))) s += 1;
          if (span.length >= 2 && span.length <= 3) s += 2; else if (span.length === 4) s += 1; else s -= 1;
          if (span.length === words.length) s += 1;                       // the whole line is the name
          if (titleIdx.includes(i + 1) || titleIdx.includes(i + 2) || deptIdx.includes(i + 1)) s += 2;
          if (titleIdx.includes(i) && !strong) s -= 4;
          if (deptIdx.includes(i) && !strong) s -= 3;
          if ((CORP.test(span.join(" ")) || ADDR.test(span.join(" "))) && !strong) s -= 4;
          if (ADDR.test(l) && !strong) s -= 3;
          if (COUNTRIES.some(([c]) => c.toLowerCase() === span.join(" ").toLowerCase())) s -= 6;
          const bad = lw.filter(w => NOT_NAME.has(w) || COUNTRIES.some(([c]) => c.toLowerCase() === w)).length;
          s -= bad * 3;
          const cw = lw.filter(w => companyWords.has(w) && !localJoined.includes(w)).length;
          s -= cw * 3;
          if (span.some(w => /^[A-Z]{2,}$/.test(w)) && span.some(w => /^[A-Z][a-z]/.test(w)) && !strong) s -= 1;
          if (span.every(w => w.length <= 2)) s -= 3;
          if (s > bestScore || (s === bestScore && span.join(" ").length > bestText.length)) { bestScore = s; bestName = i; bestText = span.join(" "); }
        }
      }
    });
    if (bestName > -1 && bestScore >= 1) {
      out.name = bestText.replace(/\b l(?=[a-z]{2})/g, " I").replace(/^l(?=[a-z]{2})/, "I").replace(/[.,]+$/, "");
      // fix "lwamoto" -> "Iwamoto" style misreads
      out.name = out.name.split(" ").map(w => /^l[a-z]{2,}$/.test(w) ? "I" + w.slice(1) : w).join(" ");
      used.add(bestName);
      const rest = lines[bestName].split(/,\s*/).slice(1).join(", ");
      if (rest && TITLE.test(rest)) out.title = rest;
    }
    // Pick the title closest to the name
    if (!out.title && titleIdx.length) {
      const t = titleIdx.filter(i => !used.has(i)).sort((a, b) => Math.abs(a - bestName) - Math.abs(b - bestName))[0];
      if (t !== undefined) { out.title = lines[t]; used.add(t); }
    }
    const d = deptIdx.filter(i => !used.has(i)).sort((a, b) => Math.abs(a - bestName) - Math.abs(b - bestName))[0];
    if (d !== undefined && Math.abs(d - bestName) <= 3) { out.department = lines[d]; used.add(d); }

    // Address: lines that look like an address
    const addr = [];
    lines.forEach((l, i) => {
      if (used.has(i)) return;
      if (ADDR.test(l) || COUNTRIES.some(([c, re]) => new RegExp("^" + c + "\\b", "i").test(l))) addr.push(l);
    });
    out.address = addr.join(", ").replace(/\s*,\s*,/g, ",").slice(0, 240);

    // Country
    const where = out.address + " " + out.phone + " " + out.mobile + " " + out.fax;
    for (const [c, re] of COUNTRIES) if (re.test(out.address)) { out.country = c; break; }
    if (!out.country) for (const [c, re] of COUNTRIES) if (re.test(where)) { out.country = c; break; }

    return out;
  }

  const api = { parseCard, isMobileNumber };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.CardParser = api;
})(typeof self !== "undefined" ? self : this);
