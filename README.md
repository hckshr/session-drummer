# Session Drummer

A web page that listens to you play guitar through your phone's mic and suggests drum parts to play along with. No app, nothing uploaded; everything runs in the browser.

**Try it:** [session-drummer.hckshr.workers.dev](https://session-drummer.hckshr.workers.dev/)

## How it works

1. Tap **Listen** and play for 10–20 seconds.
2. It works out your tempo, meter (4/4 or 3/4), straight vs. swung feel, and a rough mood, then describes it in plain words ("relaxed, dark and moody 3/4").
3. You get a few drum parts that fit, plus a couple of left turns that might not work but could be interesting.
4. **With my guitar** plays ~10 seconds of your take, beat-aligned to the drum grid, with that groove. **Loop drums** gives you drums only to practice against.

The drum kit is synthesized with the Web Audio API (no samples).

## Build and deploy

```sh
node build.js         # builds index.html and worker.js from src/
npx wrangler deploy   # publish to Cloudflare Workers
```
