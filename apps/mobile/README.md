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

The server must explicitly support the `native.v1` authentication contract.
Native email-code completion returns one opaque bearer session, stored only in
SecureStore. Browser sessions continue to use their HttpOnly cookie.

The first app slice is deliberately useful: sign in, select a home, review its
current work, talk to Rolo, save a reviewable Rolo draft, and capture private
photos/documents through the existing signed upload protocol.
