# Session Drummer

A web page that listens to you play guitar through your phone's mic and suggests drum parts to play along with. No app, nothing uploaded; everything runs in the browser.

**Try it:** [session-drummer.hckshr.workers.dev](https://session-drummer.hckshr.workers.dev/)

## How it works

1. Tap **Listen** and play for 10–20 seconds.
2. It works out your tempo, meter (4/4 or 3/4), straight vs. swung feel, and a rough mood, then describes it in plain words ("relaxed, dark and moody 3/4").
3. You get a few drum parts that fit, plus a couple of left turns that might not work but could be interesting.
4. **With my guitar** plays ~10 seconds of your take, beat-aligned to the drum grid, with that groove. **Loop drums** gives you drums only to practice against.

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
