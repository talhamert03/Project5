import { audio } from './core/audio';
import { haptics } from './core/haptics';
import { Input } from './core/input';
import { Loop } from './core/loop';
import { type Quality, type SaveData, defaultSave, loadSave, writeSave } from './core/storage';
import { PENS, PEN_BY_ID, type Pen } from './game/pens';
import { Rarity } from './game/upgrades';
import { type RunOptions, type RunResult, World, type WorldEvent } from './game/world';
import { setLang, t } from './i18n';
import { dailyInfo, ensureMissions, metaBonus, rankIndex, rankProgress, settleRun, WORKSHOP } from './meta/progression';
import { canFullscreen, exitApp, initNative, keepAwake, toggleFullscreen } from './platform';
import { Background } from './render/background';
import { Sprites } from './render/sprites';
import { View } from './render/view';
import { fmt } from './ui/format';
import { HudView } from './ui/hud';
import {
  bannerHTML,
  bootHTML,
  dailyHTML,
  menuHTML,
  missionsHTML,
  overHTML,
  pauseHTML,
  pensHTML,
  recordsHTML,
  settingsHTML,
  toastHTML,
  upgradeHTML,
  workshopHTML,
} from './ui/screens';

export const VERSION = '1.0.0';

type State = 'boot' | 'menu' | 'game' | 'paused' | 'upgrade' | 'over';
type PanelName = 'daily' | 'missions' | 'workshop' | 'pens' | 'records' | 'settings';

interface Timer {
  t: number;
  fn: () => void;
}

const QUALITY_LEVEL: Record<Quality, number> = { high: 1, balanced: 0.75, saver: 0.45 };

/**
 * Uygulama denetleyicisi: durum makinesi (açılış → menü → oyun → güç seçimi → oyun sonu),
 * kayıt, ayarlar ve dünya olaylarının arayüze aktarılması.
 */
export class App {
  save: SaveData = loadSave();
  readonly view: View;
  readonly sprites: Sprites;
  readonly bg: Background;
  readonly world: World;
  readonly input: Input;
  readonly loop: Loop;
  readonly hud: HudView;

  private ui: HTMLElement;
  private screenEl: HTMLElement;
  private panelEl: HTMLElement;
  private bannerEl: HTMLElement;
  private toastEl: HTMLElement;

  state: State = 'boot';
  private panel: PanelName | null = null;
  private runDaily = false;
  private timers: Timer[] = [];
  private upgradeStart = false;
  private picking = false;
  private resetArmed = false;
  private newMissions = 0;
  private fpsT = 0;
  private lowFpsT = 0;
  private bannerT = 0;
  private countUps: Array<{ el: HTMLElement; from: number; to: number; t: number; dur: number; tick: boolean }> = [];

  constructor() {
    setLang(this.save.settings.lang);
    ensureMissions(this.save);

    const canvas = document.getElementById('game') as HTMLCanvasElement;
    this.ui = document.getElementById('ui') as HTMLElement;
    this.view = new View(canvas);
    this.view.quality = this.save.settings.quality;
    this.view.resize();
    this.sprites = new Sprites();
    this.bg = new Background(this.view, this.sprites);
    this.world = new World(this.view, this.sprites, this.bg, this.currentPen());
    this.world.setQuality(QUALITY_LEVEL[this.save.settings.quality]);
    this.world.onEvent = (e) => this.onWorld(e);
    this.input = new Input(canvas, this.view);
    this.input.sink = this.world;

    this.hud = new HudView(this.ui);
    this.hud.onLayout = () => this.measureHud();
    this.screenEl = this.layer('screen-layer');
    this.panelEl = this.layer('panel-layer');
    this.bannerEl = this.layer('banner-layer');
    this.toastEl = this.layer('toasts');

    audio.setMusic(this.save.settings.music);
    audio.setSfx(this.save.settings.sfx);
    haptics.enabled = this.save.settings.haptics;
    this.applyPenColor();

    this.ui.addEventListener('click', (e) => this.onClick(e));
    document.addEventListener('pointerdown', () => this.unlockAudio(), { capture: true });
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('blur', () => {
      if (this.state === 'game') this.pause();
    });
    this.view.onResize(() => this.measureHud());
    initNative(
      () => this.onBack(),
      () => {
        if (this.state === 'game') this.pause();
      },
    );

    this.loop = new Loop((dt) => this.frame(dt));
  }

