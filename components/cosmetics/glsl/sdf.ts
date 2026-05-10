/**
 * Signed-distance-field helpers for shader cosmetics. Used by
 * ripple, eclipse, shockwave, gavel, scoreband (digit-ring), and
 * the ferrofluid spike mask.
 *
 * Convention: SDFs return negative inside, positive outside. We
 * use `smoothstep(0.0, width, abs(sd))` to get an anti-aliased band
 * of given thickness.
 */

export const SDF_GLSL = /* glsl */ `
float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

/** Annulus / ring with inner radius rIn and outer rOut. Negative
 *  inside the ring, positive outside. */
float sdRing(vec2 p, float rIn, float rOut) {
  float d = length(p);
  return max(rIn - d, d - rOut);
}

/** 1D distance to a line segment from a to b, projected. */
float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

/** Wedge angle of a point in radians relative to the centre.
 *  Used by stained-glass + divine-rays for radial segmentation. */
float wedgeAngle(vec2 p) {
  return atan(p.y, p.x);
}

/** Smooth band of given thickness across an SDF — anti-aliased ring/
 *  contour suitable for additive composition. */
float bandSmooth(float sd, float thickness) {
  return 1.0 - smoothstep(0.0, thickness, abs(sd));
}
`;
