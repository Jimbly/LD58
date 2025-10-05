/* eslint n/global-require:off */
// eslint-disable-next-line import/order
const local_storage = require('glov/client/local_storage');
local_storage.setStoragePrefix('ld58'); // Before requiring anything else that might load from this

import assert from 'assert';
import { AnimationSequencer, animationSequencerCreate } from 'glov/client/animation';
import { autoResetSkippedFrames } from 'glov/client/auto_reset';
import { autoAtlas } from 'glov/client/autoatlas';
import { platformParameterGet } from 'glov/client/client_config';
import * as engine from 'glov/client/engine';
import { ALIGN, Font, fontCreate, FontStyle, fontStyle, fontStyleColored } from 'glov/client/font';
import { eatAllInput, KEYS, mouseDownAnywhere } from 'glov/client/input';
import { localStorageGetJSON, localStorageSetJSON } from 'glov/client/local_storage';
import { markdownAuto } from 'glov/client/markdown';
import { markdownSetColorStyle } from 'glov/client/markdown_renderables';
import { netInit } from 'glov/client/net';
import {
  scoreAlloc,
  ScoreSystem,
} from 'glov/client/score';
import { scoresDraw } from 'glov/client/score_ui';
import { spot, SPOT_DEFAULT_LABEL } from 'glov/client/spot';
import { spriteSetGet } from 'glov/client/sprite_sets';
import { Sprite, spriteCreate } from 'glov/client/sprites';
import { fade } from 'glov/client/transition';
import * as transition from 'glov/client/transition';
import {
  button,
  buttonText,
  buttonWasFocused,
  drawBox,
  drawHBox,
  label,
  menuUp,
  panel,
  playUISound,
  scaleSizes,
  setFontHeight,
  setPanelPixelScale,
  UIBox,
  uiGetFont,
  uiSetPanelColor,
  UISounds,
  uiTextHeight,
} from 'glov/client/ui';
import { randCreate, shuffleArray } from 'glov/common/rand_alea';
import { TSMap } from 'glov/common/types';
import { capitalize as capitalizeOrig, clamp, easeOut, lerp, plural } from 'glov/common/util';
import { v3copy } from 'glov/common/vmath';
import { palette, palette_font } from './palette';