  private layer(cls: string): HTMLElement {
    const el = document.createElement('div');
    el.className = cls;
    this.ui.appendChild(el);
    return el;
  }

  start(): void {
    this.setScreen(bootHTML());
    this.world.startAttract();
    this.loop.start();
    const boot = this.screenEl.querySelector('#boot') as HTMLElement | null;
    const go = (): void => {
      if (this.state !== 'boot') return;
      boot?.classList.add('out');
      window.setTimeout(() => this.toMenu(), 380);
    };
    boot?.addEventListener('pointerdown', go, { once: true });
    boot?.addEventListener('keydown', go, { once: true });
  }

  private unlockAudio(): void {
    if (audio.ready) return;
    audio.unlock();
    audio.startMusic();
  }

  private currentPen(): Pen {
    return PEN_BY_ID.get(this.save.pen) ?? PENS[0];
  }

  private applyPenColor(): void {
    const p = this.currentPen();
    document.documentElement.style.setProperty('--ink', p.color);
    document.documentElement.style.setProperty('--ink-core', p.core);
    this.world.setPen(p);
  }

  private commit(): void {
    writeSave(this.save);
  }

  // ───────────────────────── EKRANLAR ─────────────────────────

  private setScreen(html: string): void {
    this.screenEl.innerHTML = html;
  }

  toMenu(): void {
    this.state = 'menu';
    this.timers = [];
    this.picking = false;
    this.hud.show(false);
    this.bannerEl.innerHTML = '';
    void keepAwake(false);
    audio.resume();
    audio.setIntensity(0);
    if (this.world.phase !== 'attract') this.world.startAttract();
    this.renderMenu();
  }

  private renderMenu(): void {
    this.setScreen(menuHTML({ save: this.save, daily: dailyInfo(), missionsReady: this.newMissions }));
  }

  private openPanel(name: PanelName): void {
    this.panel = name;
    this.resetArmed = false;
    if (name === 'missions') this.newMissions = 0;
    this.renderPanel();
  }

  private renderPanel(): void {
    const s = this.save;
    let html = '';
    switch (this.panel) {
      case 'daily':
        html = dailyHTML(s, dailyInfo());
        break;
      case 'missions':
        html = missionsHTML(s);
        break;
      case 'workshop':
        html = workshopHTML(s);
        break;
      case 'pens':
        html = pensHTML(s);
        break;
      case 'records':
        html = recordsHTML(s);
        break;
      case 'settings':
        html = settingsHTML(s, VERSION, canFullscreen(), this.resetArmed);
        break;
      default:
        html = '';
    }
    // aynı paneli yeniden çizerken kaydırma konumunu koru
    const prev = this.panelEl.querySelector('.panel-body') as HTMLElement | null;
    const scroll = prev?.scrollTop ?? 0;
    const same = prev && this.panelEl.querySelector(`#panel-${this.panel}`);
    this.panelEl.innerHTML = html;
    const body = this.panelEl.querySelector('.panel-body') as HTMLElement | null;
    if (same && body) {
      body.scrollTop = scroll;
      this.panelEl.querySelector('.panel')?.setAttribute('style', 'animation:none');
    }
  }

  private closePanel(): void {
    if (!this.panel) return;
    this.panel = null;
    const el = this.panelEl.querySelector('.panel');
    if (el) {
      el.classList.add('out');
      window.setTimeout(() => {
        if (!this.panel) this.panelEl.innerHTML = '';
      }, 240);
    }
    if (this.state === 'menu') this.renderMenu();
  }

