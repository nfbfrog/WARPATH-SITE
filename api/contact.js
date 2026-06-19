// Warpath Collective lead-capture endpoint.
// Receives the signup form POST and emails the lead via Resend.
// Env vars (set in Vercel -> Project -> Settings -> Environment Variables):
//   RESEND_API_KEY  - your Resend API key (starts with "re_").
//   MAIL_FROM       - verified sender address (e.g. hello@warpathcollective.com).
//   LEAD_TO         - where leads are delivered; comma-separate for multiple
//                     (e.g. "ethan@warpathcollective.com, matt@warpathcollective.com").

const { Resend } = require('resend');

// Brand palette
const CHARCOAL = '#0D0D0F';
const CARD = '#F6F4EE';
const GOLD = '#A88B4D';
const RUST = '#7A1E1B';
const INK = '#4b463c';        // warm body text
const INK_STRONG = '#15120c'; // headlines / emphasis
const QUOTE = '#5c574b';
const FOOT = '#8a8d92';       // footer subtext on charcoal
const HAIR = '#e3ddcc';       // hairline rules on the cream card

// Assets (served from the site root)
const SYMBOL_URL = 'https://warpathcollective.com/warpath-symbol-cream.png';
const WORDMARK_URL = 'https://warpathcollective.com/warpath-wordmark.png'; // wordmark cropped from the logo (carved brand font)
const FONT_URL = 'https://warpathcollective.com/fonts/BaumWell.ttf';