function capitalize(s: string): string {
  return capitalizeOrig(s).replace('Acid', 'Alchemical');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { abs, max, min, ceil, round, floor } = Math;

const PAL_BLUE = 17;
const PAL_GREEN = 12;
const PAL_YELLOW = 11;
const PAL_RED = 26;
const PAL_BLACK = 25;
const PAL_WHITE = 19;
const PAL_CYAN = 18;

const INV_COLS = 6;
const INV_ROWS = 2;

window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SPRITES = 10;

const BUTTON_H = 18;
const IMG_H = 12;
const IMG_PAD = (BUTTON_H - IMG_H) / 2;
const FRAME_H = 16;
const FRAME_PAD = 1;

const NUM_COLLECTOR = 6;
const NUM_NEXT = 3;
const COLLECTOR_X = 17;
const COLLECTOR_W = 64;
const COLLECTOR_Y = 9;
const NEXTUP_X = 254;
const NEXTUP_Y = COLLECTOR_Y;
const NEXTUP_W = 54;
const MAX_TOOL_TIER = 5;
const NEW_TOOL_COST = 100;

// Virtual viewport for our game logic
const game_width = 320;
const game_height = 240;

let font_tiny: Font;

type Score = {
  won: boolean;
  days: number;
  money: number;
};
let score_system: ScoreSystem<Score>;

let blend_data: TSMap<{
  blend_start: number;
  blend_start_value: number;
  last_value: number;
}> = {};
function blend(key: string, value: number): number {
  let bd = blend_data[key];
  if (!bd || autoResetSkippedFrames(key)) {
    bd = blend_data[key] = {
      blend_start: engine.frame_timestamp,
      blend_start_value: value,
      last_value: value,
    };
  }
  let dt = engine.frame_timestamp - bd.blend_start;
  let w = min(dt / 500, 1);
  let v = lerp(easeOut(w, 2), bd.blend_start_value, bd.last_value);
  if (value !== bd.last_value) {
    bd.blend_start_value = v;
    bd.blend_start = engine.frame_timestamp - 16;
    bd.last_value = value;
  }
  return round(v);
}

type SkillDef = {
  name: string;
  progress?: number[];
  quality?: number[];
  durability?: number;
  cooldown?: number;
  temperament?: number;
  special?: 'progress' | 'quality' | 'durability' | 'pierce';
  special_amount?: number;
  special_duration?: number;
  success?: number;
  sound: string;
};
const CDRARE = 14;
const CDRARE2 = 29;
const SKILLS: TSMap<SkillDef> = {
  l1: {
    name: 'Radiant Blast',
    // Prog 100 in 40-50 dur
    progress: [11, 13], // ratio 2.4
    durability: 5,
    sound: 'none',
  },
  l2: {
    name: 'Luminous Incision',
    // Qual 100 in 45 dur, CD, temp -
    quality: [34,36],  // ratio 2.333 (temp-)
    durability: 15,
    cooldown: 2,
    temperament: -1,
    sound: 'none',
  },
  d1: {
    name: 'Earth Shatter',
    // Prog 100 in 50
    progress: [21, 23], // ratio 2.2
    durability: 10,
    sound: 'none',
  },
  d2: {
    name: 'Harmonic Boring',
    // Qual 100 in 50, CD
    quality: [23,25], // ratio 2.67 (but rounds poorly)
    durability: 9,
    cooldown: 1,
    sound: 'none',
  },
  a1: {
    name: 'Temper Alignment',
    // Prog 100 in 60, temp +
    progress: [28, 30], // 2.0
    durability: 15,
    temperament: 2,
    sound: 'none',
  },
  a2: {
    name: 'Virtuous Distillation',
    // Qual 100 in 35-50, high variance
    quality: [10, 15], // ratio 2.5, variance
    durability: 5,
    sound: 'none',
  },

  d3: {
    name: 'Dashing Strike',
    progress: [50, 55],
    durability: 24,
    cooldown: 3,
    sound: 'none',
  },
  d4: {
    name: 'Finish It',
    // 100% extra Prog for next 4 turns, CD 14
    special: 'progress',
    special_amount: 100,
    special_duration: 3,
    cooldown: CDRARE2,
    temperament: 1,
    sound: 'buff1',
  },
  d5: {
    name: 'Stone Sense',
    // 50% extra Qual for next 4 turns, CD 14
    special: 'quality',
    special_amount: 75,
    special_duration: 4,
    cooldown: 9,
    sound: 'buff1',
  },
  l3: {
    name: 'Jack o\' All Trades',
    quality: [8,9],
    progress: [8,9],
    durability: 7,
    cooldown: 3,
    temperament: 1,
    sound: 'none',
  },
  l4: {
    name: 'Venerate',
    // Temp ++, CD 5
    temperament: 2,
    cooldown: 5,
    sound: 'buff3',
  },
  l5: {
    name: 'Laser Focus',
    // 200% extra Qual for next 1 turn
    special: 'quality',
    special_amount: 200,
    special_duration: 1,
    cooldown: 4,
    sound: 'buff3',
  },
  a3: {
    name: 'Repair',
    // dur +30, CD 5
    durability: -30,
    cooldown: CDRARE,
    sound: 'buff2',
  },
  a4: {
    name: 'Soften',
    // Ignore defenses for next 4 steps, CD 14
    special: 'pierce',
    special_amount: 100,
    special_duration: 11,
    cooldown: CDRARE2,
    sound: 'buff2',
  },
  a5: {
    name: 'Precision',
    // 50% less dur for next 4 steps, CD 14
    special: 'durability',
    special_amount: -50,
    special_duration: 7,
    cooldown: CDRARE,
    sound: 'buff2',
  },
};

const GEM_TYPES = ['ruby', 'sapphire', 'emerald'] as const;
type GemType = typeof GEM_TYPES[number];
type InventoryItem = {
  gem: GemType;
  tier: number;
};

const TOOL_TYPES = ['laser', 'drill', 'acid'] as const;
type ToolType = typeof TOOL_TYPES[number];
type ToolEntry = {
  tool: ToolType;
  tier: number;
};

type Request = InventoryItem & {
  value: number;
  done: boolean;
};

type OreEntry = {
  gem: GemType;
  defense: Record<ToolType, number>;
};

type GameData = {
  inventory: (InventoryItem|null)[];
  money: number;
  tools: (ToolEntry|null)[];
  requests: Request[];
  next_up: OreEntry[];
  skills: string[];
  max_tier: number; // 2-4 only
  won: boolean;
  endless: boolean;
  days: number;
  seed: number[];
};

let rand_level = randCreate(1);
let rand_craft = randCreate(1);

function defenseForType(gem: GemType): Record<ToolType, number> {
  if (gem === 'emerald') {
    return {
      laser: 1 + rand_level.range(2),
      drill: 2 + rand_level.range(2),
      acid: 0,
    };
  } else if (gem === 'ruby') {
    return {
      laser: 0,
      drill: 1 + rand_level.range(2),
      acid: 2 + rand_level.range(2),
    };
  } else {
    return {
      laser: 2 + rand_level.range(2),
      drill: 0,
      acid: 1 + rand_level.range(2),
    };
  }
}

const TEMPERAMENT_BONUS = {
  [-1]: -20,
  0: 0,
  1: 20,
  2: 50,
};

const DEFENSE_REDUCTION = [
  0,
  -10,
  -35,
  -50,
];

function requestValueForTier(tier: number): number {
  return [0, 100, 1000, 2000, 4000, 8000][tier];
}

class GameState {
  data: GameData;
  constructor() {
    let inventory: InventoryItem[] = [];
    let tools: ToolEntry[] = [{
      tool: 'laser',
      tier: 1,
    }];
    let money = 0;
    let requests: Request[] = [];
    let next_up: OreEntry[] = [];
    rand_level.reseed(123456);
    for (let ii = 0; ii < NUM_COLLECTOR; ++ii) {
      let tier = ii < 3 ? 1 : 2;
      let gem = ii < 3 ? GEM_TYPES[ii] : GEM_TYPES[rand_level.range(GEM_TYPES.length)];
      requests.push({
        gem,
        tier,
        value: requestValueForTier(tier),
        done: false,
      });
    }
    for (let ii = 0; ii < NUM_NEXT; ++ii) {
      let gem = GEM_TYPES[ii % GEM_TYPES.length];
      next_up.push({
        gem,
        defense: defenseForType(gem),
      });
    }
    shuffleArray(next_up, rand_level);

    if (engine.DEBUG && true) {
      money = 1000000;
      for (let ii = 0; ii < 12; ++ii) {
        inventory.push({
          gem: GEM_TYPES[ii % GEM_TYPES.length], // rand_level.range(GEM_TYPES.length)],
          tier: 4, //1 + rand_level.range(5),
        });
      }
      tools[0].tier = 1;
      // tools.push({
      //   tool: 'drill',
      //   tier: 3,
      // }, {
      //   tool: 'acid',
      //   tier: 5,
      // });
    }
    this.data = {
      inventory,
      money,
      tools,
      requests,
      next_up,
      skills: [],
      max_tier: 2,
      seed: rand_level.exportState(),
      won: false,
      endless: false,
      days: 1,
    };
    this.applySkills();
  }

  score(): Score {
    let { won, money, days, inventory } = this.data;
    for (let ii = 0; ii < inventory.length; ++ii) {
      let entry = inventory[ii];
      if (entry) {
        let sell_value = requestValueForTier(entry.tier);
        if (entry.tier > 1) {
          sell_value /= 2;
        }
        money += sell_value;
      }
    }
    money = floor(money / 100);
    return {
      won,
      money,
      days,
    };
  }

  saveGame(): void {
    this.data.seed = rand_level.exportState();
    localStorageSetJSON('save', this.data);
    score_system.setScore(0, this.score());
  }

  loadGame(): void {
    let data = localStorageGetJSON<GameData>('save');
    assert(data);
    this.data = data;
    rand_level.importState(data.seed);
  }

  toolTiers(): {
    laser: number;
    drill: number;
    acid: number;
  } {
    let { tools } = this.data;
    let tool_tiers = {
      laser: 0,
      drill: 0,
      acid: 0,
    };
    for (let ii = 0; ii < tools.length; ++ii) {
      let tool = tools[ii];
      if (tool) {
        tool_tiers[tool.tool] += tool.tier;
      }
    }
    return tool_tiers;
  }

  applySkills(): void {
    let { skills } = this.data;
    let tool_tiers = this.toolTiers();

    let seen: TSMap<true> = {};
    for (let ii = 0; ii < skills.length; ++ii) {
      seen[skills[ii]] = true;
    }
    let tooltype: keyof typeof tool_tiers;
    // Add any missing up to 10
    for (tooltype in tool_tiers) {
      let count = tool_tiers[tooltype];
      for (let ii = 1; ii <= count; ++ii) {
        let key = `${tooltype[0].toLowerCase()}${ii}`;
        if (SKILLS[key] && !seen[key] && skills.length < 10) {
          skills.push(key);
        }
      }
    }
    skills.sort(function (a, b) {
      let at = ['l', 'd', 'a'].indexOf(a[0]);
      let bt = ['l', 'd', 'a'].indexOf(b[0]);
      if (at !== bt) {
        return at - bt;
      }
      return a < b ? -1 : 1;
    });
  }

  crafting = -1;
  progress = 0;
  quality = 0;
  durability = 0;
  // -1 - malign
  // 0 - equable
  // 1 - benign
  // 2 - exalted
  temperament: -1 | 0 | 1 | 2 = 0;
  cooldowns: number[] = [];
  specials: {
    skill_idx: number;
    special: 'progress' | 'quality' | 'durability' | 'pierce';
    special_amount: number;
    special_duration: number;
  }[] = [];
  startCraft(index: number): void {
    rand_craft.reseed(rand_level.range(10000000));
    this.crafting = index;
    this.progress = 0;
    this.quality = 0;
    this.durability = 100;
    this.temperament = (0 + rand_craft.range(2)) as 0 | 1;
    this.cooldowns = [];
    for (let ii = 0; ii < 10; ++ii) {
      this.cooldowns.push(0);
    }
    this.specials = [];
    this.applySkills();
  }
  finishCrafting(): void {
    let { durability, quality, progress, crafting } = this;
    let { inventory, next_up, requests } = this.data;

    let target = next_up[crafting];
    if (durability >= 0 && progress >= 100) {
      for (let ii = inventory.length - 1; ii >= 0; --ii) {
        if (!inventory[ii]) {
          inventory.splice(ii, 1);
        }
      }
      let tier = min(5, floor(quality / 100) + 1);
      inventory.push({
        gem: target.gem,
        tier,
      });
      this.data.max_tier = clamp(tier, this.data.max_tier, 4);
    }
    this.crafting = -1;
    this.data.days++;
    // cycle next_up, first ensure anything missing is there now
    let seen: TSMap<boolean> = {};
    for (let ii = 0; ii < next_up.length; ++ii) {
      let entry = next_up[ii];
      seen[entry.gem] = true;
    }
    next_up = [];
    for (let ii = 0; ii < GEM_TYPES.length; ++ii) {
      let gem = GEM_TYPES[ii];
      if (!seen[gem]) {
        next_up.push({
          gem,
          defense: defenseForType(gem),
        });
      }
    }
    while (next_up.length < NUM_NEXT) {
      let gem = GEM_TYPES[rand_level.range(GEM_TYPES.length)];
      if (next_up.length === 2 &&
        next_up[0].gem === gem &&
        next_up[1].gem === gem
      ) {
        continue;
      }
      next_up.push({
        gem,
        defense: defenseForType(gem),
      });
    }
    shuffleArray(next_up, rand_level);
    this.data.next_up = next_up;

    let any_done = Boolean(requests.find((a) => a.done));
    if (!any_done) {
      // none completed, cycle one which is not satisfied
      let options = [];
      let satisfy_used = -1;
      for (let ii = 3; ii < requests.length; ++ii) {
        let entry = requests[ii];
        if (!entry.done) {
          let idx = this.satisfiesRequest(entry);
          if (idx === null || idx === satisfy_used) {
            // not satisfied, or satisfied by a gem that already saved a different entry
            options.push(ii);
          } else {
            satisfy_used = idx;
          }
        }
      }
      if (!options.length) {
        // all are satisfied, cycle one that is a different color than what we just got
        let did_protect = false;
        for (let ii = 3; ii < requests.length; ++ii) {
          let entry = requests[ii];
          if (!entry.done) {
            if (entry.gem !== target.gem || did_protect) {
              options.push(ii);
            } else {
              did_protect = true;
            }
          }
        }
      }
      if (options.length) {
        let idx = options[rand_level.range(options.length)];
        requests[idx].done = true;
      }
    }

    function hasRequest(gem: GemType, tier: number): boolean {
      for (let ii = 3; ii < requests.length; ++ii) {
        let entry = requests[ii];
        if (!entry.done && entry.gem === gem && entry.tier === tier) {
          return true;
        }
      }
      return false;
    }

    for (let ii = 3; ii < requests.length; ++ii) {
      let entry = requests[ii];
      if (entry.done) {
        let gem = GEM_TYPES[rand_level.range(GEM_TYPES.length)];
        let tier = 2 + rand_level.range(this.data.max_tier - 2 + 1);
        while (hasRequest(gem, tier)) {
          gem = GEM_TYPES[rand_level.range(GEM_TYPES.length)];
          tier = 2 + rand_level.range(this.data.max_tier - 2 + 1);
        }
        requests[ii] = {
          gem,
          tier,
          value: requestValueForTier(tier),
          done: false,
        };
      }
    }
    this.saveGame();
  }
  skillBonuses(skill_index: number): {
    progress: number;
    quality: number;
    durability: number;
  } {
    let { skills, next_up } = this.data;
    let { temperament, specials, crafting } = this;
    let skill_id = skills[skill_index];
    assert(skill_id);
    let target = next_up[crafting];
    let special_mul = {
      progress: 1,
      quality: 1,
      durability: 1,
      pierce: 1,
    };
    for (let ii = specials.length - 1; ii >= 0; --ii) {
      let spec = specials[ii];
      special_mul[spec.special] *= (spec.special_amount + 100)/100;
    }
    if (temperament) {
      let mul = 1 + TEMPERAMENT_BONUS[temperament]/100;
      special_mul.progress *= mul;
      special_mul.quality *= mul;
    }
    const tool_type = skill_id[0] === 'l' ? 'laser' : skill_id[0] === 'd' ? 'drill' : 'acid';
    let defadd = DEFENSE_REDUCTION[target.defense[tool_type]]/100 * (2 - special_mul.pierce);
    special_mul.progress += defadd;
    let skill = SKILLS[skill_id]!;
    if (skill.durability && skill.durability < 0) {
      special_mul.durability = 1;
    }
    return special_mul;
  }
  activateSkill(skill_index: number): boolean {
    let { skills } = this.data;
    let { cooldowns, temperament, specials } = this;
    let skill_id = skills[skill_index];
    assert(skill_id);

    for (let ii = 0; ii < cooldowns.length; ++ii) {
      if (cooldowns[ii]) {
        --cooldowns[ii];
      }
    }

    let special_mul = this.skillBonuses(skill_index);

    for (let ii = specials.length - 1; ii >= 0; --ii) {
      let spec = specials[ii];
      spec.special_duration--;
      if (!spec.special_duration) {
        specials.splice(ii, 1);
      }
    }

    let skill = SKILLS[skill_id]!;
    if (skill.cooldown) {
      cooldowns[skill_index] = skill.cooldown;
    }
    this.durability = clamp(this.durability - round((skill.durability || 0) * special_mul.durability), -100, 100);

    if (skill.success) {
      if (rand_craft.range(100) >= skill.success) {
        return false;
      }
    }

    if (skill.quality) {
      let v = skill.quality[0] + rand_craft.range(skill.quality[1] - skill.quality[0] + 1);
      v *= special_mul.quality;
      this.quality += round(v);
    }
    if (skill.progress) {
      let v = skill.progress[0] + rand_craft.range(skill.progress[1] - skill.progress[0] + 1);
      v *= special_mul.progress;
      this.progress = clamp(this.progress + round(v), 0, 100);
    }

    let dtemp = rand_craft.range(4);
    if (temperament === 2) {
      if (dtemp === 3) {
        temperament--;
      } else {
        temperament -= 2;
      }
    } else if (temperament === -1) {
      temperament++;
    } else if (dtemp === 0) {
      temperament--;
    } else if (dtemp === 3) {
      temperament++;
    }
    temperament = clamp(temperament, -1, 2) as -1 | 0 | 1 | 2;

    if (skill.temperament) {
      temperament += skill.temperament;
      temperament = clamp(temperament, -1, 2) as -1 | 0 | 1 | 2;
    }
    this.temperament = temperament;

    if (skill.special) {
      specials.push({
        skill_idx: skill_index,
        special: skill.special,
        special_amount: skill.special_amount!,
        special_duration: skill.special_duration!,
      });
    }
    return true;
  }

  satisfiesRequest(req: Request): number | null {
    let { inventory } = this.data;
    let best: number | null = null;
    for (let ii = 0; ii < inventory.length; ++ii) {
      let entry = inventory[ii];
      if (entry && entry.gem === req.gem && entry.tier >= req.tier) {
        // valid
        if (!best || entry.tier < inventory[best]!.tier) {
          best = ii;
        }
      }
    }
    return best;
  }

  toolTier(tool_type: ToolType): number {
    return this.toolTiers()[tool_type];
  }

  upgradeCost(tool: ToolType, cur_tier: number): {
    gem: GemType;
    gem_tier: number;
    money: number;
  } {
    return {
      money: [0, 200, 1500, 3000, 5000][cur_tier],
      gem: tool === 'drill' ? 'emerald' : tool === 'laser' ? 'sapphire' : 'ruby',
      gem_tier: [0, 1, 2, 2, 3][cur_tier],
    };
  }
  upgradeCanAfford(tool_index: number): number | null {
    let tool = this.data.tools[tool_index];
    assert(tool);
    let cost = this.upgradeCost(tool.tool, tool.tier);
    if (cost.money > this.data.money) {
      return null;
    }
    return this.satisfiesRequest({
      gem: cost.gem,
      tier: cost.gem_tier,
      value: 0,
      done: false,
    });
  }
  upgrade(tool_index: number): void {
    let tool = this.data.tools[tool_index];
    assert(tool);
    let cost = this.upgradeCost(tool.tool, tool.tier);
    let satisfies_request = this.satisfiesRequest({
      gem: cost.gem,
      tier: cost.gem_tier,
      value: 0,
      done: false,
    });
    assert(satisfies_request !== null);
    this.data.money -= cost.money;
    this.data.inventory[satisfies_request] = null;
    tool.tier++;
    this.applySkills();
  }
  buyTool(tool_index: number, tool_type: ToolType): void {
    this.data.money -= NEW_TOOL_COST;
    this.data.tools[tool_index] = {
      tool: tool_type,
      tier: 1,
    };
    this.applySkills();
  }
}

let game_state: GameState;
let sprite_dither: Sprite;

function init(): void {
  sprite_dither = spriteCreate({
    name: 'ditheroverlay',
  });

  if (localStorageGetJSON<GameData>('save')) {
    game_state = new GameState();
    game_state.loadGame();
  }
}

function startNewGame(): void {
  game_state = new GameState();
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  engine.setState(statePrep);
}

const TRANSITION_TIME = 250;
function queueTransition(): void {
  // Why isn't this working?
  if (engine.getFrameIndex() > 1) {
    transition.queue(Z.TRANSITION_FINAL, fade.bind(null, TRANSITION_TIME));
  }
}

let inv_highlight: number | null = null;
let PERSONAL_Y = 0;

function drawCollector(): void {
  let font = uiGetFont();
  let text_height = uiTextHeight();
  let x = COLLECTOR_X;
  let y = COLLECTOR_Y;
  let w = COLLECTOR_W;
  let { requests, inventory } = game_state.data;
  let ore_disabled = inventory.length === INV_COLS * INV_ROWS && !inventory.includes(null);
  font.draw({
    color: ore_disabled ? palette_font[PAL_RED] : palette_font[PAL_WHITE],
    x, y, w,
    align: ALIGN.HCENTER,
    text: 'Sell',
  });
  label({
    x, y, w,
    text: ' ',
    tooltip: 'A gem of any tier can be sold for $100.\n\nHINT: If the gem is T2 or higher, sell to a Collector instead.'
  });
  y += text_height + 2;

  for (let ii = 0; ii < requests.length; ++ii) {
    let entry = requests[ii];
    x = COLLECTOR_X;
    let satisfies_request = game_state.satisfiesRequest(entry);
    if (entry.done) {
      autoAtlas('game', 'check').draw({
        x: x + IMG_PAD,
        y: y + IMG_PAD,
        w: IMG_H,
        h: IMG_H,
      });
    } else if (satisfies_request !== null) {
      if (button({
        x, y,
        img: autoAtlas('game', 'check'),
        // eslint-disable-next-line prefer-template
        tooltip: 'Sell the highlighted gem ' + (ii < 3 ? '(repeatable)' : 'to a collector') +
          ((inventory[satisfies_request]!.tier > entry.tier) ?
            '\n\nWARNING: You are selling a MORE VALUABLE gem than is specifically required' : ''),
        sound_button: 'sell',
      })) {
        if (ii >= 3) {
          entry.done = true;
        }
        game_state.data.money += entry.value;
        inventory[satisfies_request] = null;
        game_state.saveGame();
      }
      if (buttonWasFocused()) {
        inv_highlight = satisfies_request;
      }
    } else {
      autoAtlas('game', 'x').draw({
        x: x + IMG_PAD,
        y: y + IMG_PAD,
        w: IMG_H,
        h: IMG_H,
      });
    }
    x += BUTTON_H + 2;
    let framepos = {
      x,
      y: y + FRAME_PAD,
      z: Z.SPRITES,
      w: FRAME_H,
      h: FRAME_H,
    };
    drawBox(framepos, autoAtlas('game', satisfies_request && !entry.done ? 'item-border' : 'item-empty'), 1);
    framepos.z++;
    autoAtlas('game', entry.gem).draw({
      x: x + IMG_PAD - FRAME_PAD,
      y: y + IMG_PAD,
      w: IMG_H,
      h: IMG_H,
      z: framepos.z,
      color: entry.done ? [1,1,1,0.5] : undefined,
    });
    framepos.z++;
    autoAtlas('game', `tier${entry.tier}`).draw({
      ...framepos,
      color: entry.done ? [0.4, 0.4, 0.5, 1] : undefined,
    });
    x += FRAME_H + 2;
    font.draw({
      color: palette_font[entry.done ? PAL_BLACK - 2 : satisfies_request ? PAL_YELLOW : PAL_GREEN],
      x, y, h: BUTTON_H,
      align: ALIGN.VCENTER,
      text: `$${entry.value}`,
    });

    y += BUTTON_H + 1;
    if (ii === 2) {
      y += 2;
      label({
        x: COLLECTOR_X, y, w,
        h: text_height * 2 - 6,
        text: ' ',
        tooltip: 'Collectors pay more for gems.\n\n' +
        'Each day, any fulfilled Collectors will come back with a new offer, and up to 1 existing offer' +
        ' will also refresh.',
      });
      font.draw({
        x: COLLECTOR_X, y, w,
        align: ALIGN.HCENTER,
        text: 'Collector',
      });
      y += text_height - 4;
      font.draw({
        x: COLLECTOR_X, y, w,
        align: ALIGN.HCENTER,
        text: 'Requests',
      });
      y += text_height + 3;
    }
  }

  PERSONAL_Y = y + 2;
}

function drawPersonalCollection(): void {
  let font = uiGetFont();
  let text_height = uiTextHeight();
  let x = COLLECTOR_X;
  let y = PERSONAL_Y;
  let w = COLLECTOR_W;
  label({
    x, y: y + 4, w,
    h: text_height * 4 - 3,
    text: ' ',
    tooltip: 'Collect a T5 gem of each type to win the game.'
  });
  font.draw({
    x, y, w,
    align: ALIGN.HCENTER,
    text: 'Personal',
  });
  y += text_height - 4;
  font.draw({
    x: COLLECTOR_X, y, w,
    align: ALIGN.HCENTER,
    text: 'Collection',
  });
  y += text_height + 2;

  x = COLLECTOR_X + floor((COLLECTOR_W - FRAME_H * 3 - 2*2)/2);
  let did_win = true;
  for (let ii = 0; ii < GEM_TYPES.length; ++ii) {
    let have_it = game_state.satisfiesRequest({
      gem: GEM_TYPES[ii],
      tier: 5,
      value: 0,
      done: false,
    }) !== null;
    drawBox({
      x, y, z: Z.UI - 1,
      w: FRAME_H,
      h: FRAME_H + IMG_H + 2,
    }, autoAtlas('game', have_it ? 'item-border' : 'item-empty'), 1);

    autoAtlas('game', GEM_TYPES[ii]).draw({
      x: x + (FRAME_H - IMG_H)/2,
      y: y + (FRAME_H - IMG_H)/2,
      w: IMG_H,
      h: IMG_H,
    });
    autoAtlas('game', 'tier5').draw({
      x: x,
      y: y,
      z: Z.UI + 1,
      w: FRAME_H,
      h: FRAME_H,
    });

    if (!have_it) {
      did_win = false;
    }
    autoAtlas('game', have_it ? 'check' : 'x').draw({
      x: x + (FRAME_H - IMG_H)/2,
      y: y + (FRAME_H - IMG_H)/2 + IMG_H + 2,
      z: Z.UI + 1,
      w: IMG_H,
      h: IMG_H,
    });

    x += FRAME_H + 2;
  }

  font_tiny.draw({
    size: 8,
    x: COLLECTOR_X,
    y: game_height - 2,
    w: COLLECTOR_W,
    align: ALIGN.VBOTTOM | ALIGN.HCENTER,
    text: `Day ${game_state.data.days}`,
  });

  if (did_win && !game_state.data.won) {
    game_state.data.won = true;
    game_state.saveGame();
  }
}


const INV_W = INV_COLS * FRAME_H + (INV_COLS - 1) * 2;
const INV_X = floor((game_width - INV_W)/2);
const INV_Y = NEXTUP_Y;
function drawInventory(): void {
  let font = uiGetFont();
  let text_height = uiTextHeight();
  let x = INV_X;
  let y = INV_Y;
  let w = INV_W;
  let { money, inventory } = game_state.data;
  let ore_disabled = inventory.length === INV_COLS * INV_ROWS && !inventory.includes(null);
  font.draw({
    color: ore_disabled ? palette_font[PAL_RED] : palette_font[PAL_WHITE],
    x, y, w,
    text: 'Inventory',
  });
  font.draw({
    color: palette_font[PAL_GREEN],
    x, y, w,
    align: ALIGN.HRIGHT,
    text: `$${blend('money', money)}`,
  });
  y += text_height + 3;

  let invidx = 0;
  for (let invy = 0; invy < INV_ROWS; ++invy) {
    for (let invx = 0; invx < INV_COLS; ++invx, ++invidx) {
      let item = inventory[invidx];
      let xx = x + invx * (FRAME_H + 2);
      drawBox({
        x: xx,
        y,
        w: FRAME_H,
        h: FRAME_H,
      }, autoAtlas('game', invidx === inv_highlight ? 'item-highlight' : item ? 'item-border' : 'item-empty'), 1);
      if (item) {
        autoAtlas('game', item.gem).draw({
          x: xx + (FRAME_H - IMG_H)/2,
          y: y + (FRAME_H - IMG_H)/2,
          w: IMG_H,
          h: IMG_H,
          z: Z.UI + 1,
        });
        autoAtlas('game', `tier${item.tier}`).draw({
          x: xx,
          y,
          w: FRAME_H,
          h: FRAME_H,
          z: Z.UI + 2,
        });
      }
    }
    y += FRAME_H + 2;
  }
}

const TOOLS_PAD1 = 4;
const TOOLS_PRICE_W = 36;
const BUY_W = BUTTON_H + IMG_H;
const TOOLS_W = BUY_W + TOOLS_PAD1 + BUTTON_H + 2 + FRAME_H + 1 + TOOLS_PRICE_W;
const TOOLS_X = floor((game_width - TOOLS_W)/2);
const TOOLS_Y = 68;
function drawTools(): void {
  let font = uiGetFont();
  let text_height = uiTextHeight();
  let x = TOOLS_X;
  let y = TOOLS_Y;
  let w = TOOLS_W;
  let { money, tools } = game_state.data;
  label({
    x, y, w,
    text: 'Tools',
    tooltip: 'Tools unlock skills to assist in extracting gems of higher quality,' +
      ' up to 5 skills of each tool class, and 10 skills total.'
  });
  y += text_height + 1;

  let x0 = x;
  for (let ii = 0; ii < TOOL_TYPES.length; ++ii) {
    x = x0;
    let tool = tools[ii];
    if (!tool) {
      let tool_type = TOOL_TYPES[ii];
      let can_afford = money >= NEW_TOOL_COST;
      let buy_param = {
        x,
        y,
        w: BUY_W,
        h: BUTTON_H,
        frame: 0, // aspect hacky fix
        disabled: !can_afford,
      };
      if (button({
        ...buy_param,
        img: autoAtlas('game', `add-${tool_type}`),
        tooltip: `Buy a T1 ${capitalize(tool_type)} for $${NEW_TOOL_COST}`,
        disabled_focusable: true,
        sound_button: 'upgrade',
      })) {
        game_state.buyTool(ii, tool_type);
      }
      font.draw({
        color: palette_font[NEW_TOOL_COST > money ? PAL_RED : PAL_GREEN],
        x: x + BUY_W + 4,
        y,
        h: BUTTON_H,
        align: ALIGN.VCENTER,
        text: `$${NEW_TOOL_COST}`,
      });
      y += BUTTON_H + 2;
      continue;
    }
    x += (BUY_W - FRAME_H) / 2;
    drawBox({
      x,
      y: y + 1,
      w: FRAME_H,
      h: FRAME_H,
    }, autoAtlas('game', 'item-border'), 1);
    autoAtlas('game', tool.tool).draw({
      x: x + (FRAME_H - IMG_H)/2,
      y: y + (FRAME_H - IMG_H)/2 + 1,
      w: IMG_H,
      h: IMG_H,
      z: Z.UI + 1,
    });
    autoAtlas('game', `tier${tool.tier}`).draw({
      x,
      y: y + 1,
      w: FRAME_H,
      h: FRAME_H,
      z: Z.UI + 2,
    });
    x += (BUY_W - FRAME_H) / 2;
    x += FRAME_H + TOOLS_PAD1;
    if (tool.tier === MAX_TOOL_TIER) {
      font.draw({
        color: palette_font[PAL_GREEN],
        x,
        y,
        h: BUTTON_H,
        align: ALIGN.VCENTER,
        text: 'Maximum Tier',
      });
      x += BUTTON_H + 2;
      x += FRAME_H + 1;
      x += TOOLS_PRICE_W + TOOLS_PAD1;
    } else {
      let upgrade_cost = game_state.upgradeCost(tool.tool, tool.tier);
      let can_afford = game_state.upgradeCanAfford(ii);
      // let tooltip_warn = game_state.toolTier(tool.tool) >= 5 ?
      //   `\n\nWARNING: Your already have all 5 ${capitalize(tool.tool)} Skills unlocked, upgrading` +
      //   ' this tool will not unlock additional skills.' : '';
      let tooltip_warn = '';
      if (button({
        x, y, w: BUTTON_H, h: BUTTON_H,
        disabled: can_afford === null,
        img: autoAtlas('game', 'upgrade'),
        tooltip: `Upgrade tool, unlocking a new skill, paying the cost listed to the right.${tooltip_warn}`,
        disabled_focusable: true,
        sound_button: 'upgrade',
      })) {
        game_state.upgrade(ii);
      }
      if (buttonWasFocused()) {
        inv_highlight = can_afford;
      }
      x += BUTTON_H + 2;

      drawBox({
        x,
        y: y + 1,
        w: FRAME_H,
        h: FRAME_H,
      }, autoAtlas('game', can_afford === null ? 'item-empty' : 'item-border'), 1);
      autoAtlas('game', upgrade_cost.gem).draw({
        x: x + (FRAME_H - IMG_H)/2,
        y: y + (FRAME_H - IMG_H)/2 + 1,
        w: IMG_H,
        h: IMG_H,
        z: Z.UI + 1,
      });
      autoAtlas('game', `tier${upgrade_cost.gem_tier}`).draw({
        x,
        y: y + 1,
        w: FRAME_H,
        h: FRAME_H,
        z: Z.UI + 2,
      });
      x += FRAME_H + 1;
      font.draw({
        x, y,
        h: BUTTON_H,
        align: ALIGN.VCENTER,
        text: '+',
      });
      font.draw({
        color: palette_font[upgrade_cost.money > money ? PAL_RED : PAL_GREEN],
        x: x + 6,
        y,
        h: BUTTON_H,
        align: ALIGN.VCENTER,
        text: `$${upgrade_cost.money}`,
      });
      x += TOOLS_PRICE_W + TOOLS_PAD1;
    }

    y += BUTTON_H + 2;
  }
}

function drawOreCard(x: number, y: number, w: number, entry: OreEntry, do_tooltips: boolean): number {
  autoAtlas('game', 'item-oreframe').draw({
    x: x + (w - FRAME_H)/2,
    y,
    w: FRAME_H,
    h: FRAME_H,
  });
  autoAtlas('game', `ore-${entry.gem}`).draw({
    x: x + (w - IMG_H)/2,
    y: y + (FRAME_H - IMG_H)/2,
    z: Z.UI + 1,
    w: IMG_H,
    h: IMG_H,
  });
  y += FRAME_H + 4;
  const RES_STEP = 8;
  const PAD1 = 1;
  const RES_LINE_W = IMG_H + PAD1 + RES_STEP * 3 + 2;
  for (let ii = 0; ii < TOOL_TYPES.length; ++ii) {
    let xx = x + floor((w - RES_LINE_W)/2);
    let tool = TOOL_TYPES[ii];
    autoAtlas('game', tool).draw({
      x: xx,
      y, w: IMG_H, h: IMG_H,
    });
    xx += IMG_H + PAD1;
    let def = entry.defense[tool];
    for (let jj = 0; jj < def; ++jj) {
      autoAtlas('game', 'defense').draw({
        x: xx,
        y, w: IMG_H, h: IMG_H,
      });
      xx += RES_STEP + 1;
    }
    if (do_tooltips && def) {
      label({
        x, y, w,
        h: IMG_H + 1,
        text: '',
        tooltip: ` [c=red]${DEFENSE_REDUCTION[def]}%[/c] Progress from [c=${
          tool === 'laser' ? 'red' : tool === 'drill' ? 'white' : 'green'}]${capitalize(tool)}[/c] Skills `,
      });
    }
    y += IMG_H + 1;
  }

  return y;
}

const MAIN_PANEL = {
  x: 49,
  y: 20,
  w: 222,
  h: 138,
};
const CRAFT_TOOLTIP_PANEL = {
  x: (game_width - 264)/2,
  w: 264,
  y: MAIN_PANEL.y + MAIN_PANEL.h + 2,
  h: 54,
};
const SKILL_PAD = 1;
const QUICKBAR_W = BUTTON_H * 10 + SKILL_PAD * 9;
const TEMP = [
  [PAL_RED, 'MALIGN'],
  [PAL_WHITE + 1, 'EQUABLE'],
  [PAL_GREEN, 'BENIGN'],
  [PAL_YELLOW, 'EXALTED'],
] as const;
const FONT_OUTLINE = {
  outline_color: palette_font[PAL_BLACK],
  outline_width: 2.5,
};
const font_styles_tooltip: TSMap<FontStyle> = {
  red: fontStyle(null, {
    color: palette_font[PAL_RED],
    ...FONT_OUTLINE,
  }),
  green: fontStyle(null, {
    color: palette_font[PAL_GREEN],
    ...FONT_OUTLINE,
  }),
  blue: fontStyle(null, {
    color: palette_font[PAL_BLUE],
    ...FONT_OUTLINE,
  }),
  white: fontStyle(null, {
    color: palette_font[PAL_WHITE],
    ...FONT_OUTLINE,
  }),
  cyan: fontStyle(null, {
    color: palette_font[PAL_CYAN],
    ...FONT_OUTLINE,
  }),
};
const font_style_tooltip = fontStyleColored(null, palette_font[PAL_WHITE]);
const font_style_cooldown = fontStyle(null, {
  color: palette_font[PAL_WHITE + 2],
  outline_color: palette_font[PAL_BLACK],
  outline_width: 2.5,
});
type SkillStyle = 'button' | 'disabled' | 'selectable';
function drawSkill(
  x: number, y: number,
  skill_id: string | null, ii: number, skill_style: SkillStyle, tooltip_pos: UIBox
): void {
  let font = uiGetFont();
  let z = Z.UI;
  if (!skill_id) {
    drawBox({
      x: x + 1,
      y: y + 1,
      w: FRAME_H, h: FRAME_H,
    }, autoAtlas('game', 'item-empty'), 1);
    return;
  }
  let tool_type = skill_id[0] === 'l' ? 'laser' : skill_id[0] === 'd' ? 'drill' : 'acid';
  // font.draw({
  //   color: palette_font[PAL_BLACK],
  //   x, y,
  //   z: z + 2,
  //   w: BUTTON_H, h: BUTTON_H,
  //   align: ALIGN.HVCENTER,
  //   text: skill_id.toUpperCase(),
  // });
  let icon = autoAtlas('game', skill_id);
  let focused = false;
  if (skill_style === 'button') {
    let { cooldowns, specials } = game_state;
    let special = specials.find((a) => a.skill_idx === ii);
    if (special) {
      font_tiny.draw({
        color: palette_font[PAL_YELLOW],
        size: 8,
        x,
        y: y - 7,
        z,
        w: BUTTON_H,
        align: ALIGN.HCENTER,
        text: `${special.special_duration}T`,
      });
    }
    let cooldown = cooldowns[ii] || 0;
    let disabled = cooldown > 0;
    if (cooldown > 0) {
      font.draw({
        style: font_style_cooldown,
        x: x + 1, y: y + 1,
        z: z + 2,
        w: BUTTON_H, h: BUTTON_H,
        align: ALIGN.HVCENTER,
        text: String(cooldown),
      });
    }
    if (button({
      x, y,
      w: BUTTON_H, h: BUTTON_H,
      img: icon,
      disabled,
      hotkey: ii === 9 ? KEYS['0'] : KEYS['1'] + ii,
      disabled_focusable: true,
      sound_button: SKILLS[skill_id]!.sound,
    })) {
      game_state.activateSkill(ii);
    }
    focused = buttonWasFocused();
  } else {
    if (skill_style === 'disabled') {
      drawBox({
        x, y,
        w: BUTTON_H, h: BUTTON_H,
      }, autoAtlas('game', 'item-empty'), 1);
      icon.draw({
        x: x + 3,
        y: y + 3,
        z: Z.UI + 1,
        w: IMG_H,
        h: IMG_H,
        color: [1, 1, 1, 0.5],
      });
      focused = spot({
        def: SPOT_DEFAULT_LABEL,
        x, y, w: BUTTON_H, h: BUTTON_H,
      }).focused;
    } else if (skill_style === 'selectable') {
      let { skills } = game_state.data;
      let selected = skills.includes(skill_id);
      if (!selected && skills.length >= 10) {
        // cannot select, at max
        button({
          x, y,
          w: BUTTON_H, h: BUTTON_H,
          img: icon,
          draw_only: true,
          base_name: 'button_unselected',
        });
        focused = spot({
          def: SPOT_DEFAULT_LABEL,
          x, y, w: BUTTON_H, h: BUTTON_H,
        }).focused;
      } else {
        // select/deselect
        if (button({
          x, y,
          w: BUTTON_H, h: BUTTON_H,
          img: icon,
          base_name: selected ? undefined : 'button_unselected',
        })) {
          if (selected) {
            skills.splice(skills.indexOf(skill_id), 1);
          } else {
            skills.push(skill_id);
          }
          // NO, would re-add: game_state.applySkills();
        }
        focused = buttonWasFocused();
      }
    } else {
      assert(false);
    }
  }
  if (focused) {
    const yadv = 12;
    x = tooltip_pos.x;
    y = tooltip_pos.y;
    let w = tooltip_pos.w;
    z = tooltip_pos.z || Z.TOOLTIP;
    let skill = SKILLS[skill_id]!;
    x += 3;
    w -= 6;
    y += 1;
    markdownAuto({
      font_style: font_style_tooltip,
      x, y, z, w,
      text: `${capitalize(tool_type)} #${skill_id[1]}: [c=white]${skill.name}[/c]`,
      align: ALIGN.HCENTER,
    });
    y += yadv;

    let count = 0;
    let wrapped = false;
    let y_start = y;
    function wrap(): void {
      if (wrapped) {
        return;
      }
      wrapped = true;
      y = y_start;
      x += floor(w/2);
    }

    function addLine(text: string): void {
      markdownAuto({
        font_style: font_style_tooltip,
        font_styles: font_styles_tooltip,
        x, y, z,
        text,
      });
      y += yadv;
      ++count;
      if (count === 3) {
        wrap();
      }
    }

    let bonuses = skill_style === 'button' ? game_state.skillBonuses(ii) : {
      progress: 1,
      quality: 1,
      durability: 1,
    };

    function bonus(key: keyof typeof bonuses): string {
      let b = bonuses[key];
      b = round(b * 100 - 100);
      if (!b) {
        return '';
      }
      return ` (${b < 0 ? '-' : '+'}${abs(b)}%)`;
    }
    function bump(v: number, key: keyof typeof bonuses): number {
      v = round(v * bonuses[key]);
      return v;
    }
    function bump2(v: number[], key: keyof typeof bonuses): string {
      return `${bump(v[0], key)}-${bump(v[1], key)}`;
    }

    if (skill.durability) {
      if (skill.durability > 0) {
        addLine(`Durability: [c=red]-${bump(skill.durability, 'durability')}[/c]${bonus('durability')}`);
      } else {
        addLine(`Durability: [c=green]+${bump(-skill.durability, 'durability')}[/c]${bonus('durability')}`);
      }
    }

    if (skill.progress) {
      addLine(`Progress: [c=green]+${bump2(skill.progress, 'progress')}[/c]${bonus('progress')}`);
    }
    if (skill.quality) {
      addLine(`Quality: [c=cyan]+${bump2(skill.quality, 'quality')}[/c]${bonus('quality')}`);
    }
    if (skill.temperament) {
      if (skill.temperament < 0) {
        addLine('Temperament: [c=red]--[/c]');
      } else if (skill.temperament === 1) {
        addLine('Temperament: [c=green]++[/c]');
      } else {
        addLine('Temperament: [c=green]++++[/c]');
      }
    }
    if (skill.success) {
      addLine(`Success Rate: [c=red]${skill.success}%[/c]`);
    }

    if (skill.special) {
      let turns = `for the next [c=green]${skill.special_duration} ${plural(skill.special_duration!, 'Turn')}[/c]`;
      if (skill.special === 'pierce') {
        addLine('[c=green]Ignore ore defense[/c]');
        addLine(`  ${turns}`);
      } else {
        addLine(`${skill.special_amount! < 0 ? 'Decrease' : 'Increase'} ` +
          `[c=green]${skill.special}[/c] effects of other skills`);
        addLine(`  by [c=green]${abs(skill.special_amount!)}%[/c] ${turns}`);
      }
    }

    if (skill.cooldown) {
      if (!skill.special) {
        wrap();
      }
      addLine(`Cooldown: [c=red]${skill.cooldown} ${plural(skill.cooldown, 'Turn')}[/c]`);
    }

    panel({
      ...tooltip_pos,
      z: z - 1,
      sprite: autoAtlas('game', `panel_${tool_type}`),
    });
  }
}

const MUSIC_KEYS = ['progress', 'quality'] as const;
type MusicKey = typeof MUSIC_KEYS[number];
type MusicState = {
  value: number;
  last_played: number;
  play_to: number;
  play_countdown: number;
};
let music_last_values = {} as Record<MusicKey, MusicState>;
function tickMusicalEffects(): void {
  let dt = engine.getFrameDt();
  if (autoResetSkippedFrames('musicfx')) {
    for (let ii = 0; ii < MUSIC_KEYS.length; ++ii) {
      let key = MUSIC_KEYS[ii];
      music_last_values[key] = {
        value: game_state[key],
        last_played: 0,
        play_to: 0,
        play_countdown: 0,
      };
    }
  }

  for (let ii = 0; ii < MUSIC_KEYS.length; ++ii) {
    let key = MUSIC_KEYS[ii];
    let record = music_last_values[key];
    let lastv = record.value;
    let v = game_state[key];
    if (lastv !== v) {
      // some change happened
      record.value = v;
      let newscale = 2 + floor(v * 7/100);
      if (key === 'quality') {
        if (floor(lastv/100) !== floor(v/100)) {
          // increased tier, play highest note
          newscale = 9;
        } else {
          v %= 100;
          newscale = 2 + floor(v * 7/100);
        }
      }
      record.play_to = newscale;
      if (record.play_countdown) {
        // currently playing, just let it continue at the same rhythm
        if (record.last_played === record.play_to) {
          // but, not going to play anything
          --record.last_played;
        }
      } else {
        record.last_played = max(0, min(record.last_played, newscale - 2));
        record.play_countdown = 1;
      }
    }

    if (record.play_countdown) {
      if (dt >= record.play_countdown) {
        if (record.last_played >= record.play_to) {
          // done
          record.play_countdown = 0;
        } else {
          ++record.last_played;
          playUISound(`scale${ii+1}-${record.last_played}`);
          record.play_countdown = 192 - (dt - record.play_countdown);
        }
      } else {
        record.play_countdown -= dt;
      }
    }
  }
}

function stateCraft(dt: number): void {
  let font = uiGetFont();
  let text_height = uiTextHeight();
  let black = palette[PAL_BLACK];
  gl.clearColor(black[0], black[1], black[2], 1);

  let { x, y } = MAIN_PANEL;

  let { next_up } = game_state.data;
  let { crafting, temperament } = game_state;
  let { durability, progress, quality } = game_state;

  let done = progress >= 100 || durability <= 0;
  let done_good = done && (durability >= 0 && progress >= 100);

  let target = next_up[crafting];
  const PADTOP = 5;
  const z = Z.UI;

  x += 19;
  y += PADTOP;

  let y0 = y;
  let w = NEXTUP_W;
  if (done) {
    sprite_dither.draw({
      x: x + 1,
      y: y + 1,
      z: Z.UI + 10,
      w: 52,
      h: 62,
    });
    if (done_good) {
      if (autoResetSkippedFrames('done')) {
        playUISound('success');
      }
      let xx = x + (w - FRAME_H*2)/2;
      let yy = y + 10;
      drawBox({
        x: xx,
        y: yy,
        z: Z.UI + 11,
        w: FRAME_H * 2,
        h: FRAME_H * 2,
      }, autoAtlas('game', 'item-border'), 2);
      autoAtlas('game', target.gem).draw({
        x: xx + FRAME_H - IMG_H,
        y: yy + FRAME_H - IMG_H,
        z: Z.UI + 12,
        w: IMG_H * 2,
        h: IMG_H * 2,
      });
      autoAtlas('game', `tier${floor(quality/100)+1}`).draw({
        x: xx,
        y: yy,
        z: Z.UI + 13,
        w: FRAME_H * 2,
        h: FRAME_H * 2,
      });
    } else {
      if (autoResetSkippedFrames('done')) {
        playUISound('fail');
      }
    }
  }
  y += 3;
  y = drawOreCard(x, y, w, target, true);
  y += 2;
  panel({
    x, y: y0,
    w: NEXTUP_W,
    h: y - y0,
    sprite: autoAtlas('game', 'panel_inset'),
    eat_clicks: false,
  });

  y += 4;
  let tempbonus = TEMPERAMENT_BONUS[temperament];
  label({
    x, y,
    w,
    h: text_height * 2 - 4,
    // eslint-disable-next-line prefer-template
    tooltip: `Ore temperament is ${TEMP[temperament + 1][1]}:` +
      (tempbonus ?
        `\n [c=${tempbonus < 0 ? 'red' : tempbonus > 0 ? 'green' : '0'}]${tempbonus > 0 ? '+' : ''}${tempbonus}%[/c]` +
        ' to Progress and Quality ' : '\n No bonus or penalty') +
      '\n\nBenign and Equable temperament have a 50% chance to change up or down.\n' +
      'Malign and Exalted will always change.\n' +
      'This is further affected by some skills.',
    text: '',
  });
  font.draw({
    color: palette_font[done ? PAL_WHITE + 3 : PAL_WHITE],
    x, y, w,
    align: ALIGN.HCENTER,
    text: 'Temperament',
  });
  y += text_height - 1;

  font.draw({
    color: palette_font[done ? PAL_WHITE + 3 : TEMP[temperament + 1][0]],
    x, y, w,
    align: ALIGN.HCENTER,
    text: TEMP[temperament + 1][1],
  });

  w = QUICKBAR_W;
  x = MAIN_PANEL.x + floor((MAIN_PANEL.w - w)/2);
  y = MAIN_PANEL.y + 109;
  if (done) {
    // done
    font.draw({
      color: palette_font[done_good ? PAL_GREEN : PAL_RED],
      x, y,
      w: floor(w/3),
      h: BUTTON_H,
      align: ALIGN.HVCENTER | ALIGN.HWRAP,
      text: done_good ? 'Crafting\ncomplete!' : 'Crafting\nfailed',
    });
    if (buttonText({
      x: x + floor(w/3),
      y,
      w: floor(w*2/3) + 8,
      text: 'Back to the workshop...',
      auto_focus: true,
      hotkeys: [KEYS.SPACE, KEYS.ENTER, KEYS.ESCAPE],
    })) {
      game_state.finishCrafting();
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      engine.setState(statePrep);
    }
  } else {
    // do skills
    let { skills } = game_state.data;
    for (let ii = 0; ii < 10; ++ii) {
      let skill_id = skills[ii] || null;
      drawSkill(x, y, skill_id, ii, 'button', CRAFT_TOOLTIP_PANEL);
      if (skill_id) {
        font_tiny.draw({
          x, y: y + BUTTON_H + 1,
          w: BUTTON_H,
          text: ii === 9 ? '0' : `${ii + 1}`,
          size: 8,
          align: ALIGN.HCENTER,
        });
      }
      x += BUTTON_H + SKILL_PAD;
    }
  }

  x = MAIN_PANEL.x + 88;
  y = MAIN_PANEL.y + PADTOP;
  w = MAIN_PANEL.x + MAIN_PANEL.w - 6 - x;
  const BAR_MAX_W = w - 4;
  const BAR_SECTION_H = 25;
  ([
    ['Durability', -1, durability, 'bar-red', 'If [c=red]Durability[/c] goes under 0, the ore is ruined.'],
    // eslint-disable-next-line @stylistic/max-len
    ['Progress', -1, progress, 'bar-green', 'Reach [c=green]Progress[/c] of 100 before [c=red]Durability[/c] goes negative to extract the gem.[/c]'],
    ['Quality', 0, quality, 'bar-cyan', 'Every 100 [c=cyan]Quality[/c] increases the gem Tier by 1, to a max of 5.'],
  ] as const).forEach(function (pair) {
    drawHBox({
      x, y, w,
      h: BAR_SECTION_H,
    }, autoAtlas('game', 'bar-bg'));
    label({
      x, y, w, h: BAR_SECTION_H-2,
      text: ' ',
      tooltip: pair[4],
    });

    let v = blend(pair[0], pair[2]);
    let vw = clamp(3 + round(v/100 * (BAR_MAX_W - 3)), 3, v === 100 ? BAR_MAX_W : BAR_MAX_W - 1);

    let text: string = pair[0];
    if (text === 'Quality') {
      let tier = min(4, floor(v / 100));
      text = `Quality (T${tier+1})`;
      const GOAL_X = floor(BAR_MAX_W * 0.9) + tier * 3;
      // draw goal
      if (tier < 4) {
        drawHBox({
          x: x + 2 + GOAL_X,
          y: y + 15,
          z: z + 1,
          h: 8,
          w: 3,
        }, autoAtlas('game', 'bar-gold'));
      }
      // draw current progress
      let bar_start = tier * 6;
      let bar_left = GOAL_X - bar_start;
      let v_left = v - tier * 100;
      vw = clamp(3 + round(v_left/100 * (bar_left - 3)), 3, v === 100 ? bar_left : bar_left - 1);
      let xx = x + 2;
      for (let ii = 0; ii < tier; ++ii) {
        drawHBox({
          x: xx,
          y: y + 15,
          z: z + 1,
          h: 8,
          w: 3,
        }, autoAtlas('game', pair[3]));
        xx += 3;
        drawHBox({
          x: xx,
          y: y + 15,
          z: z + 1,
          h: 8,
          w: 3,
        }, autoAtlas('game', 'bar-gold'));
        xx += 3;
      }
      drawHBox({
        x: x + 2 + bar_start,
        y: y + 15,
        z: z + 1,
        h: 8,
        w: vw,
      }, autoAtlas('game', pair[3]));
    } else {
      if (text === 'Durability' && v < 0) {
        // draw nothing
      } else {
        drawHBox({
          x: x + 2,
          y: y + 15,
          z: z + 1,
          h: 8,
          w: vw,
        }, autoAtlas('game', pair[3]));
      }
    }

    font.draw({
      x: x + 2 + pair[1],
      y: y - 1,
      z: z + 1,
      text: text,
    });

    font.draw({
      x: x + w - 10,
      y: y,
      z: z + 1,
      text: String(v),
      align: ALIGN.HCENTER,
    });


    y += BAR_SECTION_H + 5;
  });

  panel({
    ...MAIN_PANEL,
    eat_clicks: false,
    sprite: autoAtlas('game', 'panel_blue'),
  });

  tickMusicalEffects();
}
function stateCraftInit(index: number): void {
  game_state.startCraft(index);
  engine.setState(stateCraft);
}

function drawNextUp(): void {
  let text_height = uiTextHeight();
  let x = NEXTUP_X;
  let y = NEXTUP_Y;
  let w = NEXTUP_W;
  label({
    x, y, w,
    align: ALIGN.HCENTER,
    text: 'Next Ore',
    tooltip: 'Choose an available ore to start extracting a gem.' +
      '  The gem type is indicated by the color within the ore.\n\nResistances to certain tool types are also shown.'
  });
  y += text_height + 3;

  let { next_up, inventory, days } = game_state.data;
  let disabled = inventory.length === INV_COLS * INV_ROWS && !inventory.includes(null);
  let hide = days === 1;
  for (let ii = 0; ii < next_up.length; ++ii) {
    let entry = next_up[ii];
    let y0 = y;
    y += 3;
    if (hide && ii !== 0) { // first one is 0 resistance to lasers
      continue;
    }
    font_tiny.draw({
      size: 8,
      x,
      y: y + 1,
      w: w - 4,
      align: ALIGN.HRIGHT,
      text: `${ii + 1}`,
    });
    y = drawOreCard(x, y, w, entry, false);
    y += 4;

    if (button({
      x, y: y0, z: Z.UI - 1,
      w, h: y - y0,
      base_name: 'button_blue',
      text: ' ',
      hotkey: KEYS['1'] + ii,
      disabled,
    })) {
      stateCraftInit(ii);
      queueTransition();
    }
    y += 2;
  }
}

const SKILLS_Y = 150;
const SKILLS_W = BUTTON_H * 5 + 4;
const SKILLS_X = floor((game_width - SKILLS_W)/2);
function drawSkillsInPrep(): void {
  let font = uiGetFont();
  let text_height = uiTextHeight();
  let x = SKILLS_X;
  let y = SKILLS_Y;
  let w = SKILLS_W;
  font.draw({
    x, y, w,
    text: 'Skills',
  });

  let skills_unlocked: TSMap<true> = {};
  let tool_tiers = game_state.toolTiers();
  let tooltype: keyof typeof tool_tiers;
  for (tooltype in tool_tiers) {
    let count = tool_tiers[tooltype];
    for (let ii = 1; ii <= count; ++ii) {
      let key = `${tooltype[0].toLowerCase()}${ii}`;
      if (SKILLS[key]) {
        skills_unlocked[key] = true;
      }
    }
  }
  let { skills } = game_state.data;
  let max_skills = min(10, Object.keys(skills_unlocked).length);
  font.draw({
    color: skills.length === 10 ? palette_font[PAL_RED] :
      skills.length === max_skills ? palette_font[PAL_WHITE] : palette_font[PAL_YELLOW],
    x, y, w,
    align: ALIGN.HRIGHT,
    text: `${skills.length} / ${max_skills}`,
  });

  y += text_height + 2;

  let skill_ids = [
    'l1', 'l2', 'l3', 'l4', 'l5',
    'd1', 'd2', 'd3', 'd4', 'd5',
    'a1', 'a2', 'a3', 'a4', 'a5'
  ];
  for (let ii = 0; ii < skill_ids.length; ++ii) {
    let skill_id = skill_ids[ii];
    if (skill_id === 'd1' || skill_id === 'a1') {
      x = SKILLS_X;
      y += BUTTON_H + 3;
    }
    drawSkill(x, y, skill_id, -1, skills_unlocked[skill_id] ? 'selectable' : 'disabled', {
      x: CRAFT_TOOLTIP_PANEL.x,
      w: CRAFT_TOOLTIP_PANEL.w,
      y: SKILLS_Y - CRAFT_TOOLTIP_PANEL.h + 2,
      h: CRAFT_TOOLTIP_PANEL.h,
    });
    x += BUTTON_H + 1;
  }
}

function drawVictory(): void {
  if (!game_state.data.won || game_state.data.endless) {
    return;
  }

  let z = Z.MODAL + 1;

  const PAD = 20;

  let x = PAD;
  let y = PAD;
  let w = game_width - PAD * 2;
  let font = uiGetFont();
  let text_height = uiTextHeight();

  y += 20;

  font.draw({
    style: font_styles_tooltip.white,
    x,y,z,w,
    size: text_height * 2,
    align: ALIGN.HCENTER,
    text: 'You Win!',
  });

  y += text_height * 2 + 20;

  y += markdownAuto({
    font_style: font_style_tooltip,
    x,y,z,w,
    text_height,
    align: ALIGN.HCENTER|ALIGN.HWRAP,
    text: 'You successfully collected a perfect [c=red]Ruby[/c], [c=blue]Sapphire[/c], and [c=green]Emerald[/c],' +
      ' achieving your life-long goal.  Congrats!\n\n' +
      'Thanks for playing!',
  }).h;

  y += 20;

  let button_w = BUTTON_H * 10;
  if (buttonText({
    x: (game_width - button_w) / 2,
    y,
    z,
    w: button_w,
    text: 'View High Scores',
  })) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    engine.setState(stateScores);
  }

  y += BUTTON_H + 4;
  if (buttonText({
    x: (game_width - button_w) / 2,
    y,
    z,
    w: button_w,
    text: 'Keep Playing',
  })) {
    game_state.data.endless = true;
  }

  panel({
    x,
    y: PAD,
    z,
    w,
    h: game_height - PAD * 2,
    sprite: autoAtlas('game', 'panel_blue'),
  });

  menuUp();
}

