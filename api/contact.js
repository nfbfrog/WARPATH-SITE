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
const BONE = '#F5F3EC';
const IRON = '#6c6f74';
const RUST = '#7A1E1B';
const GOLD = '#A88B4D';
const INK = '#2a2a2e';
const RULE = '#e4dfce';
const LOGO_URL = 'https://warpathcollective.com/warpath-logo-email.png';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

// Wraps inner HTML in the branded frame: logo header + content card + charcoal footer.
function shell(preheader, inner) {
  return '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light only">' +
    '</head>' +
    '<body style="margin:0;padding:0;background:' + CHARCOAL + ';">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">' + esc(preheader) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + CHARCOAL + ';padding:28px 12px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:' + BONE + ';border-radius:10px;overflow:hidden;border:1px solid #23231d;">' +
    // header
    '<tr><td align="center" style="background:#ffffff;padding:30px 30px 24px;border-bottom:2px solid ' + GOLD + ';">' +
    '<img src="' + LOGO_URL + '" width="200" alt="Warpath Collective" style="display:block;width:200px;max-width:72%;height:auto;border:0;">' +
    '</td></tr>' +
    // content
    '<tr><td style="padding:36px 42px 40px;font-family:Arial,Helvetica,sans-serif;color:' + INK + ';">' + inner + '</td></tr>' +
    // footer
    '<tr><td align="center" style="background:' + CHARCOAL + ';padding:26px 30px;">' +
    '<div style="font-family:Georgia,\'Times New Roman\',serif;letter-spacing:3px;font-size:13px;color:' + GOLD + ';">WE ROW TOGETHER</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:' + IRON + ';padding-top:8px;">Warpath Collective &middot; warpathcollective.com</div>' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

// A labeled detail row for the internal lead email. valueHtml is already-safe HTML.
function row(label, valueHtml) {
  return '<tr>' +
    '<td style="padding:13px 0;border-top:1px solid ' + RULE + ';vertical-align:top;width:140px;' +
    'font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:' + GOLD + ';font-weight:bold;">' + label + '</td>' +
    '<td style="padding:13px 0;border-top:1px solid ' + RULE + ';vertical-align:top;font-size:15px;line-height:1.55;color:' + INK + ';">' + valueHtml + '</td>' +
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
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2px;color:' + RUST + ';font-weight:bold;">NEW LEAD</div>' +
    '<h1 style="margin:6px 0 24px;font-family:Georgia,\'Times New Roman\',serif;font-size:26px;font-weight:normal;color:' + CHARCOAL + ';">' + esc(lead.name) + '</h1>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
    row('Email', '<a href="mailto:' + esc(lead.email) + '" style="color:' + RUST + ';text-decoration:none;">' + esc(lead.email) + '</a>') +
    row('Business', esc(lead.business || '—')) +
    row('What they need', msgHtml) +
    '</table>' +
    '<div style="padding-top:30px;">' +
    '<a href="mailto:' + esc(lead.email) + '?subject=' + encodeURIComponent('Re: your Warpath Collective inquiry') + '" ' +
    'style="display:inline-block;background:' + RUST + ';color:#F5F3EC;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;letter-spacing:.5px;text-decoration:none;padding:13px 28px;border-radius:5px;">Reply to ' + esc(lead.name) + '</a>' +
    '</div>';

  const leadText =
    'New Warpath Collective lead\n\n' +
    'Name: ' + lead.name + '\n' +
    'Email: ' + lead.email + '\n' +
    'Business: ' + (lead.business || '-') + '\n\n' +
    'What they need:\n' + lead.message + '\n';

  // --- Customer-facing auto-reply ------------------------------------------
  const replyInner =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2px;color:' + GOLD + ';font-weight:bold;">MESSAGE RECEIVED</div>' +
    '<h1 style="margin:6px 0 20px;font-family:Georgia,\'Times New Roman\',serif;font-size:28px;font-weight:normal;color:' + CHARCOAL + ';">You\'re on the Warpath.</h1>' +
    '<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:' + INK + ';">Hi ' + esc(lead.name) + ',</p>' +
    '<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:' + INK + ';">Thanks for reaching out to Warpath Collective. We\'ve got your message, and one of us will be in touch within one business day.</p>' +
    '<div style="margin:24px 0;padding:18px 22px;background:#efeade;border-left:3px solid ' + GOLD + ';font-size:14px;line-height:1.6;color:#4A4D52;">' +
    '<div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:' + GOLD + ';padding-bottom:8px;font-weight:bold;">What you sent us</div>' +
    msgHtml +
    '</div>' +
    '<p style="margin:20px 0 0;font-family:Georgia,\'Times New Roman\',serif;font-size:16px;line-height:1.5;color:' + CHARCOAL + ';">We row together,<br><span style="color:' + RUST + ';">The Warpath Collective crew</span></p>';

  const replyText =
    'Hi ' + lead.name + ',\n\n' +
    'Thanks for reaching out to Warpath Collective. We received your message and will be in touch within one business day.\n\n' +
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
        html: shell('We received your message — we will be in touch within one business day.', replyInner),
        text: replyText
      });
    } catch (e) { /* confirmation is non-critical; the lead is already captured */ }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: String((err && err.message) || err) });
  }
};
