# Official logo assets

Original supplied by the user: `public/branding/spotlight-original.png` (preserved).
Transparent master: `public/branding/spotlight-transparent.png`.
App lockup: `public/branding/spotlight-logo-transparent.png`.
App symbol: `public/branding/spotlight-symbol-transparent.png`.

Background extraction used the built-in image_gen image editing tool with transparent_background=true. App assets are derived by `npm run icons`; UI images retain alpha without flattening. The header container is also transparent. Apple/maskable install tiles use an application canvas; their logo artwork retains the extracted alpha.

Exact edit prompt:

> Edit target: the provided SpotLight Volleyball Club official logo image. Task: background extraction only. Remove the entire white/off-white and partly translucent rectangular backdrop to genuine alpha transparency, including empty space between the orbit strokes, gold streak and lettering. Preserve the logo design as exactly as possible: navy and gold colors, all orbit curves, four-point gold stars and small gold diamonds, the exact volleyball drawing and its enclosed white ball panels and gold highlights, the exact text SPOTLIGHT and VOLLEYBALL CLUB and the two gold horizontal rules. The enclosed white volleyball panels are foreground artwork and must remain opaque white. Text letter counters should be transparent. Do not redesign, retype, recolor, invent or add anything. Keep the original portrait lockup and proportions, with the symbol above the lettering. Clean anti-aliased cutout edges without white halo. Output a transparent PNG. No checkerboard pixels, no background, no shadow.
