import type { SaveData } from '../core/storage';
import type { RunResult } from '../game/world';
import { PENS, type Pen } from '../game/pens';
import { UPGRADE_BY_ID } from '../game/upgrades';
import { getLang, t } from '../i18n';
import {
  type DailyInfo,
  RANKS,
  type RankProgress,
  type Settlement,
  WORKSHOP,
  rankProgress,
} from '../meta/progression';
import { fmt, fmtDuration, fmtTime, roman } from './format';
import { icon } from './icons';

export function rankLabel(idx: number): string {
  const r = RANKS[idx];
  return `${t('rank.' + r.key)}${r.tier ? ' ' + roman(r.tier) : ''}`;
}

function seal(idx: number, size = 48): string {
  const r = RANKS[idx];
  const letter = t('rank.' + r.key).charAt(0).toLocaleUpperCase(getLang() === 'tr' ? 'tr-TR' : 'en-US');
  return `<div class="seal" style="--rc:${r.color};--s:${size}px"><b>${letter}</b>${r.tier ? `<i>${roman(r.tier)}</i>` : ''}</div>`;
}

export function rankCard(p: RankProgress, best: number, extraClass = '', rankUp = false): string {
  const next = p.next ? t('menu.toNext', { rank: rankLabel(p.idx + 1), n: fmt(p.need) }) : t('menu.maxRank');
  return `
    <div class="rank-card ${extraClass}" style="--rc:${p.rank.color}">
      ${seal(p.idx)}
      <div class="rank-info">
        ${rankUp ? `<div class="rank-up">${icon('star')}${t('over.rankUp')}</div>` : ''}
        <div class="rank-name">${rankLabel(p.idx)}</div>
        <div class="bar"><i style="--w:${(p.frac * 100).toFixed(1)}%"></i></div>
        <div class="rank-next">${next}</div>
      </div>
      <div class="best-box"><small>${t('menu.best')}</small><b>${fmt(best)}</b></div>
    </div>`;
}

const LOGO_STROKE = `<svg class="logo-stroke" viewBox="0 0 300 22" preserveAspectRatio="none"><path d="M6 14 C 60 2, 110 20, 160 10 S 250 4, 294 12"/></svg>`;

export function bootHTML(): string {
  return `
    <section class="screen boot" id="boot">
      <h1 class="logo"><span>${t('app.title1')}</span><span>${t('app.title2')}</span>${LOGO_STROKE}</h1>
      <p class="tagline">${t('app.tagline')}</p>
      <div class="boot-hint">${t('app.tap')}</div>
    </section>`;
}

export interface MenuData {
  save: SaveData;
  daily: DailyInfo;
  missionsReady: number;
}

export function menuHTML(d: MenuData): string {
  const s = d.save;
  const p = rankProgress(s.best);
  const streak = s.streak.count > 0 ? ` · ${icon('flame')}${s.streak.count}` : '';
  return `
    <section class="screen menu" id="menu">
      <header class="menu-top enter" style="--d:0">
        <div class="chip coin">${icon('coin')}<span class="coin-count" id="m-coins">${fmt(s.coins)}</span></div>
        <div class="right">
          <button class="icon-btn" data-a="panel" data-p="records" aria-label="${t('menu.records')}">${icon('trophy')}</button>
          <button class="icon-btn" data-a="panel" data-p="settings" aria-label="${t('menu.settings')}">${icon('gear')}</button>
        </div>
      </header>
      <div class="brand enter" style="--d:1">
        <h1 class="logo"><span>${t('app.title1')}</span><span>${t('app.title2')}</span>${LOGO_STROKE}</h1>
      </div>
      <div class="menu-bottom">
        <div class="enter" style="--d:2">${rankCard(p, s.best)}</div>
        <button class="btn-play enter" style="--d:3" data-a="play">${icon('play')}${t('menu.play')}</button>
        <div class="menu-grid enter" style="--d:4">
          <button class="tile daily" data-a="panel" data-p="daily" style="--tc:var(--gold)">${icon('calendar')}${t('menu.daily')}<small>${t('mod.' + d.daily.mod.id)}${streak.replace(/<svg/, '<svg style="font-size:11px;vertical-align:-1px;color:var(--ember)"')}</small></button>
          <button class="tile" data-a="panel" data-p="missions" style="--tc:var(--rose)">${icon('target')}${t('menu.missions')}${d.missionsReady > 0 ? `<span class="badge">${d.missionsReady}</span>` : ''}</button>
          <button class="tile" data-a="panel" data-p="workshop" style="--tc:var(--violet)">${icon('hammer')}${t('menu.workshop')}</button>
          <button class="tile" data-a="panel" data-p="pens" style="--tc:var(--ink)">${icon('pen')}${t('menu.pens')}</button>
        </div>
      </div>
    </section>`;
}

