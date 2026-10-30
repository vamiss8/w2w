# Third-party code

## supabase-js

The client for Supabase: the queries, the magic link, realtime.

- File: `vendor/supabase-js-2.117.2.js` (217 945 bytes, unmodified)
- Source: the npm package `@supabase/supabase-js@2.117.2`, file `dist/umd/supabase.js`
- SHA-256: `59d39487c3589843b410322d8a3d562ce022aba1e5ccb16898ef3fb2a0da2ecd`
- License: MIT, copy in `licenses/supabase-js-LICENSE.txt`

It is the same file the site used to load from jsDelivr, byte for byte, and
the same version `tests/package.json` installs. A browser test holds the two
together: when one changes and the other does not, it fails.

`.gitattributes` keeps git from changing its line endings, so a checkout on
Windows still matches the checksum.

To update, change the version in `tests/package.json`, then:

```bash
cd tests && npm install
```

```bash
cp tests/node_modules/@supabase/supabase-js/dist/umd/supabase.js vendor/supabase-js-<version>.js
```

Then point the `<script>` in `index.html` at the new file, delete the old one,
and update the version, size and checksum above
(`sha256sum vendor/supabase-js-<version>.js`).

## Fonts

Cinzel Decorative, Sora, IBM Plex Sans and IBM Plex Mono, served by Google
Fonts under the SIL Open Font License 1.1. Nothing of them is in this
repository.
