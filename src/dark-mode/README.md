# `dark-mode`

Adaptive Dark Mode is enabled using the popup's **Dark Mode** switch, above
Readability. The choice is saved locally per origin (scheme, host, and port),
survives reloads, and applies to that site's open tabs and embedded frames.
It is independent of saved CSS and is not part of Google Drive sync.

The popup's **All websites** switch controls every supported website, including
open tabs and embedded frames. It is opt-in; existing per-site choices are kept.
While global mode is enabled it takes precedence over per-site settings, so a
scheduled daytime interval also turns off sites previously enabled manually.
Turning global mode off restores those individual choices.

**Use schedule** defaults to **18:00–08:00**. Change the From/Until time fields,
or turn scheduling off to run global Dark Mode all day. Schedules use the
browser's local wall-clock time, automatically following its current time zone
and daylight-saving changes; the popup displays that time zone. The start is
inclusive and the end exclusive, and overnight ranges are supported. Equal
start/end times are rejected; use the all-day option instead.

Content scripts check at minute boundaries and on focus, visibility, and resume,
without needing an active background worker or additional permissions. Suspended
tabs recheck when resumed. Settings and site preferences are read together, with
outdated asynchronous reads discarded when preferences change during startup.

Inspired by [WebKit's Adaptive Dark Mode](https://webkit.org/blog/18541/introducing-adaptive-dark-mode/),
the content script detects light pages, darkens light backgrounds and CSS
gradients while preserving hue, and adjusts foreground colors toward a 4.5:1
contrast ratio. Existing dark backgrounds, transparent colors, raster images,
videos, and canvas contents are preserved. Neutral inline SVG fills and strokes
are adjusted for visibility. Pages and regions declaring native dark support
or `color-scheme: only light` are left alone.

Mutation, stylesheet-load, hover, focus, and resize events schedule a debounced
refresh. Each pass reads authored colors with the generated stylesheet disabled,
avoiding repeated transformations. Disabling removes the generated stylesheet,
element markers, observers, timers, and listeners; authored styles are never edited.
The Reader and editor UI are excluded and keep their own themes.

This is an extension implementation, not Safari's engine feature. WebKit does not
expose that feature as an extension API. This implementation does not reproduce
WebKit's bitmap histogram analysis, rendering-level privacy guarantees, or power
efficiency. Closed shadow roots, complex image overlays and blending, animated
styles, advanced color spaces, and CSS backgrounds on pseudo-elements may need
site-specific custom CSS. Full-page style analysis can be costly on very large
or continuously changing pages. Browser-internal pages and extension stores
cannot be styled; the popup switch is disabled when no content script is available.
The readiness check uses the dark-mode content script, independently of editor
startup. After reloading or updating the extension, refresh existing website tabs
so they receive the new content script; the popup offers **Reload page** when its
controller is disconnected.
