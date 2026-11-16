/* SidelineScout scoreboard scanner: reads the clock and down & distance from a broadcast video, in the browser. */
(function (root) {
  'use strict';
  const ORD = { ST: 1, ND: 2, RD: 3, TH: 4 };

  function parseText(txt) {
    const s = String(txt).toUpperCase().replace(/\s+/g, '');
    const out = { q: null, clk: null, down: null, dist: null };
    const m = s.match(/(ST|ND|RD|TH)[^A-Z0-9]*[&8S]?[^A-Z0-9]*(\d{1,2}?|GOAL)(?=[1-4O6IL]?(?:ST|ND|RD|TH|OT)|$)/);
    if (m) {
      out.down = ORD[m[1]]; out.dist = m[2] === 'GOAL' ? 'GOAL' : m[2];
      const rest = s.slice(m.index + m[0].length);
      if (rest.indexOf('OT') >= 0) out.q = 5;
      else { const q = rest.match(/(ST|ND|RD|TH)/); if (q) out.q = ORD[q[1]]; }
    }
    const c = s.match(/(\d{1,2}):(\d{2})/);
    if (c) out.clk = parseInt(c[1], 10) + ':' + c[2];
    return out;
  }

  function mmss(t) {
    t = Math.floor(t); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  }

  function segments(reads, minCount) {
    minCount = minCount || 2; const runs = [];
    for (const r of reads) {
      if (r.down == null || r.dist == null) continue;
      const key = (r.q || 0) + '|' + r.down + '|' + r.dist;
      const last = runs[runs.length - 1];
      if (last && last.key === key) { last.n++; last.tLast = r.t; }
      else runs.push({ key, q: r.q || 0, down: r.down, dist: r.dist, n: 1, tFirst: r.t, tLast: r.t, clk: r.clk });
    }
    const merged = [];
    for (const s of runs.filter(x => x.n >= minCount)) {
      const last = merged[merged.length - 1];
      if (last && last.key === s.key) { last.tLast = s.tLast; last.n += s.n; } else merged.push(Object.assign({}, s));
    }
    return merged;
  }

  function buildPlays(segs) {
    const plays = [];
    segs.forEach((s, i) => {
      const row = { qtr: s.q || 1, clock: s.clk || '', dn: s.down, dist: s.dist, gain: '', check: '', t: s.tFirst, tEnd: s.tFirst };
      const num = v => /^\d+$/.test(String(v));
      if (i + 1 < segs.length) {
        const n = segs[i + 1]; row.tEnd = n.tFirst;
        if (n.q === s.q && n.down === s.down + 1 && num(s.dist) && num(n.dist)) row.gain = parseInt(s.dist, 10) - parseInt(n.dist, 10);
        else if (n.q === s.q && n.down === s.down && n.dist !== s.dist) return; // penalty or no play
        else if (n.down === 1) row.check = s.down < 4 ? 'first down, turnover or score next (gain at least ' + s.dist + ')' : 'conversion, punt, turnover or score next';
        else row.check = 'scoreboard jumped: check this play';
      } else row.check = 'last play in the video';
      plays.push(row);
    });
    return plays;
  }

  async function createRecognizer(ort, model, chars) {
    const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
    const ch = chars.concat([' ']);
    function size(w, h) {
      const ratio = w / h, W = Math.floor(48 * Math.max(320 / 48, ratio));
      const rw = Math.ceil(48 * ratio) > W ? W : Math.ceil(48 * ratio);
      return { W, rw };
    }
    async function recognize(rgba, rw, W) {
      const data = new Float32Array(3 * 48 * W), plane = 48 * W;
      for (let y = 0; y < 48; y++) for (let x = 0; x < rw; x++) {
        const i = (y * rw + x) * 4, o = y * W + x;
        data[o] = (rgba[i + 2] / 255 - 0.5) / 0.5;            // blue first (BGR), as the model expects
        data[plane + o] = (rgba[i + 1] / 255 - 0.5) / 0.5;
        data[2 * plane + o] = (rgba[i] / 255 - 0.5) / 0.5;
      }
      const out = await session.run({ x: new ort.Tensor('float32', data, [1, 3, 48, W]) });
      const o = out[session.outputNames[0]], T = o.dims[1], C = o.dims[2], p = o.data;
      let txt = '', prev = -1;
      for (let t = 0; t < T; t++) {
        let best = 0, bv = -1; const base = t * C;
        for (let c = 0; c < C; c++) { const v = p[base + c]; if (v > bv) { bv = v; best = c; } }
        if (best !== prev && best !== 0) txt += ch[best - 1] || '';
        prev = best;
      }
      return txt;
    }
    return { size, recognize };
  }

  function readFrame(rec, video, box, canvas) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const sx = box.x * vw, sy = box.y * vh, sw = box.w * vw, sh = box.h * vh;
    const z = rec.size(sw, sh); canvas.width = z.rw; canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, z.rw, 48);
    return rec.recognize(ctx.getImageData(0, 0, z.rw, 48).data, z.rw, z.W);
  }

  function seek(video, t) {
    return new Promise(res => {
      let done = false; const fin = () => { if (!done) { done = true; video.removeEventListener('seeked', fin); res(); } };
      video.addEventListener('seeked', fin); setTimeout(fin, 6000); video.currentTime = t;
    });
  }

  const api = { parseText, segments, buildPlays, createRecognizer, readFrame, seek, mmss };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SS = api;
})(typeof window !== 'undefined' ? window : globalThis);
