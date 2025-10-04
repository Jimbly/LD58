/* eslint n/global-require:off */
// eslint-disable-next-line import/order
const local_storage = require('glov/client/local_storage');
local_storage.setStoragePrefix('glovjs-playground'); // Before requiring anything else that might load from this

import { autoAtlas } from 'glov/client/autoatlas';
import { platformParameterGet } from 'glov/client/client_config';
import * as engine from 'glov/client/engine';
import { ALIGN } from 'glov/client/font';
import { netInit } from 'glov/client/net';
import { spriteSetGet } from 'glov/client/sprite_sets';
import {
  button,
  drawBox,
  scaleSizes,
  setFontHeight,
  uiGetFont,
  uiTextHeight,
} from 'glov/client/ui';
import { randCreate } from 'glov/common/rand_alea';
import { palette, palette_font } from './palette';

const { floor } = Math;

const PAL_GREEN = 12;
const PAL_YELLOW = 11;
// const PAL_RED = 26;
const PAL_BLACK = 25;


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

// Virtual viewport for our game logic
const game_width = 320;
const game_height = 240;

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
};

type OreEntry = {
  gem: GemType;
  defense: Record<ToolType, number>;
};

type GameData = {
  inventory: InventoryItem[];
  money: number;
  tools: ToolEntry[];
  requests: Request[];
  personal_collected: boolean[];
  next_up: OreEntry[];
};

let rand = randCreate(1);

function defenseForType(gem: GemType): Record<ToolType, number> {
  if (gem === 'emerald') {
    return {
      laser: 1 + rand.range(2),
      drill: 2 + rand.range(2),
      acid: 0 + rand.range(2),
    };
  } else if (gem === 'ruby') {
    return {
      laser: 0 + rand.range(2),
      drill: 1 + rand.range(2),
      acid: 2 + rand.range(2),
    };
  } else {
    return {
      laser: 2 + rand.range(2),
      drill: 0 + rand.range(2),
      acid: 1 + rand.range(2),
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
    rand.reseed(1234);
    for (let ii = 0; ii < NUM_COLLECTOR; ++ii) {
      let tier = ii < 3 ? 1 : 2;
      let gem = ii < 3 ? GEM_TYPES[ii] : GEM_TYPES[rand.range(GEM_TYPES.length)];
      requests.push({
        gem,
        tier,
        value: 100 * tier,
      });
    }
    for (let ii = 0; ii < NUM_NEXT; ++ii) {
      let gem = GEM_TYPES[rand.range(GEM_TYPES.length)];
      next_up.push({
        gem,
        defense: defenseForType(gem),
      });
    }

    if (engine.DEBUG) {
      money = 9999;
      for (let ii = 0; ii < 4; ++ii) {
        inventory.push({
          gem: GEM_TYPES[rand.range(GEM_TYPES.length)],
          tier: 1 + rand.range(5),
        });
      }
    }
    this.data = {
      inventory,
      money,
      tools,
      requests,
      personal_collected: [],
      next_up,
    };
  }
}

let game_state: GameState;

function init(): void {
  game_state = new GameState();
}

function satisfiesRequest(req: Request): boolean {
  let { inventory } = game_state.data;
  for (let ii = 0; ii < inventory.length; ++ii) {
    let entry = inventory[ii];
    if (entry.gem === req.gem && entry.tier >= req.tier) {
      return true;
    }
  }
  return false;
}

function drawCollector(): void {
  let font = uiGetFont();
  let text_height = uiTextHeight();
  let x = COLLECTOR_X;
  let y = COLLECTOR_Y;
  let w = COLLECTOR_W;
  font.draw({
    x, y, w,
    align: ALIGN.HCENTER,
    text: 'Collector',
  });
  y += text_height - 4;
  font.draw({
    x, y, w,
    align: ALIGN.HCENTER,
    text: 'Requests',
  });
  y += text_height + 4;

  let { requests } = game_state.data;
  for (let ii = 0; ii < requests.length; ++ii) {
    let entry = requests[ii];
    x = COLLECTOR_X;
    let satisfies_request = satisfiesRequest(entry);
    if (satisfies_request) {
      if (button({
        x, y,
        img: autoAtlas('game', 'check'),
      })) {
        // TODO
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
    drawBox(framepos, autoAtlas('game', satisfies_request ? 'item-border' : 'item-empty'), 1);
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
      color: palette_font[satisfies_request ? PAL_YELLOW : PAL_GREEN],
      x, y, h: BUTTON_H,
      align: ALIGN.VCENTER,
      text: `$${entry.value}`,
    });

    y += BUTTON_H + 1;
  }

}

function drawPersonalCollection(): void {
  // TODO
}

function drawInventory(): void {
  // TODO
}

function drawTools(): void {
  // TODO
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
  y += text_height + 4;

  let { next_up } = game_state.data;
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
    })) {
      // TODO
    }
    y += 2;
  }
}

function statePrep(dt: number): void {
  let black = palette[PAL_BLACK];
  gl.clearColor(black[0], black[1], black[2], 1);
  drawCollector();
  drawPersonalCollection();
  drawInventory();
  drawTools();
  drawNextUp();
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

  // Perfect sizes for pixely modes
  scaleSizes(BUTTON_H / 32);
  setFontHeight(14);

  init();

  engine.setState(statePrep);
}