// One body font (BaumWell) with a matching serif fallback for clients that strip web fonts (e.g. Gmail).
const FONT = "'BaumWell',Georgia,'Times New Roman',serif";

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// Wraps inner HTML in the branded frame: symbol + wordmark, content, charcoal footer.
function shell(preheader, inner) {
  return '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light only">' +
    '<style>@font-face{font-family:\'BaumWell\';src:url(\'' + FONT_URL + '\') format(\'truetype\');font-weight:normal;font-style:normal;font-display:swap;}</style>' +
    '</head>' +
    '<body style="margin:0;padding:0;background:' + CHARCOAL + ';">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">' + esc(preheader) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + CHARCOAL + ';padding:34px 14px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:' + CARD + ';border-radius:14px;overflow:hidden;font-family:' + FONT + ';">' +
    // header: ship/W symbol + Enchanted Land wordmark image
    '<tr><td align="center" style="padding:44px 44px 0;">' +
    '<img src="' + SYMBOL_URL + '" width="80" alt="" style="display:block;margin:0 auto 12px;width:80px;height:auto;border:0;">' +
    '<img src="' + WORDMARK_URL + '" width="300" alt="Warpath Collective" style="display:block;margin:0 auto;width:300px;max-width:84%;height:auto;border:0;">' +
    '</td></tr>' +
    '<tr><td align="center" style="padding:22px 0 0;"><div style="width:46px;height:1px;background:' + GOLD + ';line-height:1px;font-size:1px;">&nbsp;</div></td></tr>' +
    // content
    '<tr><td style="padding:32px 50px 46px;font-family:' + FONT + ';color:' + INK + ';">' + inner + '</td></tr>' +
    // footer
    '<tr><td align="center" style="background:' + CHARCOAL + ';padding:24px 30px;">' +
    '<img src="' + WORDMARK_URL + '" width="180" alt="Warpath Collective" style="display:block;margin:0 auto 8px;width:180px;height:auto;border:0;">' +
    '<div style="font-family:' + FONT + ';font-size:12.5px;letter-spacing:.5px;color:' + FOOT + ';">warpathcollective.com</div>' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

// Eyebrow label (tracked caps).
function eyebrow(text, color) {
  return '<div style="font-family:' + FONT + ';font-size:12px;letter-spacing:2.5px;color:' + color + ';text-transform:uppercase;">' + text + '</div>';
}

// A labeled detail row for the internal lead email. valueHtml is already-safe HTML.
function row(label, valueHtml) {
  return '<tr>' +
    '<td style="padding:13px 0;border-top:1px solid ' + HAIR + ';vertical-align:top;width:128px;' +
    'font-family:' + FONT + ';font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:' + GOLD + ';">' + label + '</td>' +
    '<td style="padding:13px 0;border-top:1px solid ' + HAIR + ';vertical-align:top;font-family:' + FONT + ';font-size:15.5px;line-height:1.6;color:' + INK + ';">' + valueHtml + '</td>' +
    '</tr>';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const { name, email, business, message, botcheck } = body;

  // Honeypot: bots fill this; humans never see it.
  if (botcheck) return res.status(200).json({ success: true });

  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  // Reject malformed addresses (also keeps the reply-to header clean).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    return res.status(400).json({ success: false, error: 'Invalid email address' });
  }

  // Cap field lengths so a bot can't post a multi-megabyte payload.
  const clip = function (s, max) { return String(s == null ? '' : s).trim().slice(0, max); };
  const lead = {
    name: clip(name, 200),
    email: clip(email, 320),
    business: clip(business, 200),
    message: clip(message, 5000)
  };

  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.MAIL_FROM;
  const to = (process.env.LEAD_TO || fromAddr || '')
    .split(',').map(function (s) { return s.trim(); }).filter(Boolean);

  if (!apiKey || !fromAddr || !to.length) {
    return res.status(500).json({ success: false, error: 'Email not configured' });
  }

  const from = '"Warpath Collective" <' + fromAddr + '>';
  const msgHtml = esc(lead.message).replace(/\n/g, '<br>');

  // --- Internal "new lead" email -------------------------------------------
  const leadInner =
    eyebrow('New lead', RUST) +
    '<div style="font-family:' + FONT + ';font-size:25px;line-height:1.25;color:' + INK_STRONG + ';margin:12px 0 24px;">' + esc(lead.name) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
    row('Email', '<a href="mailto:' + esc(lead.email) + '" style="color:' + RUST + ';text-decoration:none;">' + esc(lead.email) + '</a>') +
    row('Business', esc(lead.business || '—')) +
    row('What they need', msgHtml) +
    '</table>' +
    '<div style="padding-top:30px;">' +
    '<a href="mailto:' + esc(lead.email) + '?subject=' + encodeURIComponent('Re: your Warpath Collective inquiry') + '" ' +
    'style="display:inline-block;background:' + RUST + ';color:' + CARD + ';font-family:' + FONT + ';font-size:15px;letter-spacing:.5px;text-decoration:none;padding:13px 30px;border-radius:6px;">Reply to ' + esc(lead.name) + '</a>' +
    '</div>';

  const leadText =
    'New Warpath Collective lead\n\n' +
    'Name: ' + lead.name + '\n' +
    'Email: ' + lead.email + '\n' +
    'Business: ' + (lead.business || '-') + '\n\n' +
    'What they need:\n' + lead.message + '\n';

  // --- Customer-facing auto-reply ------------------------------------------
  const replyInner =
    eyebrow('Message received', GOLD) +
    '<div style="font-family:' + FONT + ';font-size:30px;line-height:1.25;color:' + INK_STRONG + ';margin:12px 0 22px;">You\'re on the Warpath.</div>' +
    '<p style="font-family:' + FONT + ';font-size:16.5px;line-height:1.7;color:' + INK + ';margin:0 0 16px;">Hi ' + esc(lead.name) + ',</p>' +
    '<p style="font-family:' + FONT + ';font-size:16.5px;line-height:1.7;color:' + INK + ';margin:0 0 26px;">Thanks for reaching out to Warpath Collective. We have your message, and one of us will be in touch within one business day.</p>' +
    '<div style="border-left:2px solid ' + GOLD + ';padding:2px 0 2px 20px;margin:0 0 30px;">' +
    '<div style="font-family:' + FONT + ';font-size:12px;letter-spacing:1.5px;color:' + GOLD + ';text-transform:uppercase;margin-bottom:7px;">What you sent us</div>' +
    '<div style="font-family:' + FONT + ';font-size:15.5px;line-height:1.7;color:' + QUOTE + ';">' + msgHtml + '</div>' +
    '</div>' +
    '<p style="font-family:' + FONT + ';font-size:16.5px;color:' + INK_STRONG + ';margin:0 0 4px;">We row together,</p>' +
    '<p style="font-family:' + FONT + ';font-size:15px;letter-spacing:1px;color:' + RUST + ';margin:0;text-transform:uppercase;">The Warpath Collective Crew</p>';

  const replyText =
    'Hi ' + lead.name + ',\n\n' +
    'Thanks for reaching out to Warpath Collective. We have your message, and one of us will be in touch within one business day.\n\n' +
    'What you sent us:\n' + lead.message + '\n\n' +
    'We row together,\nThe Warpath Collective crew';

  const resend = new Resend(apiKey);

  try {
    // 1. Notify the team (the critical send).
    const sent = await resend.emails.send({
      from: from,
      to: to,
      replyTo: lead.email,
      subject: 'New lead: ' + lead.name,
      html: shell('New lead from ' + lead.name, leadInner),
      text: leadText
    });
    if (sent && sent.error) {
      return res.status(500).json({ success: false, error: String(sent.error.message || sent.error) });
    }

    // 2. Confirmation to the lead (best-effort; never fail the request on this).
    try {
      await resend.emails.send({
        from: from,
        to: [lead.email],
        replyTo: to,
        subject: 'We got your message — Warpath Collective',
        html: shell('We have your message — we will be in touch within one business day.', replyInner),
        text: replyText
      });
    } catch (e) { /* confirmation is non-critical; the lead is already captured */ }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: String((err && err.message) || err) });
  }
};
