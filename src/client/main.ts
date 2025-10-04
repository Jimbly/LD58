/* eslint n/global-require:off */
// eslint-disable-next-line import/order
const local_storage = require('glov/client/local_storage');
local_storage.setStoragePrefix('glovjs-playground'); // Before requiring anything else that might load from this

import assert from 'assert';
import { autoAtlas } from 'glov/client/autoatlas';
import { platformParameterGet } from 'glov/client/client_config';
import * as engine from 'glov/client/engine';
import { ALIGN, Font, fontCreate } from 'glov/client/font';
import { KEYS } from 'glov/client/input';
import { netInit } from 'glov/client/net';
import { spriteSetGet } from 'glov/client/sprite_sets';
import { Sprite, spriteCreate } from 'glov/client/sprites';
import {
  button,
  buttonText,
  buttonWasFocused,
  drawBox,
  drawHBox,
  panel,
  scaleSizes,
  setFontHeight,
  setPanelPixelScale,
  uiGetFont,
  uiSetPanelColor,
  uiTextHeight,
} from 'glov/client/ui';
import { randCreate } from 'glov/common/rand_alea';
import { TSMap } from 'glov/common/types';
import { clamp } from 'glov/common/util';
import { palette, palette_font } from './palette';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { abs, max, min, ceil, round, floor } = Math;

const PAL_GREEN = 12;
const PAL_YELLOW = 11;
const PAL_RED = 26;
const PAL_BLACK = 25;
const PAL_WHITE = 19;


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
const COLLECTOR_Y = 12;
const NEXTUP_X = 254;
const NEXTUP_Y = COLLECTOR_Y;
const NEXTUP_W = 54;
const MAX_TOOL_TIER = 5;
const NEW_TOOL_COST = 100;

// Virtual viewport for our game logic
const game_width = 320;
const game_height = 240;

