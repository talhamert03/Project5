import { audio as realAudio } from '../core/audio';
import { haptics as realHaptics } from '../core/haptics';
import type { PointerSink } from '../core/input';
import { RAINBOW, TAU, clamp, damp, easeInOutCubic } from '../core/math';
import { Rng, fx } from '../core/rng';
import { t } from '../i18n';
import { ATMOSPHERES, type Atmosphere } from '../render/atmospheres';
import type { Background } from '../render/background';
import { BOSS_COLORS, C, METEOR_COLORS } from '../render/palette';
import { Particles, Shape } from '../render/particles';
import { blit, type Sprites } from '../render/sprites';
import { WORLD_W, type View } from '../render/view';
import { BLOCKS, BLOCK_W, City } from './city';
import { Director, type DirectorMods } from './director';
import { Effects } from './effects';
import { type GestureResult, type Shape as GestureShape, recognize, shapeGuide } from './gesture';
import { type InkLine, LineManager } from './lines';
import { BT, KINDS, MK, Meteor, renderBossRing, renderMeteors, shieldPos } from './meteors';
import type { Pen } from './pens';
import { type Stats, UPGRADES, UPGRADE_BY_ID, baseStats, Rarity } from './upgrades';

export interface DailyMod {
  id: string;
  speed?: number;
  golden?: number;
  size?: number;
  chaos?: boolean;
  scoreMult?: number;
  lineLife?: number;
  maxLines?: number;
  startUpgrade?: string;
}

export interface MetaBonus {
  maxInk: number;
  regenMult: number;
  domeStart: number;
  coinMult: number;
  goldenBonus: number;
  rerolls: number;
  startRarity: number;
}

export interface RunOptions {
  daily: boolean;
  seed: number;
  mod: DailyMod | null;
  meta: MetaBonus;
  tutorial: boolean;
  best: number;
  pen: Pen;
  /** açık yetenekler: her biri şekli çizilince atılır */
  skills: SkillLoadout[];
}

export type SkillId = 'nova' | 'warp' | 'aegis' | 'starfall';

export interface SkillLoadout {
  id: SkillId;
  shape: GestureShape;
  lv: number;
  /** bekleme süresi (sn) */
  cd: number;
  /** süre / sayı / hasar */
  power: number;
  color: string;
}

export interface SkillSlot extends SkillLoadout {
  /** kalan bekleme (sn); 0 = hazır */
  left: number;
}

/** Düşman öldürmek/sektirmek bekleme süresini kısaltır (öldürme başına sn) */
const SKILL_KILL_SEC = 0.3;
/** Yetenek hazırken mürekkep bitse de şekil çizmeye devam edilebilecek en uzun yol */
const OVERDRAW_LEN = 1100;

/**
 * Menü arka planındaki demo (attract) yalnızca bir video gibi oynar: titreşim ve efekt sesi
 * çalışmaz. Müzikle ilgili çağrılar (ton, yoğunluk) geçer. Dünya bu kontrolü kurar.
 */
let isQuiet: () => boolean = () => false;
const noop = (): void => undefined;
function quietProxy<T extends object>(obj: T, keep: Set<string>): T {
  const bound = new Map<PropertyKey, unknown>();
  return new Proxy(obj, {
    get(target, prop) {
      const v = Reflect.get(target, prop);
      if (typeof v !== 'function') return v;
      if (!keep.has(prop as string) && isQuiet()) return noop;
      let b = bound.get(prop);
      if (!b) {
        b = (v as (...args: unknown[]) => unknown).bind(target);
        bound.set(prop, b);
      }
      return b;
    },
  });
}
const audio = quietProxy(realAudio, new Set(['setScene', 'setIntensity', 'setSlowmo', 'setDrawing']));
const haptics = quietProxy(realHaptics, new Set());

export interface RunResult {
  score: number;
  wave: number;
  kills: number;
  deflects: number;
  maxCombo: number;
  bossKills: number;
  golden: number;
  coins: number;
  time: number;
  perfectWaves: number;
  maxChain: number;
  maxLineDeflect: number;
  daily: boolean;
  upgrades: string[];
}

export type WorldEvent =
  | { type: 'wave'; wave: number; boss: boolean; bossType: number }
  | { type: 'waveClear'; wave: number; bonus: number; perfect: boolean }
  | { type: 'bossDown' }
  | { type: 'record' }
  | { type: 'combo'; n: number }
  | { type: 'inkEmpty' }
  | { type: 'hit'; left: number }
  | { type: 'gameOver'; result: RunResult }
  | { type: 'tutorial'; step: number }
  | { type: 'tutorialDone' }
  | { type: 'phoenix' }
  | { type: 'atmosphere'; index: number }
  | { type: 'revive'; count: number }
  | { type: 'nearMiss' }
  | { type: 'skillReady'; id: SkillId; shape: GestureShape; first: boolean }
  | { type: 'skill'; id: SkillId }
  | { type: 'skillWait'; id: SkillId; left: number };

export type Phase = 'attract' | 'tutorial' | 'intro' | 'play' | 'cleared' | 'transition' | 'revive' | 'dying' | 'over';

interface DrumTransition {
  t: number;
  dur: number;
  to: number;
  stage: 0 | 1;
  back: Phase;
  old: HTMLCanvasElement;
  neu: HTMLCanvasElement;
  lines: Float32Array;
}

export interface Hud {
  score: number;
  best: number;
  wave: number;
  ink: number;
  maxInk: number;
  lines: number;
  maxLines: number;
  combo: number;
  mult: number;
  comboT: number;
  bossHp: number;
  coins: number;
  /** açık yetenekler ve bekleme süreleri */
  skills: SkillSlot[];
}

interface Pending {
  kind: 0 | 1;
  x: number;
  y: number;
  r: number;
  depth: number;
  delay: number;
  target: Meteor | null;
}

interface BlackHole {
  x: number;
  y: number;
  t: number;
  life: number;
}

const COMBO_WINDOW = 2.6;
const MILESTONES = [10, 25, 50, 75, 100, 150, 200];
const COMBO_WORD_COLORS = [C.turkuaz, C.gold, C.rose, C.violet, '#FFFFFF', C.gold, C.turkuaz];

/**
 * Oyun dünyası: tüm simülasyon ve çizim burada. UI'dan bağımsızdır, olaylarla (onEvent) haberleşir.
 */
export class World implements PointerSink {
  readonly parts: Particles;
  readonly fx: Effects;
  readonly city: City;
  readonly lines: LineManager;
  readonly meteors: Meteor[] = [];
  director: Director;
  stats: Stats = baseStats();
  levels: Record<string, number> = {};
  phase: Phase = 'attract';
  onEvent: (e: WorldEvent) => void = () => undefined;

  pen!: Pen;
  opts: RunOptions | null = null;
  runRng = new Rng(1);

  // oyun durumu
  score = 0;
  ink = 100;
  combo = 0;
  comboT = 0;
  mult = 1;
  wave = 0;
  kills = 0;
  deflects = 0;
  maxCombo = 0;
  bossKills = 0;
  golden = 0;
  coins = 0;
  runTime = 0;
  perfectWaves = 0;
  maxChain = 0;
  maxLineDeflect = 0;
  waveDamaged = false;
  recordBroken = false;
  phoenixUsed = 0;
  rerolls = 0;
  upgradesTaken: string[] = [];

  // zaman
  timeScale = 1;
  hitstop = 0;
  private slowOverride = 0;
  private slowOverrideT = 0;
  realT = 0;
  private introT = 0;
  private dyingT = 0;

  // çizim
  drawing = false;
  private penSpeed = 0;
  private inkFlash = 0;

  private pending: Pending[] = [];
  private holes: BlackHole[] = [];
  private chainCount = 0;
  private chainT = 0;
  private chainX = 360;
  private chainY = 400;
  /** sahnedeki bosslar (İkiz Yıldızlar'da iki tane) */
  private bosses: Meteor[] = [];
  /** İkiz Yıldızlar: ikisinin döndüğü ortak merkez */
  private twinC = { x: 360, y: -110, vy: 0, base: 0, spin: 0.9 };

  // aktif yetenekler (şekil çizerek)
  skillSlots: SkillSlot[] = [];
  /** bu turda ilk kez hazır olan yetenekler (ipucu için) */
  private skillSeen = new Set<SkillId>();
  /** çizilmekte olan çizgiye harcanan mürekkep (yetenek atılırsa iade) */
  private strokeInk = 0;
  /** mürekkep bittikten sonra şekil için ücretsiz çizim */
  private overdraw = false;
  private overdrawT = 0;
  /** şekil kılavuzu (ilk hazır oluş / dok düğmesine dokunuş) */
  private shapeHint: { shape: GestureShape; t: number; color: string } | null = null;
  /** atılan şeklin kusursuz hali parlayıp büyür */
  private castFx: { shape: GestureShape; x: number; y: number; r: number; t: number; color: string } | null = null;
  private novaX = 360;
  private novaY = 0;
  private novaDmg = 3;
  private novaR = -1;
  private novaHit = new Set<Meteor>();
  private warpT = 0;
  private aegisT = 0;
  private starfallN = 0;
  private starfallT = 0;
  /** düşman meteorların zaman ölçeği (Zaman Kırılması) */
  private hostileScale = 1;
  // koruyucu uydu
  private droneT = 3;
  private droneA = 0;

  // attract (menü demosu)
  private attractT = 0;
  private botT = 0;
  private botLine: InkLine | null = null;
  private botPts: number[] = [];
  private botIdx = 0;

  // eğitim
  tutStep = 0;
  private tutT = 0;
  private tutFrozen = false;
  private tutDrawn = false;
  private tutA: Meteor | null = null;
  private tutB: Meteor | null = null;
  private ghost: { x0: number; y0: number; x1: number; y1: number } | null = null;

  /** HUD'un kapladığı üst alan (dünya birimi) ve HUD hedef noktaları */
  topInset = 150;
  hudInk = { x: 360, y: 120 };
  hudCoin = { x: 640, y: 60 };

  // parçacık sprite kimlikleri
  private sp: Record<string, number> = {};
  private q = 1;

  readonly hud: Hud = {
    score: 0,
    best: 0,
    wave: 0,
    ink: 100,
    maxInk: 100,
    lines: 0,
    maxLines: 3,
    combo: 0,
    mult: 1,
    comboT: 0,
    bossHp: -1,
    coins: 0,
    skills: [],
  };

  constructor(
    readonly view: View,
    readonly sprites: Sprites,
    readonly bg: Background,
    pen: Pen,
  ) {
    this.parts = new Particles(2400);
    this.fx = new Effects(sprites);
    this.city = new City(view, sprites);
    this.lines = new LineManager(sprites);
    for (let i = 0; i < 220; i++) this.meteors.push(new Meteor());
    this.director = new Director(1, { speed: 1, golden: 1, size: 1, chaos: false });
    this.setPen(pen);
    this.registerSprites();
    isQuiet = () => this.phase === 'attract';
  }

  atmIndex = 0;
  private trans: DrumTransition | null = null;
  private snapA: HTMLCanvasElement | null = null;
  private snapB: HTMLCanvasElement | null = null;
  /** Şehir düşünce devam teklifi: uygulama belirler (video hakkı / yeterli altın) */
  canRevive: ((count: number) => boolean) | null = null;
  /** bu turda kaç kez devam edildi */
  revives = 0;

  get atm(): Atmosphere {
    return ATMOSPHERES[this.atmIndex];
  }

  /** Atmosferi anında uygula (gökyüzü, şehir tonu, müzik) */
  applyAtmosphere(index: number): void {
    this.atmIndex = Math.max(0, Math.min(ATMOSPHERES.length - 1, index));
    const a = this.atm;
    this.bg.setAtmosphere(a);
    this.city.setAtmosphere(a.house.tint, a.house.glow);
    audio.setScene(a.music.root, a.music.bpm);
  }

  /** Sıradaki dünyayı parça parça hazırla (her çağrı tek bir ağır işi yapar; bitince false) */
  prebuildStep(index: number, step: number): boolean {
    const a = ATMOSPHERES[index];
    if (!a) return false;
    if (step === 0) this.bg.prebuild(a);
    else if (step === 1) this.city.prebuild(a.house.tint);
    return step < 1;
  }

  setPen(pen: Pen): void {
    this.pen = pen;
    this.sp.pen = this.parts.register('pen:' + pen.id, this.sprites.glow(pen.color));
    this.sp.penHot = this.parts.register('penhot:' + pen.id, this.sprites.glow(pen.color, true));
  }

  setQuality(q: number): void {
    this.q = q;
    this.parts.setBudget(q >= 1 ? 2400 : q >= 0.7 ? 1500 : 800);
  }

  private registerSprites(): void {
    const S = this.sprites;
    const reg = (key: string, col: string, hot = false): void => {
      this.sp[key] = this.parts.register(key, S.glow(col, hot));
    };
    reg('ember', C.ember);
    reg('emberHot', C.ember, true);
    reg('gold', C.gold);
    reg('goldHot', C.gold, true);
    reg('white', '#FFFFFF', true);
    reg('rose', C.rose);
    reg('violet', C.violet);
    reg('violetHot', C.violet, true);
    reg('ice', C.ice, true);
    reg('crimson', C.crimson, true);
    reg('flame', '#FF8A3D', true);
    for (const k of Object.keys(METEOR_COLORS) as Array<keyof typeof METEOR_COLORS>) {
      reg('m_' + k, METEOR_COLORS[k]);
    }
    this.sp.smoke = this.parts.register('smoke', S.smoke);
    this.sp.sparkle = this.parts.register('sparkle', S.sparkle);
    this.sp.rock = this.parts.register('chip:rock', S.smoke, '#3A2B30');
    this.sp.armor = this.parts.register('chip:armor', S.smoke, '#7A63A8');
    this.sp.wood = this.parts.register('chip:wood', S.smoke, '#5A3A34');
    this.sp.wall = this.parts.register('chip:wall', S.smoke, '#4C5A7D');
    this.sp.goldChip = this.parts.register('chip:gold', S.smoke, '#FFD866');
  }

  get groundY(): number {
    return this.city.roofY();
  }

  get speedScale(): number {
    return this.view.H / 1280;
  }

  get inkColor(): string {
    // gökkuşağı: sabit 72 tondan biri (her karede yeni renk -> yeni parıltı görseli üretilmez)
    return this.pen.rainbow ? RAINBOW[Math.floor((this.realT * 90) / 5) % 72] : this.pen.color;
  }

  get playing(): boolean {
    return this.phase === 'play' || this.phase === 'intro' || this.phase === 'cleared' || this.phase === 'tutorial';
  }

  // ───────────────────────── YAŞAM DÖNGÜSÜ ─────────────────────────

  private resetField(): void {
    // dünya geçişi sürerken oyun başlarsa (menüde "Oyna"ya erken dokunuş) geçişi anında tamamla
    const tr = this.trans;
    if (tr) {
      if (tr.stage === 0) this.applyAtmosphere(tr.to);
      this.trans = null;
      this.director.bias = this.atm.bias;
    }
    for (const m of this.meteors) m.active = false;
    this.lines.clear();
    this.parts.clear();
    this.fx.clear();
    this.pending.length = 0;
    this.holes.length = 0;
    this.bosses = [];
    this.novaR = -1;
    this.novaHit.clear();
    this.warpT = 0;
    this.aegisT = 0;
    this.starfallN = 0;
    this.hostileScale = 1;
    this.drawing = false;
    this.timeScale = 1;
    this.hitstop = 0;
    this.slowOverrideT = 0;
    this.botLine = null;
    this.ghost = null;
    audio.setDrawing(false, 0);
    audio.setSlowmo(0);
  }

  startAttract(): void {
    this.resetField();
    this.city.reset();
    this.bg.lights = 1;
    this.phase = 'attract';
    this.opts = null;
    this.stats = baseStats();
    this.attractT = 0.5;
    this.botT = 0;
    this.hud.bossHp = -1;
  }

