# Kaleidoscopic Mandala

A glowing, kaleidoscopic mandala that visualizes **friends brought to a project**.

The full form has **500 slots**. As friends join, the mandala blooms through
milestone stages — **3 → 5 → 10 → 50 → 500** — each with its own kaleidoscopic
geometry, yet all nested inside the final 500-slot image so early stages read as
recognizable fragments of the complete form.

## Concept

- **Two inputs:**
  - **Form (stage):** how many slots are in view — `3`, `5`, `10`, `50`, or `500`.
  - **Enabled:** how many of those slots are lit (the rest are dim ghosts).
- **Nesting:** every stage shows the first _N_ slots of one master 500-slot
  layout, so `3 ⊂ 5 ⊂ 10 ⊂ 50 ⊂ 500`.
- **Symmetry per stage:** the inner rings are tuned so each milestone reads with
  its own rotational symmetry (triad → pentagon → decagon → nested rings → full
  mandala).
- **Color grows with engagement:** the more slots are enabled, the more colors
  appear. Below 50 the palette is a narrowing band around teal/cyan; at **50+**
  enabled the mandala shows the full spectrum.

## Run it

```bash
npm install
npm run dev
```

Then open the printed local URL.

### Build

```bash
npm run build
npm run preview
```

## Shareable URLs

State is synced to the URL, so any view is shareable / embeddable:

```
?stage=50&on=27        # 50-slot form, 27 lit
?stage=500&on=500      # the complete mandala
?stage=10&on=3&animate=0   # ambient motion off
```

## Project structure

```
src/
  mandala/
    layout.ts    # master 500-slot concentric layout + per-stage slicing
    palette.ts   # enabled-count -> hue span; per-slot color; ghost color
    render.ts    # canvas drawing (bloom for lit slots, dim ghosts)
  components/
    MandalaCanvas.tsx  # canvas, RAF loop, resize + DPR handling
    Controls.tsx       # stage selector, enabled slider, extras
  App.tsx        # state + URL sync
  main.tsx
  index.css
```

## Tech

React + Vite + TypeScript, rendered on an HTML Canvas for the soft glow / bloom.