  private showBanner(big: string, small: string, boss: boolean, color?: string): void {
    this.bannerEl.innerHTML = bannerHTML(big, small, boss, color);
    this.bannerT = 1.4;
  }

  toast(ic: string, text: string): void {
    const wrap = document.createElement('div');
    wrap.innerHTML = toastHTML(ic, text);
    const el = wrap.firstElementChild as HTMLElement;
    this.toastEl.appendChild(el);
    window.setTimeout(() => el.remove(), 2900);
  }

  private after(sec: number, fn: () => void): void {
    this.timers.push({ t: sec, fn });
  }

  private measureHud(): void {
    if (this.hud.root.hidden) return;
    const m = this.hud.measure(this.view);
    this.world.topInset = m.top;
    this.world.hudInk = m.ink;
    this.world.hudCoin = m.coin;
  }

  // ───────────────────────── OYUN AKIŞI ─────────────────────────

  play(daily: boolean): void {
    this.panel = null;
    this.panelEl.innerHTML = '';
    this.runDaily = daily;
    this.timers = [];
    this.picking = false;
    const d = dailyInfo();
    const opts: RunOptions = {
      daily,
      seed: daily ? d.seed : (Math.random() * 4294967296) >>> 0,
      mod: daily ? d.mod : null,
      meta: metaBonus(this.save),
      tutorial: !this.save.tutorialDone && !daily,
      best: this.save.best,
      pen: this.currentPen(),
    };
    this.hud.reset(this.save.best);
    this.world.startRun(opts);
    this.hud.setBossWave(false);
    this.hud.show(true);
    this.setScreen('');
    this.bannerEl.innerHTML = '';
    this.state = 'game';
    this.measureHud();
    void keepAwake(true);
    audio.resume();
    if (this.world.phase === 'cleared' && this.world.wave === 0) {
      const rarity = opts.meta.startRarity >= 2 ? Rarity.Epic : Rarity.Rare;
      this.showUpgrade(this.world.offerStart(rarity), true);
    }
  }

  private showUpgrade(ids: string[], start: boolean): void {
    this.state = 'upgrade';
    this.upgradeStart = start;
    this.picking = false;
    this.input.cancel();
    const sub = start ? t('up.subStart') : t('up.sub', { n: this.world.wave + 1 });
    this.setScreen(upgradeHTML(ids, this.world.levels, sub, this.world.rerolls));
    audio.whoosh();
  }

  private pick(id: string, el: HTMLElement): void {
    if (this.picking || this.state !== 'upgrade') return;
    this.picking = true;
    el.classList.add('chosen');
    this.screenEl.querySelectorAll('.card').forEach((c) => {
      if (c !== el) c.classList.add('dismissed');
    });
    this.screenEl.querySelector('.reroll-row')?.remove();
    audio.select();
    haptics.medium();
    window.setTimeout(() => {
      if (this.state !== 'upgrade') return;
      this.world.applyUpgrade(id);
      this.setScreen('');
      this.state = 'game';
      this.picking = false;
      this.world.nextWave();
    }, 480);
  }

  private reroll(): void {
    if (this.world.rerolls <= 0 || this.picking) return;
    this.world.rerolls--;
    const ids = this.upgradeStart
      ? this.world.offerStart((this.save.workshop.start ?? 0) >= 2 ? Rarity.Epic : Rarity.Rare)
      : this.world.offer();
    this.showUpgrade(ids, this.upgradeStart);
  }

  pause(): void {
    if (this.state !== 'game') return;
    this.state = 'paused';
    this.input.cancel();
    this.setScreen(pauseHTML(this.save));
    void keepAwake(false);
    audio.suspend();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'game';
    this.setScreen('');
    audio.resume();
    // devam ederken zaman yavaşça normale döner
    this.world.timeScale = 0.1;
    void keepAwake(true);
  }

