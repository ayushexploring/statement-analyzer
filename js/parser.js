/*
 * SBI statement parser.
 * Input: text items extracted by pdf.js (per page), output: list of transactions.
 * Works on layout (x/y positions) so it copes with wrapped descriptions and
 * different column orders (Debit/Credit vs Withdrawal/Deposit).
 */
(function (root) {
  'use strict';

  const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, SEPT: 8, OCT: 9, NOV: 10, DEC: 11 };
  const AMOUNT_RE = /^\(?-?(?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{2}\)?(?:CR|DR)?$/i;
  const CRDR_RE = /^(CR|DR)\.?$/i;
  const OPENING_RE = /(OPENING\s+BALANCE|BALANCE\s+AS\s+ON|BROUGHT\s+FORWARD|BALANCE\s+B\/?F|B\/F\s+BALANCE)/i;
  const STOP_RE = /(CLOSING\s+BALANCE|STATEMENT\s+SUMMARY|COMPUTER\s+GENERATED|PAGE\s+\d+\s+OF\s+\d+|^\s*\*+|TOTAL\s+(DEBITS?|CREDITS?|WITHDRAWALS?|DEPOSITS?)|CARRIED\s+FORWARD|C\/F)/i;

  const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  function isMonthName(w) {
    const u = w.toUpperCase();
    return MONTH_NAMES.some(n => n.startsWith(u) && u.length >= 3);
  }

  function parseAmount(s) {
    const t = s.trim().toUpperCase();
    let v = parseFloat(t.replace(/[(),]|CR|DR/g, ''));
    if (/DR$/.test(t) || /^\(.*\)$/.test(t)) v = -Math.abs(v);
    return v;
  }

  function round2(v) { return Math.round(v * 100) / 100; }

  // Split each pdf.js item into whitespace-separated tokens with estimated x ranges.
  function tokenize(items) {
    const out = [];
    for (const it of items) {
      const len = it.str.length || 1;
      const re = /\S+/g;
      let m;
      while ((m = re.exec(it.str))) {
        const x0 = it.x + (m.index / len) * it.w;
        const x1 = it.x + ((m.index + m[0].length) / len) * it.w;
        out.push({ text: m[0], x0, x1, xc: (x0 + x1) / 2, y: it.y, h: it.h });
      }
    }
    return out;
  }

  // Group items of a page into visual lines (top to bottom).
  function groupLines(items, page) {
    const sorted = items.filter(i => i.str && i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of sorted) {
      const tol = Math.max(2, (it.h || 8) * 0.45);
      const line = lines.find(l => Math.abs(l.y - it.y) <= tol);
      if (line) line.items.push(it);
      else lines.push({ y: it.y, page, items: [it] });
    }
    lines.sort((a, b) => b.y - a.y);
    for (const l of lines) {
      l.items.sort((a, b) => a.x - b.x);
      l.tokens = tokenize(l.items);
      l.text = l.tokens.map(t => t.text).join(' ');
      l.h = Math.max(...l.items.map(i => i.h || 8));
    }
    return lines;
  }

  function isAmountToken(t) { return AMOUNT_RE.test(t.text); }

  function detectHeader(line) {
    if (line.tokens.length > 30 || line.tokens.some(isAmountToken)) return null;
    const find = re => line.tokens.find(t => re.test(t.text));
    const bal = find(/^BALANCE/i);
    const deb = find(/^(DEBITS?|WITHDRAWALS?|DR\.?)$/i) || find(/^(DEBIT|WITHDRAWAL)/i);
    const cre = find(/^(CREDITS?|DEPOSITS?|CR\.?)$/i) || find(/^(CREDIT|DEPOSIT)/i);
    if (!bal || !deb || !cre) return null;
    const date = find(/DATE/i);
    const ref = find(/^(REF\b|CHQ|CHEQUE)/i);
    return { debit: deb.xc, credit: cre.xc, balance: bal.xc, date: date ? date.xc : null, ref: ref ? ref.x0 : null };
  }

  // Try to read a date at the start of a line (optionally after a serial number).
  function leadingDate(line, nextLine) {
    const toks = line.tokens;
    let start = 0;
    if (toks.length > 1 && /^\d{1,4}$/.test(toks[0].text) && /^\d{1,2}[-/.]/.test(toks[1].text)) start = 1;
    const head = toks.slice(start, start + 4).map(t => t.text).join(' ');

    let m = head.match(/^(\d{1,2})[\s\-/.]([A-Za-z]{3,9})[\s\-/.,]*(\d{4}|\d{2}(?![\d:]))?/);
    if (m && isMonthName(m[2])) {
      let year = m[3] ? +m[3] : null;
      let yearFromNext = false;
      if (year === null && nextLine && nextLine.tokens[0] && /^(19|20)\d{2}$/.test(nextLine.tokens[0].text)) {
        year = +nextLine.tokens[0].text;
        yearFromNext = true;
      }
      if (year !== null && year < 100) year += 2000;
      const mon = MONTHS[m[2].toUpperCase().slice(0, 3)];
      return { day: +m[1], month: mon, year, matched: m[0], start, yearFromNext };
    }
    m = head.match(/^(\d{1,2})[\-/.](\d{1,2})[\-/.](\d{4}|\d{2})\b/);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) {
      let year = +m[3];
      if (year < 100) year += 2000;
      return { day: +m[1], month: +m[2] - 1, year, matched: m[0], start, yearFromNext: false };
    }
    return null;
  }

  // Number of tokens consumed by a matched date string.
  function dateTokenCount(line, d) {
    let acc = '', n = d.start;
    const target = d.matched.replace(/\s+/g, '');
    while (n < line.tokens.length && acc.length < target.length) {
      acc += line.tokens[n].text;
      n++;
    }
    return n;
  }

  function parseLines(lines) {
    const txns = [];
    let cols = null, headerSeen = false, cur = null, opening = null, lastYear = null;

    function finalize() {
      if (!cur) return;
      const t = cur;
      cur = null;
      const amts = t.tokens.filter(isAmountToken);
      if (!amts.length) return;
      let debit = null, credit = null, balance = null, amount = null;
      if (cols) {
        const assigned = { debit: [], credit: [], balance: [] };
        for (const a of amts) {
          const k = ['debit', 'credit', 'balance'].reduce((best, c) =>
            Math.abs(a.xc - cols[c]) < Math.abs(a.xc - cols[best]) ? c : best, 'debit');
          assigned[k].push(a);
        }
        if (assigned.balance.length) balance = parseAmount(assigned.balance[assigned.balance.length - 1].text);
        if (assigned.debit.length) debit = Math.abs(parseAmount(assigned.debit[0].text));
        if (assigned.credit.length) credit = Math.abs(parseAmount(assigned.credit[0].text));
        if (debit === null && credit === null && amts.length >= 2) {
          amount = Math.abs(parseAmount(amts[0].text));
          balance = parseAmount(amts[amts.length - 1].text);
        }
      } else {
        if (amts.length >= 2) {
          amount = Math.abs(parseAmount(amts[0].text));
          balance = parseAmount(amts[amts.length - 1].text);
        } else {
          amount = Math.abs(parseAmount(amts[0].text));
        }
      }
      if (debit !== null && credit !== null) { // both columns filled: unusual, keep the larger as amount
        amount = Math.max(debit, credit); debit = credit = null;
      }
      const amtSet = new Set(amts);
      // Keep the narration column together; push Ref/Cheque column text to the end.
      let ordered = t.tokens;
      if (cols && cols.ref !== null && cols.ref > (cols.date || 0)) {
        const isRef = tok => tok.x0 >= cols.ref - 2;
        ordered = t.tokens.filter(tok => !isRef(tok)).concat(t.tokens.filter(isRef));
      }
      const desc = ordered
        .filter((tok, i) => !amtSet.has(tok) && !(CRDR_RE.test(tok.text) && i > 0 && amtSet.has(ordered[i - 1])))
        .map(tok => tok.text).join(' ')
        .replace(/^(\d{1,2}[\s\-/.](?:[A-Za-z]{3,9}|\d{1,2})[\s\-/.,]*(?:\d{4}|\d{2})?\s+)+/, '')
        .replace(/\s+/g, ' ').trim();
      txns.push({
        date: t.date, desc, balance,
        debit, credit, amount,
        page: t.page,
      });
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const hdr = detectHeader(line);
      if (hdr) { finalize(); cols = hdr; headerSeen = true; continue; }
      const hasAmt = line.tokens.some(isAmountToken);

      if (OPENING_RE.test(line.text)) {
        finalize();
        if (hasAmt && opening === null && !txns.length) {
          const a = line.tokens.filter(isAmountToken);
          opening = parseAmount(a[a.length - 1].text);
        }
        continue;
      }
      if (STOP_RE.test(line.text)) { finalize(); continue; }

      const d = leadingDate(line, lines[i + 1]);
      if (d && (headerSeen || hasAmt)) {
        finalize();
        if (d.year === null) d.year = lastYear || new Date().getFullYear();
        lastYear = d.year;
        const skip = dateTokenCount(line, d);
        const tokens = line.tokens.slice(skip);
        if (d.yearFromNext) lines[i + 1] = Object.assign({}, lines[i + 1], { tokens: lines[i + 1].tokens.slice(1) });
        cur = {
          date: new Date(d.year, d.month, d.day),
          tokens, page: line.page, lastY: line.y, h: line.h,
        };
        continue;
      }
      if (cur) {
        const gap = line.page === cur.page ? cur.lastY - line.y : 0;
        if (line.page !== cur.page || gap > cur.h * 3.5 || (hasAmt && cur.tokens.some(isAmountToken))) {
          finalize();
          continue;
        }
        cur.tokens = cur.tokens.concat(line.tokens);
        cur.lastY = line.y;
      }
    }
    finalize();
    return { txns, opening, headerFound: headerSeen };
  }

  // Use running balance to decide debit vs credit wherever possible.
  function resolveDirections(txns, opening) {
    let prev = opening;
    let verified = 0;
    for (const t of txns) {
      const amt = t.debit ?? t.credit ?? t.amount;
      if (prev !== null && t.balance !== null && amt !== null) {
        const diff = round2(t.balance - prev);
        if (Math.abs(diff + amt) < 0.015) { t.debit = amt; t.credit = null; t.verified = true; verified++; }
        else if (Math.abs(diff - amt) < 0.015) { t.credit = amt; t.debit = null; t.verified = true; verified++; }
      }
      if (t.debit === null && t.credit === null && amt !== null) {
        // Unknown direction and nothing to compare with; treat as debit but flag it.
        t.debit = amt; t.uncertain = true;
      }
      if (t.balance !== null) prev = t.balance;
      else if (prev !== null) prev = round2(prev - (t.debit || 0) + (t.credit || 0));
    }
    // Opening balance was unknown: infer it from the first transaction.
    if (opening === null && txns.length && txns[0].balance !== null) {
      const f = txns[0];
      opening = round2(f.balance + (f.debit || 0) - (f.credit || 0));
    }
    for (const t of txns) delete t.amount;
    return { opening, verified };
  }

  function parseStatement(pages) {
    const lines = [];
    pages.forEach((items, p) => lines.push(...groupLines(items, p + 1)));
    const { txns, opening, headerFound } = parseLines(lines);
    const res = resolveDirections(txns, opening);
    return {
      txns,
      opening: res.opening,
      verified: res.verified,
      headerFound,
      rawText: lines.map(l => `[p${l.page}] ${l.text}`).join('\n'),
    };
  }

  const api = { parseStatement, parseAmount, groupLines };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SBIParser = api;
})(this);
