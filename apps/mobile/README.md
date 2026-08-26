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

The server must explicitly support the `native.v1` authentication contract.
Native email-code completion returns one opaque bearer session, stored only in
SecureStore. Browser sessions continue to use their HttpOnly cookie.

The first app slice is deliberately useful: sign in, select a home, review its
current work, talk to Rolo, save a reviewable Rolo draft, and capture private
photos/documents through the existing signed upload protocol.
