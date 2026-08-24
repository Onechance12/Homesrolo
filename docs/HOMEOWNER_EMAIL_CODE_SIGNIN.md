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

## Default-off release gate

`HOMESROLO_EMAIL_CODE_SIGN_IN_ENABLED` accepts only `true` or `false` and
defaults to `false`. The request and verify endpoints return unavailable while
the gate is false. This prevents the app from asking for a code while the email
provider is still sending link-only messages.

## Production cutover

1. Deploy the code and keep `HOMESROLO_EMAIL_CODE_SIGN_IN_ENABLED=false`.
2. Configure production SMTP. Supabase's shared development mailer is not a
   production delivery service.
3. Update both the **Magic Link** and **Confirm signup** templates to include
   `{{ .Token }}` and identify it as the six-digit Homesrolo sign-in code.
   Existing confirmed users and first-time users can receive different
   templates, so changing only one is incomplete.
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

## Rollback

Set `HOMESROLO_EMAIL_CODE_SIGN_IN_ENABLED=false` and restore a tested link
template as one coordinated rollback. Leaving a code-only template behind a
link-only UI, or a link-only template behind a code-only UI, breaks sign-in.
The old callback and exchange routes can be removed only after the longest
previous link lifetime has elapsed and production logs show no remaining use.

## Public-launch hardening

Provider limits are a baseline, not the final abuse boundary. Before a broad
public launch, add durable failed-attempt throttling keyed by IP plus an
HMAC-derived email key, never a raw email address, and add a privacy-preserving
bot challenge. Neither measure may expose whether an account already exists.
