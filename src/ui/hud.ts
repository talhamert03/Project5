import { t } from '../i18n';
import type { View } from '../render/view';
import type { Hud } from '../game/world';
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
  private skillBtn!: HTMLButtonElement;
  private skillRing!: SVGCircleElement;
  private skillGlow!: SVGCircleElement;
  private skillIc!: HTMLElement;
  private bossLabel!: HTMLElement;
  private lastSkill = -1;
  private lastSkillReady = false;

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
      <button class="skill-btn interactive" data-a="skill" id="h-skill" aria-label="skill">
        <svg class="skill-ring" viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="28"/><circle class="glow" id="h-skillglow" cx="32" cy="32" r="28"/><circle class="fg" id="h-skillring" cx="32" cy="32" r="28"/></svg>
        <span class="skill-ic" id="h-skillic"></span>
        <span class="skill-ready">${t('hud.skillReady')}</span>
      </button>
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
    this.skillBtn = $('h-skill') as HTMLButtonElement;
    this.skillRing = this.root.querySelector('#h-skillring') as SVGCircleElement;
    this.skillGlow = this.root.querySelector('#h-skillglow') as SVGCircleElement;
    this.skillIc = $('h-skillic');
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
    this.lastSkill = -1;
    this.lastSkillReady = false;
  }

  /** Eğitimde yetenek düğmesi gizlenir */
  showSkill(on: boolean): void {
    this.skillBtn.hidden = !on;
  }

  /** Turun yeteneği: ikon ve renk */
  setSkill(iconName: string, color: string): void {
    this.skillIc.innerHTML = icon(iconName);
    this.skillBtn.style.setProperty('--sc', color);
    this.lastSkill = -1;
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

    // yetenek halkası: dolum oranı (her %1'de bir güncelle)
    const sk = Math.round(Math.min(1, h.skill) * 100);
    const ready = sk >= 100 && !h.skillActive;
    if (sk !== this.lastSkill || ready !== this.lastSkillReady) {
      this.lastSkill = sk;
      const off = String(176 * (1 - sk / 100));
      this.skillRing.style.strokeDashoffset = off;
      this.skillGlow.style.strokeDashoffset = off;
      if (ready !== this.lastSkillReady) {
        this.lastSkillReady = ready;
        this.skillBtn.classList.toggle('ready', ready);
        if (ready) pulse(this.skillBtn, 1.3);
      }
      this.skillBtn.classList.toggle('active', h.skillActive);
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
