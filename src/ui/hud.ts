import { t } from '../i18n';
import type { View } from '../render/view';
import type { Hud, SkillSlot } from '../game/world';
import { fmt } from './format';
import { icon } from './icons';

/**
 * Oyun içi gösterge. DOM yalnızca değer değiştiğinde güncellenir (layout thrash yok);
 * mürekkep barı transform ile ölçeklenir (GPU).
 */
export class HudView {
  readonly root: HTMLElement;
  private score!: HTMLElement;
  private best!: HTMLElement;
  private wave!: HTMLElement;
  private coins!: HTMLElement;
  private inkBar!: HTMLElement;
  private inkFill!: HTMLElement;
  private pips!: HTMLElement;
  private combo!: HTMLElement;
  private mult!: HTMLElement;
  private count!: HTMLElement;
  private ring!: SVGCircleElement;
  private boss!: HTMLElement;
  private bossFill!: HTMLElement;
  private hintEl!: HTMLElement;
  private fpsEl!: HTMLElement;
  private dock!: HTMLElement;
  private dockItems: Array<{ el: HTMLElement; ring: SVGCircleElement; sec: HTMLElement; key: number; ready: boolean }> = [];
  private bossLabel!: HTMLElement;
  private feverEl!: HTMLElement;
  private feverBar!: HTMLElement;
  private lastFever = -1;