let font_tiny: Font;

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
};
const CDRARE = 14;
const SKILLS: TSMap<SkillDef> = {
  l1: {
    name: 'Basic',
    // Prog 10, dur 5, no CD
    progress: [10, 11],
    durability: 5,
  },
  d1: {
    name: 'Basic',
    // Prog 18, dur 10, no CD
    progress: [17, 19],
    durability: 10,
  },
  a1: {
    name: 'Basic',
    // Prog 24, dur 15, no CD, temp +
    progress: [23, 25],
    durability: 15,
    temperament: 1,
  },
  l2: {
    name: 'Polish',
    // Qual 34, dur 20, CD 1, temp -
    quality: [33,35],
    durability: 20,
    cooldown: 1,
    temperament: -1,
  },
  d2: {
    name: 'Polish',
    // Qual 20, dur 10, CD 1
    quality: [19,22],
    durability: 10,
    cooldown: 1,
  },
  a2: {
    name: 'Polish',
    // Qual 12, dur 5, CD 1
    quality: [11, 13],
    durability: 5,
    cooldown: 1,
  },
  d3: {
    name: 'Hasty',
    // Prog 60, dur 10, 50%, CD 3
    progress: [60, 60],
    durability: 10,
    success: 50,
    cooldown: 3,
  },
  d4: {
    name: 'Prepare',
    // 100% extra Prog for next 4 turns, CD 14
    special: 'progress',
    special_amount: 100,
    special_duration: 4,
    cooldown: CDRARE,
  },
  d5: {
    name: 'PreciseCarve',
    // 50% extra Qual for next 4 turns, CD 14
    special: 'quality',
    special_amount: 50,
    special_duration: 4,
    cooldown: CDRARE,
  },
  l3: {
    name: 'Shear',
    // Qual 25, dur 5, 60%, CD 3
    quality: [25,25],
    durability: 5,
    success: 60,
    cooldown: 3,
  },
  l4: {
    name: 'Venerate',
    // Temp ++, CD 5
    temperament: 2,
    cooldown: 5,
  },
  l5: {
    name: 'Focus',
    // 100% extra Qual for next 1 turn
    special: 'quality',
    special_amount: 100,
    special_duration: 1,
  },
  a3: {
    name: 'Repair',
    // dur +30, CD 5
    durability: -30,
    cooldown: 5,
  },
  a4: {
    name: 'Reinforce',
    // 50% less dur for next 4 steps, CD 14
    special: 'durability',
    special_amount: 50,
    special_duration: 4,
    cooldown: CDRARE,
  },
  a5: {
    name: 'Soften',
    // Ignore defenses for next 4 steps, CD 14
    special: 'pierce',
    special_amount: 100,
    special_duration: 4,
    cooldown: CDRARE,
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
  personal_collected: boolean[];
  next_up: OreEntry[];
  skills: (string|null)[];
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
    rand_level.reseed(1234);
    for (let ii = 0; ii < NUM_COLLECTOR; ++ii) {
      let tier = ii < 3 ? 1 : 2;
      let gem = ii < 3 ? GEM_TYPES[ii] : GEM_TYPES[rand_level.range(GEM_TYPES.length)];
      requests.push({
        gem,
        tier,
        value: 100 * tier,
        done: false,
      });
    }
    for (let ii = 0; ii < NUM_NEXT; ++ii) {
      let gem = GEM_TYPES[rand_level.range(GEM_TYPES.length)];
      next_up.push({
        gem,
        defense: defenseForType(gem),
      });
    }

    if (engine.DEBUG) {
      money = 9999;
      for (let ii = 0; ii < 6; ++ii) {
        inventory.push({
          gem: GEM_TYPES[rand_level.range(GEM_TYPES.length)],
          tier: 1 + rand_level.range(5),
        });
      }
    }
    this.data = {
      inventory,
      money,
      tools,
      requests,
      personal_collected: [false, false, false],
      next_up,
      skills: [],
    };
    this.applySkills();
  }

  applySkills(): void {
    let { tools, skills } = this.data;
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

    let seen: TSMap<true> = {};
    let tooltype: keyof typeof tool_tiers;
    let need: string[] = [];
    for (tooltype in tool_tiers) {
      let count = tool_tiers[tooltype];
      for (let ii = 1; ii <= count; ++ii) {
        let key = `${tooltype[0].toLowerCase()}${ii}`;
        if (SKILLS[key]) {
          if (skills.includes(key)) {
            seen[key] = true;
          } else {
            need.push(key);
          }
        }
      }
    }
    need.reverse();
    for (let ii = 0; ii < skills.length; ++ii) {
      if (skills[ii] && !seen[skills[ii]!]) {
        skills[ii] = null;
      }
      if (!skills[ii] && need.length) {
        skills[ii] = need.pop()!;
      }
    }
    while (need.length) {
      skills.push(need.pop()!);
    }
  }

  crafting = -1;
  progress = 0;
  quality = 0;
  durability = 0;
  // -1 - malign
  // 0 - equable
  // 1 - benign
  // 2 - exalted
  temperament = 0;
  cooldowns: number[] = [];
  startCraft(index: number): void {
    rand_craft.reseed(rand_level.range(10000000));
    this.crafting = index;
    this.progress = 0;
    this.quality = 0;
    this.durability = 100;
    this.temperament = 1;
    this.cooldowns = [];
    for (let ii = 0; ii < 10; ++ii) {
      this.cooldowns.push(0);
    }
  }
  finishCrafting(): void {
    let { progress, quality, crafting } = this;
    let { inventory, next_up } = this.data;

    let target = next_up[crafting];
    if (progress >= 100) {
      let tier = floor(quality / 100) + 1;
      inventory.push({
        gem: target.gem,
        tier,
      });
    }
    this.crafting = -1;
    // todo: cycle next_up
    // todo: cycle requests that don't match what we just crafted
  }
  activateSkill(skill_index: number): boolean {
    let { skills } = this.data;
    let { cooldowns, temperament } = this;
    let skill_id = skills[skill_index];
    assert(skill_id);
    let skill = SKILLS[skill_id]!;
    if (skill.cooldown) {
      cooldowns[skill_index] = skill.cooldown;
    }
    // todo: apply special
    this.durability = clamp(this.durability - (skill.durability || 0), 0, 100);

    if (skill.success) {
      if (rand_craft.range(100) >= skill.success) {
        return false;
      }
    }


    if (skill.quality) {
      // todo: apply special
      // todo: apply temperament
      let v = skill.quality[0] + rand_craft.range(skill.quality[1] - skill.quality[0] + 1);
      this.quality += v;
    }
    if (skill.progress) {
      // todo: apply special
      // todo: apply temperament
      // todo: apply defense
      let v = skill.progress[0] + rand_craft.range(skill.progress[1] - skill.progress[0] + 1);
      this.progress = clamp(this.progress + v, 0, 100);
    }

    let dtemp = rand_craft.range(4);
    if (temperament === 2) {
      temperament--;
    } else if (temperament === -1) {
      temperament++;
    } else if (dtemp === 0) {
      temperament--;
    } else if (dtemp === 3) {
      temperament++;
    }
    temperament = clamp(temperament, -1, 2);

    if (skill.temperament) {
      temperament += skill.temperament;
      temperament = clamp(temperament, -1, 2);
    }
    this.temperament = temperament;

    if (skill.special) {
      // TODO
      // special?: 'progress' | 'quality' | 'durability' | 'pierce';
      // special_amount?: number;
      // special_duration?: number;
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

  upgradeCost(tool: ToolType, cur_tier: number): {
    gem: GemType;
    gem_tier: number;
    money: number;
  } {
    return {
      money: [0, 200, 400, 800, 1600][cur_tier],
      gem: tool === 'drill' ? 'emerald' : tool === 'laser' ? 'sapphire' : 'ruby',
      gem_tier: [0, 1, 1, 2, 2][cur_tier],
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
  trashTool(tool_index: number): void {
    this.data.tools[tool_index] = null;
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
  game_state = new GameState();
  sprite_dither = spriteCreate({
    name: 'ditheroverlay',
  });
}

let inv_highlight: number | null = null;

function drawCollector(): void {
  let font = uiGetFont();
  let text_height = uiTextHeight();
  let x = COLLECTOR_X;
  let y = COLLECTOR_Y;
  let w = COLLECTOR_W;
  font.draw({
    x, y, w,
    align: ALIGN.HCENTER,
    text: 'Sell T1',
  });
  y += text_height + 3;

  let { requests, inventory } = game_state.data;
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
            '\n\nWARNING: You are selling a MORE VALUABLE gem than is specifically required' : '')
      })) {
        // playUISound('sell');
        if (ii >= 3) {
          entry.done = true;
        }
        game_state.data.money += entry.value;
        inventory[satisfies_request] = null;
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
    });
    framepos.z++;
    autoAtlas('game', `tier${entry.tier}`).draw(framepos);
    x += FRAME_H + 2;
    font.draw({
      color: palette_font[entry.done || satisfies_request ? PAL_YELLOW : PAL_GREEN],
      x, y, h: BUTTON_H,
      align: ALIGN.VCENTER,
      text: `$${entry.value}`,
    });

    y += BUTTON_H + 1;
    if (ii === 2) {
      y += 2;
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

}

function drawPersonalCollection(): void {
  // TODO
}


const INV_COLS = 6;
const INV_ROWS = 2;
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
  font.draw({
    x, y, w,
    text: 'Inventory',
  });
  font.draw({
    color: palette_font[PAL_GREEN],
    x, y, w,
    align: ALIGN.HRIGHT,
    text: `$${money}`,
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

const TOOLS_ROWS = 5;
const TOOLS_PAD1 = 4;
const TOOLS_PRICE_W = 36;
const TOOLS_W = FRAME_H + TOOLS_PAD1 + BUTTON_H + 2 + FRAME_H + 1 + TOOLS_PRICE_W + TOOLS_PAD1 + BUTTON_H;
const TOOLS_X = floor((game_width - TOOLS_W)/2);
const TOOLS_Y = 66;
function drawTools(): void {
  let font = uiGetFont();
  let text_height = uiTextHeight();
  let x = TOOLS_X;
  let y = TOOLS_Y;
  let w = TOOLS_W;
  let { money, tools } = game_state.data;
  font.draw({
    x, y, w,
    text: 'Tools',
  });
  let tool_count = 0;
  for (let ii = 0; ii < tools.length; ++ii) {
    let tool = tools[ii];
    if (tool) {
      tool_count += tool.tier;
    }
  }
  let disabled = tool_count === 10;
  font.draw({
    color: palette_font[disabled ? PAL_RED : PAL_WHITE],
    x, y, w,
    align: ALIGN.HRIGHT,
    text: `${tool_count} / 10`,
  });
  y += text_height + 2;

  let x0 = x;
  let did_buy = false;
  for (let ii = 0; ii < TOOLS_ROWS; ++ii) {
    x = x0;
    let tool = tools[ii];
    if (!tool) {
      if (!did_buy) {
        if (ii === 1 && !tools[2]) {
          font.draw({
            x, y, w,
            align: ALIGN.HCENTER,
            text: 'Buy new tool: $100',
          });
          y += text_height + 1;
        }
        did_buy = true;
        let can_afford = money >= NEW_TOOL_COST;
        const BUY_W = BUTTON_H + IMG_H;
        let buy_param = {
          x: x + floor((w - BUY_W * 3 - 2 * 2)/2),
          y,
          w: BUY_W,
          h: BUTTON_H,
          frame: 0, // aspect hacky fix
          disabled: !can_afford,
        };
        if (button({
          ...buy_param,
          img: autoAtlas('game', 'add-laser'),
          tooltip: 'Buy a new T1 Laser for $100',
          disabled_focusable: true,
        })) {
          // playUISound('upgrade');
          game_state.buyTool(ii, 'laser');
        }
        if (button({
          ...buy_param,
          x: buy_param.x + BUY_W + 2,
          img: autoAtlas('game', 'add-drill'),
          tooltip: 'Buy a new T1 Drill for $100',
          disabled_focusable: true,
        })) {
          // playUISound('upgrade');
          game_state.buyTool(ii, 'drill');
        }
        if (button({
          ...buy_param,
          x: buy_param.x + (BUY_W + 2) * 2,
          img: autoAtlas('game', 'add-acid'),
          tooltip: 'Buy a new T1 Acid for $100',
          disabled_focusable: true,
        })) {
          // playUISound('upgrade');
          game_state.buyTool(ii, 'acid');
        }
      }
      y += BUTTON_H + 1;
      continue;
    }
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
      if (button({
        x, y, w: BUTTON_H, h: BUTTON_H,
        disabled: can_afford === null,
        img: autoAtlas('game', 'upgrade'),
        tooltip: 'Upgrade tool, unlocking a new skill, paying the cost listed on the right',
        disabled_focusable: true,
      })) {
        // playUISound('upgrade');
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
    let is_last_tool = true;
    for (let jj = 0; jj < tools.length; ++jj) {
      if (jj !== ii && tools[jj]) {
        is_last_tool = false;
      }
    }
    if (button({
      x, y, w: BUTTON_H, h: BUTTON_H,
      disabled: is_last_tool,
      img: autoAtlas('game', 'x'),
      tooltip: 'Trash tool',
      disabled_focusable: true,
    })) {
      // playUISound('trash');
      game_state.trashTool(ii);
    }

    y += BUTTON_H + 1;
  }
}

function drawOreCard(x: number, y: number, w: number, entry: OreEntry): number {
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
    for (let jj = 0; jj < entry.defense[tool]; ++jj) {
      autoAtlas('game', 'defense').draw({
        x: xx,
        y, w: IMG_H, h: IMG_H,
      });
      xx += RES_STEP + 1;
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
const SKILL_PAD = 1;
const QUICKBAR_W = BUTTON_H * 10 + SKILL_PAD * 9;
const TEMP = [
  [PAL_RED, 'MALIGN'],
  [PAL_WHITE + 1, 'EQUABLE'],
  [PAL_GREEN, 'BENIGN'],
  [PAL_YELLOW, 'EXALTED'],
] as const;
function drawSkill(x: number, y: number, ii: number, as_button: boolean): void {
  let font = uiGetFont();
  let { skills } = game_state.data;
  let z = Z.UI;
  let skill_id = skills[ii] || null;
  if (!skill_id) {
    drawBox({
      x: x + 1,
      y: y + 1,
      w: FRAME_H, h: FRAME_H,
    }, autoAtlas('game', 'item-empty'), 1);
    return;
  }
  font.draw({
    color: palette_font[PAL_BLACK],
    x, y,
    z: z + 2,
    w: BUTTON_H, h: BUTTON_H,
    align: ALIGN.HVCENTER,
    text: skill_id.toUpperCase(),
  });
  if (as_button) {
    let { cooldowns } = game_state;
    let cooldown = cooldowns[ii] || 0;
    let disabled = cooldown > 0;
    if (button({
      x, y,
      w: BUTTON_H, h: BUTTON_H,
      img: autoAtlas('game', skill_id[0] === 'l' ? 'laser' : skill_id[0] === 'd' ? 'drill' : 'acid'),
      disabled,
      hotkey: ii === 9 ? KEYS['0'] : KEYS['1'] + ii,
    })) {
      game_state.activateSkill(ii);
    }
  } else {
    // TODO
    button({
      x, y,
      w: BUTTON_H, h: BUTTON_H,
      img: autoAtlas('game', skill_id[0] === 'l' ? 'laser' : skill_id[0] === 'd' ? 'drill' : 'acid'),
      draw_only: true,
    });
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
    if (progress >= 100) {
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
    }
  }
  y += 3;
  y = drawOreCard(x, y, w, target);
  y += 2;
  panel({
    x, y: y0,
    w: NEXTUP_W,
    h: y - y0,
    sprite: autoAtlas('game', 'panel_inset'),
    eat_clicks: false,
  });

  y += 4;
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
      x, y,
      w: floor(w/3),
      h: BUTTON_H,
      align: ALIGN.HVCENTER | ALIGN.HWRAP,
      text: progress >= 100 ? 'Crafting\ncomplete!' : 'Crafting\nfailed',
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
      drawSkill(x, y, ii, true);
      if (skill_id) {
        font_tiny.draw({
          x, y: y + BUTTON_H + 1,
          w: BUTTON_H,
          text: `${ii + 1}`,
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
    ['Durability', -1, durability, 'bar-red'],
    ['Progress', -1, progress, 'bar-green'],
    ['Quality', 0, quality, 'bar-cyan'],
  ] as const).forEach(function (pair) {
    drawHBox({
      x, y, w,
      h: BAR_SECTION_H,
    }, autoAtlas('game', 'bar-bg'));

    let v = pair[2];
    let vw = clamp(3 + round(v/100 * (BAR_MAX_W - 3)), 3, v === 100 ? BAR_MAX_W : BAR_MAX_W - 1);

    let text: string = pair[0];
    if (text === 'Quality') {
      let tier = floor(quality / 100);
      text = `Quality (T${tier+1})`;
      const GOAL_X = floor(BAR_MAX_W * 0.9);
      // draw goal
      drawHBox({
        x: x + 2 + GOAL_X,
        y: y + 15,
        z: z + 1,
        h: 8,
        w: 3,
      }, autoAtlas('game', 'bar-gold'));
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
      drawHBox({
        x: x + 2,
        y: y + 15,
        z: z + 1,
        h: 8,
        w: vw,
      }, autoAtlas('game', pair[3]));
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
  });
}

function stateCraftInit(index: number): void {
  game_state.startCraft(index);
  engine.setState(stateCraft);
}

function drawNextUp(): void {
  let font = uiGetFont();
  let text_height = uiTextHeight();
  let x = NEXTUP_X;
  let y = NEXTUP_Y;
  let w = NEXTUP_W;
  font.draw({
    x, y, w,
    align: ALIGN.HCENTER,
    text: 'Next Ore',
  });
  y += text_height + 3;

  let { next_up, inventory } = game_state.data;
  let disabled = inventory.length === INV_COLS * INV_ROWS && !inventory.includes(null);
  for (let ii = 0; ii < next_up.length; ++ii) {
    let entry = next_up[ii];
    let y0 = y;
    y += 3;
    y = drawOreCard(x, y, w, entry);
    y += 4;

    if (button({
      x, y: y0, z: Z.UI - 1,
      w, h: y - y0,
      base_name: 'button_blue',
      text: ' ',
      disabled,
    })) {
      stateCraftInit(ii);
    }
    y += 2;
  }
}

const SKILLS_Y = 178;
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
    // align: ALIGN.HCENTER,
    text: 'Skills',
  });
  y += text_height + 2;

  // let { skills } = game_state.data;
  for (let ii = 0; ii < 10; ++ii) {
    if (ii === 5) {
      x = SKILLS_X;
      y += BUTTON_H + 1;
    }
    drawSkill(x, y, ii, false);
    x += BUTTON_H + 1;
  }
}

function statePrep(dt: number): void {
  let black = palette[PAL_BLACK];
  gl.clearColor(black[0], black[1], black[2], 1);
  inv_highlight = null;
  drawCollector();
  drawPersonalCollection();
  drawTools(); // before inventory
  drawInventory();
  drawNextUp();
  drawSkillsInPrep();
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
    },
    pixel_perfect,
  })) {
    return;
  }
  // let font = engine.font;

  font_tiny = fontCreate(require('./img/font/04b03_8x1.json'), 'font/04b03_8x1');

  // Perfect sizes for pixely modes
  scaleSizes(BUTTON_H / 32);
  setFontHeight(14);
  uiSetPanelColor([1,1,1,1]);
  setPanelPixelScale(1);

  init();

  engine.setState(statePrep);
  if (engine.DEBUG) {
    // stateCraftInit(0);
  }
}
