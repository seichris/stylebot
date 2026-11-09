# Dark mode

Dark mode darkens light websites, for one site from the popup's **Dark mode** switch, or for every website with **All websites**. It lives apart from saved styles: it isn't a style, and it isn't part of Google Drive sync or backups.

## Choices and schedule

- A site's choice is kept per origin (scheme, host and port), under `dark-mode:<origin>` in `chrome.storage.local`. It covers the site's pages and the frames they embed: a frame follows the top-level page's site, not its own.
- **All websites** is off by default. While it's on, it decides for every site, and a site's own switch is locked; turning it off gives each site its own choice back. Its settings are under `dark-mode:global-settings`.
- **Use schedule** limits All websites to a daily range, **18:00–08:00** by default. Times are the browser's local wall-clock time, so they follow its time zone and daylight saving; the popup names the zone. The start counts and the end doesn't, a range can cross midnight, and a range that starts when it ends is refused: turn the schedule off for all day.
- The popup saves a site's choice through the background, which checks that the tab is still on the page the popup showed the switch for, and only takes these changes from the extension's own pages.

## In the page

The content script runs Dark mode in every frame of a page Stylebot can style (`apps/content/dark-mode.ts`). It reads the choices straight from storage and listens for changes, so it works without the background awake: the top frame keys its site by its own url, and a frame by its top-level origin from `location.ancestorOrigins`, asking the background only where the browser has none (Firefox). A schedule is checked at every minute boundary, and again on focus, `pageshow` and when the page becomes visible, which covers sleep and suspended tabs. The engine ships as its own bundle, `inject-css/dark-mode.js`, which a frame loads only once Dark mode is on there, so pages it's off for don't carry it.

The engine (`features/dark-mode`) is inspired by [WebKit's Adaptive Dark Mode](https://webkit.org/blog/18541/introducing-adaptive-dark-mode/):

- It leaves a page alone that's already dark, sampled at nine points of the viewport, or whose `<meta name="color-scheme">`, root or body declares a dark or `only light` color scheme. An element that declares one keeps its colors, with everything inside it.
- Otherwise it darkens light backgrounds and gradients with their hue kept, and lifts text toward a 4.5:1 contrast. Images, videos and canvases keep their colors; neutral inline SVG fills and strokes are adapted.
- Each pass reads the page's own colors with its stylesheet switched off, so it never adapts colors twice. Changes to the page, loads, focus and resizing schedule another pass. Colors driven only by CSS `:hover` are sampled only when one of those passes runs.
- It writes one stylesheet and a marker attribute per element, both removed when Dark mode goes; the page's own styles are never edited. The stylesheet goes ahead of the styles Stylebot injects, so a saved style wins where the two tie.
- Stylebot's own UI, the editor, reader, CLI mode's terminal, the gallery preview and the inspector's overlay, keeps its own themes.

## Limits

This is an extension, not WebKit's engine feature, which isn't open to extensions: there's no bitmap analysis, and none of its rendering-level privacy or power efficiency. Closed shadow roots, blended image overlays, animated styles, wide-gamut colors and backgrounds on pseudo-elements may need a site's own CSS. A full pass reads every element's computed style, which costs on very large or constantly changing pages. Browser pages and extension stores can't be styled. Dark mode applies once the content script has read the settings, so a light page can show for a moment as it loads.
