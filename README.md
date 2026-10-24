# Blink Music — release candidate (fixed build)

## What changed in this build
- Saweria-inspired light interface: white/soft-gray surfaces, black outlines, offset black button shadows, and cyan/blue/orange/purple accents.
- Search field remains visible on mobile. Search by song title, artist, or album (not a country filter); editing or clearing a query cancels stale searches so old results cannot replace the new query.
- Search stays inside Blink Music and searches the connected Audius catalogue plus Apple/iTunes metadata results. Results label direct Audius streams separately from short previews; external services are not opened automatically.
- Home page is simplified to reduce clutter while keeping dynamic sections for trending, viral/new, world music, instrumental and classics. Results are filtered across groups to reduce repetition. Trending/viral sections reflect available catalogues, not an authoritative worldwide chart.
- Create custom playlists from the Playlist page with a name and optional cover image. Open, delete, replace cover, add/remove songs, and play available playlist tracks in saved order.
- Bottom mini-player opens an expanded mobile/desktop player inspired by the supplied video. Includes track artwork/title/artist/album, seek bar, previous/play/next, volume, source link, favorite, add to playlist, and lyrics when a matching lyrics result is available. Synced lyrics can highlight during playback.
- Favorites/playlists are stored in the current browser. Support link is Telegram only: https://t.me/Marvel_sh.

## Music and release limitations
- No app can truthfully guarantee every song from every country or full-length streams for every commercial release without an appropriate licensed provider/catalog.
- Apple/iTunes search API results can include 30-second promotional previews, not full tracks. Songs without an available in-app stream are labelled unavailable; Blink does not automatically redirect users to another website. See Apple's Search API and preview-content terms: https://performance-partners.apple.com/search-api
- Audius provides full streams for eligible tracks in its catalogue, but availability and playback can vary by track, network, browser, or API service.
- Lyrics depend on an external lyrics catalogue and are not available for every track. Missing lyrics are shown as unavailable rather than fabricated.
- The current authentication is browser-local and is not a secure server-backed account system; accounts and playlists do not sync across devices. For a public production launch, add a real authentication/database backend and review each music provider's terms/licences.
- JavaScript syntax and static checks are run during the repair process. External catalog and stream availability still need testing on the actual hosting domain; production readiness is not guaranteed until those live checks pass.

## Run
1. Replace the hosted project's `index.html` with this build's `index.html`.
2. Host it on HTTPS (for example, GitHub Pages) so browser APIs and third-party catalogue calls behave more reliably than opening the file with `file://`.
3. Test login/register, mobile search, playlist create/add/remove/delete, actual audio playback, expanded player, lyrics, and cover upload on the production domain.
