# Material Design Slider Redesign

**Goal:** Replace all circular-thumb sliders with clean Material Design pill-thumb sliders that have great touch support and fit the dark glass aesthetic.

**Design Direction:** Material Design 3 "pill" thumb variant — no circles, no heavy borders, no shadows. Flat, minimal, touch-friendly.

---

## Visual Spec

### Track
- Height: 4px
- Border-radius: 2px (fully rounded)
- Background: `rgba(255,255,255,0.1)` (unfilled portion)
- Filled portion: `var(--accent-amber)` with subtle glow
- Active/focus glow: `0 0 8px var(--accent-amber)` on the filled track

### Thumb (Pill Shape)
- Size at rest: 12px wide × 20px tall (vertical pill)
- Border-radius: 6px (fully rounded pill)
- Background: `var(--accent-amber)` flat
- No border, no box-shadow at rest
- On hover/active: grows to 14px × 24px, adds subtle shadow `0 2px 8px rgba(0,0,0,0.3)`
- Touch hit area: 48×48px invisible expansion (CSS `::before` pseudo-element or padding)

### States
- **Default**: track 4px, thumb 12×20px amber pill
- **Hover**: thumb 14×24px, cursor pointer, track glow intensifies
- **Active (dragging)**: thumb 14×24px with shadow, filled track glows
- **Disabled**: thumb grayed, track opacity 0.3

### Layout
- Peer volume slider: horizontal, 140px wide (already widened), inside tooltip
- Input gain slider: horizontal, 120px wide, inside control arc (replace -90deg rotation)
- Output volume slider: horizontal, 120px wide, below controls
- Noise gate slider: horizontal, 120px wide, below controls

---

## Implementation Notes

1. Remove all `border: 3px solid`, `box-shadow` glow, and `transform: scale(1.2)` from thumb CSS
2. Replace circular `border-radius: 50%` with `border-radius: 6px` for pill shape
3. Remove `-90deg` rotation from control-slider — keep all sliders horizontal
4. Ensure `touch-action: none` on all slider inputs (already present)
5. Keep `oninput` for smooth value changes and `attachWheel` for scroll support
6. All three slider classes (`.control-slider`, `.peer-volume-slider`, `.extra-slider`) share the same Material Design thumb/track rules
