/*
 * YOUR CREDIT CARDS
 * -----------------
 * This file only contains matching rules, never any statement data.
 * You can also edit cards inside the app and use "Download config.js"
 * to replace this file.
 *
 *  name   : label shown in the report
 *  bank   : issuer words. Used ONLY when the narration already looks like a
 *           credit-card payment (e.g. contains "CREDIT CARD", "CC PAYMENT", "BBPS ... CARD").
 *           Ignored for payments made through apps like CRED, because there
 *           the bank name in the narration is the app's bank, not the card's.
 *  match  : strong words. If any appears in the narration, the payment goes to
 *           this card, whatever else the narration says. Good choices: the UPI ID / VPA you pay the card to,
 *           a biller ID, the full or masked card number, a NEFT beneficiary name.
 *  last4  : last 4 digits of the card. Matches masked/full card numbers in the
 *           narration (e.g. "XXXXXXXXXXXX1234", "4375********1234").
 *
 * Matching is case-insensitive and ignores punctuation.
 * The longest matching word wins. If several cards match equally well
 * (e.g. two cards from the same bank), the payment is left unassigned so you
 * can pick, so fill in last4 / match for cards that share a bank.
 */
window.CARD_CONFIG = [
  { name: 'SBI SimplySave RuPay', bank: ['SBI CARD', 'SBICARD', 'SBI CARDS', 'SBICPSL'], match: ['SBICPSL'], last4: '' },
  { name: 'SBI Cashback Mastercard', bank: ['SBI CARD', 'SBICARD', 'SBI CARDS', 'SBICPSL'], match: ['SBICPSL'], last4: '' },
  { name: 'SBI PhonePe Black RuPay', bank: ['SBI CARD', 'SBICARD', 'SBI CARDS', 'SBICPSL'], match: ['SBICPSL'], last4: '' },
  { name: 'IndusInd Tiger Visa', bank: ['INDUSIND', 'INDUS IND'], match: [], last4: '' },
  { name: 'ICICI Amazon Pay Visa', bank: ['ICICI'], match: [], last4: '' },
  { name: 'ICICI Platinum Visa', bank: ['ICICI'], match: [], last4: '' },
  { name: 'ICICI Coral RuPay', bank: ['ICICI'], match: [], last4: '' },
  { name: 'HDFC Millennia Mastercard', bank: ['HDFC'], match: [], last4: '' },
  { name: 'HDFC Swiggy Mastercard', bank: ['HDFC'], match: [], last4: '' },
  { name: 'Axis IOCL RuPay', bank: ['AXIS'], match: [], last4: '' },
  { name: 'IDFC First Select Mastercard', bank: ['IDFC'], match: [], last4: '' },
  { name: 'Federal Scapia Visa', bank: ['FEDERAL', 'SCAPIA'], match: ['SCAPIA'], last4: '' },
  { name: 'Federal Scapia RuPay', bank: ['FEDERAL', 'SCAPIA'], match: ['SCAPIA'], last4: '' },
  { name: 'BOB Eterna RuPay', bank: ['BOB', 'BANK OF BARODA', 'BOBCARD', 'BOB CARD'], match: ['BOBCARD', 'BOB FINANCIAL'], last4: '' },
];
