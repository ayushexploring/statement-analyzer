/*
 * YOUR CREDIT CARDS
 * -----------------
 * Edit this list to match your 14 cards. This file only contains matching
 * rules, never any statement data. You can also edit cards inside the app
 * and use "Download config.js" to replace this file.
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
 * When several cards could match, the longest matching word wins.
 */
window.CARD_CONFIG = [
  { name: 'HDFC Credit Card', bank: ['HDFC'], match: [], last4: '' },
  { name: 'ICICI Credit Card', bank: ['ICICI'], match: [], last4: '' },
  { name: 'SBI Card', bank: ['SBI CARD', 'SBICARD', 'SBI CARDS', 'SBICPSL'], match: ['SBI CARD', 'SBICARD', 'SBICPSL'], last4: '' },
  { name: 'Axis Credit Card', bank: ['AXIS'], match: [], last4: '' },
  { name: 'Kotak Credit Card', bank: ['KOTAK'], match: [], last4: '' },
  { name: 'American Express', bank: ['AMEX', 'AMERICAN EXPRESS'], match: ['AMEX', 'AMERICAN EXPRESS'], last4: '' },
  { name: 'IDFC First Credit Card', bank: ['IDFC'], match: [], last4: '' },
  { name: 'Yes Bank Credit Card', bank: ['YES BANK', 'YESBANK'], match: [], last4: '' },
  { name: 'RBL Credit Card', bank: ['RBL'], match: [], last4: '' },
  { name: 'IndusInd Credit Card', bank: ['INDUSIND'], match: [], last4: '' },
  { name: 'AU Credit Card', bank: ['AU SMALL', 'AU BANK', 'AUBL'], match: [], last4: '' },
  { name: 'HSBC Credit Card', bank: ['HSBC'], match: [], last4: '' },
  { name: 'Standard Chartered Credit Card', bank: ['STANDARD CHARTERED', 'SCB', 'STANCHART'], match: [], last4: '' },
  { name: 'OneCard', bank: ['ONECARD', 'ONE CARD'], match: ['ONECARD', 'FPL TECHNOLOGIES'], last4: '' },
];