function statePrep(dt: number): void {
  let black = palette[PAL_BLACK];
  gl.clearColor(black[0], black[1], black[2], 1);
  inv_highlight = null;
  drawVictory();
  drawCollector();
  drawPersonalCollection();
  drawTools(); // before inventory
  drawInventory();
  drawNextUp();
  drawSkillsInPrep();

  if (button({
    x: 1,
    y: 1,
    w: BUTTON_H,
    img: autoAtlas('game', 'x'),
    tooltip: 'Save and Exit to title screen',
  })) {
    game_state.saveGame();
    queueTransition();
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    engine.setState(stateTitle);
  }
}

let title_anim: AnimationSequencer | null = null;
let title_alpha = {
  title: 0,
  sub: 0,
  button: 0,
};
function stateTitleInit(): void {
  title_anim = animationSequencerCreate();
  let t = 0;

  t = title_anim.add(0, 300, (progress) => {
    title_alpha.title = progress;
  });
  t = title_anim.add(t + 300, 300, (progress) => {
    title_alpha.sub = progress;
  });
  title_anim.add(t + 500, 300, (progress) => {
    title_alpha.button = progress;
  });
}
const style_title = fontStyle(null, {
  color: palette_font[PAL_WHITE],
  outline_color: palette_font[PAL_BLACK - 1],
  outline_width: 3,
});
function stateTitle(dt: number): void {
  let black = palette[PAL_BLACK];
  gl.clearColor(black[0], black[1], black[2], 1);
  let font = uiGetFont();
  let text_height = uiTextHeight();

  let W = game_width;
  let H = game_height;

  if (title_anim && (mouseDownAnywhere() || engine.DEBUG)) {
    title_anim.update(Infinity);
    title_anim = null;
  }
  if (title_anim) {
    if (!title_anim.update(dt)) {
      title_anim = null;
    } else {
      eatAllInput();
    }
  }

  let y = 30;

  font.draw({
    style: style_title,
    alpha: title_alpha.title,
    x: 0, y, w: W, align: ALIGN.HCENTER,
    size: text_height * 4,
    text: 'Gemwright',
  });

  font.draw({
    color: palette_font[PAL_WHITE],
    alpha: title_alpha.sub,
    x: 0,
    y: H - text_height * 2 - 3,
    w: W, align: ALIGN.HCENTER,
    text: 'By Jimb Esser for Ludum Dare 58',
  });

  const PROMPT_PAD = 8;
  if (title_alpha.button) {
    let button_w = BUTTON_H * 8;
    let button_x0 = floor((W - button_w * 2 - PROMPT_PAD) / 2);
    let button_h = BUTTON_H;
    let color = [1,1,1, title_alpha.button] as const;
    let y2 = H - BUTTON_H - 64;
    let button_param = {
      color,
      w: button_w,
      h: button_h,
    };

    if (button({
      ...button_param,
      x: button_x0,
      y: y2,
      text: game_state ? 'New Game' : 'Start Game',
    })) {
      queueTransition();
      startNewGame();
    }

    if (buttonText({
      ...button_param,
      x: button_x0 + button_w + PROMPT_PAD,
      y: y2,
      text: 'High Scores',
    })) {
      queueTransition();
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      engine.setState(stateScores);
    }

    if (game_state) {
      if (button({
        ...button_param,
        x: floor(button_x0 + (button_w + PROMPT_PAD)/2),
        y: y2 + BUTTON_H + 4,
        text: 'Resume Game',
      })) {
        queueTransition();
        engine.setState(statePrep);
      }
    }
  }
}

