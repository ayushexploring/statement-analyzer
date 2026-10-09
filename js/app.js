(function () {
  'use strict';

  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const $ = id => document.getElementById(id);
  const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
  const fmt = v => inr.format(v || 0);
  const MONTH_FMT = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });
  const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const state = {
    fileName: '',
    fileBytes: null,
    cards: (window.CARD_CONFIG || []).map(c => ({ name: c.name, bank: [...(c.bank || [])], match: [...(c.match || [])], last4: c.last4 || '' })),
    txns: [],
    month: 'all',
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function monthLabel(key) { const [y, m] = key.split('-'); return MONTH_FMT.format(new Date(+y, +m - 1, 1)); }
  function setStatus(msg, isError) {
    $('status').textContent = msg;
    $('status').classList.toggle('error', !!isError);
  }

  // ---------- File loading ----------
  const drop = $('drop');
  $('file').addEventListener('change', e => e.target.files[0] && loadFile(e.target.files[0]));
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });

  $('pwForm').addEventListener('submit', e => {
    e.preventDefault();
    openPdf($('pw').value);
  });

  async function loadFile(file) {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setStatus('Please choose a PDF file.', true);
      return;
    }
    state.fileName = file.name;
    state.fileBytes = new Uint8Array(await file.arrayBuffer());
    $('pwForm').hidden = true;
    $('pw').value = '';
    openPdf();
  }

  async function openPdf(password) {
    setStatus('Reading PDF…');
    try {
      // pdf.js transfers the buffer to its worker, so pass a copy to allow retries with a password.
      const doc = await pdfjsLib.getDocument({ data: state.fileBytes.slice(), password: password || undefined }).promise;
      $('pwForm').hidden = true;
      const pages = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        pages.push(content.items.map(it => ({
          str: it.str,
          x: it.transform[4],
          y: it.transform[5],
          w: it.width,
          h: Math.abs(it.transform[3]) || it.height || 8,
        })));
      }
      analyze(pages);
    } catch (err) {
      if (err && err.name === 'PasswordException') {
        $('pwForm').hidden = false;
        $('pw').focus();
        setStatus(err.code === 2 ? 'Incorrect password, try again.' : '', err.code === 2);
        return;
      }
      console.error(err);
      setStatus('Could not read this PDF: ' + (err && err.message ? err.message : err), true);
    }
  }

  // ---------- Analysis ----------
  function analyze(pages) {
    const res = SBIParser.parseStatement(pages);
    $('rawText').textContent = res.rawText;
    if (!res.txns.length) {
      $('results').hidden = false;
      setStatus('No transactions found. Is this an SBI account statement with selectable text (not a scanned image)? See "Debug: extracted text" below.', true);
      renderAll();
      return;
    }
    state.txns = res.txns.map((t, i) => Object.assign(t, { id: i, month: monthKey(t.date), manual: false }));
    classifyAll();

    const months = [...new Set(state.txns.map(t => t.month))].sort();
    // Default to the month with the most transactions (a "monthly" statement may include a day or two of another month).
    const counts = months.map(m => state.txns.filter(t => t.month === m).length);
    state.month = months.length === 1 ? months[0] : months[counts.indexOf(Math.max(...counts))];
    $('month').innerHTML = (months.length > 1 ? '<option value="all">All months</option>' : '') +
      months.map(m => `<option value="${m}">${monthLabel(m)}</option>`).join('');
    $('month').value = state.month;

    const first = state.txns[0].date, last = state.txns[state.txns.length - 1].date;
    const unverified = state.txns.filter(t => t.uncertain).length;
    $('fileInfo').textContent = `${state.fileName} · ${state.txns.length} transactions · ${DATE_FMT.format(first)} – ${DATE_FMT.format(last)}`;
    setStatus(unverified
      ? `Parsed ${state.txns.length} transactions. ${unverified} could not be checked against the running balance (marked ⚠).`
      : `Parsed ${state.txns.length} transactions. All amounts check out against the running balance.`);
    $('results').hidden = false;
    renderCardEditor();
    renderAll();
  }

  function classifyAll() {
    for (const t of state.txns) {
      if (t.manual) continue;
      const r = Classifier.classify(t, state.cards);
      t.category = r.category;
      t.reason = r.reason;
    }
  }

  function visibleTxns() {
    return state.month === 'all' ? state.txns : state.txns.filter(t => t.month === state.month);
  }

  // ---------- Rendering ----------
  function renderAll() {
    renderSummary();
    renderTxns();
  }

  function computeTotals() {
    const txns = visibleTxns();
    const perCard = state.cards.map(() => ({ sum: 0, n: 0 }));
    const tot = { unassigned: 0, unassignedN: 0, other: 0, otherN: 0, excluded: 0, credits: 0 };
    for (const t of txns) {
      if (t.credit) tot.credits += t.credit;
      if (!t.debit) continue;
      const c = t.category;
      if (c.startsWith('card:')) {
        const pc = perCard[+c.slice(5)];
        if (pc) { pc.sum += t.debit; pc.n++; }
      } else if (c === 'cc-unassigned') { tot.unassigned += t.debit; tot.unassignedN++; }
      else if (c === 'exclude') tot.excluded += t.debit;
      else { tot.other += t.debit; tot.otherN++; }
    }
    tot.cards = perCard.reduce((a, p) => a + p.sum, 0) + tot.unassigned;
    tot.expense = tot.cards + tot.other;
    return { perCard, tot };
  }

  function renderSummary() {
    const { perCard, tot } = computeTotals();
    const label = state.month === 'all' ? 'All months' : monthLabel(state.month);
    $('kpis').innerHTML = [
      ['Total expense · ' + label, tot.expense, 'main'],
      ['Credit card payments', tot.cards, ''],
      ['Other spends', tot.other, ''],
      ['Money in (credits)', tot.credits, ''],
    ].map(([l, v, cls]) => `<div class="kpi ${cls}"><div class="label">${esc(l)}</div><div class="value">${fmt(v)}</div></div>`).join('');

    const max = Math.max(1, ...perCard.map(p => p.sum), tot.unassigned);
    const row = (name, p, cls = '') => `<tr class="${cls}${p.sum ? '' : ' zero'}">
        <td>${esc(name)}</td><td class="num">${p.n || '–'}</td><td class="num">${fmt(p.sum)}</td>
        <td class="barcell"><div class="bar" style="width:${(p.sum / max) * 100}%"></div></td></tr>`;
    let html = '<thead><tr><th>Card</th><th class="num">Payments</th><th class="num">Amount</th><th></th></tr></thead><tbody>';
    html += state.cards.map((c, i) => row(c.name || `Card ${i + 1}`, perCard[i])).join('');
    if (tot.unassignedN) html += row('Unassigned card payments ⚠', { sum: tot.unassigned, n: tot.unassignedN }, 'warn');
    html += `<tr class="subtotal"><td>Total card payments</td><td class="num">${perCard.reduce((a, p) => a + p.n, 0) + tot.unassignedN}</td><td class="num">${fmt(tot.cards)}</td><td></td></tr></tbody>`;
    $('cardTable').innerHTML = html;

    $('totalTable').innerHTML = `<tbody>
      <tr><td>Credit card payments</td><td class="num">${fmt(tot.cards)}</td></tr>
      <tr><td>Other spends (UPI, ATM, transfers, bills…) <span class="muted small">${tot.otherN} txns</span></td><td class="num">${fmt(tot.other)}</td></tr>
      <tr class="total"><td>Total expense</td><td class="num">${fmt(tot.expense)}</td></tr>
      ${tot.excluded ? `<tr class="zero"><td>Excluded (not counted)</td><td class="num">${fmt(tot.excluded)}</td></tr>` : ''}
      <tr class="zero"><td>Money in (credits)</td><td class="num">${fmt(tot.credits)}</td></tr>
    </tbody>`;
  }

  function categoryOptions(selected) {
    const opts = state.cards.map((c, i) => [`card:${i}`, '💳 ' + (c.name || `Card ${i + 1}`)]);
    opts.push(['cc-unassigned', '💳 Card payment (unassigned)'], ['other', 'Other spend'], ['exclude', 'Exclude (self transfer / investment)']);
    return opts.map(([v, l]) => `<option value="${v}"${v === selected ? ' selected' : ''}>${esc(l)}</option>`).join('');
  }

  function rowClass(t) {
    if (!t.debit) return '';
    if (t.category === 'cc-unassigned') return 'unassigned';
    if (t.category.startsWith('card:')) return 'cc';
    if (t.category === 'exclude') return 'excluded';
    return '';
  }

  function renderTxns() {
    const f = $('filter').value;
    const q = $('search').value.trim().toUpperCase();
    const list = visibleTxns().filter(t => {
      if (q && !t.desc.toUpperCase().includes(q)) return false;
      switch (f) {
        case 'debits': return !!t.debit;
        case 'cards': return t.debit && (t.category.startsWith('card:') || t.category === 'cc-unassigned');
        case 'unassigned': return t.debit && t.category === 'cc-unassigned';
        case 'other': return t.debit && t.category === 'other';
        case 'credits': return !!t.credit;
        default: return true;
      }
    });
    let html = '<thead><tr><th>Date</th><th>Narration</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th><th>Category</th></tr></thead><tbody>';
    if (!list.length) html += '<tr><td colspan="6" class="muted">No transactions.</td></tr>';
    for (const t of list) {
      const flag = t.uncertain ? ' <span class="flag" title="Direction could not be verified against the running balance">⚠</span>' : '';
      html += `<tr data-id="${t.id}" class="${rowClass(t)}">
        <td class="num">${DATE_FMT.format(t.date)}</td>
        <td class="desc">${esc(t.desc)}${t.reason ? `<span class="why">${esc(t.reason)}${t.manual ? ' (manually set)' : ''}</span>` : (t.manual ? '<span class="why">manually set</span>' : '')}</td>
        <td class="num">${t.debit ? fmt(t.debit) + flag : ''}</td>
        <td class="num credit">${t.credit ? fmt(t.credit) : ''}</td>
        <td class="num">${t.balance !== null && t.balance !== undefined ? fmt(t.balance) : ''}</td>
        <td>${t.debit ? `<select aria-label="Category">${categoryOptions(t.category)}</select>` : '<span class="muted small">credit</span>'}</td>
      </tr>`;
    }
    $('txnTable').innerHTML = html + '</tbody>';
  }

  $('txnTable').addEventListener('change', e => {
    if (e.target.tagName !== 'SELECT') return;
    const tr = e.target.closest('tr');
    const t = state.txns[+tr.dataset.id];
    t.category = e.target.value;
    t.manual = true;
    t.reason = '';
    tr.className = rowClass(t);
    renderSummary();
  });
  $('month').addEventListener('change', e => { state.month = e.target.value; renderAll(); });
  $('filter').addEventListener('change', renderTxns);
  $('search').addEventListener('input', renderTxns);

  // ---------- Card editor ----------
  const split = s => s.split(',').map(x => x.trim()).filter(Boolean);

  function renderCardEditor() {
    $('cardEditor').innerHTML = `<div class="card-row head"><span>Card name</span><span>Bank words</span><span>Strong match words (UPI ID, biller, card no.)</span><span>Last 4</span><span></span></div>` +
      state.cards.map((c, i) => `<div class="card-row" data-i="${i}">
        <input type="text" data-k="name" value="${esc(c.name)}" placeholder="Card name" aria-label="Card name">
        <input type="text" data-k="bank" value="${esc(c.bank.join(', '))}" placeholder="e.g. HDFC" aria-label="Bank words">
        <input type="text" data-k="match" value="${esc(c.match.join(', '))}" placeholder="e.g. hdfccc@hdfcbank" aria-label="Strong match words">
        <input type="text" data-k="last4" value="${esc(c.last4)}" placeholder="1234" maxlength="4" inputmode="numeric" aria-label="Last 4 digits">
        <button class="btn" data-remove="${i}" title="Remove card" aria-label="Remove card">✕</button>
      </div>`).join('');
  }

  function readCardEditor() {
    $('cardEditor').querySelectorAll('.card-row[data-i]').forEach(row => {
      const c = state.cards[+row.dataset.i];
      const v = k => row.querySelector(`[data-k="${k}"]`).value;
      c.name = v('name').trim();
      c.bank = split(v('bank'));
      c.match = split(v('match'));
      c.last4 = v('last4').trim();
    });
  }

  $('cardEditor').addEventListener('click', e => {
    const i = e.target.dataset.remove;
    if (i === undefined) return;
    readCardEditor();
    state.cards.splice(+i, 1);
    // Category indices shift: re-run automatic matching, drop manual card picks that pointed at removed/shifted cards.
    for (const t of state.txns) {
      if (t.manual && t.category.startsWith('card:')) {
        const idx = +t.category.slice(5);
        if (idx === +i) t.manual = false;
        else if (idx > +i) t.category = 'card:' + (idx - 1);
      }
    }
    renderCardEditor();
    classifyAll();
    renderAll();
  });
  $('addCard').addEventListener('click', () => {
    readCardEditor();
    state.cards.push({ name: '', bank: [], match: [], last4: '' });
    renderCardEditor();
  });
  $('applyRules').addEventListener('click', () => {
    readCardEditor();
    classifyAll();
    renderAll();
    setStatus('Matching rules applied. Manually set categories were kept.');
  });
  $('downloadConfig').addEventListener('click', () => {
    readCardEditor();
    const body = state.cards.map(c => '  ' + JSON.stringify(c).replace(/"(\w+)":/g, '$1: ').replace(/,(?=\w+: )/g, ', ')).join(',\n');
    const src = `/*\n * YOUR CREDIT CARDS: see README.md for how matching works.\n * Generated by Card Spend Analyzer.\n */\nwindow.CARD_CONFIG = [\n${body},\n];\n`;
    download('config.js', src, 'text/javascript');
  });

  // ---------- CSV export ----------
  $('exportCsv').addEventListener('click', () => {
    const { perCard, tot } = computeTotals();
    const q = v => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [['Card', 'Payments', 'Amount'].map(q).join(',')];
    state.cards.forEach((c, i) => lines.push([q(c.name), perCard[i].n, perCard[i].sum.toFixed(2)].join(',')));
    lines.push([q('Unassigned card payments'), tot.unassignedN, tot.unassigned.toFixed(2)].join(','));
    lines.push([q('Total card payments'), '', tot.cards.toFixed(2)].join(','));
    lines.push([q('Other spends'), tot.otherN, tot.other.toFixed(2)].join(','));
    lines.push([q('Total expense'), '', tot.expense.toFixed(2)].join(','));
    lines.push('', ['Date', 'Narration', 'Debit', 'Credit', 'Balance', 'Category'].map(q).join(','));
    const catName = c => c.startsWith('card:') ? (state.cards[+c.slice(5)] || {}).name : ({ 'cc-unassigned': 'Card payment (unassigned)', other: 'Other spend', exclude: 'Excluded', credit: 'Credit' }[c] || c);
    for (const t of visibleTxns()) {
      lines.push([q(DATE_FMT.format(t.date)), q(t.desc), t.debit ? t.debit.toFixed(2) : '', t.credit ? t.credit.toFixed(2) : '',
        t.balance != null ? t.balance.toFixed(2) : '', q(catName(t.category))].join(','));
    }
    download(`card-spend-${state.month}.csv`, lines.join('\n'), 'text/csv');
  });

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
})();
