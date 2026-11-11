/* =====================================================================
 *  Elektrihind – Home Assistanti dashboardi kaart
 *  Loeb sensor.elektrihind_tabel (hinnad + piirid + varvid) ja näitab
 *  hetkehinda ning veerandtunni/tunni tulpdiagrammi samade värvidega
 *  nagu Wemose ekraan ja Android-äpp.
 *
 *  Kasutus:
 *    type: custom:elektrihind-card
 *    entity: sensor.elektrihind_tabel   # vaikimisi
 *    title: Elektrihind                 # valikuline
 *    vaade: 15min                       # 15min | tund (algvaade)
 * ===================================================================== */

const EH_VERSION = "2.8.0";
const EH_PAEVAD = ["E", "T", "K", "N", "R", "L", "P", "Püha"];
const EH_MAX_VARVE = 16;
// palett: 12 tooni × 3 heledust + hallid (HSL -> #RRGGBB)
const EH_PALETT = (() => {
  const hex = (h, s, l) => {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return "#" + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
  };
  const toonid = [0, 25, 45, 60, 90, 130, 165, 185, 210, 240, 275, 310];
  const out = [];
  for (const [s, l] of [[100, 50], [90, 70], [80, 32]]) for (const h of toonid) out.push(hex(h, s, l));
  return out.concat(["#FFFFFF", "#D0D0D0", "#A0A0A0", "#707070", "#404040", "#000000",
    "#00FFFF", "#0078FF", "#B400B4", "#00FF00", "#FFFF00", "#FF8000"]);
})();

class ElektrihindCard extends HTMLElement {
  setConfig(config) {
    this._config = {
      entity: "sensor.elektrihind_tabel",
      title: "Elektrihind",
      vaade: "15min",
      ...config,
    };
    this._vaade = this._config.vaade === "tund" ? "tund" : "15min";
    this._paev = null;      // valitud kuupäev "YYYY-MM-DD"
    this._valitud = null;   // puudutatud tulba indeks
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    this._hass = hass;
    const st = hass.states[this._config.entity];
    const vu = hass.states["sensor.elektrihind_uusim_versioon"];
    const key = [st ? st.last_updated : "puudub", vu ? vu.state : "", this._uuendab || ""].join("|");
    if (key !== this._key) {
      this._key = key;
      if (!this._seadedAvatud) this._render();
    }
  }