function upgradeDesc(id: string, nextLevel: number): string {
  const def = UPGRADE_BY_ID.get(id)!;
  const v = def.value ? def.value(nextLevel) : '';
  return t(`upg.${id}.d`, { v });
}

export function upgradeHTML(ids: string[], levels: Record<string, number>, sub: string, rerolls: number): string {
  const cards = ids
    .map((id, i) => {
      const def = UPGRADE_BY_ID.get(id)!;
      const lvl = levels[id] ?? 0;
      const tag = id === 'repair' ? '' : lvl === 0 ? t('up.new') : t('up.level', { n: lvl + 1 });
      return `
      <button class="card r${def.rarity}" data-a="pick" data-id="${id}" style="--d:${i}">
        <div class="card-icon">${icon(def.icon)}</div>
        <div class="card-body">
          <div class="card-top"><span class="rarity">${t('rarity.' + def.rarity)}</span>${tag ? `<span class="lvl">${tag}</span>` : ''}</div>
          <h3>${t('upg.' + id)}</h3>
          <p>${upgradeDesc(id, lvl + 1)}</p>
        </div>
      </button>`;
    })
    .join('');
  return `
    <section class="screen upgrade" id="upgrade">
      <h2>${t('up.title')}</h2>
      <p class="sub">${sub}</p>
      <div class="cards">${cards}</div>
      ${rerolls > 0 ? `<div class="reroll-row"><button class="btn-ghost" data-a="reroll">${icon('reroll')}${t('up.reroll', { n: rerolls })}</button></div>` : ''}
    </section>`;
}

export function pauseHTML(save: SaveData): string {
  const st = save.settings;
  return `
    <section class="screen pause" id="pause">
      <div class="pause-box">
        <h2>${t('pause.title')}</h2>
        <button class="btn-play" data-a="resume">${icon('play')}${t('pause.resume')}</button>
        <div class="toggles">
          <button class="tog ${st.music ? 'on' : ''}" data-a="set" data-k="music">${icon('music')}${t('settings.music')}</button>
          <button class="tog ${st.sfx ? 'on' : ''}" data-a="set" data-k="sfx">${icon('sound')}${t('settings.sfx')}</button>
          <button class="tog ${st.haptics ? 'on' : ''}" data-a="set" data-k="haptics">${icon('vibrate')}${t('settings.haptics')}</button>
        </div>
        <button class="btn-ghost" data-a="restart">${icon('restart')}${t('pause.restart')}</button>
        <button class="btn-ghost" data-a="quit">${icon('home')}${t('pause.menu')}</button>
        <p class="note">${t('pause.note')}</p>
      </div>
    </section>`;
}

export function overHTML(r: RunResult, st: Settlement, best: number, dailyBest: number): string {
  const p = rankProgress(best);
  const rankUp = st.rankAfter > st.rankBefore;
  const rows: string[] = [];
  let d = 0;
  rows.push(
    `<div class="reward-row gold" style="--d:${d++}"><span>${t('over.coins')}</span><span class="reward">${icon('coin')}<span id="o-coins">0</span></span></div>`,
  );
  if (st.streakBonus > 0) {
    rows.push(`<div class="reward-row" style="--d:${d++}"><span>${icon('flame')} ${t('over.streak', { n: Math.round(st.streakBonus / 25) })}</span><span class="reward">+${st.streakBonus}</span></div>`);
  }
  for (const m of st.missions) {
    rows.push(
      `<div class="reward-row gold" style="--d:${d++}"><span>${icon('check')} ${t('m.' + m.id, { n: fmt(m.target) })}</span><span class="reward">+${fmt(m.reward)}</span></div>`,
    );
  }
  if (r.daily) {
    rows.push(`<div class="reward-row" style="--d:${d++}"><span>${st.dailyBest ? t('over.dailyBest') : t('over.daily', { n: fmt(dailyBest) })}</span><span>${icon('calendar')}</span></div>`);
  }
  const toBest = !st.newBest && st.prevBest > 0 ? `<div class="tobest">${t('over.toBest', { n: fmt(st.prevBest - r.score) })}</div>` : '';
  return `
    <section class="screen over" id="over">
      <div class="over-inner">
      <div class="over-title">${t('over.title')}</div>
      <div class="over-score">
        <span class="label">${t('over.score')}</span>
        <b id="o-score">0</b>
        ${st.newBest && r.score > 0 ? `<div class="newbest">${t('over.newBest')}</div>` : toBest}
      </div>
      ${rankCard(p, best, rankUp ? 'levelup' : '', rankUp)}
      <div class="stats">
        <div><span class="label">${t('over.wave')}</span><b>${r.wave}</b></div>
        <div><span class="label">${t('over.combo')}</span><b>${r.maxCombo}</b></div>
        <div><span class="label">${t('over.kills')}</span><b>${r.kills}</b></div>
        <div><span class="label">${t('over.time')}</span><b>${fmtTime(r.time)}</b></div>
      </div>
      <div class="rewards">${rows.join('')}</div>
      <div class="over-actions">
        <button class="btn-play" data-a="again">${icon('restart')}${t('over.again')}</button>
        <button class="btn-ghost" data-a="menu" aria-label="${t('over.menu')}">${icon('home')}</button>
      </div>
      </div>
    </section>`;
}