const SCORE_COLUMNS = [
  // widths are just proportional, scaled relative to `width` passed in
  { name: '', width: 3, align: ALIGN.HFIT | ALIGN.HRIGHT | ALIGN.VCENTER },
  { name: 'Name', width: 12, align: ALIGN.HFIT | ALIGN.VCENTER },
  { name: 'Won', width: 4 },
  { name: 'Wealth', width: 8 },
  { name: 'Days', width: 4 },
];
const style_score = fontStyleColored(null, palette_font[2]);
const style_me = fontStyleColored(null, palette_font[1]);
const style_header = fontStyleColored(null, palette_font[2]);
function myScoreToRow(row: unknown[], score: Score): void {
  row.push(score.won ? 'Y' : 'N', `$${score.money}00`, score.days);
}

function stateScores(dt: number): void {
  let black = palette[PAL_BLACK];
  gl.clearColor(black[0], black[1], black[2], 1);

  let x = 4;
  let y = 3;
  const CHW = 10;
  const CHH = 16;
  const LINEH = CHH;
  let font = uiGetFont();

  if (buttonText({
    x: 1,
    y: 1,
    w: CHW * 4,
    text: 'Back',
    hotkey: KEYS.ESC,
  })) {
    queueTransition();
    engine.setState(stateTitle);
  }

  font.draw({
    style: style_title,
    x: 0,
    y,
    w: game_width,
    text: 'HIGH SCORES',
    size: CHH * 2,
    align: ALIGN.HCENTER,
  });
  y += CHH * 2 + 3;

  let w = game_width - 8;
  y += LINEH;
  let text_height = uiTextHeight();
  scoresDraw<Score>({
    score_system,
    allow_rename: true,
    x,
    width: w,
    y,
    height: game_height - y,
    z: Z.UI,
    size: text_height,
    line_height: text_height + 2,
    level_index: 0,
    columns: SCORE_COLUMNS,
    scoreToRow: myScoreToRow,
    style_score,
    style_me,
    style_header,
    color_line: palette[3],
    color_me_background: palette[0],
    rename_button_size: 6,
    rename_button_offset: -2/text_height,
  });

  // if (game_state) {
  //   let button_w = CHW * 22;
  //   if (buttonText({
  //     x: game_width - button_w - 1,
  //     w: button_w,
  //     y: game_height - BUTTON_H - 8,
  //     text: 'Play ENDLESS MODE...',
  //   })) {
  //     game_state.endless_enabled = true;
  //     queueTransition();
  //     engine.setState(stateDroneConfig);
  //   }
  // }
}


