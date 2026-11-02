// Original Web Audio synthesis: no recordings or network assets.
export class Sound {
  constructor() {
    this.volume = 0.25;
    this.muted = false;
  }
  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.osc = this.ctx.createOscillator();
    this.osc.type = "sawtooth";
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 350;
    this.engine = this.ctx.createGain();
    this.engine.gain.value = 0.035;
    this.osc.connect(this.filter);
    this.filter.connect(this.engine);
    this.engine.connect(this.master);
    this.osc.start();
    const buffer = this.ctx.createBuffer(
        1,
        this.ctx.sampleRate * 2,
        this.ctx.sampleRate,
      ),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = this.ctx.createBufferSource();
    this.noise.buffer = buffer;
    this.noise.loop = true;
    const high = this.ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 1300;
    this.skid = this.ctx.createGain();
    this.skid.gain.value = 0;
    this.noise.connect(high);
    high.connect(this.skid);
    this.skid.connect(this.master);
    const low = this.ctx.createBiquadFilter();
    low.frequency.value = 160;
    const city = this.ctx.createGain();
    city.gain.value = 0.025;
    this.noise.connect(low);
    low.connect(city);
    city.connect(this.master);
    this.noise.start();
  }
  update(speed, throttle, active, hand = false, brake = 0) {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(
      this.muted || !active ? 0 : this.volume,
      this.ctx.currentTime,
      0.1,
    );
    this.osc.frequency.setTargetAtTime(
      34 + Math.abs(speed) * 3 + (throttle ? 12 : 0),
      this.ctx.currentTime,
      0.09,
    );
    this.skid.gain.setTargetAtTime(
      Math.abs(speed) > 8 && (hand || brake) ? 0.035 : 0,
      this.ctx.currentTime,
      0.1,
    );
  }
  beep(freq = 600, duration = 0.12) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.08, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(this.ctx.currentTime + duration);
  }
}
