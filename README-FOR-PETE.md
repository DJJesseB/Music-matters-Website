# DJ Jesse B — website migration handoff

Prepared November 18, 2026 from the current locally reviewed website preview. This is the public marketing website, not the separate Event Manager / CRM.

## Start here

Upload the CONTENTS of this folder to the new host's document root, so index.html sits directly in that root. Keep filenames, capitalization and folders intact. No build, npm installation, PHP or database is required to display the website.

For local review, serve this folder with any static web server. For example, if Python is installed: python -m http.server 8080 --bind 127.0.0.1. Then open http://127.0.0.1:8080/. Do not rely on double-clicking index.html: browsers may block the JavaScript modules when opened as local files.

## Included

- Updated desktop layout and preserved mobile styling.
- Current homepage images, including the fictional guest replacement photo.
- Four testimonials, including Melissa S.; rotating carousel, expansion and navigation. No visible review counter or rotation explanation.
- FAQ guide library and two printable planner PDFs.
- Gig Log, linked beside FAQ's: 25 photos with enlarged viewing. The photo Jesse asked to remove is excluded.
- Reviews page and thank-you page.

## Inquiry form — connect before launch

The contact form is deliberately disabled in this review copy. Its inline onsubmit handler displays a message and prevents sending. The existing data-netlify and netlify-honeypot attributes document the former Netlify form connection; they do not provide delivery on another host.

Choose and implement the destination host's form handler or an agreed email service, including server-side validation and spam protection. Update the action URL, remove the preview-only onsubmit handler, and remove Netlify-specific attributes if unused. Test successful delivery to the owner and failure handling before enabling the form. Do not simply remove the blocker without connecting delivery. Do not put email or payment API secrets in browser files.

## Client Login / planning app

Client Login currently opens an information dialog. This ZIP does not include account sign-in, customer records, contracts, payment processing, email credentials or the planning app's backend/database. Migrating that application is a separate task; do not treat the static website copy as its backup.

## Links and search indexing

Temporary /preview/ prefixes have been removed. Main site links assume the folder is served at a domain root. If using a test subfolder, adjust root-relative links or give it its own test hostname. Existing canonical URLs point to music-matters.me and should remain so if that is the final domain. The Gig Log retains a noindex tag for testing: remove it from gig-log/index.html when ready for public search indexing. Keep the whole test site out of search results using the new host's staging controls.

## Photos and privacy

Selected guest faces are fictional AI replacements; DJ Jesse B remains recognizable. Original source photos and removed images are excluded from this handoff when not used on the site. A photography disclosure remains in the footer. Preserve the disclosure.

## Before changing the domain

Test desktop and mobile, inquiry delivery, FAQ documents, both PDFs, review rotation/expansion, and every Gig Log image. Verify HTTPS and the preferred www/non-www address. Keep existing email/DNS records intact. Keep the existing live website available for rollback until Jesse approves the new host's test version. Nothing in this handoff publishes or changes the live website.


## Latest FAQ additions

Includes Behind the Booth: Wedding Prep and Ask a question (name, email, question only). The portable handler faq-question.php requires PHP 8.1+ and working host mail. Set DJ_FAQ_FROM_EMAIL to a verified sender and DJ_FAQ_MAIL_ENABLED=1 only after configuring and testing delivery. Recipient: djgourmet@me.com. Static-only hosting requires a different server endpoint. This review copy does not pretend email is connected. Do not add the Netlify-only faq-delivery meta setting on another host.