  /** Yarıda bırakılan oyunun puanı yine kaydedilir */
  private settleSilently(): void {
    if (this.world.phase === 'over' || this.world.phase === 'attract') return;
    if (this.world.opts?.tutorial && this.world.phase === 'tutorial') {
      this.world.abandon();
      return;
    }
    const r = this.world.abandon();
    if (r.score > 0 || r.wave > 1) {
      settleRun(this.save, r, metaBonus(this.save).coinMult);
      this.commit();
    }
  }

  private restart(): void {
    audio.resume();
    this.settleSilently();
    this.play(this.runDaily);
  }

  private quit(): void {
    this.settleSilently();
    this.toMenu();
  }

  private gameOver(r: RunResult): void {
    const st = settleRun(this.save, r, metaBonus(this.save).coinMult);
    this.newMissions += st.missions.length;
    this.commit();
    this.state = 'over';
    this.timers = [];
    this.hud.show(false);
    this.bannerEl.innerHTML = '';
    void keepAwake(false);
    const today = this.save.daily.date === dailyInfo().key ? this.save.daily.best : 0;
    this.setScreen(overHTML(r, st, this.save.best, today));
    const scoreEl = this.screenEl.querySelector('#o-score') as HTMLElement | null;
    const coinEl = this.screenEl.querySelector('#o-coins') as HTMLElement | null;
    if (scoreEl) this.countUps.push({ el: scoreEl, from: 0, to: r.score, t: 0, dur: 1.3, tick: false });
    if (coinEl) this.countUps.push({ el: coinEl, from: 0, to: st.coins, t: -0.5, dur: 1, tick: true });
    // rütbe barı: önceki rekordan yenisine dolsun
    const bar = this.screenEl.querySelector('.rank-card .bar > i') as HTMLElement | null;
    if (bar) {
      const target = bar.style.getPropertyValue('--w');
      const before = st.rankAfter > st.rankBefore ? 0 : rankProgress(st.prevBest).frac * 100;
      bar.style.setProperty('--w', `${before.toFixed(1)}%`);
      requestAnimationFrame(() => requestAnimationFrame(() => bar.style.setProperty('--w', target)));
    }
    if (st.newBest && r.score > 0) {
      window.setTimeout(() => {
        audio.record();
        haptics.success();
      }, 900);
    }
    if (st.rankAfter > st.rankBefore) {
      window.setTimeout(() => {
        audio.rankUp();
        haptics.success();
      }, 1500);
    }
  }

  // ───────────────────────── DÜNYA OLAYLARI ─────────────────────────

  private onWorld(e: WorldEvent): void {
    switch (e.type) {
      case 'wave':
        this.hud.setBossWave(e.boss);
        if (e.boss) this.showBanner(t('banner.boss'), t('banner.bossSub'), true, 'var(--crimson)');
        else this.showBanner(t('banner.wave', { n: e.wave }), e.wave === 1 ? t('banner.ready') : '', false);
        break;
      case 'waveClear':
        this.after(0.8, () => this.showBanner(t('banner.clear', { n: e.wave }), e.perfect ? t('banner.perfect') : t('banner.bonus', { n: fmt(e.bonus) }), false, e.perfect ? 'var(--gold)' : undefined));
        this.after(2.1, () => {
          if (this.state === 'game' && this.world.phase === 'cleared') this.showUpgrade(this.world.offer(), false);
        });
        break;
      case 'gameOver':
        this.gameOver(e.result);
        break;
      case 'inkEmpty':
        this.hud.inkWarn();
        break;
      case 'tutorial':
        this.hud.hint(t('tut.' + e.step), e.step < 2 ? t('tut.skip') : undefined);
        break;
      case 'tutorialDone':
        this.save.tutorialDone = true;
        this.commit();
        this.hud.hint(null);
        break;
      default:
        break;
    }
  }

  // ───────────────────────── GİRİŞ / AYARLAR ─────────────────────────

