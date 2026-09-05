# Homeowner email-code sign-in

## Product behavior

Homesrolo sends a six-digit passwordless code. The homeowner keeps the sign-in
page open, reads the email in any app or browser, and enters the code on that
same page. Verification occurs server-side. The browser receives only the
existing opaque, HttpOnly Homesrolo session cookie; no Supabase access or
refresh token is returned to browser JavaScript or placed in a URL.

The code flow is represented by its own `emailCodeSignIn` capability. The
legacy `magicLinkSignIn` capability remains mutually exclusive during the
migration. Old callback routes stay deployed long enough to consume links that
were already issued, but the new UI does not depend on them.

Supabase OTP user creation through the app has a separate
`HOMESROLO_SELF_SIGNUP_ENABLED` gate that defaults to `false`. With that gate
off, the app requests codes with `shouldCreateUser: false`. An existing
Supabase Auth user can still sign in and receive a first Homesrolo principal
after verified email completion. This flag does not restrict direct Supabase
registration or independently gate app-principal creation; do not describe it
as a provider-wide allowlist. Keep it off for the private upload development
lane.

## Default-off release gate

`HOMESROLO_EMAIL_CODE_SIGN_IN_ENABLED` accepts only `true` or `false` and
defaults to `false`. The request and verify endpoints return unavailable while
the gate is false. This prevents the app from asking for a code while the email
provider is still sending link-only messages.

Activation also requires a separate server-only
`HOMESROLO_EMAIL_CODE_RATE_LIMIT_SECRET` containing at least 32 non-whitespace
characters and distinct from both Supabase credentials. The runtime fails
closed if the code gate is enabled without that independent secret. It is used
only to HMAC email and network subjects for the bounded process-local limiter;
raw email addresses are never stored as limiter keys.

## Production cutover

1. Deploy the code with `HOMESROLO_EMAIL_CODE_SIGN_IN_ENABLED=false` and add a
   unique `HOMESROLO_EMAIL_CODE_RATE_LIMIT_SECRET` to the server environment.
2. Configure production SMTP. Supabase's shared development mailer is not a
   production delivery service.
3. Install both branded templates and subjects below. Existing confirmed
   users and first-time users can receive different templates, so changing
   only one is incomplete.
4. Configure the OTP lifetime to 10 minutes and retain the provider's 60-second
   resend interval.
5. Smoke-test a first-time address and an existing address. Confirm delivery,
   leading-zero entry, expiry, one-time use, resend behavior, and that the
   session persists after refresh in the browser where the code was entered.
6. Set `HOMESROLO_EMAIL_CODE_SIGN_IN_ENABLED=true`, redeploy, and verify that
   `/api/v1/session` reports `emailCodeSignIn: true` and
   `magicLinkSignIn: false`.

Do not enable the gate before the two templates and production SMTP are
verified. Do not put the email or code in a URL, local storage, logs, analytics,
or error output.

## Branded production templates

The complete, paste-ready HTML lives in `apps/homeowner/email-templates/`.
`manifest.json` records the exact subjects, preview text, and provider targets.
These files are deployment inputs: committing or deploying the application
does **not** update the templates saved in Supabase.

| Supabase email template | Subject | HTML body file |
| --- | --- | --- |
| Magic Link | Your Homesrolo sign-in code | `apps/homeowner/email-templates/magic-link.html` |
| Confirm signup | Your Homesrolo sign-in code | `apps/homeowner/email-templates/confirm-signup.html` |

In the correct Supabase project's Authentication email-template settings,
open each named template, set its subject exactly as above, replace the entire
HTML body with the matching file, and save. Read back both saved subjects and
bodies. Do not paste the filename, Markdown fences, or the manifest into the
HTML editor. Both bodies deliberately contain `{{ .Token }}` exactly once;
keep that placeholder intact. There is no magic-link URL, secondary sign-in
button, external image, tracking resource, or password in either template.
Do not add click tracking or a second sign-in mechanism during installation.
This template update does not require changing signup flags, SMTP credentials,
redirect URLs, or access rules.

The message uses a 100%-width, 480px-max presentation table, inline light-mode
styles, a fixed-width Outlook fallback, and optional paired dark-mode colors.
The code is selectable text, not an image or six separate cells. The hidden
preheader describes the next step without repeating the code. The visible
10-minute expiry must match the provider's 600-second email OTP setting.

Run the deterministic content, layout, and contrast checks from the repository
root with:

```sh
node --experimental-strip-types --test apps/homeowner/lib/tests/email-templates.test.ts
```

These checks do not establish inbox delivery or pixel-perfect rendering in
every mail client. After installation, send to an approved test mailbox and
verify the **received** subject, one six-digit code, preview text, narrow-screen
layout, light/dark readability, and successful entry in the already-open PWA.
Also exercise the Confirm signup template with an explicitly approved first-time
account when that flow is in scope; a returning-user email alone cannot prove
both templates. A provider editor preview or the app's generic accepted response
is not proof that an email was delivered. Do not copy a live code into a QA
report or commit it as a test fixture.

## Rollback

Set `HOMESROLO_EMAIL_CODE_SIGN_IN_ENABLED=false` and restore a tested link
template as one coordinated rollback. Leaving a code-only template behind a
link-only UI, or a link-only template behind a code-only UI, breaks sign-in.
The old callback and exchange routes can be removed only after the longest
previous link lifetime has elapsed and production logs show no remaining use.

## Public-launch hardening

The app now applies bounded, fail-closed process-local limits to sends and
verification attempts by network address, HMAC-derived email subject, and the
pair, with provider quotas as the cross-instance backstop. A syntactically
valid send request always receives the same accepted response even when the
local limiter or provider suppresses it, so the response cannot reveal whether
an account exists. Before a broad public launch, replace or supplement the
process-local counters with a durable shared limiter and add a
privacy-preserving bot challenge. Neither measure may expose whether an account
already exists.