  connectedCallback() {
    // veerandtunni vahetus: joonista iga 30 s järel uuesti, kui slott muutus
    this._timer = setInterval(() => {
      const s = Math.floor(Date.now() / 900000);
      if (s !== this._slot && !this._seadedAvatud) this._render();
    }, 30000);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  getCardSize() {
    return 6;
  }

  static getStubConfig() {
    return { entity: "sensor.elektrihind_tabel" };
  }

  // ------------------------------------------------------------------
  _varv(hind, piirid, varvid) {
    let i = 0;
    while (i < piirid.length && hind >= piirid[i]) i++;
    return varvid[Math.min(i, varvid.length - 1)] || "var(--primary-color)";
  }

  _kell(iso) {
    return iso.slice(11, 16);
  }

  _kellTs(ts) {
    const d = new Date(ts * 1000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  _ilusSamm(vahemik) {
    const toores = vahemik / 4;
    const k = Math.pow(10, Math.floor(Math.log10(toores || 1)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * k >= toores) return m * k;
    return 10 * k;
  }

  _kuupaevTekst(d) {
    const tana = new Date();
    const f = (x) =>
      `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    const homme = new Date(tana.getTime() + 86400000);
    const eile = new Date(tana.getTime() - 86400000);
    if (d === f(tana)) return "Täna";
    if (d === f(homme)) return "Homme";
    if (d === f(eile)) return "Eile";
    return `${d.slice(8, 10)}.${d.slice(5, 7)}`;
  }

  _render() {
    if (!this._hass || !this.shadowRoot) return;
    const st = this._hass.states[this._config.entity];
    const root = this.shadowRoot;
    this._slot = Math.floor(Date.now() / 900000);

    if (!st || !Array.isArray(st.attributes.hinnad) || !st.attributes.hinnad.length) {
      root.innerHTML = `${this._stiil()}<ha-card><div class="tyhi">
        Hinnad puuduvad (${this._config.entity})
        <button class="hammas" aria-label="Seaded">⚙</button></div></ha-card>`;
      root.querySelector(".hammas").addEventListener("click", () => this._avaSeaded());
      return;
    }

    const piirid = st.attributes.piirid || [10, 15, 20, 25, 30, 35];
    const varvid = st.attributes.varvid ||
      ["#00FFFF", "#0078FF", "#B400B4", "#00FF00", "#FFFF00", "#FF8000", "#FF0000"];
    const read = st.attributes.hinnad;
    const nyyd = Date.now() / 1000;

    // ---- praegune ja järgmine veerandtund ----
    const praegu = read.find((r) => r.ts <= nyyd && nyyd < r.ts + 900);
    const jargmine = read.find((r) => r.ts > nyyd);

    // ---- päevad ----
    const paevad = [...new Set(read.map((r) => r.algus.slice(0, 10)))];
    const tanaStr = praegu ? praegu.algus.slice(0, 10) : paevad[0];
    if (!this._paev || !paevad.includes(this._paev)) this._paev = tanaStr;
    const paevaRead = read.filter((r) => r.algus.slice(0, 10) === this._paev);

    // ---- tulbad (15 min või tunni keskmine) ----
    let tulbad;
    if (this._vaade === "tund") {
      const tunnid = new Map();
      for (const r of paevaRead) {
        const k = r.algus.slice(0, 13);
        if (!tunnid.has(k)) tunnid.set(k, []);
        tunnid.get(k).push(r);
      }
      tulbad = [...tunnid.values()].map((g) => ({
        ts: g[0].ts,
        lopp: g[g.length - 1].ts + 900,
        algus: g[0].algus,
        hind: g.reduce((s, r) => s + r.hind, 0) / g.length,
        bors: g.reduce((s, r) => s + r.bors, 0) / g.length,
      }));
    } else {
      tulbad = paevaRead.map((r) => ({ ...r, lopp: r.ts + 900 }));
    }

    const hinnad = paevaRead.map((r) => r.hind);
    const min = Math.min(...hinnad);
    const max = Math.max(...hinnad);
    const kesk = hinnad.reduce((a, b) => a + b, 0) / hinnad.length;

    // ---- telg ----
    const tMin = Math.min(0, ...tulbad.map((t) => t.hind));
    const tMaxToores = Math.max(0.1, ...tulbad.map((t) => t.hind));
    const samm = this._ilusSamm(tMaxToores - tMin);
    const yMax = Math.ceil(tMaxToores / samm) * samm;
    const yMin = Math.floor(tMin / samm) * samm;
    const ulatus = yMax - yMin || 1;
    const y = (v) => ((yMax - v) / ulatus) * 100; // % ülevalt

    const jooned = [];
    for (let v = yMin; v <= yMax + 1e-9; v += samm) jooned.push(v);

    const aktiivne = tulbad.findIndex((t) => t.ts <= nyyd && nyyd < t.lopp);
    const naitaIdx = this._valitud != null && this._valitud < tulbad.length
      ? this._valitud : aktiivne;
    const detail = naitaIdx >= 0 ? tulbad[naitaIdx] : null;

    const n = tulbad.length;
    const tulbaHtml = tulbad.map((t, i) => {
      const ylem = y(Math.max(t.hind, 0));
      const alum = y(Math.min(t.hind, 0));
      const k = Math.max(alum - ylem, 0.6);
      const klass = [
        i === aktiivne ? "aktiivne" : "",
        i === naitaIdx && i !== aktiivne ? "valitud" : "",
        t.lopp <= nyyd ? "moodas" : "",
      ].join(" ");
      return `<div class="tulp ${klass}" data-i="${i}" style="left:${(i / n) * 100}%;
        width:${100 / n}%;top:${ylem}%;height:${k}%;
        --v:${this._varv(t.hind, piirid, varvid)}"></div>`;
    }).join("");

    const sildid = [];
    const sammTund = this._vaade === "tund" ? 3 : 12;
    tulbad.forEach((t, i) => {
      if (i % sammTund === 0)
        sildid.push(`<span style="left:${(i / n) * 100}%">${this._kell(t.algus).slice(0, 2)}</span>`);
    });

    const pv = praegu ? this._varv(praegu.hind, piirid, varvid) : "var(--secondary-text-color)";
    const fmt = (v) => (v == null || isNaN(v) ? "--" : v.toFixed(2));

    root.innerHTML = `${this._stiil()}
    <ha-card>
      ${this._uuenduseRiba()}
      <div class="pais">
        <div>
          <div class="pealkiri">${this._config.title}
            <button class="hammas" title="Tasud ja värvid" aria-label="Seaded">⚙</button></div>
          <div class="hind" style="color:${pv}">${fmt(praegu && praegu.hind)}
            <span class="yhik">s/kWh</span></div>
          <div class="vaike">
            ${praegu ? `${this._kell(praegu.algus)}–${this._kellTs(praegu.ts + 900)}` : ""}
            ${praegu ? ` · börs ${fmt(praegu.bors)}` : ""}
            ${jargmine ? ` · järgmine <b style="color:${this._varv(jargmine.hind, piirid, varvid)}">${fmt(jargmine.hind)}</b>` : ""}
          </div>
        </div>
        <div class="statid">
          <div><span>min</span><b style="color:${this._varv(min, piirid, varvid)}">${fmt(min)}</b></div>
          <div><span>kesk</span><b style="color:${this._varv(kesk, piirid, varvid)}">${fmt(kesk)}</b></div>
          <div><span>max</span><b style="color:${this._varv(max, piirid, varvid)}">${fmt(max)}</b></div>
        </div>
      </div>

      <div class="nupud">
        <div class="grupp">
          ${paevad.map((d) => `<button data-paev="${d}" class="${d === this._paev ? "on" : ""}">${this._kuupaevTekst(d)}</button>`).join("")}
        </div>
        <div class="grupp">
          <button data-vaade="15min" class="${this._vaade === "15min" ? "on" : ""}">15 min</button>
          <button data-vaade="tund" class="${this._vaade === "tund" ? "on" : ""}">Tund</button>
        </div>
      </div>

      <div class="detail">
        ${detail ? `<b>${this._kell(detail.algus)}–${this._kellTs(detail.lopp)}</b>
          <span style="color:${this._varv(detail.hind, piirid, varvid)}">${fmt(detail.hind)} s/kWh</span>
          <span class="vaike">börs ${fmt(detail.bors)}</span>` : "&nbsp;"}
      </div>

      <div class="graafik">
        <div class="telg">
          ${jooned.map((v) => `<span style="top:${y(v)}%">${Number.isInteger(v) ? v : v.toFixed(1)}</span>`).join("")}
        </div>
        <div class="ala">
          ${jooned.map((v) => `<div class="joon ${v === 0 ? "null" : ""}" style="top:${y(v)}%"></div>`).join("")}
          ${aktiivne >= 0 ? `<div class="nyyd" style="left:${((aktiivne + 0.5) / n) * 100}%"></div>` : ""}
          ${tulbaHtml}
        </div>
      </div>
      <div class="xtelg">${sildid.join("")}</div>
    </ha-card>`;

    // ---- sündmused ----
    root.querySelector(".hammas").addEventListener("click", () => this._avaSeaded());
    const uu = root.querySelector("[data-uuenda]");
    if (uu) uu.addEventListener("click", () => this._uuenda());
    root.querySelectorAll("button[data-paev]").forEach((b) =>
      b.addEventListener("click", () => { this._paev = b.dataset.paev; this._valitud = null; this._render(); }));
    root.querySelectorAll("button[data-vaade]").forEach((b) =>
      b.addEventListener("click", () => { this._vaade = b.dataset.vaade; this._valitud = null; this._render(); }));
    const ala = root.querySelector(".ala");
    const vali = (ev) => {
      const r = ala.getBoundingClientRect();
      const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      const i = Math.max(0, Math.min(n - 1, Math.floor((x / r.width) * n)));
      if (i !== this._valitud) { this._valitud = i; this._render(); }
    };
    ala.addEventListener("click", vali);
    ala.addEventListener("pointermove", (ev) => { if (ev.pointerType === "mouse" || ev.buttons) vali(ev); });
    ala.addEventListener("mouseleave", () => { if (this._valitud != null) { this._valitud = null; this._render(); } });
  }


  // ==================================================================
  //  Seadete vaade (tasud, KM, värvid) – nagu Wemose veebileht
  // ==================================================================
  _avaSeaded() {
    const st = this._hass.states[this._config.entity];
    const a = (st && st.attributes) || {};
    const c = a.seaded || {
      km: 24, borsKm: true,
      piirid: a.piirid || [10, 15, 20, 25, 30, 35],
      varvid: a.varvid || ["#00FFFF", "#0078FF", "#B400B4", "#00FF00", "#FFFF00", "#FF8000", "#FF0000"],
      tasud: [],
    };
    this._S = JSON.parse(JSON.stringify(c));
    this._S.tasud = (this._S.tasud || []).map((t) => ({
      nimi: t.nimi, s: t.s, km: !!t.km, on: t.on !== false,
      p: (t.p || "11111111").length === 7 ? t.p + t.p[6] : (t.p || "11111111"),
      al: t.al ?? 0, kuni: t.kuni ?? 24,
    }));
    this._seadedAvatud = true;
    this._teade = null;
    this._kinnita = false;
    this._renderSeaded();
  }

  _sulgeSeaded() {
    this._seadedAvatud = false;
    this._render();
  }

  _esc(x) {
    return String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  _nr(x) {
    return parseFloat(String(x).replace(",", "."));
  }

  // Kehtivad tasud praegusel veerandtunnil (tabel "Praegu")
  _praeguTabel() {
    const st = this._hass.states[this._config.entity];
    const read = (st && st.attributes.hinnad) || [];
    const nyyd = Date.now() / 1000;
    const r = read.find((x) => x.ts <= nyyd && nyyd < x.ts + 900);
    if (!r) return `<tr><td>Hinnaandmed puuduvad</td></tr>`;
    const S = this._S;
    const k = 1 + (this._nr(S.km) || 0) / 100;
    const tund = parseInt(r.algus.slice(11, 13), 10);
    const nadal = (new Date(r.algus.slice(0, 10) + "T12:00:00").getDay() + 6) % 7;
    const bit = r.puha ? 7 : nadal;
    let sum = r.bors * (S.borsKm ? k : 1);
    let html = `<tr><td>Börsihind${S.borsKm ? " + KM" : ""}</td><td>${(r.bors * (S.borsKm ? k : 1)).toFixed(2)}</td></tr>`;
    for (const t of S.tasud) {
      const al = parseInt(t.al, 10), kuni = parseInt(t.kuni, 10), sm = this._nr(t.s);
      if (!t.on || t.p[bit] !== "1" || isNaN(sm)) continue;
      const kell = al < kuni ? tund >= al && tund < kuni : tund >= al || tund < kuni;
      if (!kell) continue;
      const v = sm * (t.km ? k : 1);
      sum += v;
      html += `<tr><td>${this._esc(t.nimi)}</td><td>${v.toFixed(2)}</td></tr>`;
    }
    const varv = this._varv(sum, S.piirid.map((x) => this._nr(x)), S.varvid);
    html += `<tr class="sum"><td>Kokku</td><td><span class="tapp" style="background:${varv}"></span>${sum.toFixed(2)} s/kWh</td></tr>`;
    return { html, aeg: `${this._kell(r.algus)}${r.puha ? " (riigipüha)" : ""}` };
  }

  _renderSeaded() {
    const S = this._S;
    const root = this.shadowRoot;
    const p = this._praeguTabel();
    const n = S.varvid.length;

    const varvid = S.varvid.map((c, i) => `
      <div class="vr">
        <input type="color" data-varv="${i}" value="${this._esc(c)}" title="Kõik värvid">
        <input type="text" class="hex" data-hex="${i}" value="${this._esc(c)}" maxlength="7" spellcheck="false"
          aria-label="Värvikood">
        <button class="pal ${this._palett === i ? "on" : ""}" data-palett="${i}" title="Palett" aria-label="Palett">▾</button>
        ${i < n - 1
          ? `<span>kuni</span><input type="text" inputmode="decimal" class="summa" data-piir="${i}" value="${S.piirid[i]}">`
          : `<span>${S.piirid[n - 2]} ja üle selle</span>`}
        <span class="tyhik"></span>
        ${n > 2 ? `<button class="d" data-kustutavarv="${i}" aria-label="Eemalda värv">✕</button>` : ""}
      </div>
      ${this._palett === i ? `<div class="palett">${EH_PALETT.map((p) =>
        `<button class="tk" data-vali="${i}" data-c="${p}" style="background:${p}" title="${p}"
          aria-label="${p}"></button>`).join("")}</div>` : ""}`).join("");

    const tasud = S.tasud.map((t, i) => `
      <div class="kast ${t.on ? "" : "off"}">
        <div class="rida">
          <input type="text" class="nimi" maxlength="24" data-t="${i}" data-v="nimi" value="${this._esc(t.nimi)}">
          <input type="text" inputmode="decimal" class="summa" data-t="${i}" data-v="s" value="${t.s}">
        </div>
        <div class="rida">
          <div class="paevad">${EH_PAEVAD.map((d, j) => `
            <label class="${j === 7 ? "ph" : ""}">${d}
              <input type="checkbox" data-t="${i}" data-paev="${j}" ${t.p[j] === "1" ? "checked" : ""}></label>`).join("")}
          </div>
          <label class="kell"><input type="number" min="0" max="23" data-t="${i}" data-v="al" value="${t.al}">–<input
            type="number" min="1" max="24" data-t="${i}" data-v="kuni" value="${t.kuni}"></label>
        </div>
        <div class="rida">
          <label><input type="checkbox" data-t="${i}" data-v="km" ${t.km ? "checked" : ""}>+KM</label>
          <label><input type="checkbox" data-t="${i}" data-v="on" ${t.on ? "checked" : ""}>Aktiivne</label>
          <span class="tyhik"></span>
          <button class="d" data-kustuta="${i}">Kustuta</button>
        </div>
      </div>`).join("");

    root.innerHTML = `${this._stiil()}${this._seadeStiil()}
    <ha-card>
      <div class="sp">
        <div class="pealkiri">${this._config.title} · seaded</div>
        <button class="sulge" aria-label="Sulge">✕</button>
      </div>
      ${this._versiooniRida()}

      <div class="kast"><h3>Praegu ${typeof p === "object" ? p.aeg : ""}</h3>
        <table>${typeof p === "object" ? p.html : p}</table>
        <small>Arvutatud siin muudetud väärtustega (enne salvestamist).</small></div>

      <div class="kast"><h3>Üldine</h3>
        <div class="rida">
          <label>Käibemaks % <input type="number" step="0.1" min="0" max="50" data-yld="km" value="${S.km}"></label>
          <label><input type="checkbox" data-yld="borsKm" ${S.borsKm ? "checked" : ""}> Börsihinnale lisandub KM</label>
        </div></div>

      <div class="kast"><h3>Värvid <small>(lõpphind, s/kWh)</small></h3>
        ${varvid}
        ${n < EH_MAX_VARVE ? `<div class="rida"><button data-lisavarv>+ Lisa värv</button>
          <small>${n} / ${EH_MAX_VARVE}</small></div>` : ""}
      </div>

      <h3>Tasud <small>(senti/kWh)</small></h3>
      ${tasud}
      <div class="rida"><button data-lisa ${S.tasud.length >= 12 ? "disabled" : ""}>+ Lisa tasu</button></div>

      <div class="teade ${this._teade && this._teade.viga ? "viga" : "ok"}">${this._teade ? this._esc(this._teade.tekst) : ""}</div>
      <div class="rida">
        <button class="p" data-salvesta>Salvesta</button>
        <button data-tyhista>Tühista</button>
        <span class="tyhik"></span>
        <button class="d" data-vaikimisi>${this._kinnita ? "Kindel? Taasta" : "Taasta vaikimisi"}</button>
      </div>
      <p><small>Tasu kehtib valitud päevadel kellast kuni kellani. Kui „kellast“ on suurem kui
        „kellani“ (nt 22–7), kehtib see üle kesköö. Terve päev on 0–24. Riigipühal kehtib tasu
        ainult siis, kui „Püha“ on märgitud – nädalapäevi siis ei arvestata. „+KM“ märgitud tasule
        lisatakse käibemaks; jäta märkimata, kui summa juba sisaldab käibemaksu.</small></p>
    </ha-card>`;

    // ---- sisestus: väärtused kirjutatakse kohe this._S-i ----
    const uuendaPraegu = () => {
      const q = this._praeguTabel();
      const tbl = root.querySelector("table");
      if (tbl && typeof q === "object") tbl.innerHTML = q.html;
    };
    root.querySelectorAll("[data-t]").forEach((el) => {
      const i = +el.dataset.t;
      const ev = el.type === "checkbox" ? "change" : "input";
      el.addEventListener(ev, () => {
        const t = S.tasud[i];
        if (el.dataset.paev !== undefined) {
          const a = t.p.split("");
          a[+el.dataset.paev] = el.checked ? "1" : "0";
          t.p = a.join("");
        } else if (el.type === "checkbox") {
          t[el.dataset.v] = el.checked;
          if (el.dataset.v === "on") { this._renderSeaded(); return; }
        } else {
          t[el.dataset.v] = el.value;
        }
        uuendaPraegu();
      });
    });
    root.querySelectorAll("[data-yld]").forEach((el) =>
      el.addEventListener(el.type === "checkbox" ? "change" : "input", () => {
        S[el.dataset.yld] = el.type === "checkbox" ? el.checked : el.value;
        uuendaPraegu();
      }));
    root.querySelectorAll("[data-varv]").forEach((el) => {
      const f = () => {
        const i = +el.dataset.varv;
        S.varvid[i] = el.value.toUpperCase();
        const h = root.querySelector(`[data-hex="${i}"]`);
        if (h) h.value = S.varvid[i];
        uuendaPraegu();
      };
      el.addEventListener("input", f);
      el.addEventListener("change", f);
    });
    root.querySelectorAll("[data-hex]").forEach((el) => el.addEventListener("input", () => {
      let v = el.value.trim().toUpperCase();
      if (/^[0-9A-F]{6}$/.test(v)) v = "#" + v;
      const ok = /^#[0-9A-F]{6}$/.test(v);
      el.classList.toggle("vigane", !ok);
      if (!ok) return;
      const i = +el.dataset.hex;
      S.varvid[i] = v;
      const c = root.querySelector(`[data-varv="${i}"]`);
      if (c) c.value = v.toLowerCase();
      uuendaPraegu();
    }));
    root.querySelectorAll("[data-piir]").forEach((el) =>
      el.addEventListener("input", () => {
        S.piirid[+el.dataset.piir] = el.value;
        uuendaPraegu();
      }));

    // ---- nupud ----
    const on = (sel, f) => root.querySelectorAll(sel).forEach((b) => b.addEventListener("click", () => f(b)));
    on(".sulge", () => this._sulgeSeaded());
    on("[data-kontrolli]", () => this._kontrolliUuendusi());
    on("[data-uuenda]", () => { this._seadedAvatud = false; this._uuenda(); });
    on("[data-tyhista]", () => this._sulgeSeaded());
    on("[data-lisa]", () => {
      if (S.tasud.length >= 12) return;
      S.tasud.push({ nimi: "Uus tasu", s: 0, km: false, on: true, p: "11111111", al: 0, kuni: 24 });
      this._renderSeaded();
    });
    on("[data-kustuta]", (b) => { S.tasud.splice(+b.dataset.kustuta, 1); this._renderSeaded(); });
    on("[data-palett]", (b) => {
      const i = +b.dataset.palett;
      this._palett = this._palett === i ? null : i;
      this._renderSeaded();
    });
    on("[data-vali]", (b) => {
      S.varvid[+b.dataset.vali] = b.dataset.c;
      this._palett = null;
      this._renderSeaded();
    });
    on("[data-lisavarv]", () => {
      if (S.varvid.length >= EH_MAX_VARVE) return;
      const v = this._nr(S.piirid[S.piirid.length - 1]);
      S.piirid.push(isNaN(v) ? 30 : Math.round((v + 5) * 100) / 100);
      S.varvid.push("#808080");
      this._renderSeaded();
    });
    on("[data-kustutavarv]", (b) => {
      const i = +b.dataset.kustutavarv, m = S.varvid.length;
      if (m <= 2) return;
      S.varvid.splice(i, 1);
      S.piirid.splice(i < m - 1 ? i : m - 2, 1);
      this._renderSeaded();
    });
    on("[data-salvesta]", () => this._salvesta());
    on("[data-vaikimisi]", () => {
      if (!this._kinnita) { this._kinnita = true; this._renderSeaded(); return; }
      this._saada(null, "Vaikeväärtused taastatud");
    });
  }

  // Kontroll nagu Wemose jsonistSeaded()
  _kontrolli() {
    const S = this._S;
    // telefoni värvivalija ei pruugi sündmust saata – loe väljadelt (koodilahter on ülimuslik)
    this.shadowRoot.querySelectorAll("[data-varv]").forEach((el) => {
      S.varvid[+el.dataset.varv] = el.value.toUpperCase();
    });
    this.shadowRoot.querySelectorAll("[data-hex]").forEach((el) => {
      let v = el.value.trim().toUpperCase();
      if (/^[0-9A-F]{6}$/.test(v)) v = "#" + v;
      if (/^#[0-9A-F]{6}$/.test(v)) S.varvid[+el.dataset.hex] = v;
      else throw new Error(`Vigane värvikood: ${el.value}`);
    });
    const km = this._nr(S.km);
    if (isNaN(km) || km < 0 || km > 50) throw new Error("Käibemaksu % peab olema 0..50");
    const piirid = S.piirid.map((x) => this._nr(x));
    if (S.varvid.length < 2 || S.varvid.length > EH_MAX_VARVE) throw new Error(`Värve peab olema 2 kuni ${EH_MAX_VARVE}`);
    if (piirid.length !== S.varvid.length - 1) throw new Error("Piire peab olema ühe võrra vähem kui värve");
    piirid.forEach((v, i) => {
      if (isNaN(v) || v < -100 || v > 500) throw new Error("Vigane värvipiir");
      if (i > 0 && v <= piirid[i - 1]) throw new Error("Värvipiirid peavad olema kasvavas järjekorras");
    });
    S.varvid.forEach((c) => { if (!/^#[0-9A-F]{6}$/.test(c)) throw new Error("Vigane värv"); });
    if (S.tasud.length > 12) throw new Error("Liiga palju tasusid (max 12)");
    const tasud = S.tasud.map((t) => {
      const nimi = String(t.nimi).trim();
      if (!nimi) throw new Error("Igal tasul peab olema nimi");
      const sm = this._nr(t.s);
      if (isNaN(sm)) throw new Error(`Vigane summa: ${nimi}`);
      if (sm < -100 || sm > 100) throw new Error(`Summa väljaspool piire: ${nimi}`);
      const al = parseInt(t.al, 10), kuni = parseInt(t.kuni, 10);
      if (isNaN(al) || isNaN(kuni) || al < 0 || al > 23 || kuni < 1 || kuni > 24 || al === kuni)
        throw new Error(`Vigane kellaaeg: ${nimi}`);
      return { nimi, s: sm, km: !!t.km, on: !!t.on, p: t.p, al, kuni };
    });
    return { km, borsKm: !!S.borsKm, piirid, varvid: S.varvid, tasud };
  }

  async _salvesta() {
    let d;
    try {
      d = this._kontrolli();
    } catch (e) {
      this._teade = { tekst: e.message, viga: true };
      this._renderSeaded();
      return;
    }
    this._saada(d, "Salvestatud");
  }

  async _saada(seaded, okTekst) {
    try {
      await this._hass.callWS({
        type: "fire_event",
        event_type: "elektrihind_seaded",
        event_data: { seaded },
      });
      this._teade = { tekst: okTekst, viga: false };
      this._seadedAvatud = false;
      // tabel arvutatakse HA-s ümber; joonistame kohe, uuendus jõuab paari sekundiga
      this._render();
    } catch (e) {
      const t = e && e.code === "unauthorized"
        ? "Salvestamiseks on vaja administraatori kontot"
        : `Salvestamine ebaõnnestus: ${(e && e.message) || e}`;
      this._teade = { tekst: t, viga: true };
      this._kinnita = false;
      this._renderSeaded();
    }
  }

  _seadeStiil() {
    return `<style>
      .sp { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
      h3 { font-size: 14px; font-weight: 600; color: var(--secondary-text-color); margin: 0 0 8px; }
      h3 small, p small, .kast small { font-weight: 400; color: var(--secondary-text-color); }
      .kast { border: 1px solid var(--divider-color); border-radius: 10px; padding: 10px; margin-bottom: 10px; }
      .kast.off { opacity: .5; }
      .rida { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 6px; }
      .tyhik { flex: 1; }
      input[type=text], input[type=number] {
        background: var(--secondary-background-color, transparent); color: var(--primary-text-color);
        border: 1px solid var(--divider-color); border-radius: 6px; padding: 6px 8px; font: inherit; font-size: 14px; }
      input[type=number] { width: 64px; }
      .summa { width: 72px; }
      .nimi { flex: 1; min-width: 140px; }
      label { display: inline-flex; align-items: center; gap: 4px; color: var(--secondary-text-color); font-size: 13px; }
      .paevad { display: flex; gap: 2px; }
      .paevad label { flex-direction: column; gap: 0; font-size: 12px; width: 26px; }
      .paevad label.ph { width: 34px; margin-left: 4px; }
      .kell input { width: 52px; }
      .kast button, .rida button, .sulge {
        border: 1px solid var(--divider-color); border-radius: 6px; padding: 6px 12px; }
      button.p { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); }
      button.d { color: var(--error-color, #db4437); }
      button:disabled { opacity: .4; cursor: default; }
      .vr { display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: 13px; color: var(--secondary-text-color); }
      .vr input[type=color] { width: 44px; height: 32px; padding: 0; border: 1px solid var(--divider-color);
        border-radius: 6px; background: none; }
      .vr input.hex { width: 78px; font-family: monospace; text-transform: uppercase; }
      .vr input.hex.vigane { border-color: var(--error-color, #db4437); }
      .vr button.pal { padding: 4px 8px; }
      .vr button.pal.on { background: var(--primary-color); color: var(--text-primary-color, #fff); }
      .palett { display: grid; grid-template-columns: repeat(12, 1fr); gap: 4px; margin: 2px 0 10px 52px; max-width: 320px; }
      .palett .tk { aspect-ratio: 1; padding: 0; border-radius: 4px; border: 1px solid var(--divider-color); cursor: pointer; }
      .palett .tk:hover { outline: 2px solid var(--primary-text-color); }
      table { width: 100%; border-collapse: collapse; font-size: 14px; color: var(--primary-text-color); }
      td { padding: 2px 0; }
      td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
      tr.sum td { border-top: 1px solid var(--divider-color); font-weight: 700; padding-top: 6px; }
      .tapp { display: inline-block; width: 11px; height: 11px; border-radius: 50%; margin-right: 6px; vertical-align: -1px; }
      .teade { min-height: 20px; margin: 8px 0 2px; font-size: 14px; }
      .teade.viga { color: var(--error-color, #db4437); }
      .teade.ok { color: var(--success-color, #43a047); }
    </style>`;
  }

  // ---- uuendused GitHubist ----
  _versioonUuem(a, b) {
    const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
  }

  _versiooniRida() {
    const h = this._hass;
    const praegu = (h.states["sensor.elektrihind_versioon"] || {}).state || EH_VERSION;
    const uus = (h.states["sensor.elektrihind_uusim_versioon"] || {}).state;
    const uuem = uus && /^\d+\.\d+\.\d+$/.test(uus) && this._versioonUuem(uus, praegu);
    const olek = this._kontrollib ? "kontrollin…"
      : uuem ? `saadaval ${uus}` : uus && /^\d/.test(uus) ? "uusim" : "teadmata";
    return `<div class="versioon"><span>Versioon <b>${praegu}</b> · ${olek}</span>
      <span>${uuem && h.user && h.user.is_admin ? `<button class="p" data-uuenda>Uuenda ${uus}</button>` : ""}
      <button data-kontrolli ${this._kontrollib ? "disabled" : ""}>Kontrolli uuendusi</button></span></div>`;
  }

  async _kontrolliUuendusi() {
    this._kontrollib = true;
    this._renderSeaded();
    try {
      await this._hass.callService("homeassistant", "update_entity",
        { entity_id: "sensor.elektrihind_uusim_versioon" });
      await new Promise((ok) => setTimeout(ok, 1500));   // oota, kuni uus olek jõuab kaardini
    } catch (e) { /* olek jääb "teadmata" */ }
    this._kontrollib = false;
    if (this._seadedAvatud) this._renderSeaded();
  }

  _uuenduseRiba() {
    const h = this._hass;
    const uus = h.states["sensor.elektrihind_uusim_versioon"];
    const praegu = (h.states["sensor.elektrihind_versioon"] || {}).state || EH_VERSION;
    if (this._uuendab) return `<div class="uuendus">${this._uuendab}</div>`;
    if (!uus || !/^\d+\.\d+\.\d+$/.test(uus.state) || !this._versioonUuem(uus.state, praegu)) return "";
    if (!h.user || !h.user.is_admin) return "";
    const m = (uus.attributes.muudatused || []).slice(0, 4).map((x) => `<li>${String(x).replace(/[&<>"]/g, "")}</li>`).join("");
    return `<div class="uuendus"><div><b>Uuendus saadaval: ${uus.state}</b> <small>(praegu ${praegu})</small>
      ${m ? `<ul>${m}</ul>` : ""}${uus.attributes.taaskaivitus ? "<small>Home Assistant taaskäivitub.</small>" : ""}</div>
      <button class="p" data-uuenda>Uuenda</button></div>`;
  }

  async _uuenda() {
    const h = this._hass;
    const v = h.states["sensor.elektrihind_uusim_versioon"].state;
    const restart = !!h.states["sensor.elektrihind_uusim_versioon"].attributes.taaskaivitus;
    this._uuendab = `Uuendan versioonile ${v}…`;
    this._render();
    try {
      await h.callService("script", "elektrihind_uuenda", { versioon: v });
      // dashboardi ressurss uue versiooninumbriga, et brauser võtaks uue kaardi
      try {
        const res = await h.callWS({ type: "lovelace/resources" });
        const r = res.find((x) => String(x.url).includes("elektrihind-card.js"));
        if (r) await h.callWS({ type: "lovelace/resources/update", resource_id: r.id, res_type: "module",
          url: `/local/elektrihind-card.js?v=${v}` });
      } catch (e) { /* ressursi uuendus pole kriitiline */ }
      this._uuendab = restart ? `Paigaldatud ${v}. Home Assistant taaskäivitub, leht laeb end ise uuesti…`
        : `Paigaldatud ${v}. Laen lehe uuesti…`;
      this._render();
      setTimeout(() => location.reload(), restart ? 90000 : 4000);
    } catch (e) {
      this._uuendab = `Uuendus ebaõnnestus: ${String((e && e.message) || e).replace(/[&<>"]/g, "")}.
        Vaata teavitusi (Notifications). Proovi uuesti, värskendades lehte.`;
      this._render();
    }
  }

  _stiil() {
    return `<style>
      ha-card { padding: 16px; }
      .versioon { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;
        font-size: 13px; color: var(--secondary-text-color); margin: 0 0 12px; padding: 8px 10px; border-radius: 8px;
        background: var(--secondary-background-color, rgba(127,127,127,.1)); }
      .versioon b { color: var(--primary-text-color); }
      .versioon span:last-child { display: flex; gap: 6px; }
      .versioon button { font: inherit; font-size: 12px; cursor: pointer; background: none; color: var(--primary-text-color);
        border: 1px solid var(--divider-color); border-radius: 6px; padding: 5px 10px; }
      .versioon button.p { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); }
      .versioon button:disabled { opacity: .5; }
      .uuendus { display: flex; gap: 12px; align-items: center; justify-content: space-between; margin: -4px 0 12px;
        padding: 10px 12px; border-radius: 10px; font-size: 13px;
        background: var(--secondary-background-color, rgba(127,127,127,.12)); color: var(--primary-text-color); }
      .uuendus ul { margin: 4px 0 0; padding-left: 18px; color: var(--secondary-text-color); }
      .uuendus small { color: var(--secondary-text-color); }
      .uuendus button.p { background: var(--primary-color); color: var(--text-primary-color, #fff);
        border: 0; border-radius: 6px; padding: 7px 14px; cursor: pointer; font: inherit; }
      .tyhi { color: var(--secondary-text-color); padding: 8px 0; }
      .hammas { padding: 0 4px; font-size: 16px; color: var(--secondary-text-color); vertical-align: -1px; }
      .pais { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
      .pealkiri { color: var(--secondary-text-color); font-size: 14px; }
      .hind { font-size: 40px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
      .yhik { font-size: 16px; font-weight: 500; color: var(--secondary-text-color); }
      .vaike { color: var(--secondary-text-color); font-size: 13px; }
      .statid { display: flex; gap: 12px; text-align: center; }
      .statid span { display: block; font-size: 11px; color: var(--secondary-text-color); text-transform: uppercase; }
      .statid b { font-size: 15px; font-variant-numeric: tabular-nums; }
      .nupud { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin: 14px 0 6px; }
      .grupp { display: flex; border: 1px solid var(--divider-color); border-radius: 18px; overflow: hidden; }
      button { background: none; border: 0; color: var(--primary-text-color); padding: 5px 12px;
               font: inherit; font-size: 13px; cursor: pointer; }
      button.on { background: var(--primary-color); color: var(--text-primary-color, #fff); }
      .detail { color: var(--primary-text-color); display: flex; gap: 10px; align-items: baseline; min-height: 20px; font-size: 14px;
                font-variant-numeric: tabular-nums; margin-bottom: 4px; }
      .graafik { display: flex; height: 170px; }
      .telg { position: relative; width: 30px; flex: none; }
      .telg span { position: absolute; right: 6px; transform: translateY(-50%); font-size: 10px;
                   color: var(--secondary-text-color); }
      .ala { position: relative; flex: 1; touch-action: pan-y; cursor: crosshair; }
      .joon { position: absolute; left: 0; right: 0; border-top: 1px solid var(--divider-color); opacity: .6; }
      .joon.null { opacity: 1; border-top-color: var(--secondary-text-color); }
      .tulp { position: absolute; box-sizing: border-box; padding: 0 0.5px; }
      .tulp::before { content: ""; position: absolute; inset: 0 12%; background: var(--v); border-radius: 2px 2px 0 0; }
      .tulp.moodas::before { opacity: .35; }
      .tulp.aktiivne::before { inset: 0 0; box-shadow: 0 0 0 1.5px var(--primary-text-color); opacity: 1; }
      .tulp.valitud::before { inset: 0 0; box-shadow: 0 0 0 1.5px var(--secondary-text-color); opacity: 1; }
      .nyyd { position: absolute; top: 0; bottom: 0; border-left: 1px dashed var(--secondary-text-color); }
      .xtelg { position: relative; height: 16px; margin-left: 30px; }
      .xtelg span { position: absolute; font-size: 10px; color: var(--secondary-text-color); transform: translateX(-2px); }
    </style>`;
  }
}

customElements.define("elektrihind-card", ElektrihindCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "elektrihind-card",
  name: "Elektrihind",
  description: "Elektri lõpphind ja päeva tulpdiagramm (Nord Pool + tasud)",
});
console.info(`%c ELEKTRIHIND-CARD %c ${EH_VERSION} `, "background:#00a0e0;color:#fff", "");

/* =====================================================================
 *  Elektrihind – seadmed: seadmete juhtimine hinna järgi
 *    type: custom:elektrihind-seadmed-card
 *  Reeglid salvestatakse olemisse sensor.elektrihind_reeglid,
 *  plaani arvutab sensor.elektrihind_juhtimine ja lülitab automatiseerimine
 *  "Elektrihind: seadmete juhtimine".
 * ===================================================================== */
const EH_DOMEENID = ["switch", "light", "input_boolean", "fan", "water_heater", "climate", "humidifier"];

class ElektrihindSeadmedCard extends HTMLElement {
  setConfig(config) {
    this._config = { title: "Seadmed hinna järgi", ...config };
    this._muuda = null;   // muudetava reegli koopia
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    this._hass = hass;
    const j = hass.states["sensor.elektrihind_juhtimine"];
    const plaan = (j && j.attributes.plaan) || [];
    const kasud = hass.states["sensor.elektrihind_kasud"];
    const key = [(j && j.last_updated) || "", (kasud && kasud.last_updated) || "",
      ...plaan.map((p) => (hass.states[p.entity] || {}).last_changed)].join("|");
    if (key !== this._key) {
      this._key = key;
      if (!this._muuda) this._render();
    }
  }

  getCardSize() { return 4; }

  // 24h kellaaja valik: tund 00–23 ja minutid 00/15/30/45 (brauseri keelest sõltumata)
  _kellValik(attrs, h) {
    const m = Math.round((+h || 0) * 60) % 1440;
    const hh = Math.floor(m / 60), mm = m % 60;
    const tunnid = Array.from({ length: 24 }, (_, i) =>
      `<option value="${i}" ${i === hh ? "selected" : ""}>${String(i).padStart(2, "0")}</option>`).join("");
    const minutid = [0, 15, 30, 45].map((x) =>
      `<option value="${x}" ${x === mm ? "selected" : ""}>${String(x).padStart(2, "0")}</option>`).join("");
    return `<span class="kell2" ${attrs}><select data-osa="h" aria-label="tund">${tunnid}</select>:<select
      data-osa="m" aria-label="minutid">${minutid}</select></span>`;
  }

  // kellaaja väärtus "HH:MM" nii valikust (kell2) kui tavalisest väljast
  _kellVaartus(el) {
    if (el.classList && el.classList.contains("kell2")) {
      const h = el.querySelector('[data-osa="h"]').value, m = el.querySelector('[data-osa="m"]').value;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    return el.value;
  }

  // 16.25 -> "16:15", 24 -> "00:00"
  _hStr(h) {
    const m = Math.round((+h || 0) * 60) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }

  // "16:15" -> 16.25; lõpuaeg "00:00" -> 24
  _strH(t, lopp) {
    const [hh, mm] = String(t || "00:00").split(":").map((x) => parseInt(x, 10) || 0);
    const h = hh + mm / 60;
    return lopp && h === 0 ? 24 : h;
  }

  _aknad(r) {
    if (Array.isArray(r.aknad) && r.aknad.length) return r.aknad;
    return [{ al: r.al ?? 0, kuni: r.kuni ?? 24, tunde: r.tunde ?? 4 }];
  }

  _lubatud(aknad, minut) {
    return aknad.some((w) => {
      const al = Math.round(w.al * 60), kuni = Math.round(w.kuni * 60);
      return al < kuni ? minut >= al && minut < kuni : minut >= al || minut < kuni;
    });
  }

  _terve(r) {
    return r.aknad.length === 1 && +r.aknad[0].al === 0 && +r.aknad[0].kuni === 24;
  }

  _terveO(r) {
    const a = (r.odav && r.odav.aknad) || [];
    return a.length === 1 && +a[0].al === 0 && +a[0].kuni === 24;
  }

  _jaotus(r) {
    return r.jaotus || (r.jarjest === false ? "hajus" : "plokk");
  }

  _tundeTekst(x) {
    const v = +x;
    return Number.isInteger(v) ? `${v} h` : `${v.toFixed(2).replace(/0$/, "")} h`;
  }
  static getStubConfig() { return {}; }

  _reeglid() {
    const j = this._hass.states["sensor.elektrihind_juhtimine"];
    return JSON.parse(JSON.stringify((j && j.attributes.reeglid) || []));
  }

  _esc(x) {
    return String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  _nimi(entity) {
    const s = this._hass.states[entity];
    return (s && s.attributes.friendly_name) || entity;
  }

  _varv(hind, piirid, varvid) {
    let i = 0;
    while (i < piirid.length && hind >= piirid[i]) i++;
    return varvid[Math.min(i, varvid.length - 1)];
  }

  // Ajariba: iga veerandtund, sees-ajad hinnavärviga
  _riba(p, read, piirid, varvid, nyyd, aknad) {
    const sees = new Set(p.ts);
    const paevad = [...new Set(read.map((r) => r.algus.slice(0, 10)))];
    return paevad.map((d) => {
      const rr = read.filter((r) => r.algus.slice(0, 10) === d);
      const tana = rr.some((r) => r.ts <= nyyd && nyyd < r.ts + 900);
      const tunde = rr.filter((r) => sees.has(r.ts)).length / 4;
      const tykid = rr.map((r) => {
        const on = sees.has(r.ts);
        const st = on ? `background:${this._varv(r.hind, piirid, varvid)}` : "";
        const k = (r.ts <= nyyd && nyyd < r.ts + 900) ? " nyyd" : (r.ts + 900 <= nyyd ? " moodas" : "");
        const minut = parseInt(r.algus.slice(11, 13), 10) * 60 + parseInt(r.algus.slice(14, 16), 10);
        const lub = this._lubatud(aknad, minut);
        return `<i class="${on ? "on" : ""}${k}${lub ? "" : " keelatud"}" style="${st}"></i>`;
      }).join("");
      return `<div class="paevrida"><span class="psilt">${tana ? "Täna" : (paevad.indexOf(d) > 0 && read.some((r) => r.algus.slice(0, 10) === paevad[paevad.indexOf(d) - 1] && r.ts <= nyyd && nyyd < r.ts + 900)) ? "Homme" : d.slice(8, 10) + "." + d.slice(5, 7)}</span>
        <div class="riba">${tykid}</div><span class="psilt h">${tunde % 1 ? tunde.toFixed(2) : tunde} h</span></div>`;
    }).join("") + `<div class="kellad"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>`;
  }

  _render() {
    if (!this._hass || !this.shadowRoot) return;
    const root = this.shadowRoot;
    const j = this._hass.states["sensor.elektrihind_juhtimine"];
    const t = this._hass.states["sensor.elektrihind_tabel"];
    if (!j || !t) {
      root.innerHTML = `${this._stiil()}<ha-card><div class="sisu">Olemid sensor.elektrihind_juhtimine /
        sensor.elektrihind_tabel puuduvad – kontrolli paketti elektrihind.yaml.</div></ha-card>`;
      return;
    }
    const reeglid = j.attributes.reeglid || [];
    const plaan = j.attributes.plaan || [];
    const read = t.attributes.hinnad || [];
    const piirid = t.attributes.piirid || [10, 15, 20, 25, 30, 35];
    const varvid = t.attributes.varvid || ["#00FFFF", "#0078FF", "#B400B4", "#00FF00", "#FFFF00", "#FF8000", "#FF0000"];
    const nyyd = Date.now() / 1000;

    const kirjed = reeglid.map((r, i) => {
      const p0 = plaan.find((x) => x.id === r.id) || { ts: [] };
      const p = { ...p0, nyyd: p0.ts.some((t) => t <= nyyd && nyyd < t + 900) };
      const st = this._hass.states[r.entity];
      const olek = st ? st.state : "puudub";
      const ule = r.ule && r.ule.kuni > nyyd ? r.ule : null;
      const hindOlemas = read.some((x) => x.ts <= nyyd && nyyd < x.ts + 900);
      const peaks = p.nyyd ? "sees" : "väljas";
      const kell = (ts) => { const d = new Date(ts * 1000);
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
      // ise lülitatud (HA-s või seadme nupust)? – sama loogika mis automatiseerimises
      const kaskAll = ((this._hass.states["sensor.elektrihind_kasud"] || {}).attributes || {}).kasud || {};
      const kask = kaskAll[r.entity];
      const kh = r.kasitsi_h ?? 2;
      const seesNyyd = st && !["off", "unavailable", "unknown"].includes(st.state);
      const lc = st ? new Date(st.last_changed).getTime() / 1000 : 0;
      const ise = !ule && kh > 0 && kask && st && !["unavailable", "unknown"].includes(st.state)
        && seesNyyd !== kask.sees && seesNyyd !== p.nyyd && nyyd - lc < kh * 3600;
      const tahis = !r.on ? ["", "peatatud"]
        : ule ? [ule.tyyp === "sees" ? "jah" : "paus", `käsitsi ${ule.tyyp === "sees" ? "sees" : "väljas"} kuni ${kell(ule.kuni)}`]
        : ise ? ["paus", `ise ${seesNyyd ? "sisse" : "välja"} lülitatud – automaatika ootab kuni ${kell(lc + kh * 3600)}`]
        : !hindOlemas ? ["paus", "hinnad puuduvad – varuplaan"]
        : [p.nyyd ? "jah" : "", "praegu " + peaks];
      const aknad = this._aknad(r);
      const aeg = (w) => (w.al === 0 && w.kuni === 24) ? "ööpäevas" : `${this._hStr(w.al)}–${this._hStr(w.kuni)}`;
      const kirjeldus = r.viis === "piir"
        ? `sees, kui hind ≤ ${r.piir} s/kWh` + (r.mintunde ? `, vähemalt ${this._tundeTekst(r.mintunde)}` : "") +
          (aknad.length === 1 && aknad[0].al === 0 && aknad[0].kuni === 24 ? "" : ` · ainult ${aknad.map(aeg).join(", ")}`)
        : `odavaim ${({ plokk: "järjestikune aeg", hajus: "aeg (hajutatult)",
            eelista: `aeg, järjest kui vahe ≤ ${r.vahe} s/kWh` +
              ((+r.minplokk || 1) > 1 ? `, tükid vähemalt ${this._tundeTekst((+r.minplokk) / 4).replace(" h", "")} h` : "") })[this._jaotus(r)]}: ` +
          aknad.map((w) => `${this._tundeTekst(w.tunde)} ${aeg(w)}` +
            (typeof w.maks === "number" ? ` (max ${w.maks})` : "")).join(", ") +
          (typeof r.maks === "number" ? ` · mitte üle ${r.maks} s/kWh` : "") +
          (r.odav && r.odav.on ? ` · alati sees ≤ ${r.odav.piir} s/kWh` +
            ((r.odav.aknad || []).length && !(r.odav.aknad.length === 1 && r.odav.aknad[0].al === 0 && r.odav.aknad[0].kuni === 24)
              ? ` (${r.odav.aknad.map(aeg).join(", ")})` : "") : "");
      return `<div class="kirje ${r.on ? "" : "off"}">
        <div class="ylem">
          <div class="nimed"><b>${this._esc(r.nimi || this._nimi(r.entity))}</b>
            <small>${this._esc(this._nimi(r.entity))} · ${this._esc(olek)}</small></div>
          <span class="tahis ${tahis[0]}">${tahis[1]}</span>
        </div>
        <div class="kirjeldus">${kirjeldus}</div>
        ${this._riba(p, read, piirid, varvid, nyyd, aknad)}
        <div class="nupurida">
          <label class="lyliti"><input type="checkbox" data-aktiivne="${i}" ${r.on ? "checked" : ""}> Automaatne</label>
          <span class="tyhik"></span>
          ${r.on ? (ule || ise
            ? `<button data-ule="${i}" data-tyyp="">${ise ? "Jätka automaatikat" : "Tühista käsitsi"}</button>`
            : `<button data-menyy="${i}" class="${this._menyy === i ? "on" : ""}">Käsitsi ▾</button>`) : ""}
          <button data-muuda="${i}">Muuda</button>
        </div>
        ${this._menyy === i && r.on && !ule && !ise ? `<div class="menyy">
          <div><span>Sees</span>${[[0.5, "30 min"], [1, "1 h"], [2, "2 h"], [3, "3 h"]].map(([h, t]) =>
            `<button data-ule="${i}" data-tyyp="sees" data-h="${h}">${t}</button>`).join("")}</div>
          <div><span>Väljas</span>${[[1, "1 h"], [3, "3 h"], [6, "6 h"], ["oo", "kuni keskööni"], ["homme", "kuni homme õhtuni"]].map(([h, t]) =>
            `<button data-ule="${i}" data-tyyp="paus" data-h="${h}">${t}</button>`).join("")}</div>
        </div>` : ""}
      </div>`;
    }).join("");

    root.innerHTML = `${this._stiil()}
    <ha-card>
      <div class="sisu">
        <div class="pais"><span class="pealkiri">${this._esc(this._config.title)}</span>
          <button class="p" data-lisa>+ Lisa seade</button></div>
        ${kirjed || `<div class="tyhi">Seadmeid pole veel lisatud. Vajuta „+ Lisa seade“.</div>`}
        ${this._teade ? `<div class="teade viga">${this._esc(this._teade)}</div>` : ""}
      </div>
    </ha-card>`;

    root.querySelector("[data-lisa]").addEventListener("click", () => {
      this._muuda = { idx: -1, r: { id: Math.random().toString(36).slice(2, 10), nimi: "", entity: "",
        on: true, viis: "odavad", jaotus: "eelista", vahe: 1, minplokk: 4, piir: 15, maks: "", mintunde: 0, kasitsi_h: 2,
        odav: { on: false, piir: 5, aknad: [{ al: 0, kuni: 24 }] },
        varu: "oo", varuaknad: [{ al: 22, kuni: 7 }], aknad: [{ al: 0, kuni: 24, tunde: 2 }] } };
      this._renderVorm();
    });
    root.querySelectorAll("[data-muuda]").forEach((b) => b.addEventListener("click", () => {
      const i = +b.dataset.muuda;
      const vana = this._reeglid()[i];
      this._muuda = { idx: i, r: { piir: 15, vahe: 1, minplokk: 1, mintunde: 0, varu: "oo", kasitsi_h: 2, ...vana,
        maks: vana.maks ?? "", jaotus: this._jaotus(vana),
        odav: JSON.parse(JSON.stringify({ on: false, piir: 5, ...(vana.odav || {}),
          aknad: (vana.odav && vana.odav.aknad && vana.odav.aknad.length) ? vana.odav.aknad : [{ al: 0, kuni: 24 }] })),
        varuaknad: JSON.parse(JSON.stringify(vana.varuaknad && vana.varuaknad.length ? vana.varuaknad : [{ al: 22, kuni: 7 }])),
        aknad: JSON.parse(JSON.stringify(this._aknad(vana))) } };
      this._renderVorm();
    }));
    root.querySelectorAll("[data-menyy]").forEach((b) => b.addEventListener("click", () => {
      const i = +b.dataset.menyy;
      this._menyy = this._menyy === i ? null : i;
      this._render();
    }));
    root.querySelectorAll("[data-ule]").forEach((b) => b.addEventListener("click", async () => {
      const rr = this._reeglid();
      const i = +b.dataset.ule;
      const r = rr[i];
      const t = b.dataset.tyyp, h = b.dataset.h;
      const nyydS = Math.floor(Date.now() / 1000);
      this._menyy = null;
      if (!t) {
        delete r.ule;
        // "Jätka automaatikat" pärast ise lülitamist: jäta praegune olek meelde, siis automaatika võtab üle
        const st = this._hass.states[r.entity];
        if (st) {
          try {
            await this._hass.callWS({ type: "fire_event", event_type: "elektrihind_kask",
              event_data: { entity: r.entity, sees: !["off", "unavailable", "unknown"].includes(st.state) } });
          } catch (e) { /* salvestamine annab vea allpool */ }
        }
      } else if (h === "oo" || h === "homme") {
        const d = new Date();
        if (h === "oo") d.setHours(24, 0, 0, 0); else { d.setDate(d.getDate() + 1); d.setHours(21, 0, 0, 0); }
        r.ule = { tyyp: t, kuni: Math.floor(d.getTime() / 1000) };
      } else {
        r.ule = { tyyp: t, kuni: nyydS + Math.round(parseFloat(h) * 3600) };
      }
      this._salvesta(rr);
    }));
    root.querySelectorAll("[data-aktiivne]").forEach((el) => el.addEventListener("change", () => {
      const rr = this._reeglid();
      rr[+el.dataset.aktiivne].on = el.checked;
      this._salvesta(rr);
    }));
  }

  _renderVorm() {
    const root = this.shadowRoot;
    const m = this._muuda;
    const r = m.r;
    const olemid = Object.keys(this._hass.states)
      .filter((e) => EH_DOMEENID.includes(e.split(".")[0]))
      .sort((a, b) => this._nimi(a).localeCompare(this._nimi(b), "et"));

    root.innerHTML = `${this._stiil()}
    <ha-card><div class="sisu">
      <div class="pais"><span class="pealkiri">${m.idx < 0 ? "Uus seade" : "Muuda seadet"}</span>
        <button data-tyhista aria-label="Sulge">✕</button></div>

      <label class="vali">Seade
        <select data-v="entity">
          <option value="">— vali seade —</option>
          ${olemid.map((e) => `<option value="${e}" ${e === r.entity ? "selected" : ""}>
            ${this._esc(this._nimi(e))} (${e})</option>`).join("")}
        </select></label>

      <label class="vali">Nimi kaardil <small>(valikuline)</small>
        <input type="text" data-v="nimi" maxlength="30" value="${this._esc(r.nimi)}"
          placeholder="${this._esc(r.entity ? this._nimi(r.entity) : "nt Boiler")}"></label>

      <div class="vali">Kuidas juhtida
        <label class="valik"><input type="radio" name="viis" value="odavad" ${r.viis !== "piir" ? "checked" : ""}>
          <span><b>Odavaim aeg</b><br><small>Igas vahemikus valitakse valitud tundide jagu kõige odavamat
          aega, veerandtunni täpsusega (nt 16:15–17:15). Sobib boilerile.</small></span></label>
        <div class="alam ${r.viis !== "piir" ? "" : "peidus"}">
          <label class="valik"><input type="radio" name="jaotus" value="plokk" ${r.jaotus === "plokk" ? "checked" : ""}>
            <span>Alati järjestikuse plokina <small>(kõige vähem lülitusi)</small></span></label>
          <label class="valik"><input type="radio" name="jaotus" value="eelista" ${r.jaotus === "eelista" ? "checked" : ""}>
            <span>Eelista järjestikust <small>– plokina, kui see on hajutatust kallim
            kõige rohkem</small></span></label>
          <div class="alam ${r.jaotus === "eelista" ? "" : "peidus"}">
            <div><input type="text" inputmode="decimal" data-v="vahe" value="${r.vahe}"> s/kWh
              <small>(keskmise hinna vahe)</small></div>
            <div class="mp">Muidu tükkidena, iga tükk vähemalt
              <input type="number" min="1" max="16" step="1" data-v="minplokk" value="${r.minplokk}"> veerandtundi
              <small>(${this._tundeTekst((+r.minplokk || 1) / 4)} · 1 = suvalised veerandtunnid)</small></div>
          </div>
          <label class="valik"><input type="radio" name="jaotus" value="hajus" ${r.jaotus === "hajus" ? "checked" : ""}>
            <span>Hajutatult <small>(alati kõige odavamad veerandtunnid, võivad olla eraldi)</small></span></label>
          <div class="mp">Maksimumhind: ≤ <input type="text" inputmode="decimal" data-v="maks" value="${r.maks}"
            placeholder="pole"> s/kWh <small>(kallimaid veerandtunde ei kasutata; tühi = piiranguta)</small></div>
          <div class="odav">
            <label class="lyliti"><input type="checkbox" data-odav-on ${r.odav.on ? "checked" : ""}>
              <span>Lisaks alati sees, kui lõpphind on kuni
              <input type="text" inputmode="decimal" data-odav-piir value="${r.odav.piir}"> s/kWh</span></label>
            ${r.odav.on ? `<div class="odavaknad">
              <label class="lyliti"><input type="checkbox" data-odav-terve ${this._terveO(r) ? "checked" : ""}> kogu ööpäev</label>
              ${this._terveO(r) ? "" : `${r.odav.aknad.map((w, i) => `<div class="kellarida">
                ${this._kellValik(`data-odav-aken="${i}" data-k="al"`, w.al)} –
                ${this._kellValik(`data-odav-aken="${i}" data-k="kuni"`, w.kuni)}
                ${r.odav.aknad.length > 1 ? `<button class="d" data-odav-eemalda="${i}" aria-label="Eemalda vahemik">✕</button>` : ""}
              </div>`).join("")}
              <div class="kiir"><button data-odav-lisa>+ Lisa vahemik</button></div>`}
              <small>Neil aegadel on seade sees iga veerandtund, mil hind on piirist madalam või võrdne –
                lisaks ülal valitud odavaimale ajale.</small></div>` : ""}
          </div>
        </div>
        <label class="valik"><input type="radio" name="viis" value="piir" ${r.viis === "piir" ? "checked" : ""}>
          <span><b>Hinnapiir</b><br><small>Seade on sees alati, kui lõpphind on piirist madalam või võrdne.</small></span></label>
        <div class="alam ${r.viis === "piir" ? "" : "peidus"}">
          ≤ <input type="text" inputmode="decimal" data-v="piir" value="${r.piir}"> s/kWh
          <div class="mp">Aga vähemalt <input type="number" class="tundi" min="0" max="24" step="0.25" data-v="mintunde"
            value="${r.mintunde}"> tundi <small>${this._terve(r) ? "ööpäevas" : "igas vahemikus"} (kui piirist
            allapoole jääb vähem, võetakse odavaimad; 0 = ei)</small></div></div>
      </div>

      ${r.viis === "piir" ? `<label class="lyliti terve"><input type="checkbox" data-terve ${this._terve(r) ? "checked" : ""}>
        Kogu ööpäev (24 h)</label>` : ""}
      <div class="vali vahemikud ${r.viis === "piir" && this._terve(r) ? "peidus" : ""}"><b class="vpealk">${r.viis === "piir"
          ? "Kellaaja vahemikud, kus hinnapiir kehtib"
          : "Kellaaja vahemikud ja tööaeg igas vahemikus"}</b>
        ${r.viis !== "piir" ? `<div class="veerud"><span>algus</span><span>lõpp</span><span>töötab (tundi)</span><span>max s/kWh</span></div>` : ""}
        ${r.aknad.map((w, i) => `<div class="kellarida">
          ${this._kellValik(`data-aken="${i}" data-k="al"`, w.al)} –
          ${this._kellValik(`data-aken="${i}" data-k="kuni"`, w.kuni)}
          ${r.viis !== "piir" ? `<input type="number" class="tundi" min="0.25" max="24" step="0.25" data-aken="${i}" data-k="tunde"
            value="${w.tunde}" title="Töötab (tundi)">
            <input type="text" inputmode="decimal" class="tundi" data-aken="${i}" data-k="maks"
              value="${w.maks ?? ""}" placeholder="–" title="Vahemiku maksimumhind (tühi = piiranguta)">` : ""}
          ${r.aknad.length > 1 ? `<button class="d" data-eemalda="${i}" aria-label="Eemalda vahemik">✕</button>` : ""}
        </div>`).join("")}
        <div class="kiir"><button data-lisaaken>+ Lisa vahemik</button></div>
        <small>${r.viis === "piir"
          ? "Väljaspool neid vahemikke on seade väljas. Terve ööpäev on 00:00–00:00."
          : "Igas vahemikus valitakse eraldi nii mitu tundi kõige odavamat aega (nt 1,5 h). Terve ööpäev on 00:00–00:00. Kui algus on hilisem kui lõpp (nt 22:00–07:00), käib vahemik üle kesköö ja valik tehakse iga öö kohta."}</small>
      </div>

      <div class="vali">Kui lülitan seadet ise (Home Assistantis või seadme nupust)
        <div class="kellarida">automaatika ei puuduta seda
          <input type="number" class="tundi" min="0" max="48" step="0.5" data-v="kasitsi_h" value="${r.kasitsi_h}"> tundi</div>
        <small>0 = automaatika lülitab minuti jooksul tagasi plaani järgi.</small>
      </div>

      <label class="vali">Kui hinnad puuduvad (andmed ei uuenenud)
        <select data-v="varu">
          <option value="oo" ${r.varu === "oo" ? "selected" : ""}>Sees öötariifi ajal (22–07 ja nädalavahetusel)</option>
          <option value="aeg" ${r.varu === "aeg" ? "selected" : ""}>Sees valitud kellaaegadel</option>
          <option value="sees" ${r.varu === "sees" ? "selected" : ""}>Alati sees</option>
          <option value="valjas" ${r.varu === "valjas" ? "selected" : ""}>Väljas</option>
        </select></label>
      ${r.varu === "aeg" ? `<div class="vali varuaknad">
        ${r.varuaknad.map((w, i) => `<div class="kellarida">
          ${this._kellValik(`data-varu="${i}" data-k="al"`, w.al)} –
          ${this._kellValik(`data-varu="${i}" data-k="kuni"`, w.kuni)}
          ${r.varuaknad.length > 1 ? `<button class="d" data-varueemalda="${i}" aria-label="Eemalda vahemik">✕</button>` : ""}
        </div>`).join("")}
        <div class="kiir"><button data-varulisa>+ Lisa vahemik</button></div>
        <small>Kehtib ainult siis, kui hinnad puuduvad. Üle kesköö: nt 22:00–07:00. Terve ööpäev: 00:00–00:00.</small>
      </div>` : ""}

      <label class="lyliti"><input type="checkbox" data-v="on" ${r.on ? "checked" : ""}> Automaatne juhtimine sees</label>

      <div class="teade viga">${this._esc(this._vormiViga || "")}</div>
      <div class="nupurida">
        <button class="p" data-salvesta>Salvesta</button>
        <button data-tyhista>Tühista</button>
        <span class="tyhik"></span>
        ${m.idx >= 0 ? `<button class="d" data-kustuta>${this._kinnita ? "Kindel? Kustuta" : "Kustuta"}</button>` : ""}
      </div>
    </div></ha-card>`;

    root.querySelectorAll("[data-v]").forEach((el) => {
      const f = () => { r[el.dataset.v] = el.type === "checkbox" ? el.checked : el.value; };
      el.addEventListener("input", f);
      el.addEventListener("change", () => { f(); if (["minplokk", "varu"].includes(el.dataset.v)) this._renderVorm(); });
    });
    root.querySelectorAll("[data-aken]").forEach((el) => {
      const f = () => {
        const w = r.aknad[+el.dataset.aken];
        if (el.dataset.k === "tunde") w.tunde = el.value;
        else if (el.dataset.k === "maks") w.maks = el.value;
        else w[el.dataset.k] = this._strH(this._kellVaartus(el), el.dataset.k === "kuni");
      };
      el.addEventListener("input", f);
      el.addEventListener("change", f);
    });
    root.querySelectorAll("[data-varu]").forEach((el) => {
      const f = () => { r.varuaknad[+el.dataset.varu][el.dataset.k] = this._strH(this._kellVaartus(el), el.dataset.k === "kuni"); };
      el.addEventListener("input", f);
      el.addEventListener("change", f);
    });
    root.querySelectorAll("[data-varueemalda]").forEach((b) => b.addEventListener("click", () => {
      r.varuaknad.splice(+b.dataset.varueemalda, 1);
      this._renderVorm();
    }));
    // ---- "alati sees, kui hind <= X" ----
    const odavOn = root.querySelector("[data-odav-on]");
    if (odavOn) odavOn.addEventListener("change", () => { r.odav.on = odavOn.checked; this._renderVorm(); });
    const odavPiir = root.querySelector("[data-odav-piir]");
    if (odavPiir) odavPiir.addEventListener("input", () => { r.odav.piir = odavPiir.value; });
    const odavTerve = root.querySelector("[data-odav-terve]");
    if (odavTerve) odavTerve.addEventListener("change", () => {
      r.odav.aknad = odavTerve.checked ? [{ al: 0, kuni: 24 }] : [{ al: 6, kuni: 22 }];
      this._renderVorm();
    });
    root.querySelectorAll("[data-odav-aken]").forEach((el) => {
      const f = () => { r.odav.aknad[+el.dataset.odavAken][el.dataset.k] = this._strH(this._kellVaartus(el), el.dataset.k === "kuni"); };
      el.addEventListener("input", f);
      el.addEventListener("change", f);
    });
    root.querySelectorAll("[data-odav-eemalda]").forEach((b) => b.addEventListener("click", () => {
      r.odav.aknad.splice(+b.dataset.odavEemalda, 1);
      this._renderVorm();
    }));
    const odavLisa = root.querySelector("[data-odav-lisa]");
    if (odavLisa) odavLisa.addEventListener("click", () => { r.odav.aknad.push({ al: 6, kuni: 22 }); this._renderVorm(); });

    const varulisa = root.querySelector("[data-varulisa]");
    if (varulisa) varulisa.addEventListener("click", () => {
      r.varuaknad.push({ al: 13, kuni: 15 });
      this._renderVorm();
    });
    root.querySelectorAll("[data-eemalda]").forEach((b) => b.addEventListener("click", () => {
      r.aknad.splice(+b.dataset.eemalda, 1);
      this._renderVorm();
    }));
    const terve = root.querySelector("[data-terve]");
    if (terve) terve.addEventListener("change", () => {
      r.aknad = terve.checked ? [{ al: 0, kuni: 24 }] : [{ al: 6, kuni: 22 }];
      this._renderVorm();
    });
    const lisa = root.querySelector("[data-lisaaken]");
    if (lisa) lisa.addEventListener("click", () => {
      r.aknad.push({ al: 16, kuni: 21, tunde: 1 });
      this._renderVorm();
    });
    root.querySelectorAll('input[name="jaotus"]').forEach((el) => el.addEventListener("change", () => {
      r.jaotus = el.value;
      this._renderVorm();
    }));
    root.querySelectorAll('input[name="viis"]').forEach((el) => el.addEventListener("change", () => {
      r.viis = el.value;
      this._renderVorm();
    }));
    const sulge = () => { this._muuda = null; this._vormiViga = null; this._kinnita = false; this._render(); };
    root.querySelectorAll("[data-tyhista]").forEach((b) => b.addEventListener("click", sulge));
    const k = root.querySelector("[data-kustuta]");
    if (k) k.addEventListener("click", () => {
      if (!this._kinnita) { this._kinnita = true; this._renderVorm(); return; }
      const rr = this._reeglid();
      rr.splice(m.idx, 1);
      this._kinnita = false;
      this._salvesta(rr, true);
    });
    root.querySelector("[data-salvesta]").addEventListener("click", () => {
      const viga = this._kontrolli(r);
      if (viga) { this._vormiViga = viga; this._renderVorm(); return; }
      const puhas = { id: r.id, nimi: String(r.nimi || "").trim(), entity: r.entity, on: !!r.on, viis: r.viis,
        varu: r.varu || "oo", ...(r.ule ? { ule: r.ule } : {}),
        kasitsi_h: parseFloat(String(r.kasitsi_h ?? 2).replace(",", ".")),
        ...(r.varu === "aeg" ? { varuaknad: r.varuaknad.map((w) => ({ al: +w.al, kuni: +w.kuni })) } : {}),
        aknad: r.aknad.map((w) => ({ al: +w.al, kuni: +w.kuni,
          ...(r.viis === "piir" ? {} : { tunde: parseFloat(String(w.tunde).replace(",", ".")) }),
          ...(r.viis !== "piir" && String(w.maks ?? "").trim() !== ""
            ? { maks: parseFloat(String(w.maks).replace(",", ".")) } : {}) })) };
      if (r.viis === "piir") {
        puhas.piir = parseFloat(String(r.piir).replace(",", "."));
        const mt = parseFloat(String(r.mintunde || 0).replace(",", "."));
        if (mt > 0) puhas.mintunde = mt;
      } else {
        puhas.jaotus = r.jaotus;
        const mx = String(r.maks ?? "").trim();
        if (mx !== "") puhas.maks = parseFloat(mx.replace(",", "."));
        puhas.odav = { on: !!r.odav.on, piir: parseFloat(String(r.odav.piir).replace(",", ".")),
          aknad: r.odav.aknad.map((w) => ({ al: +w.al, kuni: +w.kuni })) };
        if (r.jaotus === "eelista") {
          puhas.vahe = parseFloat(String(r.vahe).replace(",", "."));
          puhas.minplokk = parseInt(r.minplokk, 10);
        }
      }
      const rr = this._reeglid();
      if (m.idx < 0) rr.push(puhas); else rr[m.idx] = puhas;
      this._salvesta(rr, true);
    });
  }

  _kontrolli(r) {
    if (!r.entity) return "Vali seade";
    if (r.viis !== "piir" && r.odav && r.odav.on) {
      const v = parseFloat(String(r.odav.piir).replace(",", "."));
      if (isNaN(v) || v < -100 || v > 500) return "„Alati sees“ hinnapiir peab olema arv (s/kWh)";
      if (!r.odav.aknad.length) return "„Alati sees“ vajab vähemalt üht kellaaja vahemikku";
      for (const w of r.odav.aknad) if (+w.al === +w.kuni && !(+w.al === 0 && +w.kuni === 24))
        return "„Alati sees“ vahemiku algus ja lõpp ei tohi olla samad";
    }
    if (r.viis !== "piir" && String(r.maks ?? "").trim() !== "") {
      const v = parseFloat(String(r.maks).replace(",", "."));
      if (isNaN(v) || v < -100 || v > 500) return "Maksimumhind peab olema arv (s/kWh) või tühi";
    }
    if (r.viis === "piir") {
      const v = parseFloat(String(r.mintunde || 0).replace(",", "."));
      if (isNaN(v) || v < 0 || v > 24 || (v * 4) % 1) return "„Vähemalt tundi“ peab olema 0 kuni 24 (veerandtunni sammuga)";
    }
    if (!r.aknad.length) return "Lisa vähemalt üks kellaaja vahemik";
    {
      const v = parseFloat(String(r.kasitsi_h ?? 2).replace(",", "."));
      if (isNaN(v) || v < 0 || v > 48) return "Ise lülitamise ooteaeg peab olema 0 kuni 48 tundi";
    }
    if (r.varu === "aeg") {
      if (!r.varuaknad.length) return "Varuplaanil peab olema vähemalt üks kellaaja vahemik";
      for (const w of r.varuaknad) {
        if (+w.al === +w.kuni) return "Varuplaani vahemiku algus ja lõpp ei tohi olla samad (terve ööpäev on 00:00–00:00)";
      }
    }
    for (const w of r.aknad) {
      const al = +w.al, kuni = +w.kuni;
      if (isNaN(al) || isNaN(kuni) || al < 0 || al >= 24 || kuni <= 0 || kuni > 24 || al === kuni)
        return "Vigane kellaaja vahemik (algus ja lõpp ei tohi olla samad, terve ööpäev on 00:00–00:00)";
      if ((al * 4) % 1 || (kuni * 4) % 1) return "Kellaajad peavad olema veerandtunni täpsusega (:00, :15, :30, :45)";
      if (r.viis !== "piir") {
        const n = parseFloat(String(w.tunde).replace(",", "."));
        if (isNaN(n) || n <= 0 || n > 24 || (n * 4) % 1) return "Tundide arv peab olema 0,25 kuni 24 (veerandtunni sammuga)";
        if (String(w.maks ?? "").trim() !== "") {
          const mx = parseFloat(String(w.maks).replace(",", "."));
          if (isNaN(mx) || mx < -100 || mx > 500) return "Vahemiku maksimumhind peab olema arv (s/kWh) või tühi";
        }
      }
    }
    if (r.viis !== "piir" && r.jaotus === "eelista") {
      const v = parseFloat(String(r.vahe).replace(",", "."));
      if (isNaN(v) || v < 0 || v > 100) return "Lubatud hinnavahe peab olema arv 0 või rohkem (s/kWh)";
      const mp = parseInt(r.minplokk, 10);
      if (isNaN(mp) || mp < 1 || mp > 16) return "Lühim tükk peab olema 1 kuni 16 veerandtundi";
    }
    if (r.viis === "piir") {
      const v = parseFloat(String(r.piir).replace(",", "."));
      if (isNaN(v) || v < -100 || v > 500) return "Hinnapiir peab olema arv (s/kWh)";
    }
    return null;
  }

  async _salvesta(reeglid, sulgeVorm) {
    try {
      await this._hass.callWS({ type: "fire_event", event_type: "elektrihind_reeglid", event_data: { reeglid } });
      this._teade = null;
      if (sulgeVorm) { this._muuda = null; this._vormiViga = null; }
      this._render();
    } catch (e) {
      const t = e && e.code === "unauthorized"
        ? "Salvestamiseks on vaja administraatori kontot"
        : `Salvestamine ebaõnnestus: ${(e && e.message) || e}`;
      if (this._muuda) { this._vormiViga = t; this._renderVorm(); } else { this._teade = t; this._render(); }
    }
  }

  _stiil() {
    return `<style>
      .sisu { padding: 16px; color: var(--primary-text-color); }
      .pais { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .pealkiri { font-size: 16px; font-weight: 500; }
      .tyhi { color: var(--secondary-text-color); padding: 8px 0; }
      .kirje { border: 1px solid var(--divider-color); border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; }
      .kirje.off { opacity: .55; }
      .ylem { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
      .nimed small { display: block; color: var(--secondary-text-color); font-size: 12px; }
      .tahis { font-size: 12px; padding: 2px 8px; border-radius: 10px; white-space: nowrap;
               background: var(--secondary-background-color, rgba(127,127,127,.15)); color: var(--secondary-text-color); }
      .tahis.jah { background: var(--success-color, #43a047); color: #fff; }
      .tahis.paus { background: var(--warning-color, #ffa600); color: #000; white-space: normal; text-align: right; }
      .menyy { margin-top: 8px; display: grid; gap: 6px; font-size: 13px; }
      .menyy div { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .menyy span { width: 48px; color: var(--secondary-text-color); }
      .menyy button { padding: 4px 9px; font-size: 12px; }
      button.on { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); }
      .kirjeldus { font-size: 13px; color: var(--secondary-text-color); margin: 4px 0 8px; }
      .paevrida { display: flex; align-items: center; gap: 6px; margin: 3px 0; }
      .psilt { width: 40px; font-size: 11px; color: var(--secondary-text-color); flex: none; }
      .psilt.h { text-align: right; }
      .riba { flex: 1; display: flex; height: 14px; border-radius: 3px; overflow: hidden;
              background: var(--secondary-background-color, rgba(127,127,127,.12)); }
      .riba i { flex: 1; }
      .riba i.moodas { opacity: .35; }
      .riba i.keelatud { background: repeating-linear-gradient(135deg, transparent 0 2px, rgba(127,127,127,.25) 2px 3px); }
      .riba i.nyyd { box-shadow: inset 0 0 0 1.5px var(--primary-text-color); }
      .kellad { display: flex; justify-content: space-between; margin: 0 46px; font-size: 10px; color: var(--secondary-text-color); }
      .nupurida { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
      .tyhik { flex: 1; }
      button { font: inherit; font-size: 13px; cursor: pointer; background: none; color: var(--primary-text-color);
               border: 1px solid var(--divider-color); border-radius: 6px; padding: 6px 12px; }
      button.p { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); }
      button.d { color: var(--error-color, #db4437); }
      label { color: var(--secondary-text-color); font-size: 13px; }
      .lyliti { display: flex; width: fit-content; align-items: center; gap: 6px; }
      .vali { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; font-size: 13px; color: var(--secondary-text-color); }
      .valik { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; color: var(--primary-text-color); }
      .valik small { color: var(--secondary-text-color); }
      .alam { margin: 0 0 4px 26px; color: var(--primary-text-color); }
      .peidus { display: none; }
      .kellarida { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; color: var(--primary-text-color); }
      .kiir { display: flex; gap: 4px; flex-wrap: wrap; }
      .kiir button { padding: 4px 8px; font-size: 12px; }
      select, input[type=text], input[type=number] {
        background: var(--secondary-background-color, transparent); color: var(--primary-text-color);
        border: 1px solid var(--divider-color); border-radius: 6px; padding: 7px 8px; font: inherit; font-size: 14px; }
      input[type=number], .alam input[type=text] { width: 70px; }
      input[type=time] { background: var(--secondary-background-color, transparent); color: var(--primary-text-color);
        border: 1px solid var(--divider-color); border-radius: 6px; padding: 6px 6px; font: inherit; font-size: 14px; }
      .kellarida { margin-bottom: 6px; }
      .kell2 { display: inline-flex; align-items: center; gap: 2px; }
      .kell2 select { padding: 6px 2px; width: 48px; }
      .varuaknad { margin: -4px 0 12px 0; }
      input.tundi { width: 48px !important; }
      .kellarida { flex-wrap: wrap; }
      .mp { margin-top: 8px; color: var(--primary-text-color); }
      .mp input { width: 54px; }
      .odav { margin-top: 12px; color: var(--primary-text-color); }
      .odav .lyliti { align-items: flex-start; }
      .odav input[type=text] { width: 54px; }
      .odavaknad { margin: 6px 0 0 26px; display: grid; gap: 6px; }
      .terve { margin: 4px 0 12px 26px; color: var(--primary-text-color); }
      .vahemikud { border-top: 1px solid var(--divider-color); padding-top: 12px; }
      .vpealk { color: var(--primary-text-color); font-weight: 600; font-size: 14px; }
      .veerud { display: flex; gap: 6px; font-size: 11px; color: var(--secondary-text-color); }
      .veerud span { width: 122px; } .veerud span:nth-child(3) { width: 72px; } .veerud span:last-child { width: auto; }
      .teade { min-height: 18px; margin-top: 8px; font-size: 13px; }
      .teade.viga { color: var(--error-color, #db4437); }
    </style>`;
  }
}

customElements.define("elektrihind-seadmed-card", ElektrihindSeadmedCard);
window.customCards.push({
  type: "elektrihind-seadmed-card",
  name: "Elektrihind – seadmed",
  description: "Seadmete juhtimine elektri lõpphinna järgi (odavaimad tunnid või hinnapiir)",
});

/* =====================================================================
 *  Elektrihind – aku: laadimisplaan (lae / kasuta / hoia) ja seaded
 *    type: custom:elektrihind-aku-card
 *  Plaan: sensor.elektrihind_aku_plaan, praegune tegevus: sensor.elektrihind_aku
 * ===================================================================== */
const EH_AKU_VARV = { lae: "#2f80ed", kasuta: "#27ae60", hoia: "transparent" };
const EH_AKU_TEKST = { lae: "Laeb võrgust", kasuta: "Katab tarbimise", hoia: "Hoiab", puudub: "Plaan puudub" };
const EH_AKU_VALJAD = [
  ["maht", "Aku maht", "kWh", 1, 1000, 0.5],
  ["minsoc", "Madalaim tase", "%", 0, 90, 1],
  ["maxsoc", "Kõrgeim tase", "%", 10, 100, 1],
  ["laadimine", "Max laadimine võrgust", "kW", 0.5, 30, 0.5],
  ["tarbimine", "Korteri keskmine tarbimine", "kW", 0.1, 20, 0.1],
  ["kasutegur", "Ringkasutegur (lae + tühjenda)", "%", 50, 100, 1],
  ["kulumine", "Aku kulumine", "s/kWh", 0, 50, 0.1],
  ["vahetus", "Lülituste vältimine (trahv vahetuse kohta)", "s", 0, 100, 0.5],
  ["soc_eeldus", "Eeldatav tase, kui andurit pole", "%", 0, 100, 1],
  ["faasipiir", "Faasi voolupiir", "A", 6, 63, 1],
  ["nihe", "Laadimise hajutatud algus", "min", 0, 60, 5],
];

class ElektrihindAkuCard extends HTMLElement {
  setConfig(config) {
    this._config = { title: "Aku", ...config };
    this._seadedAvatud = false;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    this._hass = hass;
    const p = hass.states["sensor.elektrihind_aku_plaan"];
    const a = hass.states["sensor.elektrihind_aku"];
    const c = p && p.attributes.seaded;
    const soc = c && c.soc_andur && hass.states[c.soc_andur] ? hass.states[c.soc_andur].state : "";
    const key = [p && p.last_updated, a && a.state, soc].join("|");
    if (key !== this._key) {
      this._key = key;
      if (!this._seadedAvatud) this._render();
    }
  }

  getCardSize() { return 5; }
  static getStubConfig() { return {}; }

  _esc(x) {
    return String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  _kell(ts) {
    const d = new Date(ts * 1000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  _render() {
    if (!this._hass || !this.shadowRoot) return;
    const root = this.shadowRoot;
    const ps = this._hass.states["sensor.elektrihind_aku_plaan"];
    const as = this._hass.states["sensor.elektrihind_aku"];
    if (!ps) {
      root.innerHTML = `${this._stiil()}<ha-card><div class="sisu">Olem sensor.elektrihind_aku_plaan puudub –
        kontrolli paketti elektrihind.yaml.</div></ha-card>`;
      return;
    }
    const c = ps.attributes.seaded || {};
    const tul = ps.attributes.tulemus || {};
    const plaan = tul.plaan || [];
    const nyyd = Date.now() / 1000;
    const tegevus = as ? as.state : "puudub";
    const andur = c.soc_andur && this._hass.states[c.soc_andur];
    const praeguSlot = plaan.find((x) => x.ts <= nyyd && nyyd < x.ts + 900);
    const soc = andur && !isNaN(parseFloat(andur.state)) ? parseFloat(andur.state)
      : (ps.attributes.soc_algus ?? null);
    const kogus = (t) => plaan.filter((x) => x.t === t).length / 4;

    // ---- graafik: SOC joon + tegevuse ribad ----
    const n = plaan.length;
    let graafik = `<div class="tyhi">Plaani pole – hinnad puuduvad või aku juhtimine on välja lülitatud.</div>`;
    if (n) {
      const W = 600, H = 150;
      const x = (i) => (i / n) * W;
      const y = (v) => H - (v / 100) * H;
      const algSoc = ps.attributes.soc_algus ?? plaan[0].soc;
      const punktid = [`0,${y(algSoc).toFixed(1)}`]
        .concat(plaan.map((p, i) => `${x(i + 1).toFixed(1)},${y(p.soc).toFixed(1)}`)).join(" ");
      const ribad = plaan.map((p, i) => p.t === "hoia" ? "" :
        `<rect x="${x(i).toFixed(1)}" y="0" width="${(W / n + 0.3).toFixed(2)}" height="${H}"
          fill="${EH_AKU_VARV[p.t]}" opacity="0.22"/>`).join("");
      const tunnid = [];
      plaan.forEach((p, i) => {
        const d = new Date(p.ts * 1000);
        if (d.getMinutes() === 0 && d.getHours() % 6 === 0)
          tunnid.push(`<line x1="${x(i)}" x2="${x(i)}" y1="0" y2="${H}" class="${d.getHours() === 0 ? "kesk" : "abi"}"/>
            <text x="${x(i) + 3}" y="${H - 4}">${d.getHours() === 0 ? `${d.getDate()}.${d.getMonth() + 1}` : String(d.getHours()).padStart(2, "0")}</text>`);
      });
      const piirid = [c.minsoc, c.maxsoc].map((v) =>
        `<line x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="piir"/>`).join("");
      graafik = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="g">
          ${ribad}${piirid}${tunnid.join("")}
          <polyline points="${punktid}" class="soc"/>
          <line x1="${x((nyyd - plaan[0].ts) / 900)}" x2="${x((nyyd - plaan[0].ts) / 900)}" y1="0" y2="${H}" class="nyyd"/>
        </svg>
        <div class="legend"><span><i style="background:${EH_AKU_VARV.lae}"></i>laeb ${kogus("lae")} h</span>
          <span><i style="background:${EH_AKU_VARV.kasuta}"></i>katab tarbimise ${kogus("kasuta")} h</span>
          <span><i class="joon"></i>aku tase</span></div>`;
    }

    // ---- järgmised muutused ----
    const muutused = [];
    for (let i = 0; i < n && muutused.length < 4; i++) {
      if (plaan[i].ts + 900 <= nyyd) continue;
      if (i === 0 || plaan[i].t !== plaan[i - 1].t || (muutused.length === 0)) {
        let j = i;
        while (j + 1 < n && plaan[j + 1].t === plaan[i].t) j++;
        if (muutused.length === 0 || plaan[i].t !== muutused[muutused.length - 1].t)
          muutused.push({ t: plaan[i].t, al: Math.max(plaan[i].ts, nyyd), kuni: plaan[j].ts + 900, soc: plaan[j].soc });
        i = j;
      }
    }

    root.innerHTML = `${this._stiil()}
    <ha-card><div class="sisu">
      <div class="pais">
        <div>
          <div class="pealkiri">${this._esc(this._config.title)}
            <button class="hammas" aria-label="Seaded">⚙</button></div>
          <div class="suur">${soc != null ? Math.round(soc) + " %" : "–"}
            <span class="tahis t-${tegevus}">${EH_AKU_TEKST[tegevus] || tegevus}</span></div>
          <div class="vaike">${andur ? "andurist" : "plaani järgi (andur seadistamata)"} ·
            ${c.maht} kWh · laadimine kuni ${c.laadimine} kW (~${Math.round(c.laadimine * 1000 / 690)} A faasis)</div>
        </div>
        <div class="sääst"><span>hinnanguline kokkuhoid</span><b>${(tul.kokkuhoid ?? 0).toFixed(2)} €</b>
          <small>täna + homme</small></div>
      </div>
      ${c.on === false ? `<div class="hoiatus">Aku planeerimine on välja lülitatud (⚙).</div>` : ""}
      ${graafik}
      ${muutused.length ? `<div class="muutused">${muutused.map((m) =>
        `<div><span class="tapp" style="background:${m.t === "hoia" ? "var(--secondary-text-color)" : EH_AKU_VARV[m.t]}"></span>
          <b>${this._kell(m.al)}–${this._kell(m.kuni)}</b> ${EH_AKU_TEKST[m.t].toLowerCase()}
          <small>→ ${Math.round(m.soc)} %</small></div>`).join("")}</div>` : ""}
      <div class="info">Plaan arvestab lõpphinda koos tasudega, ringkasutegurit ja aku kulumist. Võrku ei müüda.
        Deye juhtimine lisandub, kui inverter on Home Assistantis olemas.</div>
    </div></ha-card>`;
    root.querySelector(".hammas").addEventListener("click", () => this._avaSeaded());
  }

  _avaSeaded() {
    const ps = this._hass.states["sensor.elektrihind_aku_plaan"];
    this._S = JSON.parse(JSON.stringify((ps && ps.attributes.seaded) || {}));
    this._seadedAvatud = true;
    this._viga = null;
    this._renderSeaded();
  }

  _renderSeaded() {
    const S = this._S;
    const root = this.shadowRoot;
    const andurid = Object.keys(this._hass.states)
      .filter((e) => e.startsWith("sensor.") && this._hass.states[e].attributes.unit_of_measurement === "%")
      .sort();
    const vali = (k, sildi, yh, min, max, samm) => `<label class="rida2"><span>${sildi}</span>
      <span><input type="number" data-k="${k}" min="${min}" max="${max}" step="${samm}" value="${S[k]}"><span class="yh">${yh}</span></span></label>`;
    root.innerHTML = `${this._stiil()}
    <ha-card><div class="sisu">
      <div class="pais"><span class="pealkiri">${this._esc(this._config.title)} · seaded</span>
        <button data-sulge aria-label="Sulge">✕</button></div>
      <label class="lyliti"><input type="checkbox" data-k="on" ${S.on !== false ? "checked" : ""}> Aku planeerimine sees</label>
      <h3>Aku</h3>
      ${EH_AKU_VALJAD.slice(0, 3).map((v) => vali(...v)).join("")}
      <label class="rida2"><span>Aku taseme andur</span>
        <select data-k="soc_andur"><option value="">— pole (kasutatakse plaani) —</option>
          ${andurid.map((e) => `<option value="${e}" ${e === S.soc_andur ? "selected" : ""}>
            ${this._esc(this._hass.states[e].attributes.friendly_name || e)}</option>`).join("")}
        </select></label>
      ${vali(...EH_AKU_VALJAD[8])}
      <h3>Laadimine ja tarbimine</h3>
      ${vali(...EH_AKU_VALJAD[3])}
      <div class="vihje" data-vihje>≈ ${Math.round((+S.laadimine || 0) * 1000 / 690)} A faasi kohta (3 × 230 V). Arvesta maja
        3 × 80 A liitumist – mida väiksem, seda ohutum; laadimine jaotub siis pikemale ajale.</div>
      ${vali(...EH_AKU_VALJAD[4])}
      ${vali(...EH_AKU_VALJAD[9])}
      ${vali(...EH_AKU_VALJAD[10])}
      <div class="vihje">Faasipiir ja hajutatud algus rakenduvad, kui Deye juhtimine on ühendatud.</div>
      <h3>Arvutus</h3>
      ${EH_AKU_VALJAD.slice(5, 8).map((v) => vali(...v)).join("")}
      <div class="vihje">Akust kasutatakse ainult siis, kui see tasub ära: kallis hind &gt; laadimise hind ÷ kasutegur +
        kulumine. Suurem lülituste trahv = vähem vahetusi lae/kasuta/hoia vahel.</div>
      <div class="teade">${this._esc(this._viga || "")}</div>
      <div class="nupurida"><button class="p" data-salvesta>Salvesta</button><button data-sulge>Tühista</button>
        <span class="tyhik"></span><button data-vaike>Vaikeväärtused</button></div>
    </div></ha-card>`;
    root.querySelectorAll("[data-k]").forEach((el) => {
      const f = () => {
        S[el.dataset.k] = el.type === "checkbox" ? el.checked : el.tagName === "SELECT" ? el.value : el.value;
        if (el.dataset.k === "laadimine") root.querySelector("[data-vihje]").firstChild.textContent =
          `≈ ${Math.round((parseFloat(String(el.value).replace(",", ".")) || 0) * 1000 / 690)} A faasi kohta (3 × 230 V). Arvesta maja
        3 × 80 A liitumist – mida väiksem, seda ohutum; laadimine jaotub siis pikemale ajale.`;
      };
      el.addEventListener("input", f);
      el.addEventListener("change", f);
    });
    const sulge = () => { this._seadedAvatud = false; this._render(); };
    root.querySelectorAll("[data-sulge]").forEach((b) => b.addEventListener("click", sulge));
    root.querySelector("[data-vaike]").addEventListener("click", () => this._saada(null));
    root.querySelector("[data-salvesta]").addEventListener("click", () => {
      const d = { on: S.on !== false, soc_andur: S.soc_andur || "" };
      for (const [k, sildi, yh, min, max] of EH_AKU_VALJAD) {
        const v = parseFloat(String(S[k]).replace(",", "."));
        if (isNaN(v) || v < min || v > max) { this._viga = `${sildi}: peab olema ${min} … ${max} ${yh}`; this._renderSeaded(); return; }
        d[k] = v;
      }
      if (d.minsoc >= d.maxsoc) { this._viga = "Madalaim tase peab olema väiksem kui kõrgeim tase"; this._renderSeaded(); return; }
      this._saada(d);
    });
  }

  async _saada(seaded) {
    try {
      await this._hass.callWS({ type: "fire_event", event_type: "elektrihind_aku", event_data: { seaded } });
      this._seadedAvatud = false;
      this._render();
    } catch (e) {
      this._viga = e && e.code === "unauthorized" ? "Salvestamiseks on vaja administraatori kontot"
        : `Salvestamine ebaõnnestus: ${(e && e.message) || e}`;
      this._renderSeaded();
    }
  }

  _stiil() {
    return `<style>
      .sisu { padding: 16px; color: var(--primary-text-color); }
      .pais { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
      .pealkiri { font-size: 14px; color: var(--secondary-text-color); }
      .hammas { border: 0; padding: 0 4px; font-size: 16px; color: var(--secondary-text-color); }
      .suur { font-size: 36px; font-weight: 700; line-height: 1.15; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .vaike { font-size: 12px; color: var(--secondary-text-color); }
      .tahis { font-size: 12px; font-weight: 500; padding: 3px 9px; border-radius: 10px; color: #fff;
               background: var(--secondary-text-color); }
      .t-lae { background: ${EH_AKU_VARV.lae}; } .t-kasuta { background: ${EH_AKU_VARV.kasuta}; }
      .sääst { text-align: right; }
      .sääst span, .sääst small { display: block; font-size: 11px; color: var(--secondary-text-color); }
      .sääst b { font-size: 20px; }
      .g { width: 100%; height: 150px; display: block; border-radius: 6px;
           background: var(--secondary-background-color, rgba(127,127,127,.08)); }
      .g .soc { fill: none; stroke: var(--primary-text-color); stroke-width: 2; vector-effect: non-scaling-stroke; }
      .g .piir { stroke: var(--secondary-text-color); stroke-dasharray: 3 3; opacity: .5; vector-effect: non-scaling-stroke; }
      .g .abi { stroke: var(--divider-color); vector-effect: non-scaling-stroke; }
      .g .kesk { stroke: var(--secondary-text-color); vector-effect: non-scaling-stroke; }
      .g .nyyd { stroke: var(--primary-text-color); stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; }
      .g text { font-size: 11px; fill: var(--secondary-text-color); }
      .legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--secondary-text-color); margin: 6px 0 10px; }
      .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; opacity: .6; vertical-align: -1px; }
      .legend i.joon { height: 2px; background: var(--primary-text-color); opacity: 1; vertical-align: 3px; }
      .muutused { font-size: 13px; display: grid; gap: 4px; }
      .muutused small { color: var(--secondary-text-color); }
      .tapp { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }
      .info, .vihje { font-size: 12px; color: var(--secondary-text-color); margin-top: 10px; }
      .vihje { margin: 2px 0 8px; }
      .hoiatus { font-size: 13px; color: var(--warning-color, #ffa600); margin-bottom: 8px; }
      .tyhi { color: var(--secondary-text-color); padding: 12px 0; }
      h3 { font-size: 13px; font-weight: 600; color: var(--secondary-text-color); margin: 16px 0 6px;
           border-top: 1px solid var(--divider-color); padding-top: 12px; }
      .rida2 { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin: 6px 0; font-size: 14px; }
      .rida2 > span:first-child { color: var(--primary-text-color); }
      .rida2 > span:last-child { white-space: nowrap; color: var(--secondary-text-color); font-size: 13px; }
      input[type=number], select { background: var(--secondary-background-color, transparent); color: var(--primary-text-color);
        border: 1px solid var(--divider-color); border-radius: 6px; padding: 6px 8px; font: inherit; font-size: 14px; }
      input[type=number] { width: 76px; }
      .yh { display: inline-block; width: 40px; padding-left: 6px; text-align: left; }
      select { max-width: 220px; margin-right: 46px; }
      .lyliti { display: flex; align-items: center; gap: 6px; font-size: 14px; }
      button { font: inherit; font-size: 13px; cursor: pointer; background: none; color: var(--primary-text-color);
               border: 1px solid var(--divider-color); border-radius: 6px; padding: 6px 12px; }
      button.p { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); }
      .nupurida { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
      .tyhik { flex: 1; }
      .teade { min-height: 18px; color: var(--error-color, #db4437); font-size: 13px; margin-top: 8px; }
    </style>`;
  }
}

customElements.define("elektrihind-aku-card", ElektrihindAkuCard);
window.customCards.push({
  type: "elektrihind-aku-card",
  name: "Elektrihind – aku",
  description: "Aku laadimisplaan elektri lõpphinna järgi (lae odavalt, kata kallid tunnid)",
});
