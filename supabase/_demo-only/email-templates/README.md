# Demo Supabase — Auth email templates

These are the VARS-branded HTML templates for the Supabase **Auth** transactional
emails on the demo project. Paste each one into the matching slot in the demo
Supabase dashboard:

> **Authentication → Email Templates**

Each `.html` file is a complete email body. Copy the file contents, paste into
the **Message body** field for the matching template, and tweak the **Subject**
line per the suggestion below.

Supabase substitutes these template variables at send time — leave them as-is:
- `{{ .ConfirmationURL }}` — the clickable action link
- `{{ .Email }}` — the recipient address
- `{{ .SiteURL }}` — your site URL (`https://demo.vars.live`)
- `{{ .Token }}` / `{{ .TokenHash }}` — the OTP / link token

## Templates

| File | Supabase slot | Suggested subject |
|---|---|---|
| `confirm-signup.html` | Confirm signup | Confirm your VARS demo account |
| `reset-password.html` | Reset Password | Reset your VARS password |
| `magic-link.html` | Magic Link | Your VARS sign-in link |
| `change-email.html` | Change Email Address | Confirm your new VARS email |
| `invite.html` | Invite user | You've been invited to VARS |

## Design notes

- All emails share the same lockup: slate `#3E4C59` header band with the VARS
  door mark and wordmark, warm beige `#F4EEE4` body, dark slate text, a single
  primary CTA in `#3E4C59`.
- No external images (inlined SVG for the logo, no external CSS, no remote
  imports). That keeps every major mail client showing the same thing.
- Inline styles only — no `<style>` block — so Gmail / Outlook / Apple Mail
  don't strip the formatting.
