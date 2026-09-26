import { audio } from './core/audio';
import { haptics } from './core/haptics';
import { Input } from './core/input';
import { Loop } from './core/loop';
import { type Quality, type SaveData, defaultSave, loadSave, writeSave } from './core/storage';
import { PENS, PEN_BY_ID, type Pen } from './game/pens';
import { Rarity } from './game/upgrades';
import { type RunOptions, type RunResult, type SkillId, type SkillLoadout, World, type WorldEvent } from './game/world';
import { getLang, setLang, t } from './i18n';
import {
  WORKSHOP,
  claimGift,
  dailyInfo,
  ensureMissions,
  giftState,
  metaBonus,
  rankIndex,
  rankProgress,
  reviveCost,
  SKILLS,
  SKILL_BY_ID,
  SKILL_MAX_LV,
  settleRun,
  skillUpCost,
} from './meta/progression';
import {
  FREE_COINS,
  FREE_COINS_PER_DAY,
  INTERSTITIAL_EVERY,
  SHOP_BY_ID,
  STARTER_SKILL,
  type ShopItem,
  buyNative,
  hasNativeStore,
  initMonetization,
  loadPrices,
  ownedNonConsumables,
  showInterstitialAd,
  showRewardedAd,
} from './monetize';
import { canFullscreen, exitApp, initNative, isNative, keepAwake, toggleFullscreen } from './platform';
import { RAINBOW } from './core/math';
import { ATMOSPHERES, atmosphereIndexForWave, firstWaveOf } from './render/atmospheres';
import { BOSS_COLORS, C, METEOR_COLORS } from './render/palette';
import { Background } from './render/background';
import { Sprites } from './render/sprites';
import { View } from './render/view';
import { fmt } from './ui/format';
import { HudView } from './ui/hud';
import { icon } from './ui/icons';
import {
  type TabName,
  adHTML,
  bannerHTML,
  bootHTML,
  dailyHTML,
  giftHTML,
  menuHTML,
  missionsHTML,
  overHTML,
  pauseHTML,
  pensHTML,
  recordsHTML,
  reviveHTML,
  settingsHTML,
  shopHTML,
  skillsHTML,
  tabbarHTML,
  toastHTML,
  upgradeHTML,
  workshopHTML,
  worldsHTML,
} from './ui/screens';

export const VERSION = '1.6.0';

type State = 'boot' | 'menu' | 'game' | 'paused' | 'upgrade' | 'revive' | 'over';
type PanelName = 'daily' | 'missions' | 'workshop' | 'pens' | 'records' | 'settings' | 'worlds' | 'shop' | 'skills';

interface Timer {
  t: number;
  fn: () => void;
}

const QUALITY_LEVEL: Record<Quality, number> = { high: 1, balanced: 0.75, saver: 0.45 };
/** Dinamik çözünürlüğün alt sınırı ve cihazda saklanan anahtarı */
const RES_MIN = 0.6;
const RES_KEY = 'inkfall/res';
const TAB_PANELS: PanelName[] = ['pens', 'workshop', 'missions', 'records'];
const REVIVE_SECONDS = 9;
/** Boss türlerinin afiş rengi */
const BOSS_UI_COLORS = ['var(--crimson)', '#7FFFE0', '#8FE8FF', '#B066FF', '#FFB030'];

/** Oyunda parıltı olarak çizilebilecek bütün renkler (atlas açılışta bir kez doldurulur) */
function glowPalette(): string[] {
  const out: string[] = [...Object.values(METEOR_COLORS), ...BOSS_COLORS, ...Object.values(C), ...RAINBOW];
  for (const p of PENS) out.push(p.color, p.core);
  for (const a of ATMOSPHERES) out.push(...a.glows, a.accent, a.house.glow, ...a.veins);
  out.push('#BFF6FF', '#FF3355', '#FF5A3A', '#FF7A4F', '#FF9FEA', '#FFC870', '#FFE07A', '#FFFFFF', '#CFF6FF', '#FF8A3D', '#FFB04A', '#E8F6FF', '#E8FAFF', '#7FFFE0', '#FF7AE0');
  return out;
}