function panel(id: string, title: string, body: string, coins: number): string {
  return `
    <section class="screen panel" id="panel-${id}">
      <div class="panel-head">
        <button class="icon-btn" data-a="close" aria-label="${t('common.back')}">${icon('back')}</button>
        <h2>${title}</h2>
        <div class="chip coin">${icon('coin')}<span class="coin-count">${fmt(coins)}</span></div>
      </div>
      <div class="panel-body">${body}</div>
    </section>`;
}

export function dailyHTML(save: SaveData, d: DailyInfo): string {
  const now = new Date();
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const mins = Math.max(0, Math.round((end.getTime() - now.getTime()) / 60000));
  const today = save.daily.date === d.key ? save.daily : { best: 0, attempts: 0 };
  const streakDays = Array.from({ length: 7 }, (_, i) => `<i class="${i < Math.min(save.streak.count, 7) ? 'on' : ''}"></i>`).join('');
  const body = `
    <p class="lead enter">${t('daily.desc')}</p>
    <div class="daily-hero enter" style="--d:1">
      <div class="mod">${t('mod.' + d.mod.id)}</div>
      <p>${t('mod.' + d.mod.id + '.d')}</p>
    </div>
    <div class="kv enter" style="--d:1">
      <div><span class="label">${t('daily.best')}</span><b>${fmt(today.best)}</b><small class="lead">${t('daily.attempts', { n: today.attempts })}</small></div>
      <div><span class="label">${t('daily.streak')}</span><b>${t('daily.streakDays', { n: save.streak.count })}</b><div class="streak-days">${streakDays}</div></div>
    </div>
    <p class="lead enter" style="--d:2">${t('daily.streakHint')} ${t('daily.coins')}.</p>
    <button class="btn-play gold enter" style="--d:3" data-a="playDaily">${icon('play')}${t('daily.play')}</button>
    <p class="note enter" style="--d:4">${t('daily.resets', { h: Math.floor(mins / 60), m: mins % 60 })}</p>`;
  return panel('daily', t('daily.title'), body, save.coins);
}

export function missionsHTML(save: SaveData): string {
  const colors: Record<string, string> = {
    kills: 'var(--ember)',
    combo: 'var(--gold)',
    wave: 'var(--ink)',
    score: 'var(--paper)',
    perfect: 'var(--gold)',
    boss: 'var(--crimson)',
    golden: 'var(--gold)',
    oneline: 'var(--ink)',
    chain: 'var(--violet)',
    deflects: 'var(--ink)',
    daily: 'var(--gold)',
  };
  const icons: Record<string, string> = {
    kills: 'blast',
    combo: 'bolt',
    wave: 'lines',
    score: 'star',
    perfect: 'check',
    boss: 'crown',
    golden: 'coin',
    oneline: 'nib',
    chain: 'bolt',
    deflects: 'bounce',
    daily: 'calendar',
  };
  const rows = save.missions
    .map((m, i) => {
      const frac = Math.min(1, m.progress / m.target);
      return `
      <div class="row" style="--d:${i};--tc:${colors[m.id] ?? 'var(--ink)'}">
        <div class="ic">${icon(icons[m.id] ?? 'target')}</div>
        <div>
          <h4>${t('m.' + m.id, { n: fmt(m.target) })}</h4>
          <div class="progress-mini"><i style="--w:${(frac * 100).toFixed(1)}%"></i></div>
          <p>${fmt(Math.min(m.progress, m.target))} / ${fmt(m.target)}</p>
        </div>
        <span class="reward">${icon('coin')}${fmt(m.reward)}</span>
      </div>`;
    })
    .join('');
  return panel('missions', t('missions.title'), `<p class="lead">${t('missions.desc')}</p><div class="list">${rows}</div>`, save.coins);
}

