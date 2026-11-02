export const QUALITY_MODES = ["auto", "performance", "high"];
export class GraphicsQuality {
  constructor(renderer, { ratio = 1, mode = "auto", low = false } = {}) {
    this.renderer = renderer;
    this.ratio = ratio;
    this.low = low;
    this.set(mode);
  }
  set(mode) {
    this.mode = QUALITY_MODES.includes(mode) ? mode : "auto";
    this.scale = this.low
      ? 0.5
      : this.mode === "performance"
        ? 0.75
        : this.mode === "high"
          ? Math.min(this.ratio, 1.5)
          : Math.min(this.ratio, 1.25);
    this.shadows = !this.low && this.mode !== "performance";
    this.frames = 0;
    this.seconds = 0;
    this.apply();
  }
  apply() {
    this.renderer.setPixelRatio(this.scale);
    this.renderer.shadowMap.enabled = this.shadows;
    this.renderer.shadowMap.needsUpdate = true;
  }
  observe(dt) {
    if (this.low || this.mode !== "auto" || dt <= 0) return;
    this.frames++;
    this.seconds += dt;
    if (this.seconds >= 3) {
      if (this.frames >= 3 && this.seconds / this.frames > 0.038) {
        const next = Math.max(
          0.65,
          Math.round((this.scale - 0.15) * 100) / 100,
        );
        if (next !== this.scale || this.shadows) {
          this.scale = next;
          this.shadows = false;
          this.apply();
        }
      }
      this.frames = 0;
      this.seconds = 0;
    }
  }
}