  private onClick(ev: Event): void {
    const el = (ev.target as Element).closest('[data-a]') as HTMLElement | null;
    if (!el) return;
    const a = el.dataset.a!;
    const quiet = a === 'pick' || a === 'pause';
    if (!quiet) {
      audio.ui();
      haptics.light();
    }
    switch (a) {
      case 'play':
        this.play(false);
        break;
      case 'playDaily':
        this.play(true);
        break;
      case 'panel':
        this.openPanel(el.dataset.p as PanelName);
        break;
      case 'close':
        audio.back();
        this.closePanel();
        break;
      case 'pause':
        audio.back();
        this.pause();
        break;
      case 'resume':
        this.resume();
        break;
      case 'restart':
        this.restart();
        break;
      case 'quit':
        this.quit();
        break;
      case 'pick':
        this.pick(el.dataset.id!, el);
        break;
      case 'reroll':
        this.reroll();
        break;
      case 'again':
        this.play(this.runDaily);
        break;
      case 'menu':
        this.toMenu();
        break;
      case 'set':
        this.toggleSetting(el.dataset.k!);
        break;
      case 'setv':
        this.setValue(el.dataset.k!, el.dataset.v!);
        break;
      case 'buyWs':
        this.buyWorkshop(el.dataset.id!);
        break;
      case 'buyPen':
        this.buyPen(el.dataset.id!);
        break;
      case 'equip':
        this.equipPen(el.dataset.id!);
        break;
      case 'skipTut':
        this.save.tutorialDone = true;
        this.commit();
        this.hud.hint(null);
        this.world.skipTutorial();
        break;
      case 'tutorial':
        this.save.tutorialDone = false;
        this.commit();
        this.play(false);
        break;
      case 'reset':
        this.resetProgress();
        break;
      case 'fullscreen':
        void toggleFullscreen();
        break;
      default:
        break;
    }
  }

  private toggleSetting(k: string): void {
    const st = this.save.settings;
    if (k === 'music') {
      st.music = !st.music;
      audio.setMusic(st.music);
    } else if (k === 'sfx') {
      st.sfx = !st.sfx;
      audio.setSfx(st.sfx);
    } else if (k === 'haptics') {
      st.haptics = !st.haptics;
      haptics.enabled = st.haptics;
      if (st.haptics) haptics.medium();
    } else if (k === 'showFps') {
      st.showFps = !st.showFps;
      this.hud.setFps(st.showFps ? '' : null);
    }
    this.commit();
    if (this.state === 'paused') this.setScreen(pauseHTML(this.save));
    else if (this.panel) this.renderPanel();
  }

  private setValue(k: string, v: string): void {
    const st = this.save.settings;
    if (k === 'quality') {
      st.quality = v as Quality;
      this.view.quality = st.quality;
      this.view.adaptive = 1;
      this.view.resize();
      this.world.setQuality(QUALITY_LEVEL[st.quality]);
    } else if (k === 'lang') {
      st.lang = v as SaveData['settings']['lang'];
      setLang(st.lang);
      this.hud.build();
    }
    this.commit();
    this.renderPanel();
  }

  private buyWorkshop(id: string): void {
    const item = WORKSHOP.find((w) => w.id === id);
    if (!item) return;
    const lvl = this.save.workshop[id] ?? 0;
    if (lvl >= item.max) return;
    const cost = item.cost(lvl);
    if (this.save.coins < cost) {
      audio.inkEmpty();
      haptics.error();
      return;
    }
    this.save.coins -= cost;
    this.save.workshop[id] = lvl + 1;
    this.commit();
    audio.select();
    haptics.success();
    this.renderPanel();
  }

  private buyPen(id: string): void {
    const p = PEN_BY_ID.get(id);
    if (!p || this.save.pens.includes(id)) return;
    if (this.save.coins < p.price) {
      audio.inkEmpty();
      haptics.error();
      return;
    }
    this.save.coins -= p.price;
    this.save.pens.push(id);
    this.save.pen = id;
    this.commit();
    this.applyPenColor();
    audio.select();
    haptics.success();
    this.renderPanel();
  }

