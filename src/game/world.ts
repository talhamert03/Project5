import { audio } from '../core/audio';
import { haptics } from '../core/haptics';
import type { PointerSink } from '../core/input';
import { TAU, clamp, damp, easeInOutCubic, hsl } from '../core/math';
import { Rng, fx } from '../core/rng';
import { t } from '../i18n';
import type { Background } from '../render/background';
import { C, METEOR_COLORS } from '../render/palette';
import { Particles, Shape } from '../render/particles';
import type { Sprites } from '../render/sprites';
import { WORLD_W, type View } from '../render/view';
import { BLOCKS, BLOCK_W, City } from './city';
import { Director, type DirectorMods } from './director';
import { Effects } from './effects';
import { type InkLine, LineManager } from './lines';
import { KINDS, MK, Meteor, renderBossRing, renderMeteors } from './meteors';
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
}

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
  | { type: 'wave'; wave: number; boss: boolean }
  | { type: 'waveClear'; wave: number; bonus: number; perfect: boolean }
  | { type: 'bossDown' }
  | { type: 'record' }
  | { type: 'combo'; n: number }
  | { type: 'inkEmpty' }
  | { type: 'hit'; left: number }
  | { type: 'gameOver'; result: RunResult }
  | { type: 'tutorial'; step: number }
  | { type: 'tutorialDone' }
  | { type: 'phoenix' };

