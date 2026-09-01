# decode-uri-component CommonJS compatibility package

This is the MIT-licensed `decode-uri-component` 0.5.0 implementation packaged
as CommonJS. Expo Router 57 currently loads `query-string` 7 through `require()`,
while the upstream security fix is ESM-only. Keeping the implementation local
preserves Expo Router's runtime API and removes the vulnerable decoder.