export function main(): void {
  if (platformParameterGet('reload_updates')) {
    // Enable auto-reload, etc
    netInit({ engine });
  }

  // const font_info_04b03x2 = require('./img/font/04b03_8x2.json');
  // const font_info_04b03x1 = require('./img/font/04b03_8x1.json');
  // const font_info_palanquin32 = require('./img/font/palanquin32.json');
  const font_info = require('./img/font/helvetipixel.json');
  let pixely = 'strict';
  let font_def = { info: font_info, texture: 'font/helvetipixel' };
  let ui_sprites;
  let pixel_perfect = 0;
  if (pixely === 'strict') {
    ui_sprites = spriteSetGet('pixely');
    pixel_perfect = 1;
  } else if (pixely && pixely !== 'off') {
    ui_sprites = spriteSetGet('pixely');
  }

  let sounds: UISounds = {};
  for (let ii = 0; ii < 11; ++ii) {
    for (let jj = 1; jj <= 2; ++jj) {
      let key = `scale${jj}-${ii}`;
      sounds[key] = key;
    }
  }
  sounds.fail = 'fail';
  sounds.success = 'success';
  sounds.upgrade = 'upgrade';
  sounds.sell = 'sell';
  sounds.buff1 = 'buff1';
  sounds.buff2 = 'buff2';
  sounds.buff3 = 'buff3';

  if (!engine.startup({
    game_width,
    game_height,
    pixely,
    font: font_def,
    viewport_postprocess: false,
    antialias: false,
    ui_sprites: {
      ...ui_sprites,
      color_set_shades: [1, 1, 1],
      button_blue: { atlas: 'game' },
      button_blue_rollover: { atlas: 'game' },
      button_blue_down: { atlas: 'game' },
      button_selected: { atlas: 'game' },
      button_selected_rollover: { atlas: 'game' },
      button_selected_down: { atlas: 'game' },
      button_unselected: { atlas: 'game' },
      button_unselected_rollover: { atlas: 'game' },
      button_unselected_down: { atlas: 'game' },
    },
    ui_sounds: sounds,
    pixel_perfect,
    show_fps: false,
  })) {
    return;
  }
  let black = palette[PAL_BLACK];
  if (!engine.DEBUG) {
    v3copy(engine.border_color, black);
    v3copy(engine.border_clear_color, black);
  }

  font_tiny = fontCreate(require('./img/font/04b03_8x1.json'), 'font/04b03_8x1');

  // Perfect sizes for pixely modes
  scaleSizes(BUTTON_H / 32);
  setFontHeight(14);
  uiSetPanelColor([1,1,1,1]);
  setPanelPixelScale(1);

  const ENCODE_A = 10000;
  const ENCODE_B = 1000000;
  score_system = scoreAlloc({
    score_to_value: (score: Score): number => {
      return (score.won ? 1 : 0) * (ENCODE_A * ENCODE_B) +
        min(score.money, ENCODE_B - 1) * ENCODE_A +
        max(ENCODE_A - 1 - score.days, 0);
    },
    value_to_score: (value: number): Score => {
      let encode_days = value % ENCODE_A;
      value -= encode_days;
      value = floor(value / ENCODE_A);
      let money = value % ENCODE_B;
      value -= money;
      value = floor(value / ENCODE_B);
      let won = Boolean(value);
      let days = ENCODE_A - 1 - encode_days;
      return {
        won,
        days,
        money,
      };
    },
    level_defs: 1,
    score_key: 'LD58b',
    ls_key: 'ld58b',
    asc: false,
    rel: 8,
    num_names: 3,
    histogram: false,
  });

  init();

  for (let key in font_styles_tooltip) {
    markdownSetColorStyle(key, font_styles_tooltip[key]!);
  }

  stateTitleInit();
  engine.setState(stateTitle);
  if (engine.DEBUG) {
    // stateCraftInit(2);
    // engine.setState(stateScores);
    engine.setState(statePrep);
  }
}
