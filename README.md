# Session Drummer

A web page that listens to you play guitar through your phone's mic and suggests drum parts to play along with. No app, nothing uploaded; everything runs in the browser.

**Try it:** [session-drummer.hckshr.workers.dev](https://session-drummer.hckshr.workers.dev/)

## How it works

1. Tap **Record** once. The page opens the mic and waits. It shows "Listening · play whenever" with a live level meter.
2. Start playing whenever you're ready. Recording begins on your first notes. It keeps about 1.75 s of pre-roll, so the start isn't clipped.
3. It stops by itself after about 3 s of quiet, or at 60 s max. You can also tap to finish early. Then the **mic closes**. The take, the analysis and the suggestions stay put until you tap **Record / New take** again. A new take only replaces the old one if it works out. Cancel, or a take with no clear rhythm, keeps the previous one.
4. The take is trimmed to the music, from just before the first note to about 1.5 s after the last. It works out the tempo, meter (4/4 or 3/4), straight or swung feel, and a rough mood, then describes it in plain words ("relaxed, dark and moody 3/4").
5. You get a few drum parts that fit, plus a couple of left turns that might not work but could be interesting.
6. **With my guitar** has two modes:
   - **Best bars** loops a clean 4 or 8 bars (about 8–16 s) from the steadiest, fully played stretch of the take.
   - **Whole take** plays everything.

   Either way your playing is beat-aligned to the drum grid. **Loop drums** gives you drums only to practice against.

### Detection settings (under "Listening settings")

| Setting | Options | Default |
|---|---|---|
| Start on | Loud notes / Normal / Soft notes | Normal |
| Stop after | 2 s / 3 s / 4 s of quiet | 3 s |

"Start on" sets how far above the room's noise floor a note has to be (18 / 12 / 8 dB). It takes two note attacks within 1.6 s to start a take. Takes under 4 s of playing are thrown away and it keeps listening. If nothing is played for 2 minutes, it stops listening. Settings are saved on the device.

## Mix and click (preview and loop)

While **With my guitar** or **Loop drums** is playing, the panel at the bottom has:

- **Guitar − / +** (preview only), **Drums − / +**, and **Click − / +**. Each tap is 3 dB. The range runs from Off up to +9 dB, and changes apply live without restarting playback. Guitar and Drums each have a **Mute** button. The click has an **On/Off** button and is off by default.
- Levels are saved on the device (`localStorage` `sd-mix`). The same drum and click levels apply in loop mode.
- The **click** plays on every beat of the groove's meter: 1-2-3-4 in 4/4, 1-2-3 in 3/4, and every eighth (1–6) in 6/8. The ONE is higher and louder, and beat 4 of 6/8 gets a lighter accent. In the preview, the click is rendered sample-exact on the same grid the guitar is snapped to. In loop mode, it is scheduled on the same clock as the drums.
- A **beat counter** (1 2 3 4) lights the current beat, with the ONE outlined.
- Drum hits fire about 8.5 ms early to cancel the compressor's look-ahead and each sample's pre-attack. This puts drum attacks on the grid, within the ±4 ms humanize.

## Drum sounds

The kit is real recorded acoustic drums, not synthesis. The samples are trimmed, mono, 44.1 kHz MP3s (88 samples, about 650 KB total) that the Worker serves as `/kit.json`. The page decodes them in the browser.

| Voice | Source | Layers × round robins |
|---|---|---|
| Kick | Virtuosity Drums, kick (close mic, snares on) | 4 × 2 |
| Snare, center | Virtuosity Drums, snare center hit (mid mic) | 4 × 2 |
| Snare, rimshot (accented backbeats on the louder grooves) | Virtuosity Drums, snare rimshot | 2 × 2 |
| Cross-stick | Virtuosity Drums, snare cross-stick | 3 × 2 |
| Hi-hat closed / pedal / open | Virtuosity Drums, hi-hat | 4 × 2 / 3 × 2 / 3 × 2 |
| Ride, ride bell | Virtuosity Drums, ride | 3 × 2 each |
| Crash | Virtuosity Drums, crash | 2 × 2 |
| Rack tom, floor tom | Virtuosity Drums, high/low tom | 3 × 2 each |
| Shaker | Virtuosity Drums percussion, shaker | 1 × 4 |
| Brush taps (snare) | Swirly Drums, brushed snare hit (top and bottom mics mixed) | 4 × 2 |
| Brush sweeps | Swirly Drums, snare stir | 1 × 2 (a different slice is played each beat) |

Pattern velocities pick the layer, and round robins never repeat back to back. Timing (±2–4 ms) and level get a little random humanizing, and a short, subtle room reverb is added.

### Credits and license

- **Virtuosity Drums** by Versilian Studios LLC and Karoryfer Lecolds, played by Austin McMahon. Released under **CC0 1.0 Universal** (public domain). Source: <https://github.com/sfzinstruments/virtuosity_drums>. Most voices came by way of the prepared, CC0 `ferrosintesis-samples-drumkit` and `-drumkit2` crates, which take their mid-mic and kick-mic takes from that repo. The rimshot and shaker were taken straight from the repo.
- **Swirly Drums** by Karoryfer Samples, a brushed kit. Released under **CC0 1.0 Universal**. Source: <https://github.com/sfzinstruments/karoryfer.swirly-drums>.

Neither one requires attribution, but they're credited here and in the page footer anyway.

### Rebuilding the kit

`tools/build-kit.js` reads the source FLAC/WAV files (set `KIT_SRC`; see the paths in the script), trims each one to its onset, caps the tail with a fade, peak-normalizes it, encodes it to MP3 with ffmpeg/LAME, and writes `src/kit.json`.

## Build and deploy

```sh
node build.js         # builds index.html, kit.json and worker.js from src/
npx wrangler deploy   # publish to Cloudflare Workers
```