  startRun(opts: RunOptions): void {
    this.resetField();
    this.city.reset();
    this.bg.lights = 1;
    this.opts = opts;
    this.setPen(opts.pen);
    this.runRng = new Rng(opts.seed ^ 0x5bd1e995);
    const mod = opts.mod;
    const mods: DirectorMods = {
      speed: mod?.speed ?? 1,
      golden: mod?.golden ?? 1,
      size: mod?.size ?? 1,
      chaos: mod?.chaos ?? false,
    };
    this.director = new Director(opts.seed, mods);
    this.director.goldenBonus = opts.meta.goldenBonus;

    const s = baseStats();
    s.maxInk += opts.meta.maxInk;
    s.inkRegen *= opts.meta.regenMult;
    s.coinMult *= opts.meta.coinMult;
    if (mod?.lineLife) s.lineLife *= mod.lineLife;
    if (mod?.maxLines) s.maxLines = mod.maxLines;
    this.stats = s;
    this.levels = {};
    this.upgradesTaken = [];
    if (mod?.startUpgrade) this.applyUpgrade(mod.startUpgrade);

    this.city.domeCharges = opts.meta.domeStart;
    this.rerolls = opts.meta.rerolls;
    this.score = 0;
    this.ink = s.maxInk;
    this.combo = 0;
    this.comboT = 0;
    this.mult = 1;
    this.wave = 0;
    this.kills = 0;
    this.deflects = 0;
    this.maxCombo = 0;
    this.bossKills = 0;
    this.golden = 0;
    this.coins = 0;
    this.runTime = 0;
    this.perfectWaves = 0;
    this.maxChain = 0;
    this.maxLineDeflect = 0;
    this.recordBroken = false;
    this.phoenixUsed = 0;
    this.revives = 0;
    // yetenekler turun başında yarı dolu (ilk kullanım ~15-20 sn sonra)
    this.skillSlots = opts.tutorial ? [] : opts.skills.map((k) => ({ ...k, left: k.cd * 0.5 }));
    this.skillSeen.clear();
    this.shapeHint = null;
    this.castFx = null;
    this.droneT = 3;
    if (this.atmIndex !== 0) this.applyAtmosphere(0);
    this.director.bias = this.atm.bias;
    this.hud.best = opts.best;
    this.hud.bossHp = -1;

    if (opts.tutorial) {
      this.phase = 'tutorial';
      this.tutStep = -1;
      this.setTutStep(0);
    } else if (opts.meta.startRarity >= 1) {
      // Hattat başlangıcı: ilk dalgadan önce güç seçimi (UI 'cleared' + wave 0 durumunu yakalar)
      this.phase = 'cleared';
      this.wave = 0;
      audio.setIntensity(1);
    } else {
      this.startWave(1);
    }
  }

  startWave(n: number): void {
    this.wave = n;
    this.bosses = [];
    this.director.plan(n, this.view.H, this.groundY);
    this.phase = 'intro';
    this.introT = 1.35;
    this.waveDamaged = false;
    this.city.domeCharges = Math.max(this.city.domeCharges, this.stats.domePerWave);
    this.onEvent({ type: 'wave', wave: n, boss: this.director.bossWave, bossType: this.director.bossType });
    audio.setIntensity(this.director.bossWave ? 4 : n >= 7 ? 3 : n >= 3 ? 2 : 1);
    audio.waveStart();
  }

  nextWave(): void {
    this.startWave(this.wave + 1);
  }

  // ───────────────────────── GÜÇLENDİRMELER ─────────────────────────

  applyUpgrade(id: string): void {
    const def = UPGRADE_BY_ID.get(id);
    if (!def) return;
    this.levels[id] = (this.levels[id] ?? 0) + 1;
    this.upgradesTaken.push(id);
    const prevMax = this.stats.maxInk;
    def.apply(this.stats);
    if (this.stats.maxInk > prevMax) this.ink += this.stats.maxInk - prevMax;
    if (id === 'repair') this.repairOne();
    if (id === 'dome') this.city.domeCharges = Math.max(this.city.domeCharges, this.stats.domePerWave);
    if (id === 'lucky') this.director.goldenBonus += 0.015;
  }

  private repairOne(): void {
    // önce yıkık, sonra en hasarlı blok
    let target = this.city.blocks.find((b) => b.hp <= 0);
    if (!target) target = this.city.blocks.find((b) => b.hp < b.maxHp);
    if (!target) return;
    target.hp = target.maxHp;
    target.repairT = 0;
    const x = target.i * BLOCK_W + BLOCK_W / 2;
    this.parts.burst(x, this.view.H - 110, Math.round(40 * this.q), this.sp.penHot, 60, 320, 1, 22, { drag: 2.5, gravity: -120 });
    this.fx.text(t('w.repair'), x, this.view.H - 230, 30, this.pen.color, true, 1.2);
    this.bg.lights = this.city.alive / BLOCKS;
    audio.repair();
  }

  /** Dalga sonunda 3 kart (tekrarsız, seviyesi dolmamış). Nadirlik dalgayla artar. */
  offer(count = 3): string[] {
    const r = this.runRng;
    const w = this.wave;
    const rarityW = [60, 28 + w * 0.6, 9 + w * 0.5, 2.2 + w * 0.22];
    const damaged = this.city.blocks.some((b) => b.hp < b.maxHp);
    const pool = UPGRADES.filter((u) => (this.levels[u.id] ?? 0) < u.max && (u.id !== 'repair' || damaged));
    const out: string[] = [];
    // hasar varsa onarım kartı öncelikli çıkabilir
    if (damaged && this.city.alive <= 3 && r.chance(0.7)) out.push('repair');
    let guard = 0;
    while (out.length < count && guard++ < 200) {
      const rar = r.weighted(rarityW);
      const cands = pool.filter((u) => u.rarity === rar && !out.includes(u.id));
      if (cands.length === 0) continue;
      out.push(r.pick(cands).id);
    }
    return out;
  }

  /** Başlangıç kartı (atölye): verilen nadirlikte rastgele */
  offerStart(rarity: Rarity): string[] {
    const cands = UPGRADES.filter((u) => u.rarity === rarity && u.id !== 'repair');
    const out: string[] = [];
    while (out.length < Math.min(3, cands.length)) {
      const p = this.runRng.pick(cands).id;
      if (!out.includes(p)) out.push(p);
    }
    return out;
  }

  // ───────────────────────── GİRİŞ ─────────────────────────

  private canDraw(): boolean {
    if (this.phase === 'play' || this.phase === 'intro') return true;
    if (this.phase === 'tutorial') return this.tutStep < 2;
    return false;
  }

  pointerDown(x: number, y: number, tm: number): void {
    if (!this.canDraw()) return;
    if (y > this.groundY + 10) return;
    if (this.ink < 4) {
      this.inkEmptyFx();
      return;
    }
    const line = this.lines.begin(x, y, tm, this.stats.maxLines, (this.realT * 90) % 360);
    if (!line) return;
    this.drawing = true;
    this.strokeInk = 0;
    this.overdraw = false;
    this.overdrawT = 0;
    this.tutDrawn = true;
    this.penSpeed = 0;
    audio.setDrawing(true, 0);
  }

  pointerMove(x: number, y: number, tm: number): void {
    if (!this.drawing) return;
    const l = this.lines.current;
    if (!l) return;
    y = Math.min(y, this.groundY + 10);
    const d = l.distTo(x, y);
    if (d < 8) return;
    const cost = d * this.stats.drawCost;
    // bir yetenek hazırsa mürekkep bitse de şekil tamamlanabilir (tanınmazsa çizgi söner)
    if (cost > this.ink && this.anySkillReady && l.len < OVERDRAW_LEN) {
      const added = l.extend(x, y, tm);
      this.strokeInk += this.ink;
      this.ink = 0;
      this.overdraw = true;
      if (l.full) this.endLine();
      void added;
      return;
    }
    if (cost > this.ink) {
      const f = this.ink / cost;
      const px = l.lastX + (x - l.lastX) * f;
      const py = l.lastY + (y - l.lastY) * f;
      l.extend(px, py, tm);
      this.ink = 0;
      this.endLine();
      this.inkEmptyFx();
      return;
    }
    const added = l.extend(x, y, tm);
    this.ink -= added * this.stats.drawCost;
    this.strokeInk += added * this.stats.drawCost;
    this.penSpeed = this.penSpeed * 0.7 + (added / Math.max(0.004, 1 / 120)) * 0.3;
    if (l.full) this.endLine();
  }

  pointerUp(): void {
    if (this.drawing) this.endLine();
  }

  endLine(): void {
    this.drawing = false;
    // eğitimde çizgi bitince zaman akmaya devam eder (ıskalarsa adım yeniden kurulur)
    if (this.phase === 'tutorial') this.tutFrozen = false;
    audio.setDrawing(false, 0);
    const l = this.lines.end(this.stats.lineLife);
    if (l && l.n >= 2) {
      if (this.trySkillGesture(l)) return;
      if (this.overdraw) {
        // mürekkepsiz çizilen ama şekle uymayan çizgi kalıcı olmaz
        this.dissolveLine(l);
        l.shattered = true;
        l.kill();
        this.overdraw = false;
        return;
      }
      // bırakırken küçük mürekkep sıçraması
      this.parts.burst(l.lastX, l.lastY, Math.round(6 * this.q), this.sp.penHot, 30, 140, 0.4, 10, { drag: 4 });
    }
    this.overdraw = false;
  }

  private inkEmptyFx(): void {
    if (this.inkFlash > 0) return;
    this.inkFlash = 0.6;
    audio.inkEmpty();
    haptics.light();
    this.onEvent({ type: 'inkEmpty' });
  }

  // ───────────────────────── GÜNCELLEME ─────────────────────────

  update(realDt: number): void {
    this.realT += realDt;
    this.inkFlash = Math.max(0, this.inkFlash - realDt);
    let dt = realDt;
    if (this.hitstop > 0) {
      this.hitstop -= realDt;
      dt = 0;
    }

    // zaman ölçeği: çizerken ağır çekim
    let target = 1;
    if (this.drawing && this.playing) target = this.stats.slowmo;
    if (this.phase === 'tutorial' && this.tutFrozen && !this.drawing) target = 0.03;
    if (this.slowOverrideT > 0) {
      this.slowOverrideT -= realDt;
      target = Math.min(target, this.slowOverride);
    }
    if (this.phase === 'dying') target = 0.3;
    if (this.phase === 'revive') target = 0.04;
    this.timeScale = damp(this.timeScale, target, this.drawing ? 18 : 8, realDt);
    const sdt = dt * this.timeScale;
    audio.setSlowmo(clamp((1 - this.timeScale) * 1.4, 0, 1));
    if (this.drawing) audio.setDrawing(true, this.penSpeed);
    this.penSpeed *= Math.exp(-10 * realDt);

    this.bg.update(realDt);

    switch (this.phase) {
      case 'attract':
        this.updateAttract(sdt, realDt);
        break;
      case 'tutorial':
        this.updateTutorial(sdt, realDt);
        break;
      case 'intro':
        this.introT -= realDt;
        if (this.introT <= 0) this.phase = 'play';
        break;
      case 'play':
        this.updateSpawns(sdt * this.hostileScale);
        break;
      case 'transition':
        this.updateTransition(realDt);
        break;
      case 'dying':
        this.dyingT -= realDt;
        if (Math.random() < realDt * 10) {
          const x = fx.r(20, 700);
          this.explosionFx(x, this.view.H - fx.r(60, 160), C.ember, 1.2);
        }
        if (this.dyingT <= 0) {
          this.phase = 'over';
          audio.setIntensity(0);
          this.onEvent({ type: 'gameOver', result: this.result() });
        }
        break;
      default:
        break;
    }

    if (this.playing) {
      this.runTime += realDt;
      // mürekkep: yenilenme + basılı tutma bedeli (sonsuz ağır çekimi engeller)
      if (this.drawing) {
        this.ink -= 5 * realDt;
        if (this.ink <= 0) {
          this.ink = 0;
          // yetenek hazırsa şekli bitirmek için kısa bir ek süre (sonsuz ağır çekim olmasın)
          this.overdrawT += realDt;
          if (!this.anySkillReady || this.overdrawT > 2.5) {
            this.endLine();
            this.inkEmptyFx();
          }
        }
      } else {
        this.ink = Math.min(this.stats.maxInk, this.ink + this.stats.inkRegen * sdt * (this.warpT > 0 ? 2.5 : 1));
      }
      // kombo zamanlayıcı
      if (this.combo > 0) {
        this.comboT -= sdt;
        if (this.comboT <= 0) this.endCombo();
      }
    }

    this.updateSkill(sdt, realDt);
    this.updateMeteors(sdt);
    this.updateCollisions();
    this.updatePending(sdt);
    this.updateHoles(sdt);
    this.updateFrozenLines(sdt);
    this.lines.update(sdt, (l) => this.dissolveLine(l));
    this.city.update(sdt, (x, y, rubble) => this.fireFx(x, y, rubble));
    this.parts.update(sdt);
    this.fx.minY = this.phase === 'attract' ? 0 : this.topInset + 34;
    this.fx.update(sdt, realDt);

    this.chainT -= sdt;
    if (this.chainT <= 0 && this.chainCount > 0) this.endChain();

    if (this.phase === 'play') this.checkWaveClear();
    this.syncHud();
  }

  private syncHud(): void {
    const h = this.hud;
    h.score = this.score;
    h.wave = this.wave;
    h.ink = this.ink;
    h.maxInk = this.stats.maxInk;
    h.lines = this.stats.maxLines - this.lines.activeCount() + (this.drawing ? 1 : 0);
    h.maxLines = this.stats.maxLines;
    h.combo = this.combo;
    h.mult = this.mult;
    h.comboT = this.combo > 0 ? clamp(this.comboT / COMBO_WINDOW, 0, 1) : 0;
    let hp = 0;
    let max = 0;
    for (const b of this.bosses) {
      max += b.maxHp;
      if (b.active && b.kind === MK.Boss) hp += Math.max(0, b.hp);
    }
    h.bossHp = hp > 0 ? hp / max : -1;
    h.coins = this.coins;
    h.skills = this.skillSlots;
  }

  private updateSpawns(sdt: number): void {
    const d = this.director;
    d.time += sdt;
    while (d.qi < d.queue.length && d.queue[d.qi].t <= d.time) {
      const s = d.queue[d.qi++];
      if (s.kind === MK.Boss) this.spawnBoss(s.boss ?? 0);
      else this.spawn(s.kind, s.x, s.y, s.vx, s.vy);
    }
    if (d.bossWave && this.bossAlive) {
      const e = d.escort(sdt, this.view.H, this.groundY);
      if (e) this.spawn(e.kind, e.x, e.y, e.vx, e.vy);
    }
  }

  private checkWaveClear(): void {
    if (this.director.pending > 0 || this.pending.length > 0) return;
    for (const m of this.meteors) if (m.active && !m.friendly) return;
    this.phase = 'cleared';
    const perfect = !this.waveDamaged;
    let bonus = 100 * this.wave;
    if (perfect) {
      bonus += 300 * this.wave;
      this.perfectWaves++;
    }
    const gained = Math.round(bonus * this.stats.scoreMult * (this.opts?.mod?.scoreMult ?? 1));
    this.score += gained;
    this.checkRecord();
    if (this.drawing) this.endLine();
    if (perfect) {
      audio.perfect();
      this.fx.text(t('w.perfect'), 360, this.view.H * 0.36, 58, C.gold, true, 1.6);
      for (let i = 0; i < 3; i++) {
        this.parts.burst(fx.r(120, 600), this.view.H * fx.r(0.25, 0.45), Math.round(14 * this.q), this.sp.sparkle, 60, 260, 1.1, 34, {
          drag: 2,
          gravity: 40,
        });
      }
    }
    audio.waveClear();
    audio.setIntensity(1);
    this.onEvent({ type: 'waveClear', wave: this.wave, bonus: gained, perfect });
  }

