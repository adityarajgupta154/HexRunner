# INTVL motion reference analysis

This document records interaction patterns only. Do not copy or ship INTVL
logos, text, trademarks, imagery, video, fonts, icons, or source code.

## Observed page structure

- Desktop page is approximately 17,000px tall at a 1440×900 viewport.
- The experience is organized as full-viewport sticky cards rather than a
  sequence of ordinary document sections.
- Each major card pins to the viewport while internal media, copy, phone
  frames, and data labels animate against scroll progress.
- Rounded card edges and the global outline remain visible through most of the
  journey, creating a stacked-deck transition between scenes.

## Motion architecture to reproduce for HexRunner

1. **Hero hold**
   - Full-viewport dark geographical scene.
   - Centered two-line display headline and compact supporting copy.
   - Product download controls.
   - Background layers move more slowly than the scroll and gently scale.

2. **Handset reveal**
   - A light full-viewport card rises over the hero.
   - Product handset enters from below while the previous card remains pinned.
   - Copy and device use different scroll rates to create depth.

3. **World-stage stats**
   - Full-bleed athletic image/video.
   - Large centered title followed by three compact metric panels.
   - Panels enter with small staggered vertical movement and scale.

4. **Pinned gameplay walkthrough**
   - Long dark-green sticky scene spanning multiple viewport heights.
   - Large heading stays anchored.
   - Numbered steps change active state as scroll progresses.
   - A central phone shell remains fixed while its screen content swaps between
     run tracking, map territory, loop completion, and leaderboard states.
   - Transitions use cross-fade plus short vertical movement, not hard cuts.

5. **Split activity card**
   - Light map-texture card.
   - Editorial copy on one side and product view on the other.
   - Phone and map layers drift independently.

6. **Feature conversion cards**
   - Full-bleed runner footage remains behind three dark product cards.
   - Cards overlap and fan/translate as the scroll progresses.
   - The active card enlarges slightly while neighboring cards recede.

7. **FAQ**
   - Dark restrained accordion with high-contrast rows and bright circular
     expand controls.
   - Expansion is animated and keyboard accessible.

8. **End-state**
   - Signal-lime full-viewport card.
   - Oversized centered final call to action and product download controls.
   - Minimal footer details anchored near the bottom.

## HexRunner content requirements

- Product name and logo: HexRunner.
- Core promise: GPS running turns real streets into claimable hex territory.
- Explain route tracking, closing loops, capturing and defending territory,
  global/city/friends leaderboards, streaks, live nearby runners, safety
  signals, air-quality guidance, civic reports, and privacy-aware discovery.
- Use only assets in `public/images` and `public/videos`.
- Both App Store and Google Play controls must open the same accessible modal:
  “HexRunner is currently a prototype. We’re actively building the production
  app and store release.”
- Modal must close by close button, backdrop click, and Escape.
- All motion must respect `prefers-reduced-motion`.
- The page must work at desktop, tablet, and mobile widths.
- Use `import.meta.env.BASE_URL` for every local asset URL.