/** Tarayıcı boştayken çalıştır (animasyon karelerini bölmesin) */
function whenIdle(fn: () => void): void {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => fn(), { timeout: 600 });
  else setTimeout(fn, 60);
}

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
  private tabbarEl: HTMLElement;
  private bannerEl: HTMLElement;
  private modalEl: HTMLElement;
  private toastEl: HTMLElement;
  private adEl: HTMLElement;
  private adBusy = false;
  private adResolve: (() => void) | null = null;
  private buying = false;
  /** menü paneli ne zamandır ekranı kaplıyor (sn) */
  private coverT = 0;
  /** açılış ekranı sahneyi tamamen örterken çizim beklemede (ilk birkaç kare önbellekleri hazırlar) */
  private splashHold = true;
  private bootFrames = 0;
  private reviveCount = 0;
  private lastRunCoins = 0;
  private doubled = false;

  state: State = 'boot';
  private panel: PanelName | null = null;
  private runDaily = false;
  private timers: Timer[] = [];
  private upgradeStart = false;
  /** ileri bir dünyadan başlarken kalan hazırlık kartı seçimleri ve toplamı */
  private startPicks = 0;
  private startPickTotal = 0;
  private picking = false;
  private resetArmed = false;
  private newMissions = 0;
  private fpsT = 0;
  private lowFpsT = 0;
  // dinamik çözünürlük (tuneResolution)
  private highFpsT = 0;
  private resClock = 0;
  private lastDown = -99;
  private lastUp = -99;
  private upWait = 6;
  private settleT = 0;
  private bannerT = 0;
  private wiping = false;
  private giftShown = false;
  private thumbs: string[] = [];
  private pendingRevive = 0;
  private countUps: Array<{ el: HTMLElement; from: number; to: number; t: number; dur: number; tick: boolean }> = [];

  constructor() {
    setLang(this.save.settings.lang);
    ensureMissions(this.save);

    const canvas = document.getElementById('game') as HTMLCanvasElement;
    this.ui = document.getElementById('ui') as HTMLElement;
    this.view = new View(canvas);
    this.view.quality = this.save.settings.quality;
    // bu cihazda daha önce öğrenilmiş çözünürlük seviyesi; ilk açılışta güvenli 2x ile başlanır,
    // cihaz 60 FPS'i rahat tutuyorsa birkaç adımda ekranın gerçek yoğunluğuna (HD) çıkılır
    let learned = 0;
    try {
      learned = Number(window.localStorage.getItem(RES_KEY));
    } catch {
      /* depolama kapalı */
    }
    this.view.adaptive = learned >= RES_MIN && learned <= 1 ? learned : Math.max(RES_MIN, Math.min(1, 2 / this.view.baseDpr()));
    this.view.resize();
    this.sprites = new Sprites();
    this.bg = new Background(this.view, this.sprites);
    this.world = new World(this.view, this.sprites, this.bg, this.currentPen());
    this.world.setQuality(QUALITY_LEVEL[this.save.settings.quality]);
    this.world.onEvent = (e) => this.onWorld(e);
    // ilk düşüşte video (ya da altın) ile devam; ikincisinde yalnızca altınla (iki kat bedel)
    this.world.canRevive = (count) => count === 0 || this.save.coins >= reviveCost(this.world.wave) * (count + 1);
    this.input = new Input(canvas, this.view);
    this.input.sink = this.world;

    this.hud = new HudView(this.ui);
    this.hud.onLayout = () => this.measureHud();
    this.screenEl = this.layer('screen-layer');
    this.panelEl = this.layer('panel-layer');
    this.tabbarEl = this.layer('tabbar-layer');
    this.bannerEl = this.layer('banner-layer');
    this.modalEl = this.layer('modal-layer');
    this.toastEl = this.layer('toasts');
    this.adEl = this.layer('ad-layer');

    audio.setMusic(this.save.settings.music);
    audio.setSfx(this.save.settings.sfx);
    haptics.enabled = this.save.settings.haptics;
    this.applyPenColor();
    // menü arka planı: oyuncunun seçtiği (açık) dünya
    this.save.menuAtm = Math.min(this.save.menuAtm, this.save.maxAtm);
    if (this.save.menuAtm > 0) this.world.applyAtmosphere(this.save.menuAtm);
    // ağır görselleri menüdeyken boşta hazırla: meteorlar ve (menü başka dünyadaysa) oyunun ilk dünyası
    const warm = [...this.sprites.glowSteps(glowPalette()), ...this.sprites.warmSteps()];
    if (this.save.menuAtm > 0) warm.push(() => this.world.prebuildStep(0, 0), () => this.world.prebuildStep(0, 1));
    const runWarm = (i: number): void => {
      if (i >= warm.length) return;
      warm[i]();
      whenIdle(() => runWarm(i + 1));
    };
    window.setTimeout(() => whenIdle(() => runWarm(0)), 1500);

    this.ui.addEventListener('click', (e) => this.onClick(e));
    // Tarayıcılar sesi dokunmatikte parmak kalkınca (pointerup/touchend) izin verir
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
      document.addEventListener(ev, () => this.unlockAudio(), { capture: true });
    }
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
    // açılış ekranı ayrı bir katmanda: menü altında hazırlanırken üstte sönerek açılır
    const splash = document.createElement('section');
    splash.className = 'splash';
    splash.id = 'boot';
    splash.innerHTML = bootHTML();
    this.ui.appendChild(splash);
    this.world.startAttract();
    this.loop.start();
    const t0 = performance.now();
    let done = false;
    const go = (): void => {
      if (done) return;
      done = true;
      this.splashHold = false;
      this.toMenu();
      splash.classList.add('out');
      window.setTimeout(() => splash.remove(), 950);
    };
    // sahne, açılış bitmeden biraz önce çizilmeye başlar (açılırken ilk kare hazır olsun)
    window.setTimeout(() => (this.splashHold = false), 3000);
    window.setTimeout(go, 3550);
    // animasyonun ana kısmı görüldükten sonra dokunuş atlatır
    splash.addEventListener('pointerdown', () => {
      if (performance.now() - t0 > 1300) go();
    });
    // reklam ve satın alma altyapısı tembel başlar (açılışta ve oyun sırasında yük yok)
    void initMonetization();
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

  /** Mürekkep fırçası geçişi: ekran kapanınca fn çalışır */
  private wipe(fn: () => void): void {
    if (this.wiping) return;
    this.wiping = true;
    const el = document.createElement('div');
    el.className = 'wipe';
    el.innerHTML = '<i></i><i></i><i></i>';
    this.ui.appendChild(el);
    audio.whoosh();
    window.setTimeout(() => fn(), 470);
    window.setTimeout(() => {
      el.remove();
      this.wiping = false;
    }, 1080);
  }

  private setTabs(on: boolean): void {
    this.ui.classList.toggle('tabs-on', on);
    if (!on) this.tabbarEl.innerHTML = '';
  }

  private renderTabs(): void {
    const active: TabName = this.panel && (TAB_PANELS as string[]).includes(this.panel) ? (this.panel as TabName) : 'home';
    const canBuy = WORKSHOP.some((w) => (this.save.workshop[w.id] ?? 0) < w.max && this.save.coins >= w.cost(this.save.workshop[w.id] ?? 0));
    const had = this.tabbarEl.firstElementChild !== null;
    this.tabbarEl.innerHTML = tabbarHTML(active, this.newMissions, canBuy);
    if (had) (this.tabbarEl.firstElementChild as HTMLElement).style.animation = 'none';
  }

  toMenu(): void {
    const enter = (): void => {
      this.state = 'menu';
      this.timers = [];
      this.picking = false;
      this.hud.show(false);
      this.bannerEl.innerHTML = '';
      this.modalEl.innerHTML = '';
      void keepAwake(false);
      audio.resume();
      audio.setIntensity(0);
      if (this.world.phase !== 'attract') this.world.startAttract();
      if (this.world.atmIndex !== this.save.menuAtm) this.world.applyAtmosphere(this.save.menuAtm);
      this.setTabs(true);
      this.renderMenu();
      this.renderTabs();
      this.prepareThumbs();
      // günlük hediye: oturumda ilk menüye girişte kendiliğinden aç
      if (!this.giftShown && giftState(this.save).ready) {
        this.giftShown = true;
        window.setTimeout(() => {
          if (this.state === 'menu' && !this.panel) this.openGift();
        }, 700);
      }
    };
    if (this.state === 'boot') enter();
    else this.wipe(enter);
  }

  private renderMenu(): void {
    const idx = this.world.atmIndex;
    this.setScreen(
      menuHTML({
        save: this.save,
        daily: dailyInfo(),
        gift: giftState(this.save),
        worldName: t('atm.' + ATMOSPHERES[idx].id),
        worldIndex: idx,
      }),
    );
  }

  /** Dünya önizlemelerini boşta, tek tek hazırla (menü akıcı kalsın) */
  private prepareThumbs(): void {
    const next = (i: number): void => {
      if (i >= ATMOSPHERES.length || this.state !== 'menu') return;
      if (!this.thumbs[i]) this.thumbs[i] = this.bg.thumb(ATMOSPHERES[i]);
      window.setTimeout(() => next(i + 1), 250);
    };
    window.setTimeout(() => next(0), 900);
  }

  private openPanel(name: PanelName): void {
    const wasTab = this.panel && (TAB_PANELS as string[]).includes(this.panel);
    this.panel = name;
    this.resetArmed = false;
    if (name === 'missions') this.newMissions = 0;
    if (name === 'worlds') {
      for (let i = 0; i < ATMOSPHERES.length; i++) if (!this.thumbs[i]) this.thumbs[i] = this.bg.thumb(ATMOSPHERES[i]);
    }
    this.renderPanel();
    // sekmeler arası geçişte yandan kayarak gelsin
    if (wasTab && (TAB_PANELS as string[]).includes(name)) this.panelEl.querySelector('.panel')?.classList.add('slide');
    if (this.state === 'menu') this.renderTabs();
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
      case 'worlds':
        html = worldsHTML(s, this.thumbs, this.save.menuAtm);
        break;
      case 'shop':
        html = shopHTML(s, isNative && hasNativeStore());
        break;
      case 'skills':
        html = skillsHTML(s);
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
    if (this.state === 'menu') {
      this.renderMenu();
      this.renderTabs();
    }
  }

  private onTab(name: TabName): void {
    if (name === 'home') {
      this.closePanel();
      return;
    }
    if (this.panel === name) return;
    this.openPanel(name);
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

  // ───────────────────────── HEDİYE ─────────────────────────

  private openGift(): void {
    this.modalEl.innerHTML = giftHTML(giftState(this.save), this.save.noAds);
  }

  private closeModal(): void {
    const m = this.modalEl.querySelector('.modal');
    if (!m) return;
    m.classList.add('out');
    window.setTimeout(() => (this.modalEl.innerHTML = ''), 220);
  }

  private async claimGift(btn: HTMLElement, double = false): Promise<void> {
    if (double) {
      if (!giftState(this.save).ready || !(await this.watchAd())) return;
    }
    let reward = claimGift(this.save);
    if (!reward) return;
    if (double) {
      this.save.coins += reward;
      reward *= 2;
    }
    this.commit();
    audio.record();
    haptics.success();
    const from = (this.modalEl.querySelector('.gday.today') as HTMLElement | null) ?? btn;
    this.flyCoins(from, reward);
    this.modalEl.innerHTML = giftHTML(giftState(this.save), this.save.noAds);
    this.modalEl.querySelector('.modal')?.setAttribute('style', 'animation:none');
    this.modalEl.querySelector('.modal-card')?.setAttribute('style', 'animation:none');
    window.setTimeout(() => this.closeModal(), 1500);
    // ana ekrandaki hediye butonu artık hazır değil
    const fab = this.screenEl.querySelector('.fab.gift');
    fab?.classList.remove('ready');
    fab?.querySelector('.dot')?.remove();
  }

  /** Altınlar kaynaktan üstteki kasaya uçar */
  private flyCoins(from: HTMLElement, amount: number): void {
    const target = this.screenEl.querySelector('.currency') as HTMLElement | null;
    const counter = this.screenEl.querySelector('#m-coins') as HTMLElement | null;
    const a = from.getBoundingClientRect();
    const b = (target ?? from).getBoundingClientRect();
    const n = 10;
    const start = this.save.coins - amount;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div');
      c.className = 'fly-coin';
      c.innerHTML = icon('coin');
      const x0 = a.left + a.width / 2 + (Math.random() - 0.5) * 60;
      const y0 = a.top + a.height / 2 + (Math.random() - 0.5) * 30;
      c.style.left = `${x0}px`;
      c.style.top = `${y0}px`;
      c.style.transitionDelay = `${i * 45}ms, ${600 + i * 45}ms`;
      document.body.appendChild(c);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          c.style.transform = `translate(${b.left + 22 - x0}px, ${b.top + b.height / 2 - y0}px) scale(0.6)`;
          c.style.opacity = '0';
        }),
      );
      window.setTimeout(() => {
        audio.coin();
        if (counter) {
          counter.textContent = fmt(start + Math.round((amount * (i + 1)) / n));
          counter.classList.remove('bump');
          void counter.offsetWidth;
          counter.classList.add('bump');
        }
      }, 760 + i * 45);
      window.setTimeout(() => c.remove(), 1400 + i * 45);
    }
  }

  // ───────────────────────── OYUN AKIŞI ─────────────────────────

  play(daily: boolean): void {
    if (this.wiping || this.adBusy) return;
    // sırası gelmiş (ama henüz gösterilmemiş) geçiş reklamı yeni oyundan önce
    if (!this.save.noAds && (this.save.adRuns ?? 0) >= INTERSTITIAL_EVERY) {
      void this.showInterstitial().then(() => this.play(daily));
      return;
    }
    this.wipe(() => this.startRun(daily));
  }

  private startRun(daily: boolean): void {
    this.panel = null;
    this.panelEl.innerHTML = '';
    this.modalEl.innerHTML = '';
    this.setTabs(false);
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
      skills: this.loadout(),
      // seçilen dünyanın ilk dalgasından başla (günlük meydan okuma ve eğitim hep 1. dalga)
      startWave: daily ? 1 : firstWaveOf(Math.min(this.save.menuAtm, this.save.maxAtm)),
    };
    this.hud.reset(this.save.best);
    this.hud.setSkills(opts.skills);
    this.hud.showSkill(!opts.tutorial);
    this.world.startRun(opts);
    this.hud.setBossWave(false);
    this.hud.show(true);
    this.setScreen('');
    this.bannerEl.innerHTML = '';
    this.state = 'game';
    this.measureHud();
    void keepAwake(true);
    audio.resume();
    if (this.world.phase === 'cleared') {
      // ileri dünyadan başlarken atlanan dalgaların yerine birkaç hazırlık kartı (en fazla 5)
      const chapter = atmosphereIndexForWave(this.world.wave + 1);
      const bonus = this.world.wave > 0 ? Math.min(5, chapter + 1) : 0;
      const hattat = opts.meta.startRarity >= 1 ? 1 : 0;
      this.startPickTotal = bonus + hattat;
      this.startPicks = this.startPickTotal - 1;
      if (hattat) this.showUpgrade(this.world.offerStart(opts.meta.startRarity >= 2 ? Rarity.Epic : Rarity.Rare), true);
      else this.showUpgrade(this.world.offer(), true);
    }
  }

  private showUpgrade(ids: string[], start: boolean): void {
    this.state = 'upgrade';
    this.upgradeStart = start;
    this.picking = false;
    this.input.cancel();
    const sub = !start
      ? t('up.sub', { n: this.world.wave + 1 })
      : this.startPickTotal > 1
        ? t('up.subChapter', {
            w: t('atm.' + ATMOSPHERES[atmosphereIndexForWave(this.world.wave + 1)].id),
            i: this.startPickTotal - this.startPicks,
            n: this.startPickTotal,
          })
        : t('up.subStart');
    this.setScreen(upgradeHTML(ids, this.world.levels, sub, this.world.rerolls));
    audio.whoosh();
    // kartlar yerleştikten sonra sıradaki dünyayı boşta, parça parça hazırla (geçişte takılma olmasın)
    const nx = this.world.atmIndex + 1;
    if (nx < ATMOSPHERES.length) {
      const step = (i: number): void => {
        if (this.state !== 'upgrade') return;
        if (this.world.prebuildStep(nx, i)) whenIdle(() => step(i + 1));
      };
      window.setTimeout(() => whenIdle(() => step(0)), 1000);
    }
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
      if (this.upgradeStart && this.startPicks > 0) {
        // sıradaki hazırlık kartı
        this.startPicks--;
        this.picking = false;
        this.showUpgrade(this.world.offer(), true);
        return;
      }
      this.startPicks = 0;
      this.setScreen('');
      this.state = 'game';
      this.picking = false;
      this.world.nextWave();
    }, 480);
  }

  private reroll(): void {
    if (this.world.rerolls <= 0 || this.picking) return;
    this.world.rerolls--;
    // Hattat kartı yalnızca ilk hazırlık seçiminde; sonrakiler normal teklif
    const hattatPick = this.upgradeStart && metaBonus(this.save).startRarity >= 1 && this.startPicks === this.startPickTotal - 1;
    const ids = hattatPick ? this.world.offerStart((this.save.workshop.start ?? 0) >= 2 ? Rarity.Epic : Rarity.Rare) : this.world.offer();
    this.showUpgrade(ids, this.upgradeStart);
  }

  pause(): void {
    if (this.state !== 'game' || this.world.transitioning) return;
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
    // yarıda yeniden başlatmak da bir oyun sayılır (reklam sırası play() içinde)
    if (this.world.phase !== 'over') this.countGame();
    this.settleSilently();
    this.play(this.runDaily);
  }

  private quit(): void {
    const due = this.world.phase !== 'over' && this.world.phase !== 'attract' && this.countGame();
    this.settleSilently();
    this.toMenu();
    // menüye dönerken sıra geldiyse geçiş reklamı
    if (due) window.setTimeout(() => void this.showInterstitial(), 900);
  }

  // ── devam: ödüllü video (turda bir kez) ya da altın
  private offerRevive(count: number): void {
    this.state = 'revive';
    this.reviveCount = count;
    this.pendingRevive = reviveCost(this.world.wave) * (count + 1);
    this.input.cancel();
    this.setScreen(
      reviveHTML({ video: count === 0, noAds: this.save.noAds, cost: this.pendingRevive, bank: this.save.coins, seconds: REVIVE_SECONDS }),
    );
    this.timers = [];
    this.after(REVIVE_SECONDS, () => {
      if (this.state === 'revive' && !this.adBusy) this.giveUp();
    });
  }

  private async reviveVideo(): Promise<void> {
    if (this.state !== 'revive' || this.adBusy) return;
    // video oynarken geri sayım durur
    this.timers = [];
    const ok = await this.watchAd();
    if (this.state !== 'revive') return;
    if (!ok) {
      this.offerRevive(this.reviveCount);
      return;
    }
    this.setScreen('');
    this.state = 'game';
    this.world.revive();
  }

  // ───────────────────────── REKLAM & MAĞAZA ─────────────────────────

  /** Ödüllü video: reklamsız pakette ödül anında, yerelde AdMob, web'de demo */
  private async watchAd(): Promise<boolean> {
    if (this.adBusy) return false;
    if (this.save.noAds) {
      this.toast('noads', t('toast.noAds'));
      return true;
    }
    this.adBusy = true;
    try {
      if (isNative) {
        this.toast('video', t('toast.adLoading'));
        audio.suspend();
        const r = await showRewardedAd();
        audio.resume();
        if (r === 'rewarded') return true;
        this.toast('video', r === 'unavailable' ? t('toast.adFail') : t('toast.adSkip'));
        return false;
      }
      return await this.demoAd();
    } finally {
      this.adBusy = false;
    }
  }

  /** Web/önizleme: gerçek reklam yerine 5 sn'lik temsili video (inter: araya giren reklam) */
  private demoAd(inter = false): Promise<boolean> {
    return new Promise((resolve) => {
      const secs = 5;
      this.adEl.innerHTML = adHTML(secs, inter);
      let left = secs;
      const count = this.adEl.querySelector('#ad-count') as HTMLElement | null;
      const iv = window.setInterval(() => {
        left--;
        if (count) count.textContent = String(Math.max(0, left));
        if (left <= 0) {
          window.clearInterval(iv);
          const close = this.adEl.querySelector('#ad-close') as HTMLElement | null;
          if (close) close.hidden = false;
          if (count) count.innerHTML = icon('check');
        }
      }, 1000);
      this.adResolve = () => {
        window.clearInterval(iv);
        this.adResolve = null;
        this.adEl.innerHTML = '';
        resolve(true);
      };
    });
  }

  /** Bir oyun bitti: sayaç artar; sıra geldiyse true (Reklamsız pakette ve eğitimde hiç) */
  private countGame(): boolean {
    if (this.save.noAds || this.world.opts?.tutorial) return false;
    this.save.adRuns = (this.save.adRuns ?? 0) + 1;
    this.commit();
    return this.save.adRuns >= INTERSTITIAL_EVERY;
  }

  /** Zorunlu geçiş reklamı (her INTERSTITIAL_EVERY oyunda bir) */
  private async showInterstitial(): Promise<void> {
    if (this.save.noAds || this.adBusy || (this.save.adRuns ?? 0) < INTERSTITIAL_EVERY) return;
    this.save.adRuns = 0;
    this.commit();
    this.adBusy = true;
    this.input.cancel();
    try {
      if (isNative) {
        audio.suspend();
        await showInterstitialAd();
        audio.resume();
      } else {
        await this.demoAd(true);
      }
    } finally {
      this.adBusy = false;
    }
  }

  private async buy(id: string): Promise<void> {
    const item = SHOP_BY_ID.get(id);
    if (!item || this.buying) return;
    if ((item.kind === 'starter' && this.save.starter) || (item.kind === 'noads' && this.save.noAds)) return;
    this.buying = true;
    try {
      if (isNative) {
        if (!hasNativeStore()) {
          this.toast('bag', t('toast.storeOff'));
          return;
        }
        const r = await buyNative(item);
        if (r !== 'ok') {
          if (r === 'error') this.toast('bag', t('toast.buyFail'));
          return;
        }
      } else {
        this.toast('bag', t('toast.demoBuy'));
      }
      this.grant(item);
    } finally {
      this.buying = false;
    }
  }

  private grant(item: ShopItem): void {
    this.save.coins += item.coins;
    if (item.kind === 'starter') {
      this.save.starter = true;
      if (!this.save.skills.includes(STARTER_SKILL)) this.save.skills.push(STARTER_SKILL);
    }
    if (item.kind === 'noads') this.save.noAds = true;
    this.commit();
    audio.purchase();
    haptics.success();
    if (item.kind === 'noads') this.toast('noads', t('toast.noAdsOn'));
    else this.toast('coin', t('toast.bought', { n: fmt(item.coins) }));
    this.refreshCoins();
  }

  /** Kalıcı ürünleri geri yükle (altın yeniden verilmez) */
  private async restore(silent: boolean): Promise<void> {
    const owned = await ownedNonConsumables();
    let n = 0;
    for (const id of owned) {
      const it = SHOP_BY_ID.get(id);
      if (it?.kind === 'noads' && !this.save.noAds) {
        this.save.noAds = true;
        n++;
      }
      if (it?.kind === 'starter' && !this.save.starter) {
        this.save.starter = true;
        if (!this.save.skills.includes(STARTER_SKILL)) this.save.skills.push(STARTER_SKILL);
        n++;
      }
    }
    if (n) this.commit();
    if (!silent) this.toast('check', n ? t('toast.restored') : t('toast.nothing'));
    if (n || !silent) this.refreshCoins();
  }

  private async freeCoins(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    if (this.save.adCoins.date !== today) this.save.adCoins = { date: today, n: 0 };
    if (this.save.adCoins.n >= FREE_COINS_PER_DAY) {
      haptics.error();
      return;
    }
    if (!(await this.watchAd())) return;
    this.save.adCoins.n++;
    this.save.coins += FREE_COINS;
    this.commit();
    audio.purchase();
    haptics.success();
    this.toast('coin', t('toast.bought', { n: fmt(FREE_COINS) }));
    this.refreshCoins();
  }

  /** Oyun sonu: video izle, kazanılan altınlar iki katına çıksın */
  private async doubleCoins(btn: HTMLElement): Promise<void> {
    if (this.doubled || this.lastRunCoins <= 0 || this.state !== 'over') return;
    if (!(await this.watchAd())) return;
    if (this.doubled) return;
    this.doubled = true;
    this.save.coins += this.lastRunCoins;
    this.commit();
    audio.purchase();
    haptics.success();
    btn.classList.add('done');
    btn.setAttribute('disabled', '');
    const coinEl = this.screenEl.querySelector('#o-coins') as HTMLElement | null;
    if (coinEl) this.countUps.push({ el: coinEl, from: this.lastRunCoins, to: this.lastRunCoins * 2, t: 0, dur: 0.9, tick: true });
  }

  /** Açık panel ve menüdeki altın sayısını tazele */
  private refreshCoins(): void {
    if (this.panel) this.renderPanel();
    for (const el of this.ui.querySelectorAll('.coin-count, #m-coins')) el.textContent = fmt(this.save.coins);
  }

  private storePrepared = false;

  /** Mağaza ilk açıldığında: Play bağlantısı, yerel fiyatlar ve kalıcı ürünlerin geri yüklenmesi */
  private prepareStore(): void {
    if (!isNative || this.storePrepared) return;
    this.storePrepared = true;
    void (async () => {
      await loadPrices();
      await this.restore(true);
      if (this.panel === 'shop') this.renderPanel();
    })();
  }

  /** Açık yeteneklerin bu turdaki hali (seviyeye göre bekleme ve güç) */
  private loadout(): SkillLoadout[] {
    return SKILLS.filter((k) => this.save.skills.includes(k.id)).map((k) => {
      const lv = Math.max(1, Math.min(SKILL_MAX_LV, this.save.skillLv[k.id] ?? 1));
      return { id: k.id as SkillId, shape: k.shape, lv, cd: k.cd[lv - 1], power: k.power[lv - 1], color: k.color };
    });
  }

  /** Yetenek ağacı: aç (seviye 1) ya da seviye atlat */
  private buySkill(id: string): void {
    const k = SKILL_BY_ID.get(id);
    if (!k) return;
    const owned = this.save.skills.includes(id);
    const lv = owned ? Math.max(1, this.save.skillLv[id] ?? 1) : 0;
    const cost = owned ? skillUpCost(k, lv) : k.price;
    if (cost < 0) return;
    if (this.save.coins < cost) {
      audio.inkEmpty();
      haptics.error();
      this.toast('coin', t('toast.needCoins'));
      return;
    }
    this.save.coins -= cost;
    if (!owned) this.save.skills.push(id);
    this.save.skillLv[id] = lv + 1;
    this.commit();
    audio.select();
    haptics.success();
    const name = t('skill.' + id);
    if (owned) this.toast('star', t('toast.skillUp', { name, n: lv + 1 }));
    else this.toast('star', t('toast.skillNew', { name, shape: t('shape.' + k.shape).toLocaleLowerCase(this.locale()) }));
    this.renderPanel();
    this.panelEl.querySelector(`[data-sk="${id}"]`)?.classList.add('lvup');
  }

  private locale(): string {
    return getLang() === 'tr' ? 'tr-TR' : 'en-US';
  }

  private doRevive(): void {
    if (this.state !== 'revive') return;
    const cost = this.pendingRevive;
    if (this.save.coins < cost) return;
    this.save.coins -= cost;
    this.commit();
    this.setScreen('');
    this.state = 'game';
    this.world.revive();
  }

  private giveUp(): void {
    if (this.state !== 'revive') return;
    this.setScreen('');
    this.state = 'game';
    this.world.giveUp();
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
    this.lastRunCoins = st.coins;
    this.doubled = false;
    this.setScreen(overHTML(r, st, this.save.best, today, true, this.save.noAds));
    // her 5 oyunda bir: skor ekranı görüldükten kısa süre sonra zorunlu geçiş reklamı
    if (this.countGame()) this.after(1.2, () => void this.showInterstitial());
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
        if (e.boss) {
          const name = t('boss.' + e.bossType);
          this.hud.setBossName(name);
          this.showBanner(name, t('boss.' + e.bossType + '.d'), true, BOSS_UI_COLORS[e.bossType] ?? 'var(--crimson)');
        }
        else this.showBanner(t('banner.wave', { n: e.wave }), e.wave === 1 ? t('banner.ready') : '', false);
        break;
      case 'waveClear': {
        this.after(0.8, () =>
          this.showBanner(
            t('banner.clear', { n: e.wave }),
            e.perfect ? t('banner.perfect') : t('banner.bonus', { n: fmt(e.bonus) }),
            false,
            e.perfect ? 'var(--gold)' : undefined,
          ),
        );
        const nextAtm = atmosphereIndexForWave(e.wave + 1);
        if (nextAtm !== this.world.atmIndex) {
          // bölüm sonu: sahne tamburu döner, yeni dünya açılır
          this.after(2.2, () => {
            if (this.state === 'game' && this.world.phase === 'cleared') {
              this.bannerEl.innerHTML = '';
              this.world.beginTransition(nextAtm);
            }
          });
        } else {
          this.after(2.1, () => {
            if (this.state === 'game' && this.world.phase === 'cleared') this.showUpgrade(this.world.offer(), false);
          });
        }
        break;
      }
      case 'atmosphere': {
        if (this.state === 'menu') {
          this.renderMenu();
          break;
        }
        const a = ATMOSPHERES[e.index];
        const name = t('atm.' + a.id);
        let sub = t('banner.chapter', { n: e.index + 1 });
        if (e.index > this.save.maxAtm) {
          this.save.maxAtm = e.index;
          this.commit();
          sub += ' · ' + t('banner.newWorld');
        }
        this.showBanner(name, sub, false, a.accent);
        this.bannerT = 1.8;
        this.after(1.8, () => {
          if (this.state === 'game' && this.world.phase === 'cleared') this.showUpgrade(this.world.offer(), false);
        });
        break;
      }
      case 'revive':
        this.offerRevive(e.count);
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
      case 'skillReady': {
        this.hud.bounceSkill(e.id);
        // ilk kez: şeklin nasıl çizileceği ekranda gösterilir (her yetenek için bir kez)
        if (e.first && !this.save.skillHints.includes(e.id)) {
          this.save.skillHints.push(e.id);
          this.commit();
          this.world.showShapeHint(e.id);
          const shape = t('shape.' + e.shape).toLocaleUpperCase(this.locale());
          this.hud.hint(t('skill.readyHint', { name: t('skill.' + e.id), shape }));
          this.after(3.2, () => this.hud.hint(null));
        }
        break;
      }
      case 'tutorialDone':
        this.hud.showSkill(true);
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
    const quiet = a === 'pick' || a === 'pause' || a === 'claimGift' || a === 'skillHint';
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
      case 'tab':
        this.onTab(el.dataset.p as TabName);
        break;
      case 'close':
        audio.back();
        this.closePanel();
        break;
      case 'gift':
        this.openGift();
        break;
      case 'claimGift':
        void this.claimGift(el);
        break;
      case 'claimGift2x':
        void this.claimGift(el, true);
        break;
      case 'reviveVideo':
        void this.reviveVideo();
        break;
      case 'adClose':
        this.adResolve?.();
        break;
      case 'shop':
        this.openPanel('shop');
        this.prepareStore();
        break;
      case 'buy':
        void this.buy(el.dataset.id!);
        break;
      case 'restore':
        void this.restore(false);
        break;
      case 'freeCoins':
        void this.freeCoins();
        break;
      case 'double':
        void this.doubleCoins(el);
        break;
      case 'skillHint':
        if (this.state === 'game') {
          this.world.showShapeHint(el.dataset.id as SkillId);
          haptics.light();
        }
        break;
      case 'buySkill':
        this.buySkill(el.dataset.id!);
        break;
      case 'closeModal':
        this.closeModal();
        if (this.state === 'menu') this.renderMenu();
        break;
      case 'world':
        this.pickWorld(Number(el.dataset.i));
        break;
      case 'revive':
        this.doRevive();
        break;
      case 'giveup':
        this.giveUp();
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
        this.hud.showSkill(true);
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

  /** Dünyalar: açık bir dünyayı menü arka planı yap (tambur dönerek) */
  private pickWorld(i: number): void {
    if (i > this.save.maxAtm) {
      audio.inkEmpty();
      haptics.error();
      return;
    }
    if (i === this.save.menuAtm) return;
    this.save.menuAtm = i;
    this.commit();
    this.closePanel();
    if (!this.world.beginTransition(i)) this.world.applyAtmosphere(i);
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
      // yeni kalitede de güvenli yoğunluktan başla; akıcıysa kendiliğinden yükselir
      this.view.adaptive = Math.max(RES_MIN, Math.min(1, 2 / this.view.baseDpr()));
      this.view.resize();
      this.world.setQuality(QUALITY_LEVEL[st.quality]);
    } else if (k === 'lang') {
      st.lang = v as SaveData['settings']['lang'];
      setLang(st.lang);
      this.hud.build();
      this.thumbs = [];
      if (this.state === 'menu') {
        this.renderMenu();
        this.renderTabs();
      }
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
    this.renderTabs();
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
    this.renderTabs();
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
    this.world.applyAtmosphere(0);
    this.toast('check', t('settings.resetDone'));
    this.renderPanel();
  }

  private onBack(): void {
    if (this.modalEl.querySelector('.modal')) {
      if (this.state === 'revive') this.giveUp();
      else this.closeModal();
      return;
    }
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
      case 'revive':
        this.giveUp();
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

  // ───────────────────────── DİNAMİK ÇÖZÜNÜRLÜK ─────────────────────────

  /**
   * Akıcılık önceliği: kare hızı 55'in altına düşerse tuval yoğunluğu adım adım iner (en fazla
   * %40); kare hızı uzun süre tam kalırsa yavaşça geri çıkar (HD'ye döner). Yukarı-aşağı salınımı
   * önlemek için bir çıkıştan hemen sonra yeniden düşülürse sonraki çıkış denemesi daha geç yapılır.
   * Öğrenilen seviye cihazda saklanır: sonraki açılışta doğrudan uygun çözünürlükten başlar.
   */
  private tuneResolution(dt: number): void {
    this.resClock += dt;
    // durum değişiminden hemen sonraki yükleme dalgalanmalarını sayma
    if (this.settleT > 0) {
      this.settleT -= dt;
      return;
    }
    const fps = this.loop.fps;
    const v = this.view;
    if (fps < 55) {
      this.lowFpsT += dt * (fps < 40 ? 2 : 1);
      this.highFpsT = 0;
    } else {
      this.lowFpsT = Math.max(0, this.lowFpsT - dt * 0.5);
      if (fps >= 58) this.highFpsT += dt;
    }
    if (this.lowFpsT > 1.5 && v.adaptive > RES_MIN) {
      const was = v.adaptive;
      v.adaptive = Math.max(RES_MIN, v.adaptive * (fps < 40 ? 0.8 : 0.9));
      this.lowFpsT = 0;
      this.highFpsT = 0;
      // yeni çıkılmışken tekrar düştüyse bu seviye sınırda: çıkışı daha seyrek dene
      if (this.resClock - this.lastUp < 10) this.upWait = Math.min(90, this.upWait * 2);
      this.lastDown = this.resClock;
      if (Math.abs(was - v.adaptive) > 0.001) this.applyResolution();
    } else if (this.highFpsT > this.upWait && v.adaptive < 1 && this.resClock - this.lastDown > 8) {
      v.adaptive = Math.min(1, v.adaptive * 1.07);
      this.highFpsT = 0;
      this.lastUp = this.resClock;
      this.applyResolution();
    }
  }

  private applyResolution(): void {
    const v = this.view;
    v.resize(false);
    // çok düşük yoğunlukta parçacık bütçesi de hafifler (görüntü aynı, sayı biraz azalır)
    this.world.setQuality(v.adaptive < 0.75 ? Math.min(QUALITY_LEVEL[this.save.settings.quality], 0.7) : QUALITY_LEVEL[this.save.settings.quality]);
    this.settleT = 0.6;
    try {
      window.localStorage.setItem(RES_KEY, v.adaptive.toFixed(3));
    } catch {
      /* depolama kapalı */
    }
  }

  // ───────────────────────── KARE ─────────────────────────

  private frame(dt: number): void {
    const s = this.state;
    // menüde opak bir panel ekranı tamamen kapladıysa arkadaki sahne görünmez:
    // simülasyon ve çizim durur (GPU boşa çalışmaz), panel kapanınca kaldığı yerden sürer
    this.coverT = this.panel && s === 'menu' ? this.coverT + dt : 0;
    const covered =
      (this.coverT > 0.45 && !this.world.transitioning) || (s === 'boot' && this.splashHold && this.bootFrames++ > 3);
    if (s !== 'paused' && !covered) {
      this.world.update(dt);
      this.world.render();
    }

    if (s === 'game' || s === 'upgrade' || s === 'revive') this.hud.update(this.world.hud, dt);

    if (s === 'game' || s === 'upgrade' || s === 'over' || s === 'revive') {
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
      if (this.save.settings.showFps)
        this.hud.setFps(`${Math.round(this.loop.fps)} FPS · ${this.view.dpr.toFixed(2)}x · ${this.loop.workMs.toFixed(1)}ms · ${this.world.parts.n}p`);
    }
    if ((s === 'game' || s === 'menu') && !document.hidden && !this.world.transitioning && !covered && !this.adBusy) this.tuneResolution(dt);
  }
}