  spawn(kind: MK, x: number, y: number, vx: number, vy: number): Meteor | null {
    const m = this.meteors.find((mm) => !mm.active);
    if (!m) return null;
    const size = this.opts?.mod?.size ?? 1;
    m.spawn(kind, x, y, vx, vy, kind === MK.Boss ? 1 : size);
    if (kind === MK.Phantom) {
      // yüzü hep dik dursun
      m.rot = 0;
      m.spin = 0;
    }
    return m;
  }

  get bossAlive(): boolean {
    for (const b of this.bosses) if (b.active && b.kind === MK.Boss) return true;
    return false;
  }

  /** Boss türüne göre sahneye çıkış */
  private spawnBoss(type: number): void {
    const n = Math.max(1, Math.round(this.wave / 5));
    // her tam döngüde (5 boss) daha dayanıklı
    const hp = 14 + 7 * (n - 1);
    this.bosses = [];
    const make = (x: number, y: number, r: number, hpv: number): Meteor | null => {
      const m = this.spawn(MK.Boss, x, y, 0, 0);
      if (!m) return null;
      m.bossType = type;
      m.r = r;
      m.hp = m.maxHp = hpv;
      m.baseV = 30 * this.speedScale;
      m.vy = m.baseV;
      m.minionT = 2.5;
      m.rot = 0;
      // bosslar yavaşça sallanır (ışık yönü sabit kalsın)
      m.spin = 0;
      this.bosses.push(m);
      return m;
    };
    if (type === BT.Twins) {
      const c = this.twinC;
      c.x = 360;
      c.y = -120;
      c.base = 26 * this.speedScale;
      c.vy = c.base;
      c.spin = 0.9;
      for (let i = 0; i < 2; i++) {
        const t = make(360, -120, 58, Math.round(hp * 0.52));
        if (t) {
          t.twin = i;
          t.minionT = 2 + i * 1.2;
        }
      }
    } else {
      const m = make(360, -110, type === BT.Queen ? 70 : 80, type === BT.Frost ? Math.round(hp * 0.85) : hp);
      if (m && type === BT.Frost) m.shields = 3;
      if (m && type === BT.Singularity) m.pulseT = 5;
      if (m && type === BT.Queen) m.baseV = 24 * this.speedScale;
    }
    audio.bossAppear();
    this.fx.shake(0.35);
    haptics.heavy();
  }

  private updateMeteors(dt: number): void {
    if (dt <= 0) {
      for (const m of this.meteors) if (m.active) m.flash = Math.max(0, m.flash);
      return;
    }
    const W = WORLD_W;
    const ground = this.groundY;
    const inGame = this.phase !== 'attract';
    for (const m of this.meteors) {
      if (!m.active) continue;
      // düşmanlar: ayaz ve Zaman Kırılması onları yavaşlatır
      let mdt = dt;
      if (!m.friendly && inGame) {
        if (m.slowT > 0) {
          m.slowT -= dt;
          mdt *= 0.45;
        }
        mdt *= this.hostileScale;
      }
      m.age += mdt;
      m.flash = Math.max(0, m.flash - dt);
      m.lineCd -= dt;

      if (!m.friendly && m.kind !== MK.Boss && this.atm.wind !== 0 && inGame) {
        m.vx += this.atm.wind * this.speedScale * mdt;
      }
      if (m.kind === MK.Golden && !m.friendly) {
        m.vx = m.baseV + Math.sin(m.age * 2.4 + m.swayPh) * 90 * this.speedScale;
      }
      if (m.kind === MK.Phantom) {
        // hayalet: ~2.3 sn'lik döngüde kısa süre saydamlaşır; şehre yaklaşınca hep görünür (adil olsun)
        const ph = (m.age + m.swayPh) % 2.3;
        const target = !m.friendly && ph > 1.45 && m.y < this.groundY - 190 ? 1 : 0;
        m.fade += (target - m.fade) * Math.min(1, dt * 9);
        m.rot = Math.sin(m.age * 3 + m.swayPh) * 0.18;
      }
      if (m.kind !== MK.Boss) {
        // zırhı kırılıp yukarı seken düşman meteor yeniden düşer; ekran dışında kaybolup dalgayı kilitlemesin
        if (!m.friendly && m.vy < 90 * this.speedScale) m.vy += 520 * this.speedScale * mdt;
        // güvenlik ağı: çok uzun yaşayan (sıkışmış) meteorları sessizce kaldır
        if (m.age > 45) {
          m.active = false;
          continue;
        }
      }
      if (m.kind === MK.Boss) this.updateBoss(m, mdt);
      if (m.friendly && inGame) this.steerFriendly(m, dt);

      const sp = Math.hypot(m.vx, m.vy);
      const steps = clamp(Math.ceil((sp * mdt) / 7), 1, 10);
      const h = mdt / steps;
      for (let s = 0; s < steps && m.active; s++) {
        m.x += m.vx * h;
        m.y += m.vy * h;
        this.collideLines(m);
        if (m.x < m.r && m.vx < 0) {
          m.x = m.r;
          m.vx = -m.vx;
        } else if (m.x > W - m.r && m.vx > 0) {
          m.x = W - m.r;
          m.vx = -m.vx;
        }
      }
      if (!m.active) continue;
      m.rot += m.spin * mdt;
      m.trailAcc += dt;
      if (m.trailAcc >= 1 / 60) {
        m.trailAcc = 0;
        m.pushTrail();
      }
      // yanma parçacıkları
      if (Math.random() < dt * (m.kind === MK.Boss ? 40 : 14) * this.q) {
        const col = m.friendly ? this.sp.penHot : this.sp['m_' + KINDS[m.kind].key];
        this.parts.spawn({
          x: m.x + fx.r(-m.r, m.r) * 0.5,
          y: m.y + fx.r(-m.r, m.r) * 0.5,
          vx: -m.vx * 0.15 + fx.r(-30, 30),
          vy: -m.vy * 0.15 + fx.r(-30, 30),
          life: fx.r(0.25, 0.6),
          size: m.r * fx.r(0.5, 1),
          sprite: col,
          drag: 2,
        });
      }

      if (!m.friendly) {
        // Aegis yeteneği: şehrin üstündeki kalkan meteorları mürekkebe çevirip geri fırlatır
        if (this.aegisT > 0 && m.y + m.r >= this.aegisY(m.x) && m.vy > 0) {
          this.aegisReflect(m);
          continue;
        }
        // kubbe kalkanı
        if (this.city.domeCharges > 0 && m.kind !== MK.Boss && m.y + m.r >= this.city.domeY(m.x) && this.phase !== 'attract') {
          this.domeBlock(m);
          continue;
        }
        if (m.y + m.r * 0.3 >= ground) {
          this.impact(m);
          continue;
        }
      } else {
        // sekme ustası: dost meteor tavandan geri döner
        if (m.y < m.r + 6 && m.vy < 0 && m.topBounces < this.stats.ricochet && inGame) {
          m.topBounces++;
          m.y = m.r + 6;
          m.vy = -m.vy;
          m.flash = 0.2;
          this.fx.ring(m.x, m.y, 6, 80, 0.4, this.inkColor, 6);
          audio.deflect(this.combo);
          if (this.stats.cometBurst > 0) this.cometBurstAt(m.x, m.y);
        }
        if (m.y < -m.r - 30) {
          this.exitTop(m);
          continue;
        }
        if (m.y > this.view.H + 60) {
          m.active = false;
          continue;
        }
        if (m.y + m.r * 0.3 >= ground && m.vy > 0) {
          // dost meteor şehre zarar vermez: sönerek dağılır
          m.active = false;
          this.parts.burst(m.x, ground, Math.round(10 * this.q), this.sp.penHot, 40, 200, 0.5, 18, { drag: 3 });
        }
      }
    }
  }

  private updateBoss(m: Meteor, dt: number): void {
    if (m.bossType === BT.Twins) {
      this.updateTwin(m, dt);
      return;
    }
    const enraged = m.hp < m.maxHp * 0.5;
    // Boss sahnenin orta bandında dolaşır: şehre inmez (çizim alanı hep kalır), tepeye de kaçmaz
    m.vy = this.roamY(m, m.y, dt, 0, enraged, m.vy);
    // yatay: iki salınımın toplamı, ekranın bir ucundan öbürüne gezinir; çizgiler yana itemez
    const ph = m.swayPh;
    let targetX: number;
    switch (m.bossType) {
      case BT.Queen:
        targetX = 360 + Math.sin(m.age * 0.8 + ph) * 220 + Math.sin(m.age * 2.1) * 40;
        break;
      case BT.Frost:
        targetX = 360 + Math.sin(m.age * 0.33 + ph) * 175 + Math.sin(m.age * 0.9) * 35;
        break;
      case BT.Singularity:
        targetX = 360 + Math.sin(m.age * 0.5 + ph) * 190 + Math.sin(m.age * 1.3) * 30;
        break;
      default:
        targetX = 360 + Math.sin(m.age * 0.42 + ph) * 200 + Math.sin(m.age * 1.1) * 40;
    }
    targetX = clamp(targetX, m.r + 12, WORLD_W - m.r - 12);
    m.vx = (targetX - m.x) * 3;
    m.rot = Math.sin(m.age * 1.3) * 0.1;

    // Buz Kalesi: kırılan kristaller zamanla yeniden büyür
    if (m.bossType === BT.Frost && m.shields !== 7) {
      m.shieldT += dt;
      // tümü kırılınca uzun bir açık pencere: hasar verme fırsatı
      if (m.shieldT > (m.shields === 0 ? 8.5 : 6)) {
        m.shieldT = 0;
        for (let i = 0; i < 3; i++) {
          if (!((m.shields >> i) & 1)) {
            m.shields |= 1 << i;
            const [x, y] = shieldPos(m, i, this.realT);
            this.fx.ring(x, y, 4, 60, 0.4, BOSS_COLORS[BT.Frost], 5);
            break;
          }
        }
      }
    }
    // Tekillik: çizgileri kıran nabız (önce daralan uyarı halkası)
    if (m.bossType === BT.Singularity && m.y > 40) {
      m.pulseT -= dt;
      if (m.pulseT <= -1) {
        m.pulseT = enraged ? 4 : 6;
        for (const l of this.lines.pool) if (l.alive && l.collidable) this.shatterLine(l);
        if (this.drawing) this.endLine();
        this.fx.ring(m.x, m.y, m.r, 900, 0.8, BOSS_COLORS[BT.Singularity], 24);
        this.fx.flash(BOSS_COLORS[BT.Singularity], 0.25);
        this.fx.shake(0.4);
        audio.blackHole();
        haptics.heavy();
      }
    }

    m.minionT -= dt;
    if (m.minionT <= 0 && m.y > 40) {
      const spd = this.director.baseSpeed(this.view.H) * 1.05;
      const col = BOSS_COLORS[m.bossType] ?? C.crimson;
      const fan = (kind: MK, angs: number[], speedMul = 1): void => {
        for (const a of angs) {
          const ang = Math.PI / 2 + a;
          const s = this.spawn(kind, m.x + Math.cos(ang) * m.r * 0.8, m.y + Math.sin(ang) * m.r * 0.8, Math.cos(ang) * spd * speedMul, Math.sin(ang) * spd * speedMul);
          if (s) s.flash = 0.3;
        }
      };
      switch (m.bossType) {
        case BT.Queen:
          m.minionT = enraged ? 2.1 : 3;
          fan(MK.Comet, enraged ? [-0.6, 0, 0.6] : [-0.45, 0.45], 0.62);
          break;
        case BT.Frost:
          m.minionT = enraged ? 2.2 : 3;
          fan(MK.Ice, enraged ? [-0.5, 0, 0.5] : [-0.35, 0.35], 0.9);
          break;
        case BT.Singularity:
          m.minionT = enraged ? 2 : 2.8;
          fan(MK.Phantom, enraged ? [-0.4, 0.4] : [0.001], 0.9);
          break;
        default:
          m.minionT = enraged ? 1.5 : 2.3;
          fan(MK.Shard, enraged ? [-0.55, 0, 0.55] : [-0.45, 0.45]);
      }
      this.parts.burst(m.x, m.y + m.r * 0.7, Math.round(16 * this.q), this.parts.register('hot:' + col, this.sprites.glow(col, true)), 60, 260, 0.6, 26, { drag: 3 });
    }
  }

  /**
   * Boss'un dikey gezinmesi: HUD'un hemen altı ile ekranın ortası arasındaki bantta yavaşça
   * iner çıkar. Çizgiye çarpıp yukarı itilince yumuşakça banda geri döner. Yeni dikey hızı döndürür.
   */
  private roamY(m: Meteor, y: number, dt: number, pad: number, enraged: boolean, vy: number): number {
    const H = this.view.H;
    const top = this.topInset + m.r * 0.9 + 26 + pad;
    // öfkelenince biraz daha aşağı sarkar, ama çizim için hep geniş bir alan kalır
    const low = Math.min(H * (enraged ? 0.5 : 0.46), this.groundY - 440) - pad * 0.6;
    const bot = Math.max(top + 70, low);
    const u = 0.5 + 0.34 * Math.sin(m.age * 0.37 + m.swayPh * 1.7) + 0.16 * Math.sin(m.age * 0.91 + 1.3);
    const ty = top + (bot - top) * u;
    // girişte daha hızlı süzülür, bantta ağır ağır
    const lim = y < top ? 150 : 70;
    const want = clamp((ty - y) * 0.9, -lim, lim) * this.speedScale;
    let v = vy + (want - vy) * Math.min(1, dt * 1.6);
    // geri itilince HUD'un altına kaçmasın
    if (y < this.topInset + m.r * 0.6 && v < 0 && m.age > 2) v = 0;
    return v;
  }

  /** İkiz Yıldızlar: ortak merkez etrafında dans eder; biri düşünce diğeri öfkelenir */
  private updateTwin(m: Meteor, dt: number): void {
    const c = this.twinC;
    const alive = this.bosses.filter((b) => b.active && b.kind === MK.Boss);
    const lead = alive[0] === m;
    if (lead) {
      // ortak merkez de orta bantta gezinir (ikizlerin yörüngesi için bant biraz daraltılır)
      c.vy = this.roamY(m, c.y, dt, 70, alive.length === 1, c.vy);
      c.y += c.vy * dt;
      c.x = 360 + Math.sin(m.age * 0.5) * 150 + Math.sin(m.age * 1.2) * 30;
      if (alive.length === 1) c.spin = 1.7;
    }
    const a = m.age * c.spin + m.twin * Math.PI;
    const R = alive.length === 1 ? 70 : 125;
    const tx = c.x + Math.cos(a) * R;
    const ty = c.y + Math.sin(a) * R * 0.55;
    m.vx = (tx - m.x) / Math.max(dt, 1e-3);
    m.vy = (ty - m.y) / Math.max(dt, 1e-3);
    m.rot = Math.sin(m.age * 2 + m.twin) * 0.12;
    m.minionT -= dt;
    if (m.minionT <= 0 && m.y > 40) {
      m.minionT = alive.length === 1 ? 2.2 : 3.4;
      const spd = this.director.baseSpeed(this.view.H) * 0.85;
      const s = this.spawn(MK.Nova, m.x, m.y + m.r * 0.8, fx.r(-60, 60) * this.speedScale, spd);
      if (s) s.flash = 0.3;
    }
  }

