LD58 - Collector
============================

Ludum Dare 58 Entry by Jimbly - "Gemwright"

Extract high quality gems from ore in this turn-based crafting game.

* Play here: [dashingstrike.com/LudumDare/LD58/](http://www.dashingstrike.com/LudumDare/LD58/)
* Using [Javascript libGlov/GLOV.js framework](https://github.com/Jimbly/glovjs)

Acknowledgements:
* [HelvetiPixel font](https://www.pentacom.jp/pentacom/bitfontmaker2/gallery/?id=381) by pentacom
* [ENDESGA-32 Palette](https://lospec.com/palette-list/endesga-32)

Start with: `npm start` (after running `npm i` once)

# TODO
* Play all the way through
# Stretch
* Animate progress
* Sound effects - ascending scaled for each of prog/qual?
* Music
# Publish
* Social share image
* Screenshots / cover image

# Abilities draft (need 15 in 3 tools) - add more temperament changes to this
* L1 Basic: Prog 10, dur 5, no CD
* D1 Basic: Prog 18, dur 10, no CD
* A1 Polish: Qual 12, dur 5, CD 1
* L2 Polish: Qual 34, dur 20, CD 1, temp -
* D2 Polish: Qual 20, dur 10, CD 1
* A2 Basic: Prog 24, dur 15, no CD, temp +
* D3 Hasty: Prog 60, dur 10, 50%, CD 3
* D4 Prepare: 100% extra Prog for next 4 steps, CD 14
* D5 Precise Carve: 50% extra Qual for next 4 steps, CD 14
* L3 Shear: Qual 20, dur 5, 60%, CD 3
* L4 Venerate: Temp ++, CD 5
* L5 Focus: 100% extra Qual for next 1 step
* A3 Repair: dur +30, CD 5
* A4 Reinforce: 50% less dur for next 4 steps, CD 14
* A5 Soften: Ignore defenses for next 4 steps, CD 14

# Ideas

## Gemsmith
* Collectors request a type + tier of gem, pay cash
* Player chooses an incoming ore from a short list (type + starting durability and quality or resistances?)
* Does FFXIV crafting minigame to refine it into something useful, it goes to inventory
  * Then, either satisfy a collector for cash, or go onto the next one
* With cash, add additional tools or upgrade them (laser, drill, acid), unlocking more abilities for crafting (maybe tier-up also requires a appropriate quality gem)
* (stretch) upgrade ore suppliers
* Goal is to satisfy a/each collector with a tier 5 gem
* Systems: crafting game (3), upgrades (3), collectors (1), balance (2)
* Art: 3 ore, 3 gems, 3 tools

## World Seed + inky magic
* Move on grid, can see neighbors
* On grid cell, if danger, fight, else choose collect/fight
  * collect is always lower tier, but no risk
* Upon death, respawn at origin, equipped gear lost (or inventory?)
  * Or, just get pushed back originward and lose 1 random unequipped item or something
* Inventory system
  * Equip 3 def + 1-2 off spells
  * Combine 2 identical to increase tier
  * (stretch) Combine 2 different to get additional types
* Goal: reach T7 or something
* Systems: inventory (5), combat (2), movement/world (2)
* Art: 3-6 spell icons, 3-6 enemies, hero, 3-6 biome tiles

## D.W.A.R.F.S. II
* Land on a planet, configure scanner, roam around and mine gems
* Scanner can be reconfigured when it finishes recharging, but otherwise keeps scanning around you
  * It reveals any resources smaller than the match level
* History of recent finds and and known exotics
* Get a 100% match and collect a perfect sample of each exotic to finish the planet; goal of 3 planets?
* Systems: planet gen (3), movement/mining (2), scanner (3)
* Art: planet tiles (simple), rover, gems
* (stretch) Upgrade rover