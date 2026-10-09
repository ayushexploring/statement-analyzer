/*
 * Decides whether a debit is a credit-card bill payment and, if so, which card.
 */
(function (root) {
  'use strict';

  // Narration patterns that indicate a credit-card bill payment.
  const CC_INDICATORS = [
    /CREDIT ?CARD/, /\bCRED\b/, /CRED ?CLUB/, /\bCC ?(PAY|PMT|BILL|PAYMENT)/, /\bCCPAY/, /CARD ?(PAYMENT|PMT|BILL|DUES?)\b/,
    /CARDPAY/, /\bBBPS\b.*\bCARD\b/, /\bCARD\b.*\bBBPS\b/, /\bSBI ?CARDS?\b/, /\bSBICPSL\b/, /\bAMEX\b/,
    /AMERICAN EXPRESS/, /\bONE ?CARD\b/, /\bCHEQ\b/, /\bCCBP\b/,
  ];
  // Apps that pay the card on your behalf: the bank named in the narration is theirs, not the card's.
  const INTERMEDIARIES = /\bCRED\b|CRED ?CLUB|\bCHEQ\b|PHONEPE|PAYTM|GPAY|GOOGLE ?PAY|AMAZON ?PAY|MOBIKWIK|BILLDESK|\bPAYZAPP\b|\bPOWER ?ACCESS\b/;

  function norm(s) {
    return ' ' + String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() + ' ';
  }
  function hasWord(text, word) {
    const w = norm(word).trim();
    return w.length > 0 && text.includes(' ' + w + ' ');
  }
  // Also match across glued tokens like "HDFCCREDITCARD" by comparing without spaces.
  function hasCompact(text, word) {
    const w = norm(word).replace(/ /g, '');
    return w.length >= 4 && text.replace(/ /g, '').includes(w);
  }

  function last4Regex(last4) {
    return new RegExp('[X*\\d]{4,}[ -]?' + last4 + '(?!\\d)');
  }

  function isCardPayment(desc) {
    const t = norm(desc);
    return CC_INDICATORS.some(re => re.test(t));
  }

  /**
   * @returns {{category: string, reason: string}}
   *   category: 'card:<index>' | 'cc-unassigned' | 'other'
   */
  function classify(txn, cards) {
    if (!txn.debit) return { category: 'credit', reason: '' };
    const raw = String(txn.desc || '').toUpperCase();
    const t = norm(txn.desc);
    const looksCC = isCardPayment(txn.desc);
    const viaApp = INTERMEDIARIES.test(t);

    let best = null;
    const consider = (i, len, why) => {
      if (!best || len > best.len) best = { i, len, why };
    };

    cards.forEach((c, i) => {
      for (const w of c.match || []) {
        if (hasWord(t, w) || hasCompact(t, w)) consider(i, 100 + norm(w).length, `matched "${w}"`);
      }
      if (c.last4 && /^\d{4}$/.test(c.last4) && last4Regex(c.last4).test(raw)) consider(i, 200, `card ending ${c.last4}`);
      if (looksCC && !viaApp) {
        for (const w of c.bank || []) {
          if (hasWord(t, w)) consider(i, norm(w).length, `card payment mentioning "${w}"`);
        }
      }
    });

    if (best) return { category: 'card:' + best.i, reason: best.why };
    if (looksCC) return { category: 'cc-unassigned', reason: viaApp ? 'paid via app, card not identifiable' : 'card payment, issuer not recognised' };
    return { category: 'other', reason: '' };
  }

  root.Classifier = { classify, isCardPayment };
})(this);