  /** Dost meteor yönlendirme: mıknatıs kartı, yıldız yağmuru ve Tekillik çekimi */
  private steerFriendly(m: Meteor, dt: number): void {
    for (const b of this.bosses) {
      if (!b.active || b.kind !== MK.Boss || b.bossType !== BT.Singularity) continue;
      const dx = b.x - m.x;
      const dy = b.y - m.y;
      const d = Math.hypot(dx, dy);
      if (d < 460 && d > 1) {
        const f = 900 * this.speedScale * (1 - d / 460) * dt;
        m.vx += (dx / d) * f;
        m.vy += (dy / d) * f;
      }
    }
    // Güdüm yalnızca yakından geçerken: menzil dışındaki hedef kovalanmaz, önde kalan düşmana hafifçe kıvrılır.
    // Mıknatıs kartı zayıf ve kısa menzilli; yeteneklerin güdümlü yıldızları daha geniş (ama sınırlı) alanda arar.
    const lvl = this.stats.magnet;
    let turn = 0;
    let range = 0;
    let cone = -1;
    if (m.homing > 0) {
      turn = m.homing;
      range = m.homing >= 5 ? 640 : 380;
    } else if (lvl > 0) {
      turn = 0.75 + lvl * 0.4;
      range = 130 + lvl * 30;
      cone = 0.25;
    }
    if (turn <= 0) return;
    const sp = Math.hypot(m.vx, m.vy) || 1;
    const hx = m.vx / sp;
    const hy = m.vy / sp;
    let best: Meteor | null = null;
    let bd = range;
    for (const o of this.meteors) {
      if (!o.active || o.friendly || o.ghost) continue;
      const dx = o.x - m.x;
      const dy = o.y - m.y;
      if (dx > range || dx < -range || dy > range || dy < -range) continue;
      const d = Math.sqrt(dx * dx + dy * dy) - o.r;
      if (d >= bd) continue;
      // arkada kalan hedefe dönülmez (tam tur atan "füze" hissi olmasın)
      if (cone > -1 && (dx * hx + dy * hy) / Math.max(1, d + o.r) < cone) continue;
      bd = d;
      best = o;
    }
    if (!best) return;
    // yaklaştıkça biraz güçlenir, menzil kenarında neredeyse hissedilmez
    const w = turn * (0.3 + 0.7 * (1 - Math.max(0, bd) / range));
    const cur = Math.atan2(m.vy, m.vx);
    const want = Math.atan2(best.y - m.y, best.x - m.x);
    let d = want - cur;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    const na = cur + clamp(d, -w * dt, w * dt);
    m.vx = Math.cos(na) * sp;
    m.vy = Math.sin(na) * sp;
  }

  // ───────────────────────── ÇARPIŞMALAR ─────────────────────────

