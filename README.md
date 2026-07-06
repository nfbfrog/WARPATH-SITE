# Warpath Collective — Website

Marketing site for **Warpath Collective**: Revenue Leak Audits, System Builds, automation, sites/storefronts, and systems retainers for owner-led businesses.

Live: https://warpathcollective.com

## Stack
- Static HTML with a shared `styles.css` (Cinzel + Inter, custom brand palette)
- Serverless lead form: `api/contact.js` (Vercel Functions + Nodemailer over Gmail SMTP)
- Hosted on Vercel, auto-deployed from this repo

## Pages
- `index.html` — home
- `apps.html`, `sites.html`, `automation.html`, `retainers.html` — offer detail pages
- `gym.html`, `coaches.html`, `small-business.html` — vertical/context pages

## Local preview
```
python -m http.server 4500
```
Then open http://localhost:4500

## Deployment
Pushes to `main` auto-deploy to production via Vercel. The lead form requires `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and `LEAD_TO` environment variables set on the Vercel project.