export function workshopHTML(save: SaveData): string {
  const colors = ['var(--ink)', 'var(--ink)', 'var(--violet)', 'var(--rose)', 'var(--gold)', 'var(--gold)', 'var(--violet)'];
  const rows = WORKSHOP.map((w, i) => {
    const lvl = save.workshop[w.id] ?? 0;
    const maxed = lvl >= w.max;
    const cost = maxed ? 0 : w.cost(lvl);
    const can = !maxed && save.coins >= cost;
    const dots = Array.from({ length: w.max }, (_, k) => `<i class="${k < lvl ? 'on' : ''}"></i>`).join('');
    return `
      <div class="row" style="--d:${i};--tc:${colors[i]}">
        <div class="ic">${icon(w.icon)}</div>
        <div>
          <h4>${t('ws.' + w.id)}</h4>
          <p>${t('ws.' + w.id + '.d')}</p>
          <div class="lvl-dots">${dots}</div>
        </div>
        ${
          maxed
            ? `<span class="buy done">${t('workshop.max')}</span>`
            : `<button class="buy ${can ? '' : 'disabled'}" data-a="buyWs" data-id="${w.id}">${icon('coin')}${fmt(cost)}</button>`
        }
      </div>`;
  }).join('');
  return panel('workshop', t('workshop.title'), `<p class="lead">${t('workshop.desc')}</p><div class="list">${rows}</div>`, save.coins);
}

function penSwatch(p: Pen, id: string): string {
  const stroke = p.rainbow ? `url(#rg-${id})` : p.color;
  const grad = p.rainbow
    ? `<defs><linearGradient id="rg-${id}" x1="0" x2="1"><stop offset="0" stop-color="#ff4f8b"/><stop offset=".25" stop-color="#ffc857"/><stop offset=".5" stop-color="#3df58a"/><stop offset=".75" stop-color="#3ef0e0"/><stop offset="1" stop-color="#a77bff"/></linearGradient></defs>`
    : '';
  return `<svg class="pen-swatch" viewBox="0 0 140 54">${grad}
    <path d="M10 38 C 40 6, 72 50, 130 16" stroke="${stroke}" stroke-width="16" opacity=".22"/>
    <path d="M10 38 C 40 6, 72 50, 130 16" stroke="${stroke}" stroke-width="7"/>
    <path d="M10 38 C 40 6, 72 50, 130 16" stroke="${p.core}" stroke-width="2.4"/></svg>`;
}

export function pensHTML(save: SaveData): string {
  const bestRank = rankProgress(save.best).idx;
  const cards = PENS.map((p, i) => {
    const owned = save.pens.includes(p.id);
    const equipped = save.pen === p.id;
    const rankLocked = p.rank !== undefined && bestRank < p.rank;
    let btn: string;
    if (equipped) btn = `<span class="buy done">${t('pens.equipped')}</span>`;
    else if (owned) btn = `<button class="buy ghost" data-a="equip" data-id="${p.id}">${t('pens.equip')}</button>`;
    else if (rankLocked) btn = `<span class="buy ghost disabled">${icon('lock')}${t('pens.needRank', { rank: rankLabel(p.rank!) })}</span>`;
    else if (p.price === 0) btn = `<button class="buy ghost" data-a="equip" data-id="${p.id}">${t('pens.equip')}</button>`;
    else btn = `<button class="buy ${save.coins >= p.price ? '' : 'disabled'}" data-a="buyPen" data-id="${p.id}">${icon('coin')}${fmt(p.price)}</button>`;
    return `
      <div class="pen ${equipped ? 'equipped' : ''} ${rankLocked && !owned ? 'locked' : ''}" style="--pc:${p.color};--d:${i}">
        ${penSwatch(p, p.id)}
        <h4>${t('pen.' + p.id)}</h4>
        ${btn}
      </div>`;
  }).join('');
  return panel('pens', t('pens.title'), `<p class="lead">${t('pens.desc')}</p><div class="pen-grid">${cards}</div>`, save.coins);
}

