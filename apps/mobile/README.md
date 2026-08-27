# Homesrolo mobile

Native iOS and Android client for the homeowner-controlled Homesrolo record.
It uses Expo Router and the versioned API already hosted by the homeowner app;
it is not a WebView and contains no service-role, storage, OpenAI, email, or
Jobrolo secret.

Development defaults to `https://app.homesrolo.com`. A local API can be selected
without editing code:

```sh
EXPO_PUBLIC_HOMESROLO_API_URL=http://127.0.0.1:3100 npm start
```

## Local browser UI preview

The Expo app can run as React Native Web with deterministic, in-memory fixture
data. This is a developer inspection harness for the native UI, not another
homeowner web app:

```sh
npm run preview:web
```

The preview starts signed in and covers Homes, Home, Rolo, Work, Care, People,
photos, documents, warranties, and representative professionals. Fixture writes
last only until the dev server/page restarts. Capture controls show a safe
simulation notice and never open a picker or upload a file.

The fixture boundary requires all three conditions: an Expo development bundle,
the web platform, and `EXPO_PUBLIC_HOMESROLO_PREVIEW_MODE=1`. The native package
deliberately exposes no ordinary web command; the public web product remains the
homeowner app at `app.homesrolo.com`. A production export cannot activate the
preview even if the public flag is present. Preview mode does not read or write
SecureStore, construct a bearer API client, or call the Homesrolo server.

The server keeps two deliberate transports. Expo iOS and Android send
`x-homesrolo-client: native.v1` and store the opaque bearer in SecureStore. The
production Expo web bundle uses the existing same-origin `HttpOnly`, `Secure`,
`SameSite=Lax` session cookie; application JavaScript never receives or stores
that raw handle. `pwa.v1` is retained only on a bodyless same-origin migration
request that moves a bearer left by an older PWA release into the HttpOnly
cookie and immediately clears browser storage. The external signed
object-storage PUT receives neither internal authentication transport.

The first app slice is deliberately useful: sign in, select a home, review its
current work, talk to Rolo, save a reviewable Rolo draft, and capture private
photos/documents through the existing signed upload protocol. Rolo can inspect
one private photo only after an explicit, per-message consent. Preview mode uses
one existing in-memory sample photo and never invokes a picker, upload, or model.