  private shownScore = 0;
  private lastScoreText = '';
  private lastPop = 0;
  private lastInk = -1;
  private lastLow = false;
  private lastPips = '';
  private lastCombo = -1;
  private lastMult = '';
  private lastWave = -1;
  private lastBoss = -2;
  private lastCoins = -1;
  private beaten = false;
  private best0 = 0;
  private bossWave = false;
  private time = 0;
  /** HUD yüksekliği değişince (boss barı) dünya üst boşluğunu yeniden ölç */
  onLayout: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.hidden = true;
    parent.appendChild(this.root);
    this.build();
  }

  build(): void {
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="left"><button class="icon-btn interactive" data-a="pause" aria-label="${t('pause.title')}">${icon('pause')}</button></div>
        <div class="hud-score">
          <div class="score" id="h-score">0</div>
          <div class="hud-sub"><span class="hud-wave" id="h-wave"></span><span class="hud-best" id="h-best"></span></div>
        </div>
        <div class="right">
          <div class="chip coin">${icon('coin')}<span class="coin-count" id="h-coins">0</span></div>
        </div>
      </div>
      <div class="ink-row">
        <div class="ink-bar" id="h-ink"><div class="ink-fill" id="h-inkfill"></div></div>
        <div class="pips" id="h-pips"></div>
      </div>
      <div class="combo" id="h-combo">
        <svg class="combo-ring" viewBox="0 0 22 22"><circle class="bg" cx="11" cy="11" r="8"/><circle class="fg" id="h-ring" cx="11" cy="11" r="8"/></svg>
        <div class="mult" id="h-mult">x1.0</div>
        <div class="count" id="h-count"></div>
      </div>
      <div class="boss-bar" id="h-boss" hidden>
        <div class="label" id="h-bosslabel">${t('hud.boss')}</div>
        <div class="bar"><i id="h-bossfill" style="--w:100%"></i></div>
      </div>
      <div class="hint" id="h-hint" hidden></div>
      <div class="fever" id="h-fever" hidden><b>${t('hud.fever')}</b><span><i id="h-feverbar"></i></span></div>
      <div class="skill-dock" id="h-dock"></div>
      <div class="fps" id="h-fps" hidden></div>`;
    const $ = <T extends HTMLElement>(id: string): T => this.root.querySelector('#' + id) as T;
    this.score = $('h-score');
    this.best = $('h-best');
    this.wave = $('h-wave');
    this.coins = $('h-coins');
    this.inkBar = $('h-ink');
    this.inkFill = $('h-inkfill');
    this.pips = $('h-pips');
    this.combo = $('h-combo');
    this.mult = $('h-mult');
    this.count = $('h-count');
    this.ring = this.root.querySelector('#h-ring') as SVGCircleElement;
    this.boss = $('h-boss');
    this.bossFill = $('h-bossfill');
    this.hintEl = $('h-hint');
    this.fpsEl = $('h-fps');
    this.dock = $('h-dock');
    this.feverEl = $('h-fever');
    this.feverBar = $('h-feverbar');
    this.dockItems = [];
    this.bossLabel = $('h-bosslabel');
    this.invalidate();
  }

  invalidate(): void {
    this.lastScoreText = '';
    this.lastInk = -1;
    this.lastPips = '';
    this.lastCombo = -1;
    this.lastMult = '';
    this.lastWave = -1;
    this.lastBoss = -2;
    this.lastCoins = -1;
    for (const d of this.dockItems) d.key = -1;
    this.lastFever = -1;
  }

  /** Eğitimde yetenek doku gizlenir */
  showSkill(on: boolean): void {
    this.dock.hidden = !on;
  }

  /** Yetenek doku: her açık yetenek için şeklinin simgesi ve bekleme halkası */
  setSkills(slots: Array<{ id: string; shape: string; color: string }>): void {
    this.dock.innerHTML = slots
      .map(
        (k) => `
        <button class="sk interactive" data-a="skillHint" data-id="${k.id}" style="--sc:${k.color}" aria-label="${t('skill.' + k.id)}">
          <svg class="sk-ring" viewBox="0 0 60 60"><circle class="bg" cx="30" cy="30" r="26"/><circle class="fg" cx="30" cy="30" r="26"/></svg>
          ${shapeIcon(k.shape, 'sk-glyph')}
          <b class="sk-sec"></b>
          <span class="sk-tag">${t('hud.skillReady')}</span>
        </button>`,
      )
      .join('');
    this.dockItems = [...this.dock.querySelectorAll<HTMLElement>('.sk')].map((el) => ({
      el,
      ring: el.querySelector('.fg') as SVGCircleElement,
      sec: el.querySelector('.sk-sec') as HTMLElement,
      key: -1,
      ready: false,
    }));
  }

  /** Hazır olan yeteneğin simgesi zıplar */
  bounceSkill(id: string): void {
    const d = this.dockItems.find((x) => x.el.dataset.id === id);
    if (d) pulse(d.el, 1.35);
  }

  /** Boss barının etiketi (boss adı) */
  setBossName(name: string): void {
    this.bossLabel.textContent = name;
  }

  show(on: boolean): void {
    this.root.hidden = !on;
  }

  reset(best: number): void {
    this.shownScore = 0;
    this.best0 = best;
    this.beaten = false;
    this.best.classList.remove('beaten');
    this.best.textContent = best > 0 ? `${t('hud.best')} ${fmt(best)}` : '';
    this.hint(null);
    this.invalidate();
  }

  setBossWave(on: boolean): void {
    this.bossWave = on;
    this.lastWave = -1;
  }

  hint(text: string | null, skipLabel?: string): void {
    if (!text) {
      this.hintEl.hidden = true;
      return;
    }
    this.hintEl.hidden = false;
    this.hintEl.textContent = text;
    if (skipLabel) {
      const b = document.createElement('button');
      b.className = 'skip';
      b.dataset.a = 'skipTut';
      b.textContent = skipLabel;
      this.hintEl.appendChild(b);
    }
    // animasyonu yeniden başlat
    this.hintEl.style.animation = 'none';
    void this.hintEl.offsetWidth;
    this.hintEl.style.animation = '';
  }

  inkWarn(): void {
    this.inkBar.animate(
      [{ transform: 'none' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }],
      { duration: 400 },
    );
  }

  setFps(text: string | null): void {
    this.fpsEl.hidden = text === null;
    if (text !== null) this.fpsEl.textContent = text;
  }

  update(h: Hud, dt: number): void {
    this.time += dt;
    // skor sayacı yumuşak yükselir
    const diff = h.score - this.shownScore;
    this.shownScore = Math.abs(diff) < 1 ? h.score : this.shownScore + diff * Math.min(1, dt * 14);
    const txt = fmt(Math.round(this.shownScore));
    if (txt !== this.lastScoreText) {
      this.lastScoreText = txt;
      this.score.textContent = txt;
      if (diff > 40 && this.time - this.lastPop > 0.16) {
        this.lastPop = this.time;
        pulse(this.score, 1.12);
      }
    }
    if (!this.beaten && this.best0 > 0 && h.score > this.best0) {
      this.beaten = true;
      this.best.classList.add('beaten');
      this.best.textContent = t('hud.newBest');
    }

    const inkFrac = h.maxInk > 0 ? h.ink / h.maxInk : 0;
    if (Math.abs(inkFrac - this.lastInk) > 0.002) {
      this.lastInk = inkFrac;
      this.inkFill.style.transform = `scaleX(${inkFrac.toFixed(3)})`;
      const low = inkFrac < 0.2;
      if (low !== this.lastLow) {
        this.lastLow = low;
        this.inkBar.classList.toggle('low', low);
      }
    }

    const pipKey = `${h.lines}/${h.maxLines}`;
    if (pipKey !== this.lastPips) {
      this.lastPips = pipKey;
      let html = '';
      for (let i = 0; i < h.maxLines; i++) html += `<i class="${i < h.lines ? '' : 'off'}"></i>`;
      this.pips.innerHTML = html;
    }

    if (h.combo !== this.lastCombo) {
      const on = h.combo >= 2;
      this.combo.classList.toggle('on', on);
      if (on) {
        this.count.textContent = `${h.combo} ${t('hud.combo')}`;
        const cc = h.mult >= 4 ? 'var(--violet)' : h.mult >= 3 ? 'var(--rose)' : h.mult >= 2 ? 'var(--gold)' : 'var(--ink)';
        this.combo.style.setProperty('--cc', cc);
      }
      this.lastCombo = h.combo;
    }
    const m = 'x' + h.mult.toFixed(1);
    if (m !== this.lastMult) {
      this.lastMult = m;
      this.mult.textContent = m;
      pulse(this.mult, 1.12);
    }
    if (h.combo >= 2) this.ring.style.strokeDashoffset = String(50.3 * (1 - h.comboT));

    if (h.wave !== this.lastWave) {
      this.lastWave = h.wave;
      this.wave.textContent = h.wave > 0 ? `${t('hud.wave')} ${h.wave}` : '';
      this.wave.classList.toggle('boss', this.bossWave);
    }

    const bossKey = h.bossHp < 0 ? -1 : Math.round(h.bossHp * 200);
    if (bossKey !== this.lastBoss) {
      const wasHidden = this.lastBoss < 0;
      this.lastBoss = bossKey;
      const hide = h.bossHp < 0;
      const changed = this.boss.hidden !== hide;
      this.boss.hidden = hide;
      if (h.bossHp >= 0) {
        this.bossFill.style.setProperty('--w', `${(h.bossHp * 100).toFixed(1)}%`);
        if (wasHidden) this.boss.style.animation = '';
      }
      if (changed) this.onLayout?.();
    }

    // yetenek doku: bekleme halkası (her %1'de bir) ve kalan saniye
    this.updateDock(h.skills);

    // Mürekkep Ateşi göstergesi (transform ile küçülen bar)
    const fv = Math.round(h.fever * 200);
    if (fv !== this.lastFever) {
      if ((fv > 0) !== (this.lastFever > 0)) {
        this.feverEl.hidden = fv <= 0;
        this.combo.classList.toggle('fever', fv > 0);
      }
      this.lastFever = fv;
      if (fv > 0) this.feverBar.style.transform = `scaleX(${(fv / 200).toFixed(3)})`;
    }

    if (h.coins !== this.lastCoins) {
      const bump = this.lastCoins >= 0 && h.coins > this.lastCoins;
      this.lastCoins = h.coins;
      this.coins.textContent = fmt(h.coins);
      if (bump) {
        pulse(this.coins, 1.25);
      }
    }
  }

  private updateDock(slots: SkillSlot[]): void {
    const n = Math.min(slots.length, this.dockItems.length);
    for (let i = 0; i < n; i++) {
      const k = slots[i];
      const d = this.dockItems[i];
      const frac = k.cd > 0 ? 1 - k.left / k.cd : 1;
      const key = Math.round(frac * 100) * 1000 + Math.ceil(k.left);
      if (key === d.key) continue;
      d.key = key;
      d.ring.style.strokeDashoffset = (163.4 * (1 - frac)).toFixed(1);
      const ready = k.left <= 0;
      d.sec.textContent = ready ? '' : String(Math.ceil(k.left));
      if (ready !== d.ready) {
        d.ready = ready;
        d.el.classList.toggle('ready', ready);
        if (ready) pulse(d.el, 1.3);
      }
    }
  }

  /** Dünya koordinatında HUD hedefleri ve üst boşluk */
  measure(view: View): { top: number; ink: { x: number; y: number }; coin: { x: number; y: number } } {
    const r = this.inkBar.getBoundingClientRect();
    const c = this.coins.getBoundingClientRect();
    const combo = this.combo.getBoundingClientRect();
    const boss = this.boss.hidden ? 0 : this.boss.getBoundingClientRect().bottom;
    return {
      top: view.toWorldY(Math.max(r.bottom, combo.bottom, boss)),
      ink: { x: view.toWorldX(r.left + r.width / 2), y: view.toWorldY(r.top + r.height / 2) },
      coin: { x: view.toWorldX(c.left + c.width / 2), y: view.toWorldY(c.top + c.height / 2) },
    };
  }
}

/** Yerleşimi yeniden hesaplatmadan (reflow yok) kısa büyüme animasyonu */
function pulse(el: HTMLElement, scale: number): void {
  el.animate([{ transform: 'none' }, { transform: `scale(${scale})`, offset: 0.4 }, { transform: 'none' }], { duration: 220, easing: 'ease-out' });
}

/** Yetenek şekillerinin simgesi (arayüz: dok, yetenek ağacı, ipuçları) */
export function shapeIcon(shape: string, cls = ''): string {
  const d: Record<string, string> = {
    circle: '<circle cx="12" cy="12" r="7.6"/>',
    triangle: '<path d="M12 4.2 L20 18.6 H4 Z"/>',
    square: '<path d="M5.2 5.2 H18.8 V18.8 H5.2 Z"/>',
    zigzag: '<path d="M4.5 6 H19.5 L4.5 18 H19.5"/>',
  };
  return `<svg class="shape-ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${d[shape] ?? ''}</svg>`;
}
