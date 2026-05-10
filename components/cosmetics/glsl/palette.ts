/**
 * Iñigo Quílez cyclic palette function. Returns a vec3 colour given a
 * scalar `t` and four control vectors (offset, amplitude, frequency,
 * phase). Used by aurora, oil-slick, stained-glass for smooth
 * gradient cycling.
 *
 * Pre-baked palettes:
 *   PALETTE_RAINBOW   — full spectrum, bright
 *   PALETTE_AURORA    — cyan/teal/violet (matches tier S+)
 *   PALETTE_SUNSET    — red/orange/gold (matches tier F-D-C bands)
 *   PALETTE_OBSIDIAN  — near-black with cyan highlight
 *   PALETTE_GOLD      — gold spectrum (subscriber/divine tier)
 *
 * Shaders import the PALETTE_GLSL string + a specific palette
 * function call: `vec3 c = palette(t, AURORA_A, AURORA_B, AURORA_C, AURORA_D);`
 */

export const PALETTE_GLSL = /* glsl */ `
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318530718 * (c * t + d));
}

const vec3 PAL_RAINBOW_A   = vec3(0.5, 0.5, 0.5);
const vec3 PAL_RAINBOW_B   = vec3(0.5, 0.5, 0.5);
const vec3 PAL_RAINBOW_C   = vec3(1.0, 1.0, 1.0);
const vec3 PAL_RAINBOW_D   = vec3(0.0, 0.33, 0.67);

const vec3 PAL_AURORA_A    = vec3(0.5, 0.5, 0.5);
const vec3 PAL_AURORA_B    = vec3(0.5, 0.5, 0.5);
const vec3 PAL_AURORA_C    = vec3(1.0, 1.0, 0.5);
const vec3 PAL_AURORA_D    = vec3(0.8, 0.9, 0.3);

const vec3 PAL_SUNSET_A    = vec3(0.5, 0.3, 0.2);
const vec3 PAL_SUNSET_B    = vec3(0.5, 0.3, 0.2);
const vec3 PAL_SUNSET_C    = vec3(1.0, 1.0, 0.5);
const vec3 PAL_SUNSET_D    = vec3(0.0, 0.25, 0.55);

const vec3 PAL_OBSIDIAN_A  = vec3(0.04, 0.04, 0.05);
const vec3 PAL_OBSIDIAN_B  = vec3(0.04, 0.20, 0.30);
const vec3 PAL_OBSIDIAN_C  = vec3(1.0, 1.0, 1.0);
const vec3 PAL_OBSIDIAN_D  = vec3(0.0, 0.33, 0.67);

const vec3 PAL_GOLD_A      = vec3(0.55, 0.42, 0.10);
const vec3 PAL_GOLD_B      = vec3(0.45, 0.30, 0.05);
const vec3 PAL_GOLD_C      = vec3(1.0, 1.0, 1.0);
const vec3 PAL_GOLD_D      = vec3(0.10, 0.20, 0.30);
`;