  private equipPen(id: string): void {
    const p = PEN_BY_ID.get(id);
    if (!p) return;
    const rankOk = p.rank === undefined || rankIndex(this.save.best) >= p.rank;
    if (!this.save.pens.includes(id)) {
      if (p.price > 0 || !rankOk) return;
      this.save.pens.push(id);
    }
    this.save.pen = id;
    this.commit();
    this.applyPenColor();
    this.renderPanel();
  }

  private resetProgress(): void {
    if (!this.resetArmed) {
      this.resetArmed = true;
      this.renderPanel();
      return;
    }
    const settings = this.save.settings;
    this.save = defaultSave();
    this.save.settings = settings;
    ensureMissions(this.save);
    this.commit();
    this.applyPenColor();
    this.resetArmed = false;
    this.toast('check', t('settings.resetDone'));
    this.renderPanel();
  }

  private onBack(): void {
    if (this.panel) {
      this.closePanel();
      return;
    }
    switch (this.state) {
      case 'game':
        this.pause();
        break;
      case 'paused':
        this.resume();
        break;
      case 'over':
        this.toMenu();
        break;
      case 'menu':
      case 'boot':
        exitApp();
        break;
      default:
        break;
    }
  }

  private onVisibility(): void {
    if (document.hidden) {
      if (this.state === 'game') this.pause();
      this.input.cancel();
      audio.suspend();
    } else if (this.state !== 'paused') {
      audio.resume();
    }
  }

  // ───────────────────────── KARE ─────────────────────────

  private frame(dt: number): void {
    const s = this.state;
    if (s !== 'paused' && s !== 'boot') {
      this.world.update(dt);
      this.world.render();
    } else if (s === 'boot') {
      this.world.update(dt);
      this.world.render();
    }

    if (s === 'game' || s === 'upgrade') this.hud.update(this.world.hud, dt);

    if (s === 'game' || s === 'upgrade' || s === 'over') {
      for (let i = this.timers.length - 1; i >= 0; i--) {
        const tm = this.timers[i];
        tm.t -= dt;
        if (tm.t <= 0) {
          this.timers.splice(i, 1);
          tm.fn();
        }
      }
    }

    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.bannerEl.innerHTML = '';
    }

    // oyun sonu sayaçları
    for (let i = this.countUps.length - 1; i >= 0; i--) {
      const c = this.countUps[i];
      c.t += dt;
      const p = Math.max(0, Math.min(1, c.t / c.dur));
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(c.from + (c.to - c.from) * eased);
      const txt = fmt(v);
      if (c.el.textContent !== txt) {
        c.el.textContent = txt;
        if (c.tick && p > 0) audio.coin();
      }
      if (p >= 1) this.countUps.splice(i, 1);
    }

    // FPS göstergesi + otomatik kalite düşürme
    this.fpsT += dt;
    if (this.fpsT > 0.5) {
      this.fpsT = 0;
      if (this.save.settings.showFps) this.hud.setFps(`${Math.round(this.loop.fps)} FPS · ${this.loop.workMs.toFixed(1)}ms · ${this.world.parts.n}p`);
    }
    if ((s === 'game' || s === 'menu') && !document.hidden) {
      if (this.loop.fps < 48) this.lowFpsT += dt;
      else this.lowFpsT = Math.max(0, this.lowFpsT - dt * 0.5);
      if (this.lowFpsT > 3 && this.view.adaptive > 0.6) {
        this.lowFpsT = 0;
        this.view.adaptive *= 0.85;
        this.view.resize();
        if (this.view.adaptive < 0.8) this.world.setQuality(Math.min(QUALITY_LEVEL[this.save.settings.quality], 0.7));
      }
    }
  }
}
