/* Session Drummer — hands-free take detector. Feed it mic blocks; it waits for playing to start
   (onsets above an adaptive noise floor), keeps a pre-roll, and ends the take after sustained silence
   or a hard maximum. Pure JS so it can be tested in Node. */
(function (root) {
  'use strict';
  const DEF = { preroll: 1.75, startDb: 12, onsetDb: 9, stopSec: 2.8, maxSec: 60, minPlayed: 4, quietDb: 10, rearmQuiet: 1.2, guard: 0.4 };
  function Listener(sr, opts) {
    this.sr = sr; this.o = Object.assign({}, DEF, opts || {});
    this.hop = Math.round(sr * 0.02);
    this.ring = new Float32Array(Math.round(sr * this.o.preroll));
    this.reset();
  }
  Listener.prototype.reset = function () {
    this.state = 'armed'; this.floor = null; this.t = 0; this.ringPos = 0; this.ringFill = 0;
    this.recent = []; this.prevE = []; this.lastOn = -1; this.hp = 0; this.hpx = 0; this.acc = 0; this.accN = 0;
    this.chunks = null; this.needQuiet = 0; this.guardUntil = this.t + this.o.guard; this.level = -120;
  };
  Listener.prototype.setOptions = function (o) { Object.assign(this.o, o); };
  // Pause = ignore input entirely (we are playing sound). Resume re-arms with a short guard.
  Listener.prototype.pause = function () { if (this.state === 'rec') this.state = 'armed'; this.paused = true; this.chunks = null; this.recent = []; };
  Listener.prototype.resume = function () { this.paused = false; this.state = 'armed'; this.recent = []; this.ringFill = 0; this.guardUntil = this.t + this.o.guard; };
  // Force the current take to end now (user tapped Done).
  Listener.prototype.finish = function () { return this.state === 'rec' ? this._stop('manual') : null; };

  Listener.prototype._ringWrite = function (x) {
    const r = this.ring, n = r.length;
    for (let i = 0; i < x.length; i++) { r[this.ringPos] = x[i]; this.ringPos = (this.ringPos + 1) % n; }
    this.ringFill = Math.min(n, this.ringFill + x.length);
  };
  Listener.prototype._ringRead = function () {
    const r = this.ring, n = r.length, out = new Float32Array(this.ringFill);
    let p = (this.ringPos - this.ringFill + n) % n; for (let i = 0; i < out.length; i++) { out[i] = r[p]; p = (p + 1) % n; }
    return out;
  };
  Listener.prototype.push = function (x) {
    const ev = [];
    if (this.paused) { this.t += x.length / this.sr; return ev; }
    if (this.state === 'rec') this.chunks.push(new Float32Array(x)); else this._ringWrite(x);
    // per-hop energy of a high-passed signal (drops rumble / handling noise)
    const a = Math.exp(-2 * Math.PI * 100 / this.sr);
    for (let i = 0; i < x.length; i++) {
      const y = a * (this.hp + x[i] - this.hpx); this.hpx = x[i]; this.hp = y;
      this.acc += y * y; this.accN++;
      if (this.accN >= this.hop) { const e = this.acc / this.accN; this.acc = 0; this.accN = 0; this.t += this.hop / this.sr; const r = this._frame(e); if (r) ev.push(r); }
    }
    return ev;
  };
  Listener.prototype._frame = function (e) {
    const o = this.o, db = 10 * Math.log10(e + 1e-12); this.level = db;
    if (this.floor === null) this.floor = db;
    // onset: energy jump vs the last ~160 ms, well above the floor
    const pe = this.prevE; let m = 0; for (const v of pe) m += v; m = pe.length ? m / pe.length : e;
    pe.push(e); if (pe.length > 8) pe.shift();
    const isOn = db > this.floor + o.onsetDb && db > -62 && e > 2.2 * m && this.t - this.lastOn > 0.08;
    if (isOn) this.lastOn = this.t;
    if (this.state === 'armed') {
      // adaptive floor: falls quickly, rises slowly (~3 s)
      this.floor += (db < this.floor ? 0.25 : 0.007) * (db - this.floor);
      if (this.t < this.guardUntil) return null;
      if (this.needQuiet > 0) { if (db < this.floor + o.quietDb) this.needQuiet -= this.hop / this.sr; else this.needQuiet = o.rearmQuiet; return null; }
      if (isOn && db > this.floor + o.startDb) this.recent.push(this.t);
      this.recent = this.recent.filter(t => this.t - t < 1.6);
      if (this.recent.length >= 2) {
        this.state = 'rec'; this.chunks = [this._ringRead()]; this.recT0 = this.t - this.ringFill / this.sr;
        this.firstOn = this.recent[0]; this.lastPlay = this.t; this.lastLoud = this.t; this.recFloor = this.floor; this.recent = [];
        return { type: 'start', t: this.t };
      }
      return null;
    }
    if (this.state === 'rec') {
      if (isOn && db > this.recFloor + o.onsetDb) this.lastPlay = this.t;
      if (db > this.recFloor + o.quietDb + 4) this.lastLoud = this.t;
      const sinceOn = this.t - this.lastPlay, sinceLoud = this.t - this.lastLoud;
      if (this.t - this.recT0 >= o.maxSec) return this._stop('max');
      if ((sinceOn >= o.stopSec && sinceLoud >= 1.0) || sinceOn >= o.stopSec + 3) return this._stop('silence');
    }
    return null;
  };
  Listener.prototype._stop = function (reason) {
    let n = 0; for (const c of this.chunks) n += c.length;
    const take = new Float32Array(n); let p = 0; for (const c of this.chunks) { take.set(c, p); p += c.length; }
    const sr = this.sr, rel = (t) => Math.max(0, Math.min(n, Math.round((t - this.recT0) * sr)));
    const first = rel(this.firstOn), last = rel(this.lastPlay);
    const played = (last - first) / sr;
    // trim to the music: a little before the first note, ~1.5 s of ring after the last one
    const s0 = Math.max(0, first - Math.round(0.25 * sr)), s1 = Math.min(n, last + Math.round(1.5 * sr));
    this.chunks = null; this.state = 'armed'; this.recent = []; this.ringFill = 0; this.floor = this.recFloor;
    this.needQuiet = reason === 'silence' ? 0 : this.o.rearmQuiet; // after a max/manual stop, wait for quiet before re-arming
    this.guardUntil = this.t + this.o.guard;
    if (played < this.o.minPlayed) return { type: 'short', played, reason };
    return { type: 'take', reason, played, take: take.slice(s0, s1), rawLen: n / sr, trimmedFrom: s0 / sr };
  };
  const api = { Listener, DEFAULTS: DEF };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SDListener = api;
})(typeof self !== 'undefined' ? self : this);
