# The work emerges

A single short scrolling page. A dense, over-theoretical **ART WORK DESCRIPTION** explodes into typographic fireworks, leaving one sentence.

The page opens in the same neutral system sans as the Reel (CapCut's "System" font): `-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`. As it breaks down, words mutate into serif (EB Garamond, Times), monospace, pixel type, italic, bold, thin, stretched, compressed, re-tracked and rotated.

Plain `index.html`, `style.css` and `script.js`. No frameworks, no build step.

## How it works

- The page is about `330vh` tall. The text block is pinned to the screen (`position: sticky`) and slides up as you scroll.
- Every word has a **launch moment** between 0 and 1 of scroll progress. Before it launches, a word goes wrong in place: font swap, pastel color, misalignment, letters drifting apart, swapping places with its neighbour. Words about to become fireworks start to glow. This part follows the scroll exactly.
- When the scroll passes a word's launch moment, the word leaves the paragraph and plays out in real time, like a real firework:
  1. It peels off the line and shoots up along a curve with a glowing trail, speeding up and stretching.
  2. It pauses briefly at the top.
  3. It explodes with a flash. Glowing particles, streaks, the word's own letters, punctuation and short lines fly outward, slow down, fall under gravity, fade, and sometimes crackle.
- **Theory words** (listed in `POSH` in `script.js`), hand-marked words, and about 22% of other words become full fireworks. At most 5 play at once (6 on large screens). Every other word fizzles in place: a few sparks, and its letters drop like embers.
- Firework types: `chrysanthemum` (long trails and crackle), `peony` (round glowing dots), `starburst` (small and sharp), `willow` (drooping golden trails), `partial` (a lopsided fan), `ring` (a tilted ring) and `letters` (a mostly typographic shell).
- The glow comes from pre-rendered radial-gradient sprites drawn on one `<canvas>` in additive (`lighter`) mode. There are no CSS blur filters on the text.
- Each word always produces the same firework, because every parameter comes from a seeded generator.

### Sound

- Pops, booms and crackle are **synthesized with the Web Audio API**. There are no audio files.
- Nothing plays on load. Audio starts after the visitor's first touch, click or key press. Some mobile browsers only count a tap, not a swipe; until then the fireworks are silent.
- Each burst plays at the exact frame it explodes:
  - small shells give a short, sharp pop
  - large shells give a deeper boom with a low thump
  - chrysanthemums, willows and some large shells get a delayed crackle
- Pitch, filter and volume vary per firework, and sound is panned to the burst's position. A compressor and a minimum gap between sounds stop it from becoming a wall of noise.

### Finale

When the final sentence appears, the remaining show stops within a third of a second, and a fireworks finale starts around the sentence:
- Full-size rockets rise from the bottom corners, each carrying a leftover theory word. They burst in the upper area, the lower area and at the sides, framing the sentence instead of covering it. Burst spots are chosen so the sentence stays clear.
- For about 10 seconds up to 4 overlap. After that the finale slows to one or two every few seconds, with faint embers drifting in between, so the screen is never empty.
- The finale has sound (it unlocks the same way as the rest).
- The sentence sits above the fireworks layer with a soft halo in the background color, so it stays readable.

Edit `afterglow()` (timing and how many overlap) and `spawnFinale()` (size, placement) in `script.js`.

Pacing (scroll progress):

| progress | what happens |
|---|---|
| 0 – 0.05 | dense, calm block |
| 0.05 – 0.3 | fonts, colors, misalignment; the first rockets go up |
| 0.3 – 0.72 | most words launch; 3–5 fireworks overlap |
| 0.72 – 0.86 | the remaining text clears; a few theory words (marked `last`) stay, then go up |
| 0.9 – 1 | the show stops; the final sentence appears with a fireworks finale framing it |

## Run it locally

```bash
cd tap-dance-site
python3 -m http.server 8080
```

Open http://localhost:8080. To test on a phone on the same Wi‑Fi, add `--bind 0.0.0.0` and open `http://<your-computer's-LAN-IP>:8080`.

## Edit the text

The text is in `index.html`, inside `<article class="statement">`, one `<p>` per paragraph. The small label at the top is the `<h1 class="label">`. Plain text works. To art-direct one word, wrap it:

```html
<span data-fx="launch:0.07 burst:letters">performativity,</span>
```

| option | meaning |
|---|---|
| `launch:0.1` | when this word leaves the text (0–0.86) |
| `burst:chrysanthemum\|peony\|starburst\|willow\|partial\|ring\|letters` | firework type (also makes the word a full firework) |
| `mode:pop` | explode in place instead of shooting up |
| `pastel:<color>` | its color before launching |
| `font:sans\|times\|arial\|mono\|courier\|pixel` | its font before launching |
| `last` | one of the theory words that remain until the end (keep these in the last paragraphs, which are the ones on screen at that point) |

Words without `data-fx` get random effects from the seeded generator. Theory words (listed in `POSH` at the top of `script.js`) launch earlier and always try to become full fireworks.

## Change the final sentence

In `index.html`:

```html
<p class="final" id="final"><span>i just felt like it :p</span></p>
```

## Edit the pastel colors

At the top of `style.css`: `--yellow`, `--pink`, `--blue`, `--green`, `--lilac`, `--red`. The glow versions used by the fireworks are in `GLOW` at the top of `script.js`, as `r,g,b`.

## Speed and intensity

- **Total length:** `--scroll-length` in `style.css` (default `330vh`). Shorter makes the page faster.
- In `script.js` → `CONFIG`:
  - `launchCurve`: pairs of `[share of words launched, scroll progress]`. Move the progress values down to make things break earlier.
  - `calmUntil`: how long the opening stays untouched (default `0.04`).
  - `clearAt`: when the final sentence appears (default `0.9`).
  - `fireworkSize`: explosion radius multiplier.
  - `maxRockets`: how many full fireworks may play at once.
  - `rocketShare`: share of ordinary words that become full fireworks.
  - `sound`: `false` turns all audio off.
  - `volume`: master volume, 0–1.
  - `smoothing`: how quickly the text catches up with the scroll.
  - `seed`: a different number gives a different (still fixed) composition.

## Reduced motion

With `prefers-reduced-motion`, words still change font and color, then disappear in turn. Each one leaves a still glowing bloom that fades in place, with no travelling or exploding. Firework words still pop (sound only). The final sentence is the same.