export function recordsHTML(save: SaveData): string {
  const recs = save.records.length
    ? save.records
        .map(
          (r, i) => `
      <div class="rec" style="--d:${i}">
        <span class="pos">${i + 1}</span>
        <div><b>${fmt(r.score)}</b><br><small>${t('over.wave')} ${r.wave} · ${r.date}${r.daily ? ' · ' + t('st.daily') : ''}</small></div>
        ${i === 0 ? `<span style="color:var(--gold);font-size:22px">${icon('crown')}</span>` : '<span></span>'}
      </div>`,
        )
        .join('')
    : `<p class="lead">${t('records.empty')}</p>`;
  const stats = `
    <div class="kv">
      <div><span class="label">${t('st.runs')}</span><b>${fmt(save.totalRuns)}</b></div>
      <div><span class="label">${t('st.kills')}</span><b>${fmt(save.totalKills)}</b></div>
      <div><span class="label">${t('st.wave')}</span><b>${save.bestWave}</b></div>
      <div><span class="label">${t('st.combo')}</span><b>${save.bestCombo}</b></div>
      <div><span class="label">${t('st.boss')}</span><b>${save.bossKills}</b></div>
      <div><span class="label">${t('st.time')}</span><b>${fmtDuration(save.totalPlaySec)}</b></div>
    </div>`;
  return panel(
    'records',
    t('records.title'),
    `${rankCard(rankProgress(save.best), save.best)}<div class="section-title">${t('records.top')}</div><div class="list">${recs}</div><div class="section-title">${t('records.stats')}</div>${stats}`,
    save.coins,
  );
}

export function settingsHTML(save: SaveData, version: string, canFullscreen: boolean, resetArmed: boolean): string {
  const st = save.settings;
  const sw = (k: string, on: boolean, ic: string, label: string): string => `
    <button class="toggle-row" data-a="set" data-k="${k}"><span class="l">${icon(ic)}${label}</span><span class="switch ${on ? 'on' : ''}"></span></button>`;
  const seg = (k: string, opts: Array<[string, string]>, val: string): string =>
    `<div class="seg">${opts.map(([v, l]) => `<button class="${v === val ? 'on' : ''}" data-a="setv" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const body = `
    <div class="list">
      ${sw('music', st.music, 'music', t('settings.music'))}
      ${sw('sfx', st.sfx, 'sound', t('settings.sfx'))}
      ${sw('haptics', st.haptics, 'vibrate', t('settings.haptics'))}
      <div class="toggle-row"><span class="l">${icon('star')}${t('settings.quality')}</span>${seg(
        'quality',
        [
          ['high', t('q.high')],
          ['balanced', t('q.balanced')],
          ['saver', t('q.saver')],
        ],
        st.quality,
      )}</div>
      <div class="toggle-row"><span class="l">${icon('info')}${t('settings.lang')}</span>${seg(
        'lang',
        [
          ['auto', t('lang.auto')],
          ['tr', 'TR'],
          ['en', 'EN'],
        ],
        st.lang,
      )}</div>
      ${sw('showFps', st.showFps, 'chart', t('settings.fps'))}
      ${canFullscreen ? `<button class="toggle-row" data-a="fullscreen"><span class="l">${icon('expand')}${t('settings.fullscreen')}</span><span></span></button>` : ''}
    </div>
    <div class="section-title"></div>
    <div class="list">
      <button class="btn-ghost" data-a="tutorial">${icon('info')}${t('settings.tutorial')}</button>
      <button class="btn-ghost danger" data-a="reset">${icon('restart')}${resetArmed ? t('settings.resetConfirm') : t('settings.reset')}</button>
    </div>
    <p class="credits">${t('settings.credits', { v: version })}</p>`;
  return panel('settings', t('settings.title'), body, save.coins);
}

export function bannerHTML(big: string, small: string, boss: boolean, color?: string): string {
  return `
    <div class="banner ${boss ? 'boss' : ''}" ${color ? `style="--bc:${color}"` : ''}>
      <div class="big">${big}</div>
      <svg class="stroke" viewBox="0 0 300 16" preserveAspectRatio="none"><path d="M6 10 C 70 2, 120 14, 170 8 S 260 4, 294 9"/></svg>
      ${small ? `<div class="small">${small}</div>` : ''}
    </div>`;
}

export function toastHTML(ic: string, text: string): string {
  return `<div class="toast">${icon(ic)}<span>${text}</span></div>`;
}