export type Phase = 'attract' | 'tutorial' | 'intro' | 'play' | 'cleared' | 'dying' | 'over';

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
  private boss: Meteor | null = null;

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
    return this.pen.rainbow ? hsl(this.realT * 90, 95, 62) : this.pen.color;
  }

  get playing(): boolean {
    return this.phase === 'play' || this.phase === 'intro' || this.phase === 'cleared' || this.phase === 'tutorial';
  }

  // ───────────────────────── YAŞAM DÖNGÜSÜ ─────────────────────────

  private resetField(): void {
    for (const m of this.meteors) m.active = false;
    this.lines.clear();
    this.parts.clear();
    this.fx.clear();
    this.pending.length = 0;
    this.holes.length = 0;
    this.boss = null;
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
    this.director.plan(n, this.view.H, this.groundY);
    this.phase = 'intro';
    this.introT = 1.35;
    this.waveDamaged = false;
    this.city.domeCharges = Math.max(this.city.domeCharges, this.stats.domePerWave);
    this.onEvent({ type: 'wave', wave: n, boss: this.director.bossWave });
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
      // bırakırken küçük mürekkep sıçraması
      this.parts.burst(l.lastX, l.lastY, Math.round(6 * this.q), this.sp.penHot, 30, 140, 0.4, 10, { drag: 4 });
    }
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
        this.updateSpawns(sdt);
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
          this.endLine();
          this.inkEmptyFx();
        }
      } else {
        this.ink = Math.min(this.stats.maxInk, this.ink + this.stats.inkRegen * sdt);
      }
      // kombo zamanlayıcı
      if (this.combo > 0) {
        this.comboT -= sdt;
        if (this.comboT <= 0) this.endCombo();
      }
    }

    this.updateMeteors(sdt);
    this.updateCollisions();
    this.updatePending(sdt);
    this.updateHoles(sdt);
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
    h.bossHp = this.boss && this.boss.active ? this.boss.hp / this.boss.maxHp : -1;
    h.coins = this.coins;
  }

  private updateSpawns(sdt: number): void {
    const d = this.director;
    d.time += sdt;
    while (d.qi < d.queue.length && d.queue[d.qi].t <= d.time) {
      const s = d.queue[d.qi++];
      this.spawn(s.kind, s.x, s.y, s.vx, s.vy);
    }
    if (d.bossWave && this.boss && this.boss.active) {
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
    if (kind === MK.Boss) {
      const n = Math.max(1, Math.round(this.wave / 5));
      m.hp = m.maxHp = 14 + 8 * (n - 1);
      m.baseV = 30 * this.speedScale;
      m.vy = m.baseV;
      m.minionT = 2.5;
      m.spin = 0.25;
      this.boss = m;
      audio.bossAppear();
      this.fx.shake(0.35);
      haptics.heavy();
    }
    return m;
  }

  private updateMeteors(dt: number): void {
    if (dt <= 0) {
      for (const m of this.meteors) if (m.active) m.flash = Math.max(0, m.flash);
      return;
    }
    const W = WORLD_W;
    const ground = this.groundY;
    for (const m of this.meteors) {
      if (!m.active) continue;
      m.age += dt;
      m.flash = Math.max(0, m.flash - dt);
      m.lineCd -= dt;

      if (m.kind === MK.Golden && !m.friendly) {
        m.vx = m.baseV + Math.sin(m.age * 2.4 + m.swayPh) * 90 * this.speedScale;
      }
      if (m.kind === MK.Boss) this.updateBoss(m, dt);

      const sp = Math.hypot(m.vx, m.vy);
      const steps = clamp(Math.ceil((sp * dt) / 7), 1, 10);
      const h = dt / steps;
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
      m.rot += m.spin * dt;
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
    m.vy += (m.baseV - m.vy) * Math.min(1, dt * 1.1);
    // yatay konum sabit bir salınım: çizgiler boss'u yana itemez
    const targetX = 360 + Math.sin(m.age * 0.45) * 150;
    m.vx = (targetX - m.x) * 3;
    // geri itilince HUD'un altına kaçmasın
    const minY = this.topInset + m.r * 0.6;
    if (m.y < minY && m.vy < 0) m.vy = 0;
    m.minionT -= dt;
    if (m.minionT <= 0 && m.y > 40) {
      const enraged = m.hp < m.maxHp * 0.5;
      m.minionT = enraged ? 1.5 : 2.3;
      const spd = this.director.baseSpeed(this.view.H) * 1.05;
      for (const a of enraged ? [-0.55, 0, 0.55] : [-0.45, 0.45]) {
        const ang = Math.PI / 2 + a;
        const s = this.spawn(MK.Shard, m.x + Math.cos(ang) * m.r * 0.8, m.y + Math.sin(ang) * m.r * 0.8, Math.cos(ang) * spd, Math.sin(ang) * spd);
        if (s) s.flash = 0.3;
      }
      this.parts.burst(m.x, m.y + m.r * 0.7, Math.round(16 * this.q), this.sp.crimson, 60, 260, 0.6, 26, { drag: 3 });
    }
  }

  // ───────────────────────── ÇARPIŞMALAR ─────────────────────────

  private collideLines(m: Meteor): void {
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
      m.vy = -150 * this.speedScale;
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
      for (let j = 0; j < list.length; j++) {
        const b = list[j];
        if (!b.active || b.friendly || b === a) continue;
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
    if (a.pierce < this.stats.pierce) {
      a.pierce++;
      a.vx *= 0.9;
      a.vy *= 0.9;
      a.flash = 0.2;
      return;
    }
    a.active = false;
    this.queueExplosion(x, y, this.stats.explosionR, a.chainDepth + 1, 0);
    this.explosionFx(x, y, this.inkColor, 0.7);
  }

  private bossDamage(boss: Meteor, a: Meteor, x: number, y: number): void {
    a.active = false;
    boss.hp -= 1;
    boss.flash = 0.2;
    this.explosionFx(x, y, C.crimson, 0.9);
    this.queueExplosion(x, y, this.stats.explosionR * 0.8, 1, 0);
    this.addScore(40, x, y, true);
    this.bumpCombo();
    this.fx.shake(0.18);
    audio.bossHit();
    haptics.medium();
    if (boss.hp <= 0) this.bossDeath(boss);
  }

  private bossDeath(b: Meteor): void {
    b.active = false;
    this.boss = null;
    this.bossKills++;
    const n = Math.max(1, Math.round(this.wave / 5));
    this.addScore(1500 * n, b.x, b.y - 60, true);
    this.hitstop = 0.14;
    this.slowOverride = 0.2;
    this.slowOverrideT = 1.1;
    this.fx.shake(1);
    this.fx.flash('#FFFFFF', 0.9);
    this.fx.ring(b.x, b.y, 20, 520, 1.1, C.crimson, 22);
    this.fx.ring(b.x, b.y, 10, 340, 0.8, C.gold, 12);
    for (let i = 0; i < 6; i++) {
      this.explosionFx(b.x + fx.r(-70, 70), b.y + fx.r(-70, 70), i % 2 ? C.crimson : C.gold, 1.6);
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
    this.fx.text(t('w.bossDown'), 360, this.view.H * 0.35, 46, C.gold, true, 2);
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
    }
    const col = METEOR_COLORS[def.key];
    const scale = m.kind === MK.Heavy ? 1.3 : m.kind === MK.Shard ? 0.6 : 1;
    this.explosionFx(m.x, m.y, col, scale);
    audio.explode(depth === 0 ? scale : scale * 0.8);
    this.fx.shake(depth === 0 ? 0.13 : 0.08);
    if (depth === 0) haptics.medium();

    if (m.kind === MK.Golden) {
      this.golden++;
      this.rewardCoins(m.x, m.y, 5);
    }
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
    if (this.stats.cometBurst > 0) {
      const r = 70 + this.stats.cometBurst * 40;
      this.fx.ring(m.x, 20, 10, r, 0.5, this.inkColor, 8);
      this.queueExplosion(m.x, 20, r, 1, 0);
      audio.explode(0.6);
    }
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
    const dmg = m.kind === MK.Boss ? 2 : 1;
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
    if (m.kind === MK.Boss) this.boss = null;
    this.explosionFx(x, y, C.ember, m.kind === MK.Boss ? 2.2 : 1.5);
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
    this.phase = 'dying';
    this.dyingT = 2.4;
    this.fx.shake(1);
    audio.gameOver();
    haptics.error();
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
        for (const m of this.meteors) m.active = false;
        this.startWave(1);
      }
    }
    void sdt;
  }

  // ───────────────────────── ÇİZİM ─────────────────────────

  render(): void {
    const v = this.view;
    const g = v.ctx;
    const k = v.scale * v.dpr;

    v.setPixelTransform();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    this.bg.renderSky(g);

    const sx = this.fx.shakeX;
    const sy = this.fx.shakeY;
    v.setWorldTransform(sx, sy);
    const tx = (v.offX + sx * v.scale) * v.dpr;
    const ty = (v.offY + sy * v.scale) * v.dpr;

    this.bg.renderLive(g, this.q >= 0.7 ? 1 : 0);
    this.city.render(g);
    this.city.renderDome(g, this.inkColor);
    this.renderWarnings(g);
    this.renderHoles(g);
    this.lines.render(g, this.pen, this.stats.lineWidth);
    renderMeteors(g, this.meteors, this.sprites, this.inkColor, k, tx, ty, this.realT);
    if (this.boss && this.boss.active) renderBossRing(g, this.boss, this.realT);
    this.parts.render(g, k, tx, ty);
    this.fx.renderRings(g);
    this.renderGhost(g);
    this.fx.renderText(g);

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
      g.drawImage(this.sprites.glow(col, true), s.x - sz / 2, y - sz / 2, sz, sz);
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
    g.drawImage(this.sprites.glow(this.pen.color, true), x - 40, y - 40, 80, 80);
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