  private collideLines(m: Meteor): void {
    if (m.ghost) return;
    const lw = this.stats.lineWidth * 0.5;
    const rad = m.r + lw;
    for (const l of this.lines.pool) {
      if (!l.collidable) continue;
      if (m.lastLine === l.id && m.lineCd > 0) continue;
      if (m.x < l.minX - rad || m.x > l.maxX + rad || m.y < l.minY - rad || m.y > l.maxY + rad) continue;
      let best = rad * rad;
      let bx = 0;
      let by = 0;
      let bs = 0;
      let hit = false;
      const p = l.pts;
      for (let i = 0; i < l.n - 1; i++) {
        const ax = p[i * 2];
        const ay = p[i * 2 + 1];
        const ex = p[i * 2 + 2];
        const ey = p[i * 2 + 3];
        const abx = ex - ax;
        const aby = ey - ay;
        const L2 = abx * abx + aby * aby;
        let tt = L2 > 1e-6 ? ((m.x - ax) * abx + (m.y - ay) * aby) / L2 : 0;
        tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
        const cx = ax + abx * tt;
        const cy = ay + aby * tt;
        const dx = m.x - cx;
        const dy = m.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) {
          best = d2;
          bx = cx;
          by = cy;
          bs = l.arc[i] + (l.arc[i + 1] - l.arc[i]) * tt;
          hit = true;
        }
      }
      if (!hit) continue;
      let nx = m.x - bx;
      let ny = m.y - by;
      let d = Math.sqrt(best);
      if (d < 1e-3) {
        // tam çizgi üstünde: hızın tersine it
        const sp = Math.hypot(m.vx, m.vy) || 1;
        nx = -m.vx / sp;
        ny = -m.vy / sp;
        d = 1;
      } else {
        nx /= d;
        ny /= d;
      }
      this.onLineHit(m, l, bx, by, nx, ny, bs, rad);
      return;
    }
  }

  private onLineHit(m: Meteor, l: InkLine, px: number, py: number, nx: number, ny: number, s: number, rad: number): void {
    if (m.kind === MK.Boss) {
      this.shatterLine(l);
      if (m.bossType === BT.Twins) this.twinC.vy = -150 * this.speedScale;
      else m.vy = -150 * this.speedScale;
      m.flash = 0.25;
      this.fx.shake(0.2);
      audio.bossHit();
      return;
    }

    const vn = m.vx * nx + m.vy * ny;
    m.x = px + nx * (rad + 0.5);
    m.y = py + ny * (rad + 0.5);
    if (vn >= 0) return;

    if (!m.friendly && m.armor > 0) {
      m.armor = 0;
      this.parts.burst(m.x, m.y, Math.round(12 * this.q), this.sp.armor, 120, 360, 0.9, 12, {
        shape: Shape.Chip,
        additive: false,
        gravity: 500,
        spin: 12,
      });
      this.parts.burst(m.x, m.y, Math.round(10 * this.q), this.sp.violetHot, 60, 260, 0.4, 20, { drag: 4 });
      this.fx.text(t('w.armor'), m.x, m.y - 40, 22, C.violet);
      audio.shatter();
      haptics.medium();
      m.vx -= 2 * vn * nx;
      m.vy -= 2 * vn * ny;
      m.vx *= 0.45;
      m.vy *= 0.45;
      m.flash = 0.2;
      m.lastLine = l.id;
      m.lineCd = 0.2;
      if (!this.stats.heavyProof) this.shatterLine(l);
      else l.wobble(s, 14);
      return;
    }

    if (!m.friendly && this.stats.fireChance > 0 && this.runRng.chance(this.stats.fireChance)) {
      l.wobble(s, 8);
      this.parts.burst(m.x, m.y, Math.round(16 * this.q), this.sp.flame, 60, 240, 0.6, 26, { drag: 3, gravity: -200 });
      this.killMeteor(m, 0);
      return;
    }

    m.vx -= 2 * vn * nx;
    m.vy -= 2 * vn * ny;
    const sp = Math.hypot(m.vx, m.vy) || 1;
    const minS = 560 * this.speedScale;
    const target = clamp(Math.max(sp * this.stats.bounceMult, minS), 0, 1500 * this.speedScale);
    m.vx *= target / sp;
    m.vy *= target / sp;
    m.lastLine = l.id;
    m.lineCd = 0.12;
    m.bounces++;
    m.flash = 0.15;
    l.wobble(s, 10);

    const wasHostile = !m.friendly;
    m.friendly = true;
    m.deflectedBy = l.id;
    m.fade = 0;
    if (wasHostile) {
      this.chargeSkills(0.4);
      // buz kristali dokunduğu çizgiyi dondurur: kısa süre sonra kırılır
      if (m.kind === MK.Ice && l.frozen <= 0 && this.phase !== 'attract') {
        l.frozen = 0.42;
        this.parts.burst(px, py, Math.round(14 * this.q), this.sp.ice, 60, 260, 0.6, 12, { drag: 3, shape: Shape.Streak });
        this.fx.text(t('w.frozen'), px, py - 34, 20, C.ice);
        audio.freeze();
      }
      // kırağı kartı: sekme noktasındaki düşmanları yavaşlatır
      if (this.stats.frost > 0) this.frostNova(px, py, 170, this.stats.frost, false);
    }

    // görsel geri bildirim
    const col = this.inkColor;
    this.fx.ring(px, py, 6, 70, 0.4, col, 6);
    this.parts.spawn({ x: px, y: py, vx: 0, vy: 0, life: 0.16, size: 110, sprite: this.sp.penHot });
    for (let i = 0; i < Math.round(10 * this.q); i++) {
      const a = Math.atan2(ny, nx) + fx.r(-1.1, 1.1);
      const v = fx.r(160, 520);
      this.parts.spawn({
        x: px,
        y: py,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: fx.r(0.2, 0.45),
        size: fx.r(5, 9),
        sprite: this.sp.penHot,
        shape: Shape.Streak,
        drag: 5,
      });
    }

    if (wasHostile && this.phase !== 'attract' && this.phase !== 'tutorial' && py > this.groundY - 125) {
      // şehre çok yakınken kurtarış
      this.addScore(60, px, py, false);
      this.fx.text(t('w.nearMiss'), px, py - 60, 30, C.gold, true, 1);
      this.parts.burst(px, py, Math.round(14 * this.q), this.sp.goldHot, 120, 420, 0.6, 12, { drag: 3, shape: Shape.Streak });
      this.hitstop = Math.max(this.hitstop, 0.04);
      this.onEvent({ type: 'nearMiss' });
    }
    if (wasHostile) {
      this.deflects++;
      l.deflects++;
      if (l.deflects > this.maxLineDeflect) this.maxLineDeflect = l.deflects;
      this.bumpCombo();
      this.addScore(10 * this.stats.deflectScoreMult, px, py, false);
      this.ink = Math.min(this.stats.maxInk, this.ink + 1.5);
      audio.deflect(this.combo);
      haptics.light();
      if (this.stats.mirror > 0 && !m.mirrored && m.kind !== MK.Shard) {
        m.mirrored = true;
        const base = Math.atan2(m.vy, m.vx);
        const angs = this.stats.mirror >= 2 ? [-0.36, 0.36] : [0.34];
        for (const a of angs) {
          const c = this.spawn(MK.Shard, m.x, m.y, Math.cos(base + a) * target, Math.sin(base + a) * target);
          if (c) {
            c.friendly = true;
            c.mirrored = true;
            c.lastLine = l.id;
            c.lineCd = 0.3;
            c.flash = 0.2;
          }
        }
      }
      if (this.phase === 'tutorial') this.tutFrozen = false;
    } else {
      this.addScore(5, px, py, false);
      audio.deflect(Math.max(0, this.combo - 2));
    }
  }

  private shatterLine(l: InkLine): void {
    l.shattered = true;
    l.kill();
    const p = l.pts;
    for (let i = 0; i < l.n; i += 2) {
      this.parts.spawn({
        x: p[i * 2],
        y: p[i * 2 + 1],
        vx: fx.r(-160, 160),
        vy: fx.r(-200, 120),
        life: fx.r(0.4, 0.8),
        size: fx.r(6, 11),
        sprite: this.sp.penHot,
        shape: Shape.Streak,
        gravity: 500,
        drag: 1.5,
      });
    }
    audio.shatter();
    haptics.medium();
  }

  private dissolveLine(l: InkLine): void {
    const p = l.pts;
    const step = Math.max(1, Math.round(3 / this.q));
    for (let i = 0; i < l.n; i += step) {
      this.parts.spawn({
        x: p[i * 2],
        y: p[i * 2 + 1],
        vx: fx.r(-20, 20),
        vy: fx.r(-70, -20),
        life: fx.r(0.4, 0.9),
        size: fx.r(6, 12),
        sprite: this.sp.pen,
        drag: 1,
      });
    }
  }

  private updateCollisions(): void {
    const list = this.meteors;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.active || !a.friendly) continue;
      // Buz Kalesi kristalleri dost meteorları durdurur
      if (this.hitShield(a)) continue;
      for (let j = 0; j < list.length; j++) {
        const b = list[j];
        if (!b.active || b.friendly || b === a || b.ghost) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.r + b.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        const cx = a.x + dx * (a.r / rr);
        const cy = a.y + dy * (a.r / rr);
        if (b.kind === MK.Boss) {
          this.bossDamage(b, a, cx, cy);
        } else if (b.kind === MK.Heavy && b.armor > 0) {
          b.armor = 0;
          b.vx += (dx / rr) * 200;
          b.vy = -Math.abs(b.vy) * 0.3;
          b.flash = 0.3;
          this.parts.burst(b.x, b.y, Math.round(12 * this.q), this.sp.armor, 120, 360, 0.9, 12, {
            shape: Shape.Chip,
            additive: false,
            gravity: 500,
            spin: 12,
          });
          audio.shatter();
          this.consumeFriendly(a, cx, cy);
        } else {
          this.killMeteor(b, a.chainDepth);
          this.consumeFriendly(a, cx, cy);
        }
        if (!a.active) break;
      }
    }
  }

  /** Dost meteor çarpışmadan sonra ya deler geçer ya da patlar */
  private consumeFriendly(a: Meteor, x: number, y: number): void {
    // kuyruklu yıldız bir hedefi fazladan deler
    if (a.pierce < this.stats.pierce + (a.kind === MK.Comet ? 1 : 0)) {
      a.pierce++;
      a.vx *= 0.9;
      a.vy *= 0.9;
      a.flash = 0.2;
      return;
    }
    a.active = false;
    if (a.kind === MK.Nova) {
      // sektirilen nova çekirdeği dev bir patlamayla zincir başlatır
      this.queueExplosion(x, y, this.stats.explosionR * 1.9, a.chainDepth + 1, 0);
      this.explosionFx(x, y, METEOR_COLORS.nova, 1.4);
      this.fx.ring(x, y, 20, this.stats.explosionR * 2.2, 0.5, METEOR_COLORS.nova, 14);
      this.fx.shake(0.3);
      return;
    }
    this.queueExplosion(x, y, this.stats.explosionR, a.chainDepth + 1, 0);
    this.explosionFx(x, y, this.inkColor, 0.7);
  }

  /** Dost meteor bir buz kristaline çarptıysa kristal kırılır, meteor tükenir */
  private hitShield(a: Meteor): boolean {
    for (const b of this.bosses) {
      if (!b.active || b.kind !== MK.Boss || b.bossType !== BT.Frost || b.shields === 0) continue;
      for (let i = 0; i < 3; i++) {
        if (!((b.shields >> i) & 1)) continue;
        const [x, y] = shieldPos(b, i, this.realT);
        const rr = a.r + 24;
        if ((a.x - x) ** 2 + (a.y - y) ** 2 > rr * rr) continue;
        b.shields &= ~(1 << i);
        b.shieldT = 0;
        this.parts.burst(x, y, Math.round(20 * this.q), this.sp.ice, 80, 380, 0.8, 14, { shape: Shape.Streak, drag: 2.5, gravity: 200 });
        this.fx.ring(x, y, 6, 110, 0.45, BOSS_COLORS[BT.Frost], 8);
        this.fx.text(t('w.shieldBreak'), x, y - 36, 22, C.ice);
        this.addScore(60, x, y, false);
        this.bumpCombo();
        audio.shatter();
        haptics.medium();
        a.active = false;
        this.explosionFx(x, y, BOSS_COLORS[BT.Frost], 0.6);
        return true;
      }
    }
    return false;
  }

  private bossDamage(boss: Meteor, a: Meteor, x: number, y: number): void {
    a.active = false;
    const col = BOSS_COLORS[boss.bossType] ?? C.crimson;
    if (boss.bossType === BT.Frost && boss.shields !== 0) {
      // kristaller yerindeyken kale hasar almaz
      this.explosionFx(x, y, col, 0.6);
      this.fx.text(t('w.shielded'), x, y - 30, 22, C.ice);
      audio.shatter();
      return;
    }
    this.hurtBoss(boss, a.kind === MK.Nova ? 2 : 1, x, y);
    this.queueExplosion(x, y, this.stats.explosionR * 0.8, 1, 0);
  }

  /** Boss'a doğrudan hasar (dost meteor, yıldız patlaması) */
  private hurtBoss(boss: Meteor, dmg: number, x: number, y: number): void {
    if (!boss.active || boss.hp <= 0) return;
    const col = BOSS_COLORS[boss.bossType] ?? C.crimson;
    boss.hp -= dmg;
    boss.flash = 0.2;
    this.explosionFx(x, y, col, 0.9);
    this.addScore(40 * dmg, x, y, true);
    this.bumpCombo();
    this.chargeSkills(1.5);
    this.fx.shake(0.18);
    audio.bossHit();
    haptics.medium();
    if (boss.hp > 0) return;
    const others = this.bosses.some((b) => b !== boss && b.active && b.kind === MK.Boss && b.hp > 0);
    if (others) {
      // ikizlerden biri düştü: diğeri öfkelenir
      boss.active = false;
      this.explosionFx(boss.x, boss.y, col, 1.8);
      this.fx.ring(boss.x, boss.y, 20, 360, 0.9, col, 18);
      this.fx.text(t('w.twinDown'), boss.x, boss.y - 80, 34, C.gold, true, 1.4);
      this.addScore(600, boss.x, boss.y, true);
      this.hitstop = 0.1;
      audio.bossDie();
      haptics.heavy();
      return;
    }
    this.bossDeath(boss);
  }

  private bossDeath(b: Meteor): void {
    b.active = false;
    for (const o of this.bosses) o.active = false;
    this.bosses = [];
    this.bossKills++;
    const n = Math.max(1, Math.round(this.wave / 5));
    this.addScore(1500 * n, b.x, b.y - 60, true);
    this.hitstop = 0.14;
    this.slowOverride = 0.2;
    this.slowOverrideT = 1.1;
    this.fx.shake(1);
    this.fx.flash('#FFFFFF', 0.9);
    const bcol = BOSS_COLORS[b.bossType] ?? C.crimson;
    this.fx.ring(b.x, b.y, 20, 520, 1.1, bcol, 22);
    this.fx.ring(b.x, b.y, 10, 340, 0.8, C.gold, 12);
    for (let i = 0; i < 6; i++) {
      this.explosionFx(b.x + fx.r(-70, 70), b.y + fx.r(-70, 70), i % 2 ? bcol : C.gold, 1.6);
    }
    this.parts.burst(b.x, b.y, Math.round(40 * this.q), this.sp.rock, 200, 700, 1.4, 18, {
      shape: Shape.Chip,
      additive: false,
      gravity: 700,
      spin: 10,
    });
    // tüm eskortlar da patlar
    for (const m of this.meteors) {
      if (m.active && !m.friendly) this.queueExplosion(m.x, m.y, 10, 2, 0.2 + Math.random() * 0.4, m);
    }
    this.rewardCoins(b.x, b.y, 20 * n);
    this.fx.text(t('w.bossDown.' + b.bossType), 360, this.view.H * 0.35, 44, C.gold, true, 2);
    audio.bossDie();
    haptics.success();
    this.onEvent({ type: 'bossDown' });
  }

  private queueExplosion(x: number, y: number, r: number, depth: number, delay: number, target: Meteor | null = null): void {
    if (this.pending.length > 120) return;
    this.pending.push({ kind: target ? 1 : 0, x, y, r, depth, delay, target });
  }

  private updatePending(dt: number): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.delay -= dt;
      if (p.delay > 0) continue;
      this.pending.splice(i, 1);
      if (p.kind === 1) {
        if (p.target && p.target.active && !p.target.friendly) this.killMeteor(p.target, p.depth);
        continue;
      }
      // alan hasarı
      for (const m of this.meteors) {
        if (!m.active || m.friendly || m.kind === MK.Boss) continue;
        const dx = m.x - p.x;
        const dy = m.y - p.y;
        const rr = p.r + m.r;
        if (dx * dx + dy * dy <= rr * rr) {
          if (m.kind === MK.Heavy && m.armor > 0) {
            m.armor = 0;
            m.flash = 0.3;
            continue;
          }
          this.killMeteor(m, p.depth);
        }
      }
    }
  }

  // ───────────────────────── PUAN & KOMBO ─────────────────────────

  private killMeteor(m: Meteor, depth: number): void {
    if (!m.active) return;
    m.active = false;
    const def = KINDS[m.kind];
    const inGame = this.phase !== 'attract';
    if (inGame) {
      this.kills++;
      this.chainCount++;
      this.chainT = 0.45;
      this.chainX = m.x;
      this.chainY = m.y;
      if (this.chainCount > this.maxChain) this.maxChain = this.chainCount;
      this.bumpCombo();
      const pts = def.score * (1 + 0.5 * depth);
      this.addScore(pts, m.x, m.y, true);
      this.ink = Math.min(this.stats.maxInk, this.ink + this.stats.inkPerKill);
      this.fx.home(m.x, m.y, this.hudInk.x, this.hudInk.y, this.pen.color, 18, 0.55);
      this.chargeSkills(1);
    }
    const col = METEOR_COLORS[def.key];
    const scale = m.kind === MK.Heavy ? 1.3 : m.kind === MK.Shard ? 0.6 : m.kind === MK.Nova ? 1.5 : m.kind === MK.Comet ? 0.8 : 1;
    this.explosionFx(m.x, m.y, col, scale);
    audio.explode(depth === 0 ? scale : scale * 0.8);
    this.fx.shake(depth === 0 ? 0.13 : 0.08);
    if (depth === 0) haptics.medium();

    if (m.kind === MK.Golden) {
      this.golden++;
      this.rewardCoins(m.x, m.y, 5 + this.stats.luckyCoins);
    }
    if (m.kind === MK.Nova) {
      // nova çekirdeği: dev patlama halkası, yakındakileri de götürür
      this.fx.ring(m.x, m.y, 20, this.stats.explosionR * 2.4, 0.6, METEOR_COLORS.nova, 16);
      this.queueExplosion(m.x, m.y, this.stats.explosionR * 1.9, depth + 1, 0.04);
      this.fx.shake(0.3);
    }
    if (m.kind === MK.Ice && inGame) this.frostNova(m.x, m.y, 190, 2, true);
    if (m.kind === MK.Splitter) {
      const spd = this.director.baseSpeed(this.view.H) * 1.1;
      for (const a of [-0.7, 0, 0.7]) {
        const ang = Math.PI / 2 + a;
        this.spawn(MK.Shard, m.x, m.y, Math.cos(ang) * spd, Math.sin(ang) * spd);
      }
    }
    if (this.stats.chain > 0 && depth < 2) {
      const targets = this.nearestHostiles(m.x, m.y, 250, this.stats.chain);
      targets.forEach((tg, i) => {
        this.fx.bolt(m.x, m.y, tg.x, tg.y, C.ice);
        this.queueExplosion(tg.x, tg.y, 0, depth + 1, 0.06 + i * 0.05, tg);
      });
      if (targets.length) audio.zap();
    }
    if (depth < 3) this.queueExplosion(m.x, m.y, this.stats.explosionR * (depth === 0 ? 1 : 0.75), depth + 1, 0.05 + depth * 0.03);
    if (inGame && this.stats.blackHole > 0 && this.combo > 0 && this.combo % 15 === 0) this.spawnHole(m.x, m.y);
    if (this.phase === 'tutorial' && this.tutStep === 1) this.setTutStep(2);
  }

  private nearestHostiles(x: number, y: number, range: number, n: number): Meteor[] {
    const out: Meteor[] = [];
    const r2 = range * range;
    for (const m of this.meteors) {
      if (!m.active || m.friendly || m.kind === MK.Boss) continue;
      const d2 = (m.x - x) ** 2 + (m.y - y) ** 2;
      if (d2 < r2) out.push(m);
    }
    out.sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2));
    return out.slice(0, n);
  }

  private rewardCoins(x: number, y: number, n: number): void {
    const amount = Math.round(n * this.stats.coinMult);
    this.coins += amount;
    const vis = Math.min(10, amount);
    for (let i = 0; i < vis; i++) {
      this.fx.home(x, y, this.hudCoin.x, this.hudCoin.y, C.gold, 22, 0.7 + i * 0.04, () => audio.coin());
    }
  }

  private addScore(base: number, x: number, y: number, show: boolean): void {
    if (this.phase === 'attract') return;
    const gained = Math.round(base * this.mult * this.stats.scoreMult * (this.opts?.mod?.scoreMult ?? 1));
    this.score += gained;
    if (show) {
      const size = 22 + Math.min(18, gained / 60);
      this.fx.text('+' + gained, x, y - 16, size, this.mult >= 3 ? C.gold : C.paper);
    }
    this.checkRecord();
  }

  private checkRecord(): void {
    const best = this.opts?.best ?? 0;
    if (!this.recordBroken && best > 0 && this.score > best && !this.opts?.tutorial) {
      this.recordBroken = true;
      this.fx.text(t('w.record'), 360, this.view.H * 0.38, 52, C.gold, true, 1.8);
      for (let i = 0; i < 4; i++) {
        this.parts.burst(360 + fx.r(-200, 200), this.view.H * 0.3, Math.round(16 * this.q), i % 2 ? this.sp.goldHot : this.sp.penHot, 100, 480, 1.2, 16, {
          drag: 2,
          gravity: 300,
          shape: Shape.Streak,
        });
      }
      audio.record();
      haptics.success();
      this.onEvent({ type: 'record' });
    }
  }

  private bumpCombo(): void {
    if (this.phase === 'attract') return;
    this.combo++;
    this.comboT = COMBO_WINDOW;
    this.mult = 1 + Math.min(this.combo, 100) * 0.04;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    if (this.stats.inkSurge > 0 && this.combo % 10 === 0) {
      this.ink = Math.min(this.stats.maxInk, this.ink + this.stats.inkSurge);
      this.fx.home(360, this.view.H * 0.45, this.hudInk.x, this.hudInk.y, this.pen.color, 26, 0.5);
    }
    const mi = MILESTONES.indexOf(this.combo);
    if (mi >= 0) {
      this.fx.text(t('w.combo.' + this.combo), 360, this.view.H * 0.42, 44 + mi * 4, COMBO_WORD_COLORS[mi], true, 1.3);
      this.fx.flash(this.pen.color, 0.12);
      audio.combo(mi);
      haptics.success();
      this.onEvent({ type: 'combo', n: this.combo });
    }
  }

  private endCombo(): void {
    if (this.combo >= 10) {
      const bonus = this.combo * 10;
      const gained = Math.round(bonus * this.stats.scoreMult * (this.opts?.mod?.scoreMult ?? 1));
      this.score += gained;
      this.fx.text(`${t('w.comboBonus')} +${gained}`, 360, this.view.H * 0.5, 28, C.turkuaz, true, 1.3);
      this.checkRecord();
    }
    this.combo = 0;
    this.mult = 1;
  }

  /** Zincir bitti: 3+ patlamada tek, büyük bir etiket ve kare bonus */
  private endChain(): void {
    const n = this.chainCount;
    this.chainCount = 0;
    if (n < 3 || this.phase === 'attract') return;
    const bonus = n * n * 10;
    const gained = Math.round(bonus * this.stats.scoreMult * (this.opts?.mod?.scoreMult ?? 1));
    this.score += gained;
    this.checkRecord();
    const size = Math.min(56, 30 + n * 2.5);
    this.fx.text(`${t('w.chain', { n })}  +${gained}`, this.chainX, this.chainY - 70, size, n >= 6 ? C.rose : C.gold, true, 1.3);
    if (n >= 5) {
      this.fx.flash(C.gold, 0.1);
      this.hitstop = Math.max(this.hitstop, 0.05);
      audio.combo(Math.min(4, Math.floor(n / 3)));
    }
  }

  private breakCombo(): void {
    if (this.combo >= 5) this.fx.text(t('w.comboBreak'), 360, this.view.H * 0.5, 30, C.crimson, true, 1.2);
    this.combo = 0;
    this.mult = 1;
    this.comboT = 0;
  }

  // ───────────────────────── ŞEHİR ─────────────────────────

  private exitTop(m: Meteor): void {
    m.active = false;
    if (this.phase === 'attract') return;
    this.addScore(15, m.x, 40, false);
    this.parts.burst(m.x, 6, Math.round(8 * this.q), this.sp.penHot, 40, 160, 0.5, 16, { drag: 3 });
    if (this.stats.cometBurst > 0) this.cometBurstAt(m.x, 20);
  }

  private cometBurstAt(x: number, y: number): void {
    const r = 70 + this.stats.cometBurst * 40;
    this.fx.ring(x, y, 10, r, 0.5, this.inkColor, 8);
    this.queueExplosion(x, y, r, 1, 0);
    audio.explode(0.6);
  }

  private domeBlock(m: Meteor): void {
    this.city.domeCharges--;
    this.city.domeFlash = 1;
    m.active = false;
    this.explosionFx(m.x, m.y, this.inkColor, 1);
    this.fx.ring(m.x, m.y, 10, 160, 0.6, this.inkColor, 12);
    this.fx.text(t('w.dome'), m.x, m.y - 50, 28, this.inkColor);
    this.fx.shake(0.25);
    audio.dome();
    haptics.medium();
  }

  private impact(m: Meteor): void {
    m.active = false;
    const x = m.x;
    const y = this.groundY + 10;
    if (this.phase === 'revive' || this.phase === 'dying' || this.phase === 'over') {
      this.explosionFx(x, y, C.ember, 1);
      return;
    }
    if (this.phase === 'attract' || m.tutorial || this.phase === 'tutorial') {
      this.explosionFx(x, y, METEOR_COLORS[KINDS[m.kind].key], 0.7);
      if (this.phase === 'tutorial') {
        this.fx.text(t('w.retry'), 360, this.view.H * 0.45, 30, C.paper, true, 1.2);
        this.tutRetry();
      }
      return;
    }
    if (m.kind === MK.Golden) {
      this.explosionFx(x, y, C.gold, 0.6);
      this.fx.text(t('w.escaped'), x, y - 40, 20, C.gold);
      return;
    }
    const dmg = m.kind === MK.Boss || m.kind === MK.Nova ? 2 : 1;
    // şehre çarpan boss listeden çıkar (havuzdaki nesne başka meteor olarak yeniden kullanılabilir)
    if (m.kind === MK.Boss) this.bosses = this.bosses.filter((b) => b !== m);
    for (let k = 0; k < dmg; k++) {
      const bi = this.city.targetBlock(k === 0 ? x : x + (x < 360 ? BLOCK_W : -BLOCK_W));
      if (bi < 0) break;
      const b = this.city.blocks[bi];
      b.hp--;
      b.flash = 1;
      b.wobble = 1;
      const bx = bi * BLOCK_W + BLOCK_W / 2;
      if (b.hp <= 0) {
        b.collapseT = 0;
        if (this.stats.secondWind > 0) this.secondWind(bx);
        this.parts.burst(bx, this.view.H - 100, Math.round(26 * this.q), this.sp.wood, 100, 420, 1.3, 14, {
          shape: Shape.Chip,
          additive: false,
          gravity: 700,
          spin: 9,
        });
        for (let i = 0; i < Math.round(12 * this.q); i++) {
          this.parts.spawn({
            x: bx + fx.r(-60, 60),
            y: this.view.H - fx.r(40, 120),
            vx: fx.r(-60, 60),
            vy: fx.r(-80, -20),
            life: fx.r(1.2, 2.4),
            size: fx.r(60, 120),
            sizeEnd: 160,
            sprite: this.sp.smoke,
            additive: false,
            drag: 1,
          });
        }
      }
    }
    this.explosionFx(x, y, m.kind === MK.Nova ? METEOR_COLORS.nova : C.ember, m.kind === MK.Boss ? 2.2 : m.kind === MK.Nova ? 1.9 : 1.5);
    this.fx.ring(x, y, 10, 220, 0.6, C.ember, 14);
    this.fx.shake(m.kind === MK.Boss ? 1 : 0.6);
    this.fx.flash(C.crimson, 0.22);
    this.fx.damageA = 1;
    this.hitstop = 0.06;
    audio.cityHit();
    haptics.heavy();
    this.waveDamaged = true;
    this.breakCombo();
    this.bg.lights = this.city.alive / BLOCKS;
    this.onEvent({ type: 'hit', left: this.city.alive });
    if (this.city.alive === 0) this.cityFallen();
  }

  private cityFallen(): void {
    if (this.stats.phoenix > this.phoenixUsed) {
      this.phoenixUsed++;
      for (const i of [1, 2, 3]) {
        const b = this.city.blocks[i];
        b.hp = b.maxHp;
        b.repairT = 0;
      }
      for (const m of this.meteors) if (m.active && !m.friendly && m.kind !== MK.Boss) this.queueExplosion(m.x, m.y, 10, 2, Math.random() * 0.5, m);
      this.slowOverride = 0.25;
      this.slowOverrideT = 1.2;
      this.fx.flash(C.gold, 0.8);
      this.fx.text(t('w.phoenix'), 360, this.view.H * 0.4, 56, C.gold, true, 2);
      this.parts.burst(360, this.view.H - 140, Math.round(80 * this.q), this.sp.goldHot, 100, 700, 1.6, 26, { drag: 1.5, gravity: -80 });
      this.bg.lights = this.city.alive / BLOCKS;
      audio.rankUp();
      haptics.success();
      this.onEvent({ type: 'phoenix' });
      return;
    }
    if (this.drawing) this.endLine();
    const can = !!this.opts && !this.opts.tutorial && this.revives < 2 && !!this.canRevive?.(this.revives);
    if (can) {
      this.phase = 'revive';
      this.fx.shake(0.8);
      audio.cityHit();
      haptics.error();
      this.onEvent({ type: 'revive', count: this.revives });
      return;
    }
    this.fall();
  }

  private fall(): void {
    this.phase = 'dying';
    this.dyingT = 2.4;
    this.fx.shake(1);
    audio.gameOver();
    haptics.error();
  }

  /** Altınla devam: üç mahalle yeniden yükselir, sahnedeki düşmanlar patlar */
  revive(): void {
    if (this.phase !== 'revive') return;
    this.revives++;
    for (const i of [1, 2, 3]) {
      const b = this.city.blocks[i];
      b.hp = b.maxHp;
      b.repairT = 0;
    }
    for (const m of this.meteors) if (m.active && !m.friendly && m.kind !== MK.Boss) this.queueExplosion(m.x, m.y, 10, 2, Math.random() * 0.4, m);
    for (const b of this.bosses) if (b.active && b.kind === MK.Boss) b.vy = -260 * this.speedScale;
    this.twinC.vy = -260 * this.speedScale;
    this.phase = 'play';
    this.slowOverride = 0.25;
    this.slowOverrideT = 1;
    this.ink = this.stats.maxInk;
    this.fx.flash(this.pen.color, 0.6);
    this.parts.burst(360, this.view.H - 140, Math.round(70 * this.q), this.sp.penHot, 100, 650, 1.5, 24, { drag: 1.5, gravity: -80 });
    this.bg.lights = this.city.alive / BLOCKS;
    audio.repair();
    haptics.success();
  }

  /** Devam etmeden vazgeç */
  giveUp(): void {
    if (this.phase === 'revive') this.fall();
  }

  result(): RunResult {
    return {
      score: this.score,
      wave: this.wave,
      kills: this.kills,
      deflects: this.deflects,
      maxCombo: this.maxCombo,
      bossKills: this.bossKills,
      golden: this.golden,
      coins: this.coins,
      time: this.runTime,
      perfectWaves: this.perfectWaves,
      maxChain: this.maxChain,
      maxLineDeflect: this.maxLineDeflect,
      daily: this.opts?.daily ?? false,
      upgrades: this.upgradesTaken.slice(),
    };
  }

  /** Oyuncu vazgeçerse (menüye dön) mevcut sonucu kapat */
  abandon(): RunResult {
    this.phase = 'over';
    return this.result();
  }

  // ───────────────────────── AKTİF YETENEK ─────────────────────────

  get anySkillReady(): boolean {
    if (this.phase !== 'play' && this.phase !== 'intro') return false;
    for (const k of this.skillSlots) if (k.left <= 0) return true;
    return false;
  }

  /** Düşman öldürmek / sektirmek bekleme sürelerini kısaltır */
  private chargeSkills(v: number): void {
    if (this.phase === 'attract' || this.phase === 'tutorial' || !this.opts || this.opts.tutorial) return;
    this.tickSkills(v * SKILL_KILL_SEC * this.stats.charge);
  }

  private tickSkills(sec: number): void {
    for (const k of this.skillSlots) {
      if (k.left <= 0) continue;
      k.left = Math.max(0, k.left - sec);
      if (k.left <= 0) {
        audio.skillReady();
        haptics.light();
        const first = !this.skillSeen.has(k.id);
        this.skillSeen.add(k.id);
        this.onEvent({ type: 'skillReady', id: k.id, shape: k.shape, first });
      }
    }
  }

  /** Şekil kılavuzunu ekranın ortasında canlandır (ipucu) */
  showShapeHint(id: SkillId): void {
    const k = this.skillSlots.find((s) => s.id === id);
    if (!k) return;
    this.shapeHint = { shape: k.shape, t: 0, color: k.color === '#FFFFFF' ? this.pen.color : k.color };
  }

  /** Bitirilen çizgi bir yetenek şekli mi? Hazırsa yeteneği at (çizgi ışığa dönüşür) */
  private trySkillGesture(l: InkLine): boolean {
    if ((this.phase !== 'play' && this.phase !== 'intro') || !this.skillSlots.length) return false;
    const g = recognize(l.pts, l.n);
    if (!g) return false;
    const k = this.skillSlots.find((s) => s.shape === g.shape);
    if (!k) return false;
    if (k.left > 0) {
      // bekliyor: çizgi normal mürekkep olarak kalır, kalan süre gösterilir
      this.fx.text(`${Math.ceil(k.left)}s`, g.cx, g.cy, 30, '#A8A6C8', false, 0.9);
      this.onEvent({ type: 'skillWait', id: k.id, left: k.left });
      return false;
    }
    this.castSkill(k, g, l);
    return true;
  }

  private castSkill(k: SkillSlot, g: GestureResult, l: InkLine): void {
    k.left = k.cd;
    const H = this.view.H;
    const col = k.color === '#FFFFFF' ? this.inkColor : k.color;
    // çizilen şekil ışığa dönüşüp merkezine akar; harcanan mürekkep iade edilir
    l.shattered = true;
    l.kill();
    const p = l.pts;
    const hot = this.parts.register('hot:' + col, this.sprites.glow(col, true));
    const step = Math.max(1, Math.round(2 / this.q));
    for (let i = 0; i < l.n; i += step) {
      const x = p[i * 2];
      const y = p[i * 2 + 1];
      this.parts.spawn({ x, y, vx: (g.cx - x) * 2.2, vy: (g.cy - y) * 2.2, life: 0.45, size: fx.r(9, 16), sprite: hot, drag: 2.5 });
    }
    this.ink = Math.min(this.stats.maxInk, this.ink + this.strokeInk);
    this.strokeInk = 0;
    this.overdraw = false;
    this.castFx = { shape: k.shape, x: g.cx, y: g.cy, r: Math.max(60, g.r), t: 0, color: col };
    this.fx.ring(g.cx, g.cy, 10, g.r * 2.4, 0.6, col, 10);
    switch (k.id) {
      case 'nova':
        this.novaR = 0;
        this.novaX = g.cx;
        this.novaY = g.cy;
        this.novaDmg = k.power;
        this.novaHit.clear();
        this.hitstop = 0.08;
        this.fx.flash('#FFFFFF', 0.5);
        this.fx.shake(0.7);
        this.parts.burst(g.cx, g.cy, Math.round(70 * this.q), this.sp.penHot, 200, 900, 1.2, 22, { drag: 1.6, shape: Shape.Streak });
        audio.skillNova();
        break;
      case 'warp':
        this.warpT = k.power;
        this.fx.flash('#6EC8FF', 0.35);
        this.fx.ring(g.cx, g.cy, 20, 700, 0.9, '#6EC8FF', 18);
        audio.skillWarp();
        break;
      case 'aegis':
        this.aegisT = k.power;
        this.fx.flash(col, 0.3);
        this.parts.burst(360, this.groundY - 60, Math.round(60 * this.q), this.sp.penHot, 100, 600, 1, 18, { drag: 2, gravity: -60 });
        audio.skillAegis();
        break;
      case 'starfall':
        this.starfallN = k.power;
        this.starfallT = 0;
        this.fx.flash(C.gold, 0.3);
        audio.skillStar();
        break;
    }
    this.fx.text(t('skill.' + k.id), 360, H * 0.4, 46, col, true, 1.3);
    haptics.success();
    this.onEvent({ type: 'skill', id: k.id });
  }

  private updateSkill(sdt: number, realDt: number): void {
    const H = this.view.H;
    if ((this.phase === 'play' || this.phase === 'intro') && this.skillSlots.length) this.tickSkills(sdt * this.stats.charge);
    if (this.shapeHint) {
      this.shapeHint.t += realDt;
      if (this.shapeHint.t > 2.8) this.shapeHint = null;
    }
    if (this.castFx) {
      this.castFx.t += realDt;
      if (this.castFx.t > 0.7) this.castFx = null;
    }
    // Yıldız Patlaması: çizilen dairenin merkezinden yayılan şok dalgası
    if (this.novaR >= 0) {
      this.novaR += realDt * 1500 * this.speedScale;
      const ox = this.novaX;
      const oy = this.novaY;
      for (const m of this.meteors) {
        if (!m.active || m.friendly || this.novaHit.has(m)) continue;
        const d = Math.hypot(m.x - ox, m.y - oy);
        if (d > this.novaR + m.r) continue;
        this.novaHit.add(m);
        if (m.kind === MK.Boss) {
          this.hurtBoss(m, this.novaDmg, m.x, m.y + m.r * 0.5);
          m.vy = -220 * this.speedScale;
          if (m.bossType === BT.Twins) this.twinC.vy = -220 * this.speedScale;
          if (m.bossType === BT.Frost) m.shields = 0;
        } else {
          m.armor = 0;
          this.killMeteor(m, 1);
        }
      }
      if (this.novaR > H + 400) {
        this.novaR = -1;
        this.novaHit.clear();
      }
    }
    // Zaman Kırılması: düşmanlar ağırlaşır, mürekkep hızlı dolar
    if (this.warpT > 0) this.warpT -= realDt;
    const hs = this.warpT > 0 ? 0.28 : 1;
    this.hostileScale += (hs - this.hostileScale) * Math.min(1, realDt * 6);
    if (this.aegisT > 0) this.aegisT -= realDt;
    // Yıldız Yağmuru: şehirden yukarı güdümlü yıldızlar
    if (this.starfallN > 0) {
      this.starfallT -= realDt;
      if (this.starfallT <= 0) {
        this.starfallT = 0.09;
        this.starfallN--;
        const x = fx.r(90, 630);
        const m = this.spawn(MK.Comet, x, this.groundY - 20, fx.r(-160, 160) * this.speedScale, -950 * this.speedScale);
        if (m) {
          m.friendly = true;
          m.homing = 6;
          m.flash = 0.2;
          m.chainDepth = 1;
          this.parts.burst(x, this.groundY - 20, Math.round(10 * this.q), this.sp.goldHot, 60, 260, 0.5, 14, { drag: 3 });
          audio.deflect(this.combo + 3);
        }
      }
    }
    // koruyucu uydu: şehrin üstünde döner, en alçaktaki düşmanı lazerle vurur
    if (this.stats.guardian > 0 && this.phase !== 'attract') {
      this.droneA += realDt * 1.1;
      if (this.phase === 'play') {
        this.droneT -= sdt;
        if (this.droneT <= 0) {
          let target: Meteor | null = null;
          for (const m of this.meteors) {
            if (!m.active || m.friendly || m.kind === MK.Boss || m.ghost || m.y < H * 0.25) continue;
            if (!target || m.y > target.y) target = m;
          }
          if (target) {
            const [dx, dy] = this.dronePos();
            this.fx.bolt(dx, dy, target.x, target.y, C.turkuaz);
            this.fx.ring(dx, dy, 4, 40, 0.3, C.turkuaz, 5);
            target.armor = 0;
            this.killMeteor(target, 1);
            audio.zap();
            this.droneT = this.stats.guardian >= 2 ? 4 : 7;
          } else {
            this.droneT = 0.4;
          }
        }
      }
    }
  }

  private dronePos(): [number, number] {
    return [360 + Math.cos(this.droneA) * 270, this.groundY - 80 + Math.sin(this.droneA * 2) * 16];
  }

  /** Aegis kalkanının x noktasındaki yüksekliği (elips kubbe) */
  private aegisY(x: number): number {
    const u = clamp((x - 360) / 430, -1, 1);
    return this.groundY + 40 - 175 * Math.sqrt(1 - u * u);
  }

  private aegisReflect(m: Meteor): void {
    if (m.kind === MK.Boss) {
      if (m.bossType === BT.Twins) this.twinC.vy = -200 * this.speedScale;
      else m.vy = -200 * this.speedScale;
      m.flash = 0.3;
      this.fx.ring(m.x, m.y + m.r, 10, 200, 0.5, this.inkColor, 12);
      audio.dome();
      return;
    }
    const sp = Math.max(560 * this.speedScale, Math.hypot(m.vx, m.vy) * 1.1);
    const a = -Math.PI / 2 + clamp((m.x - 360) / 430, -1, 1) * 0.5 + fx.r(-0.15, 0.15);
    m.vx = Math.cos(a) * sp;
    m.vy = Math.sin(a) * sp;
    m.y = this.aegisY(m.x) - m.r - 2;
    m.friendly = true;
    m.fade = 0;
    m.armor = 0;
    m.homing = 2.5;
    m.flash = 0.25;
    this.deflects++;
    this.bumpCombo();
    this.addScore(10, m.x, m.y, false);
    this.fx.ring(m.x, m.y + m.r, 6, 90, 0.4, this.inkColor, 8);
    audio.deflect(this.combo);
    haptics.light();
  }

  /** Ayaz dalgası: çevredeki düşmanları yavaşlatır */
  private frostNova(x: number, y: number, r: number, dur: number, big: boolean): void {
    for (const m of this.meteors) {
      if (!m.active || m.friendly || m.kind === MK.Boss) continue;
      if ((m.x - x) ** 2 + (m.y - y) ** 2 < r * r) m.slowT = Math.max(m.slowT, dur);
    }
    this.fx.ring(x, y, 8, r, big ? 0.6 : 0.4, '#BFF6FF', big ? 10 : 6);
    if (big) this.parts.burst(x, y, Math.round(16 * this.q), this.sp.ice, 60, 300, 0.8, 10, { drag: 2.5, shape: Shape.Streak });
  }

  /** Buz tutan çizgiler kısa süre sonra kırılır */
  private updateFrozenLines(dt: number): void {
    for (const l of this.lines.pool) {
      if (!l.alive || l.frozen <= 0) continue;
      l.frozen -= dt;
      if (l.frozen <= 0 && l.collidable) {
        const p = l.pts;
        for (let i = 0; i < l.n; i += 3) {
          this.parts.spawn({ x: p[i * 2], y: p[i * 2 + 1], vx: fx.r(-120, 120), vy: fx.r(-160, 60), life: fx.r(0.4, 0.8), size: fx.r(6, 10), sprite: this.sp.ice, shape: Shape.Streak, gravity: 500, drag: 1.5 });
        }
        this.shatterLine(l);
      }
    }
  }

  /** İkinci nefes: bir mahalle düşünce mürekkep dolar, zaman bir an yavaşlar */
  private secondWind(x: number): void {
    this.ink = this.stats.maxInk;
    this.slowOverride = 0.35;
    this.slowOverrideT = 1.8;
    this.fx.text(t('w.secondWind'), x, this.view.H * 0.55, 30, this.pen.color, true, 1.3);
    this.fx.home(x, this.view.H - 160, this.hudInk.x, this.hudInk.y, this.pen.color, 30, 0.6);
  }

  /** Yetenek ve kart görselleri (dünya dönüşümü altında) */
  private renderSkillFx(g: CanvasRenderingContext2D): void {
    const col = this.inkColor;
    g.globalCompositeOperation = 'lighter';
    if (this.novaR >= 0) {
      const a = clamp(1 - this.novaR / (this.view.H + 400), 0, 1);
      g.strokeStyle = col;
      g.globalAlpha = 0.28 * a;
      g.lineWidth = 60;
      g.beginPath();
      g.arc(this.novaX, this.novaY, this.novaR, 0, TAU);
      g.stroke();
      g.strokeStyle = '#FFFFFF';
      g.globalAlpha = 0.85 * a;
      g.lineWidth = 7;
      g.beginPath();
      g.arc(this.novaX, this.novaY, this.novaR, 0, TAU);
      g.stroke();
    }
    // atılan şekil: kusursuz hali parlar ve büyüyerek söner
    const cf = this.castFx;
    if (cf) {
      const p = cf.t / 0.7;
      const sz = cf.r * 2 * (1 + p * 0.5);
      this.traceShape(g, cf.shape, cf.x - sz / 2, cf.y - sz / 2, sz, 1);
      g.strokeStyle = cf.color;
      g.globalAlpha = 0.35 * (1 - p);
      g.lineWidth = 26;
      g.stroke();
      g.strokeStyle = '#FFFFFF';
      g.globalAlpha = 0.9 * (1 - p);
      g.lineWidth = 5;
      g.stroke();
    }
    if (this.aegisT > 0) {
      const a = Math.min(1, this.aegisT * 2) * (this.aegisT < 1.5 ? 0.6 + 0.4 * Math.sin(this.realT * 30) : 1);
      const cy = this.groundY + 40;
      for (const [w, al, c] of [
        [34, 0.14, col],
        [10, 0.4, col],
        [3, 0.9, '#FFFFFF'],
      ] as const) {
        g.strokeStyle = c;
        g.globalAlpha = al * a;
        g.lineWidth = w;
        g.beginPath();
        g.ellipse(360, cy, 430, 175, 0, Math.PI, TAU);
        g.stroke();
      }
      // kubbe üzerinde kayan altıgen parıltılar
      const glow = this.sprites.glow(col, true);
      for (let i = 0; i < 9; i++) {
        const u = ((i / 9 + this.realT * 0.08) % 1) * Math.PI;
        const x = 360 - Math.cos(u) * 430;
        const y = cy - Math.sin(u) * 175;
        g.globalAlpha = 0.5 * a;
        blit(g, glow, x - 14, y - 14, 28, 28);
      }
    }
    if (this.stats.guardian > 0 && this.phase !== 'attract') {
      const [x, y] = this.dronePos();
      const ready = this.droneT <= 1;
      g.globalAlpha = 0.6;
      const s = ready ? 60 : 44;
      blit(g, this.sprites.glow(C.turkuaz), x - s / 2, y - s / 2, s, s);
      g.globalAlpha = 1;
      blit(g, this.sprites.glow('#FFFFFF', true), x - 9, y - 9, 18, 18);
      g.globalAlpha = 0.5;
      g.strokeStyle = C.turkuaz;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x - 16, y);
      g.lineTo(x + 16, y);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // ───────────────────────── KARA DELİK ─────────────────────────

  private spawnHole(x: number, y: number): void {
    this.holes.push({ x: clamp(x, 80, 640), y: clamp(y, 200, this.groundY - 120), t: 0, life: 2.4 });
    audio.blackHole();
    this.fx.flash(C.violet, 0.2);
  }

  private updateHoles(dt: number): void {
    for (let i = this.holes.length - 1; i >= 0; i--) {
      const h = this.holes[i];
      h.t += dt;
      if (h.t >= h.life) {
        this.holes.splice(i, 1);
        this.fx.ring(h.x, h.y, 10, 200, 0.5, C.violet, 10);
        continue;
      }
      for (const m of this.meteors) {
        if (!m.active || m.friendly || m.kind === MK.Boss) continue;
        const dx = h.x - m.x;
        const dy = h.y - m.y;
        const d = Math.hypot(dx, dy);
        if (d < 300) {
          const f = (1600 / Math.max(40, d)) * dt * 60;
          m.vx += (dx / d) * f * dt * 8;
          m.vy += (dy / d) * f * dt * 8;
          if (d < 28) this.killMeteor(m, 1);
        }
      }
      if (Math.random() < dt * 60 * this.q) {
        const a = Math.random() * TAU;
        const r = fx.r(90, 170);
        this.parts.spawn({
          x: h.x + Math.cos(a) * r,
          y: h.y + Math.sin(a) * r,
          vx: -Math.cos(a) * r * 2 + -Math.sin(a) * 200,
          vy: -Math.sin(a) * r * 2 + Math.cos(a) * 200,
          life: 0.45,
          size: fx.r(6, 12),
          sprite: this.sp.violetHot,
          shape: Shape.Streak,
        });
      }
    }
  }

  // ───────────────────────── EFEKTLER ─────────────────────────

  explosionFx(x: number, y: number, color: string, scale: number): void {
    const q = this.q;
    const glowId = this.parts.register('glow:' + color, this.sprites.glow(color));
    const hotId = this.parts.register('hot:' + color, this.sprites.glow(color, true));
    // çekirdek flaş + sönen ateş topu
    this.parts.spawn({ x, y, vx: 0, vy: 0, life: 0.14, size: 210 * scale, sprite: this.sp.white, alpha: 0.9 });
    this.parts.spawn({ x, y, vx: 0, vy: 0, life: 0.5, size: 150 * scale, sizeEnd: 60 * scale, sprite: hotId });
    this.parts.burst(x, y, Math.round(18 * scale * q), glowId, 60, 420 * scale, 0.95, 38 * scale, { drag: 3.4 });
    this.parts.burst(x, y, Math.round(16 * scale * q), this.sp.white, 220, 760 * scale, 0.5, 7, {
      drag: 3,
      shape: Shape.Streak,
      gravity: 200,
    });
    // yavaş düşen közler
    this.parts.burst(x, y, Math.round(8 * scale * q), hotId, 60, 260 * scale, 1.4, 9, {
      drag: 1.6,
      gravity: 160,
    });
    this.parts.burst(x, y, Math.round(6 * scale * q), this.sp.rock, 80, 380 * scale, 1, 9 * scale, {
      shape: Shape.Chip,
      additive: false,
      gravity: 600,
      spin: 10,
    });
    for (let i = 0; i < Math.round(4 * scale * q); i++) {
      this.parts.spawn({
        x: x + fx.r(-14, 14),
        y: y + fx.r(-14, 14),
        vx: fx.r(-40, 40),
        vy: fx.r(-70, -10),
        life: fx.r(0.8, 1.5),
        size: 40 * scale,
        sizeEnd: 110 * scale,
        sprite: this.sp.smoke,
        additive: false,
        drag: 1.2,
        alpha: 0.8,
      });
    }
    this.fx.ring(x, y, 8 * scale, 120 * scale, 0.55, color, 8 * scale);
  }

  private fireFx(x: number, y: number, rubble: boolean): void {
    if (this.q < 0.5 && Math.random() < 0.5) return;
    if (!rubble) {
      this.parts.spawn({
        x,
        y,
        vx: fx.r(-15, 15),
        vy: fx.r(-120, -60),
        life: fx.r(0.4, 0.8),
        size: fx.r(18, 34),
        sizeEnd: 4,
        sprite: this.sp.flame,
        drag: 0.5,
      });
    }
    if (Math.random() < 0.35) {
      this.parts.spawn({
        x,
        y: y - 20,
        vx: fx.r(-10, 20),
        vy: fx.r(-60, -30),
        life: fx.r(1.5, 2.6),
        size: 30,
        sizeEnd: 90,
        sprite: this.sp.smoke,
        additive: false,
        alpha: 0.7,
      });
    }
    if (rubble && Math.random() < 0.5) {
      this.parts.spawn({ x, y, vx: fx.r(-20, 20), vy: fx.r(-60, -20), life: 0.8, size: 5, sprite: this.sp.emberHot, drag: 0.8 });
    }
  }

  // ───────────────────────── ATTRACT (MENÜ DEMOSU) ─────────────────────────

  private updateAttract(sdt: number, realDt: number): void {
    this.attractT -= sdt;
    if (this.attractT <= 0) {
      this.attractT = fx.r(0.9, 1.6);
      const kinds = [MK.Normal, MK.Normal, MK.Fast, MK.Splitter, MK.Golden];
      const kind = kinds[fx.i(0, kinds.length - 1)];
      const x = fx.r(80, 640);
      const tx = clamp(x + fx.r(-200, 200), 60, 660);
      const dy = this.groundY;
      const L = Math.hypot(tx - x, dy);
      const s = fx.r(170, 230) * this.speedScale * KINDS[kind].speed;
      this.spawn(kind, x, -30, ((tx - x) / L) * s, (dy / L) * s);
    }
    // bot çizgi çizer
    if (this.botLine) {
      const l = this.botLine;
      if (!l.alive || !l.drawing) {
        this.botLine = null;
      } else {
        this.botIdx += realDt * 60;
        while (this.botPts.length / 2 > 1 && this.botIdx >= 1) {
          this.botIdx -= 1;
          const px = this.botPts.shift()!;
          const py = this.botPts.shift()!;
          l.extend(px, py, this.realT * 1000 + Math.random() * 20);
        }
        if (this.botPts.length <= 2) {
          this.lines.end(1.4);
          this.botLine = null;
        }
      }
      return;
    }
    this.botT -= realDt;
    if (this.botT > 0) return;
    this.botT = 0.2;
    const H = this.view.H;
    for (const m of this.meteors) {
      if (!m.active || m.friendly || m.y < H * 0.34 || m.y > H * 0.62) continue;
      if (Math.random() < 0.25) continue;
      const lead = 0.45;
      const cx = m.x + m.vx * lead;
      const cy = m.y + m.vy * lead + 24;
      const sp = Math.hypot(m.vx, m.vy) || 1;
      let ang = Math.atan2(m.vy, m.vx) + Math.PI / 2 + fx.r(-0.45, 0.45);
      if (Math.cos(ang) < 0) ang += Math.PI;
      const len = fx.r(130, 190);
      const x0 = cx - Math.cos(ang) * len * 0.5;
      const y0 = cy - Math.sin(ang) * len * 0.5;
      const line = this.lines.begin(x0, y0, this.realT * 1000, 2, (this.realT * 90) % 360);
      if (!line) return;
      this.botLine = line;
      this.botPts = [];
      const steps = 12;
      const bend = fx.r(-18, 18);
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        const bx = x0 + Math.cos(ang) * len * f - Math.sin(ang) * Math.sin(f * Math.PI) * bend;
        const by = y0 + Math.sin(ang) * len * f + Math.cos(ang) * Math.sin(f * Math.PI) * bend;
        this.botPts.push(bx, by);
      }
      this.botIdx = 0;
      void sp;
      return;
    }
  }

  // ───────────────────────── EĞİTİM ─────────────────────────

  private setTutStep(step: number): void {
    if (step === this.tutStep) return;
    this.tutStep = step;
    this.tutT = 0;
    this.tutFrozen = false;
    this.tutDrawn = false;
    this.ghost = null;
    const H = this.view.H;
    const v = 150 * this.speedScale;
    if (step === 0) {
      this.tutA = this.spawn(MK.Normal, 360, -30, 0, v);
      if (this.tutA) this.tutA.tutorial = true;
      this.tutB = null;
    } else if (step === 1) {
      this.fx.text(t('w.great'), 360, H * 0.4, 44, this.pen.color, true, 1.2);
      this.tutA = this.spawn(MK.Normal, 250, -30, 0, v);
      this.tutB = this.spawn(MK.Normal, 470, -330, 0, v);
      if (this.tutA) this.tutA.tutorial = true;
      if (this.tutB) this.tutB.tutorial = true;
    } else if (step === 2) {
      this.fx.text(t('w.nice'), 360, H * 0.4, 44, C.gold, true, 1.2);
      this.ghost = null;
    }
    this.onEvent({ type: 'tutorial', step });
  }

  skipTutorial(): void {
    if (this.phase !== 'tutorial') return;
    if (this.drawing) this.endLine();
    for (const m of this.meteors) m.active = false;
    this.ghost = null;
    this.tutStep = 3;
    this.startWave(1);
  }

  private tutRetry(): void {
    // tüm eğitim meteorları çözülünce adımı yeniden kur
    const step = this.tutStep;
    this.tutStep = -1;
    window.setTimeout(() => {
      if (this.phase === 'tutorial' && this.tutStep === -1) this.setTutStep(step);
    }, 700);
  }

  private updateTutorial(sdt: number, realDt: number): void {
    this.tutT += realDt;
    const H = this.view.H;
    if (this.tutStep === 0 && this.tutA) {
      const a = this.tutA;
      if (a.active && !a.friendly && a.y > H * 0.4 && !this.tutDrawn && !this.tutFrozen) {
        this.tutFrozen = true;
        this.ghost = { x0: a.x - 120, y0: a.y + 150, x1: a.x + 120, y1: a.y + 150 };
      }
      if (this.tutDrawn) this.ghost = null;
      if (a.friendly && (!a.active || a.y < H * 0.2)) this.setTutStep(1);
    } else if (this.tutStep === 1 && this.tutA && this.tutB) {
      const a = this.tutA;
      const b = this.tutB;
      if (a.active && !a.friendly && a.y > H * 0.44 && !this.tutDrawn && !this.tutFrozen) {
        this.tutFrozen = true;
        // A'yı B'ye yansıtacak çizgi: yansıma normali = (çıkış - giriş) yönü
        const cx = a.x;
        const cy = a.y + 110;
        let ox = b.x - cx;
        let oy = b.y + 60 - cy;
        const ol = Math.hypot(ox, oy) || 1;
        ox /= ol;
        oy /= ol;
        let nx = ox - 0;
        let ny = oy - 1;
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl;
        ny /= nl;
        const tx = -ny;
        const ty = nx;
        this.ghost = { x0: cx - tx * 110, y0: cy - ty * 110, x1: cx + tx * 110, y1: cy + ty * 110 };
      }
      if (this.tutDrawn) this.ghost = null;
      // ikisi de patlamadan çözüldüyse (kaçtı / yere düştü) adımı yeniden kur
      if (!a.active && !b.active && this.tutStep === 1) this.tutRetry();
    } else if (this.tutStep === 2) {
      if (this.tutT > 3.2) {
        this.phase = 'intro';
        this.tutStep = 3;
        this.onEvent({ type: 'tutorialDone' });
        // eğitim bitince yetenekler de devreye girer
        if (this.opts) this.skillSlots = this.opts.skills.map((k) => ({ ...k, left: k.cd * 0.5 }));
        for (const m of this.meteors) m.active = false;
        this.startWave(1);
      }
    }
    void sdt;
  }

  // ───────────────────────── ÇİZİM ─────────────────────────

  render(): void {
    const tr = this.trans;
    if (tr) {
      if (tr.stage === 0) this.captureTransition(tr);
      this.renderDrum(tr);
      return;
    }
    this.renderScene();
  }

  // ───────────────────────── ATMOSFER GEÇİŞİ (360° TAMBUR) ─────────────────────────

  /** Sahne tamburu döner, arkasındaki yeni dünya ortaya çıkar */
  beginTransition(to: number): boolean {
    if (this.trans || to === this.atmIndex) return false;
    if (this.phase !== 'cleared' && this.phase !== 'attract') return false;
    if (this.drawing) this.endLine();
    const v = this.view;
    const mk = (c: HTMLCanvasElement | null): HTMLCanvasElement => {
      const cv = c ?? document.createElement('canvas');
      if (cv.width !== v.canvas.width || cv.height !== v.canvas.height) {
        cv.width = v.canvas.width;
        cv.height = v.canvas.height;
      }
      return cv;
    };
    this.snapA = mk(this.snapA);
    this.snapB = mk(this.snapB);
    const lines = new Float32Array(28 * 3);
    for (let i = 0; i < 28; i++) {
      lines[i * 3] = Math.random();
      lines[i * 3 + 1] = Math.random();
      lines[i * 3 + 2] = 0.4 + Math.random() * 0.8;
    }
    this.trans = { t: 0, dur: 2.7, to, stage: 0, back: this.phase, old: this.snapA, neu: this.snapB, lines };
    this.phase = 'transition';
    audio.sceneTurn();
    haptics.medium();
    return true;
  }

  get transitioning(): boolean {
    return this.trans !== null;
  }

  private captureTransition(tr: DrumTransition): void {
    const v = this.view;
    // eski sahne: tuvaldeki son kare (yeniden çizmeye gerek yok; geçiş karesi yarı maliyette)
    tr.old.getContext('2d')!.drawImage(v.canvas, 0, 0);
    // yeni sahne: atmosferi uygula, sahneyi temiz çiz
    for (const m of this.meteors) m.active = false;
    this.lines.clear();
    this.parts.clear();
    this.fx.clear();
    this.applyAtmosphere(tr.to);
    this.renderScene();
    tr.neu.getContext('2d')!.drawImage(v.canvas, 0, 0);
    tr.stage = 1;
  }

  private updateTransition(realDt: number): void {
    const tr = this.trans;
    if (!tr) {
      this.phase = 'cleared';
      return;
    }
    if (tr.stage === 0) return;
    tr.t += realDt;
    // dönüşün ortasında yeni dünyanın müziği ve ışıltısı
    if (tr.t >= tr.dur) {
      this.trans = null;
      this.phase = tr.back;
      this.director.bias = this.atm.bias;
      this.fx.flash(this.atm.accent, 0.16);
      audio.newWorld();
      haptics.success();
      this.onEvent({ type: 'atmosphere', index: this.atmIndex });
    }
  }

  private renderDrum(tr: DrumTransition): void {
    const v = this.view;
    const g = v.ctx;
    const W = v.canvas.width;
    const H = v.canvas.height;
    const p = clamp(tr.t / tr.dur, 0, 1);
    // yumuşak dönüş: sinüs yavaşlaması (ani hızlanma ve sert duruş yok)
    const e = 0.5 - 0.5 * Math.cos(Math.PI * p);
    const theta = e * Math.PI;
    const speed = Math.sin(Math.PI * p);
    const zoom = 1 - 0.11 * speed;
    const R = (W / 2) * zoom;
    const cx = W / 2;
    const cy = H / 2;
    const accent = this.atm.accent;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#04051A';
    g.fillRect(0, 0, W, H);
    // tamburun arkası: yeni dünyanın renginde yumuşak bir nebula ve süzülen yıldızlar
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.45 * speed;
    blit(g, this.sprites.glow(accent), -W * 0.35, H * 0.05, W * 1.7, H * 0.9);
    const star = this.sprites.glow('#FFFFFF', true);
    for (let i = 0; i < 28; i++) {
      const tw = 0.5 + 0.5 * Math.sin(tr.t * 3 + i * 1.7);
      g.globalAlpha = (0.35 + 0.45 * tw) * speed;
      const sx = ((tr.lines[i * 3 + 2] * 7.13 + p * 0.18 * tr.lines[i * 3]) % 1) * W;
      const sy = tr.lines[i * 3 + 1] * H;
      const ss = 3 + tr.lines[i * 3] * 5;
      blit(g, star, sx - ss / 2, sy - ss / 2, ss, ss);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    const face = (img: HTMLCanvasElement, phi: number): void => {
      const N = 72;
      for (let j = 0; j < N; j++) {
        const a0 = phi + (j / N - 0.5) * Math.PI;
        const a1 = phi + ((j + 1) / N - 0.5) * Math.PI;
        if (a1 <= -Math.PI / 2 || a0 >= Math.PI / 2) continue;
        const c0 = Math.max(a0, -Math.PI / 2);
        const c1 = Math.min(a1, Math.PI / 2);
        const u0 = (c0 - phi) / Math.PI + 0.5;
        const u1 = (c1 - phi) / Math.PI + 0.5;
        const x0 = cx + R * Math.sin(c0);
        const x1 = cx + R * Math.sin(c1);
        const w = x1 - x0;
        if (w < 0.3) continue;
        const shade = Math.cos((c0 + c1) / 2);
        const h = H * zoom * (0.88 + 0.12 * shade);
        const y = cy - h / 2;
        g.globalAlpha = 1;
        g.drawImage(img, u0 * W, 0, Math.max(1, (u1 - u0) * W), H, x0, y, w + 0.8, h);
        // kenara doğru derin gece mavisine yumuşak kararma (siyaha değil)
        const dark = (1 - shade) * (1 - shade) * 0.7;
        if (dark > 0.01) {
          g.globalAlpha = dark;
          g.fillStyle = '#060824';
          g.fillRect(x0, y, w + 0.8, h);
        }
      }
      g.globalAlpha = 1;
    };
    face(tr.old, theta);
    face(tr.neu, theta - Math.PI);

    g.globalCompositeOperation = 'lighter';
    // dikiş: sert çizgi yerine yeni dünyanın renginde yumuşak bir ışık perdesi
    const seamX = cx - R * Math.cos(theta);
    if (p > 0.03 && p < 0.97) {
      g.globalAlpha = 0.55 * speed;
      blit(g, this.sprites.glow(accent), seamX - W * 0.22, cy - H * 0.55, W * 0.44, H * 1.1);
      g.globalAlpha = 0.35 * speed;
      blit(g, this.sprites.glow('#FFFFFF', true), seamX - W * 0.04, cy - H * 0.45 * zoom, W * 0.08, H * 0.9 * zoom);
    }
    // yeni dünya öne gelirken üstünden geçen yumuşak bir ışık süpürmesi
    if (p > 0.55) {
      const q = (p - 0.55) / 0.45;
      const lx = -W * 0.4 + q * W * 1.8;
      g.globalAlpha = 0.28 * Math.sin(Math.PI * q);
      blit(g, this.sprites.glow(accent, true), lx - W * 0.3, -H * 0.1, W * 0.6, H * 1.2);
    }
    // ince, sönük hız izleri
    const streak = this.sprites.glow('#FFFFFF', true);
    for (let i = 0; i < 28; i++) {
      const ly = tr.lines[i * 3 + 1] * H;
      const len = W * 0.2 * tr.lines[i * 3 + 2] * speed;
      const lx = ((tr.lines[i * 3] + p * 1.8 * tr.lines[i * 3 + 2]) % 1.3) * W - len;
      g.globalAlpha = 0.2 * speed;
      blit(g, streak, lx, ly - 1.5, len, 3);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  private renderScene(): void {
    const v = this.view;
    const g = v.ctx;
    const k = v.scale * v.dpr;

    v.setPixelTransform();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    this.bg.renderSky(g, this.q >= 0.7 ? 1 : 0);

    const sx = this.fx.shakeX;
    const sy = this.fx.shakeY;
    v.setWorldTransform(sx, sy);
    const tx = (v.offX + sx * v.scale) * v.dpr;
    const ty = (v.offY + sy * v.scale) * v.dpr;

    this.bg.renderLive(g, this.q >= 0.7 ? 1 : 0);
    this.city.render(g);
    this.bg.renderAmbient(g, k, tx, ty);
    this.city.renderDome(g, this.inkColor);
    this.renderWarnings(g);
    this.renderHoles(g);
    this.lines.render(g, this.pen, this.stats.lineWidth);
    renderMeteors(g, this.meteors, this.sprites, this.inkColor, k, tx, ty, this.realT);
    for (const b of this.bosses) if (b.active && b.kind === MK.Boss) renderBossRing(g, b, this.realT);
    this.renderSkillFx(g);
    this.parts.render(g, k, tx, ty);
    this.fx.renderRings(g);
    this.renderGhost(g);
    this.renderShapeHint(g);
    this.fx.renderText(g, k);

    // ekran katmanları (piksel uzayı)
    v.setPixelTransform();
    const W = v.canvas.width;
    const Hp = v.canvas.height;
    const slow = clamp((1 - this.timeScale) * 1.3, 0, 1);
    if (slow > 0.02) {
      g.globalAlpha = slow * 0.55;
      g.drawImage(this.sprites.vignette, 0, 0, W, Hp);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = slow * 0.18;
      g.drawImage(this.sprites.vignetteOf(this.pen.color), 0, 0, W, Hp);
      g.globalCompositeOperation = 'source-over';
    }
    const warp = 1 - this.hostileScale;
    if (warp > 0.02) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = warp * 0.5;
      g.drawImage(this.sprites.vignetteOf('#6EC8FF'), 0, 0, W, Hp);
      g.globalCompositeOperation = 'source-over';
    }
    if (this.fx.damageA > 0) {
      g.globalAlpha = this.fx.damageA * 0.75;
      g.drawImage(this.sprites.vignetteOf('#FF1F3D'), 0, 0, W, Hp);
    }
    if (this.fx.flashA > 0) {
      g.globalAlpha = this.fx.flashA * 0.5;
      g.fillStyle = this.fx.flashColor;
      g.globalCompositeOperation = 'lighter';
      g.fillRect(0, 0, W, Hp);
      g.globalCompositeOperation = 'source-over';
    }
    g.globalAlpha = 1;
  }

  private renderWarnings(g: CanvasRenderingContext2D): void {
    if (this.phase !== 'play' && this.phase !== 'intro') return;
    const d = this.director;
    const y = this.topInset + 12;
    g.globalCompositeOperation = 'lighter';
    for (let i = d.qi; i < d.queue.length; i++) {
      const s = d.queue[i];
      const dtT = s.t - d.time;
      if (dtT > 0.85) break;
      if (dtT < 0) continue;
      const col = METEOR_COLORS[KINDS[s.kind].key];
      const p = 1 - dtT / 0.85;
      const pulse = 0.5 + 0.5 * Math.sin(this.realT * 22);
      g.globalAlpha = (0.35 + pulse * 0.5) * p;
      const sz = s.kind === MK.Boss ? 70 : 34;
      blit(g, this.sprites.glow(col, true), s.x - sz / 2, y - sz / 2, sz, sz);
      g.strokeStyle = col;
      g.lineWidth = 3;
      g.beginPath();
      const w = s.kind === MK.Boss ? 20 : 10;
      g.moveTo(s.x - w, y - 4 + p * 6);
      g.lineTo(s.x, y + 6 + p * 6);
      g.lineTo(s.x + w, y - 4 + p * 6);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  private renderHoles(g: CanvasRenderingContext2D): void {
    for (const h of this.holes) {
      const p = h.t / h.life;
      const grow = p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1;
      const r = 46 * grow;
      const grad = g.createRadialGradient(h.x, h.y, 0, h.x, h.y, r * 2.2);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.45, 'rgba(10,0,30,0.95)');
      grad.addColorStop(1, 'rgba(40,0,80,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(h.x, h.y, r * 2.2, 0, TAU);
      g.fill();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = C.violet;
      g.globalAlpha = 0.8 * grow;
      g.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const a0 = this.realT * (4 + i) + i * 2;
        g.beginPath();
        g.arc(h.x, h.y, r * (1.1 + i * 0.35), a0, a0 + 2.4);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  }

  /** Şekil kılavuzunu (birim kare) yol olarak kur; frac: çizilen kısım (0..1) */
  private traceShape(g: CanvasRenderingContext2D, shape: GestureShape, x: number, y: number, size: number, frac: number): [number, number] {
    const pts = shapeGuide(shape);
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let left = total * frac;
    g.beginPath();
    g.moveTo(x + pts[0][0] * size, y + pts[0][1] * size);
    let ex = x + pts[0][0] * size;
    let ey = y + pts[0][1] * size;
    for (let i = 1; i < pts.length && left > 0; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const f = Math.min(1, left / d);
      ex = x + (pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f) * size;
      ey = y + (pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f) * size;
      g.lineTo(ex, ey);
      left -= d;
    }
    return [ex, ey];
  }

  /** Yetenek hazır olunca: ekranın ortasında şeklin nasıl çizileceğini gösteren parlak kılavuz */
  private renderShapeHint(g: CanvasRenderingContext2D): void {
    const h = this.shapeHint;
    if (!h || this.drawing) return;
    const size = 230;
    const x = 360 - size / 2;
    const y = this.view.H * 0.42 - size / 2;
    const a = Math.min(1, h.t * 4, (2.8 - h.t) * 2.5);
    const cyc = (h.t % 1.4) / 1.1;
    const prog = easeInOutCubic(clamp(cyc, 0, 1));
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    this.traceShape(g, h.shape, x, y, size, 1);
    g.setLineDash([12, 14]);
    g.strokeStyle = h.color;
    g.globalAlpha = 0.35 * a;
    g.lineWidth = 5;
    g.stroke();
    g.setLineDash([]);
    const [ex, ey] = this.traceShape(g, h.shape, x, y, size, prog);
    g.globalAlpha = 0.25 * a;
    g.lineWidth = 22;
    g.stroke();
    g.globalAlpha = 0.95 * a;
    g.lineWidth = 7;
    g.stroke();
    g.globalAlpha = a;
    blit(g, this.sprites.glow(h.color, true), ex - 36, ey - 36, 72, 72);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  /** Eğitimde parmağın nereye çizeceğini gösteren hayalet el */
  private renderGhost(g: CanvasRenderingContext2D): void {
    const gh = this.ghost;
    if (!gh || this.drawing) return;
    const cyc = (this.realT % 1.6) / 1.6;
    const p = easeInOutCubic(clamp(cyc / 0.75, 0, 1));
    const x = gh.x0 + (gh.x1 - gh.x0) * p;
    const y = gh.y0 + (gh.y1 - gh.y0) * p;
    g.globalCompositeOperation = 'lighter';
    // kesikli yol
    g.setLineDash([10, 12]);
    g.strokeStyle = this.pen.color;
    g.globalAlpha = 0.45;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(gh.x0, gh.y0);
    g.lineTo(gh.x1, gh.y1);
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 0.9;
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(gh.x0, gh.y0);
    g.lineTo(x, y);
    g.stroke();
    const fade = cyc > 0.85 ? (1 - cyc) / 0.15 : 1;
    g.globalAlpha = fade;
    blit(g, this.sprites.glow(this.pen.color, true), x - 40, y - 40, 80, 80);
    g.globalCompositeOperation = 'source-over';
    // dokunma halkası
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = this.pen.color;
    g.lineWidth = 3;
    g.globalAlpha = 0.6 * fade;
    g.beginPath();
    g.arc(x, y, 16 + Math.sin(this.realT * 10) * 4, 0, TAU);
    g.stroke();
    g.globalCompositeOperation = 'source-over';
    // parmak: yuvarlatılmış kapsül + tırnak, hafif eğik
    g.save();
    g.translate(x, y);
    g.rotate(-0.38);
    const capsule = (px: number, py: number, w: number, h: number): void => {
      const r = w / 2;
      g.beginPath();
      g.moveTo(px, py + r);
      g.arc(px + r, py + r, r, Math.PI, 0);
      g.lineTo(px + w, py + h);
      g.lineTo(px, py + h);
      g.closePath();
    };
    g.globalAlpha = 0.3 * fade;
    g.fillStyle = '#000';
    capsule(-10, 12, 30, 86);
    g.fill();
    const fg = g.createLinearGradient(-15, 0, 15, 0);
    fg.addColorStop(0, '#EDE6D3');
    fg.addColorStop(0.55, '#FFF9EC');
    fg.addColorStop(1, '#D9CFB8');
    g.globalAlpha = 0.95 * fade;
    g.fillStyle = fg;
    capsule(-15, 4, 30, 86);
    g.fill();
    g.globalAlpha = 0.55 * fade;
    g.fillStyle = '#FFFFFF';
    capsule(-9, 9, 18, 20);
    g.fill();
    g.restore();
    g.globalAlpha = 1;
  }
}
