/** Top-down map colors for blocks (roughly Minecraft's own map palette). */
export type RGB = [number, number, number];

const EXACT: Record<string, RGB> = {
  grass_block: [109, 153, 48],
  short_grass: [100, 146, 46],
  grass: [100, 146, 46],
  tall_grass: [96, 140, 44],
  fern: [88, 132, 42],
  large_fern: [88, 132, 42],
  dirt: [134, 96, 67],
  coarse_dirt: [119, 85, 59],
  rooted_dirt: [144, 103, 76],
  dirt_path: [148, 121, 65],
  grass_path: [148, 121, 65],
  farmland: [110, 75, 45],
  podzol: [91, 63, 24],
  mycelium: [111, 99, 105],
  mud: [60, 57, 61],
  clay: [160, 166, 179],
  sand: [219, 207, 163],
  red_sand: [190, 102, 33],
  gravel: [136, 126, 126],
  stone: [125, 125, 125],
  cobblestone: [116, 116, 116],
  mossy_cobblestone: [100, 118, 92],
  andesite: [136, 136, 136],
  diorite: [188, 188, 188],
  granite: [149, 103, 85],
  tuff: [108, 109, 102],
  calcite: [223, 224, 220],
  deepslate: [80, 80, 82],
  bedrock: [85, 85, 85],
  water: [52, 92, 210],
  bubble_column: [52, 92, 210],
  lava: [214, 98, 22],
  ice: [145, 183, 253],
  packed_ice: [141, 180, 250],
  blue_ice: [116, 167, 253],
  snow: [248, 254, 254],
  snow_block: [248, 254, 254],
  powder_snow: [248, 253, 253],
  oak_leaves: [59, 128, 32],
  birch_leaves: [96, 140, 60],
  spruce_leaves: [52, 92, 52],
  jungle_leaves: [48, 136, 24],
  acacia_leaves: [70, 120, 28],
  dark_oak_leaves: [44, 104, 22],
  mangrove_leaves: [60, 120, 30],
  cherry_leaves: [228, 172, 200],
  azalea_leaves: [90, 120, 40],
  flowering_azalea_leaves: [110, 120, 70],
  pale_oak_leaves: [160, 170, 155],
  cactus: [85, 127, 43],
  sugar_cane: [148, 192, 101],
  bamboo: [94, 145, 36],
  lily_pad: [32, 128, 48],
  kelp: [56, 112, 48],
  kelp_plant: [56, 112, 48],
  seagrass: [48, 110, 50],
  tall_seagrass: [48, 110, 50],
  pumpkin: [196, 115, 24],
  melon: [113, 146, 30],
  hay_block: [176, 148, 36],
  moss_block: [89, 109, 45],
  moss_carpet: [89, 109, 45],
  sandstone: [216, 203, 155],
  red_sandstone: [186, 99, 29],
  glass: [200, 220, 230],
  bricks: [150, 87, 70],
  netherrack: [111, 54, 52],
  nether_bricks: [44, 21, 26],
  soul_sand: [81, 62, 50],
  soul_soil: [75, 57, 46],
  basalt: [80, 81, 86],
  blackstone: [42, 36, 41],
  glowstone: [210, 170, 100],
  magma_block: [142, 63, 31],
  crimson_nylium: [130, 31, 31],
  warped_nylium: [43, 114, 101],
  nether_wart_block: [115, 3, 3],
  warped_wart_block: [22, 119, 121],
  shroomlight: [240, 146, 70],
  end_stone: [219, 222, 158],
  obsidian: [20, 18, 30],
  crying_obsidian: [32, 10, 60],
  purpur_block: [169, 125, 169],
  chorus_plant: [93, 57, 93],
  chorus_flower: [151, 120, 151],
  prismarine: [99, 156, 151],
  sea_lantern: [172, 199, 190],
  terracotta: [152, 94, 67],
  mangrove_roots: [74, 59, 38],
  muddy_mangrove_roots: [70, 58, 45],
  pale_moss_block: [106, 112, 104],
  dripstone_block: [134, 107, 92],
  amethyst_block: [133, 97, 191],
  copper_block: [192, 107, 79],
  iron_block: [220, 220, 220],
  gold_block: [246, 208, 61],
  diamond_block: [98, 237, 228],
  emerald_block: [42, 203, 87],
  coal_block: [16, 15, 15],
  redstone_block: [175, 24, 5],
  lapis_block: [30, 67, 140],
  quartz_block: [235, 229, 222],
  tnt: [180, 60, 40],
  bookshelf: [117, 94, 59],
  crafting_table: [119, 87, 54],
  furnace: [110, 110, 110],
  chest: [160, 115, 50],
  torch: [255, 210, 110],
  campfire: [150, 90, 40],
  rail: [125, 110, 95]
};

const DYE: Record<string, RGB> = {
  white: [233, 236, 236],
  orange: [240, 118, 19],
  magenta: [189, 68, 179],
  light_blue: [58, 175, 217],
  yellow: [248, 197, 39],
  lime: [112, 185, 25],
  pink: [237, 141, 172],
  gray: [62, 68, 71],
  light_gray: [142, 142, 134],
  cyan: [21, 137, 145],
  purple: [121, 42, 172],
  blue: [53, 57, 157],
  brown: [114, 71, 40],
  green: [84, 109, 27],
  red: [161, 39, 34],
  black: [20, 21, 25]
};

const WOOD: Record<string, RGB> = {
  oak: [162, 130, 78],
  spruce: [114, 84, 48],
  birch: [192, 175, 121],
  jungle: [160, 115, 80],
  acacia: [168, 90, 50],
  dark_oak: [66, 43, 20],
  mangrove: [117, 54, 48],
  cherry: [226, 178, 172],
  bamboo: [193, 173, 80],
  crimson: [101, 48, 70],
  warped: [43, 104, 99],
  pale_oak: [228, 217, 215]
};

const mix = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const cache = new Map<string, RGB | null>();

/** Color for a block id ("minecraft:oak_log"), or null for air/invisible blocks. */
export function blockColor(id: string): RGB | null {
  let c = cache.get(id);
  if (c !== undefined) return c;
  c = resolve(id.includes(':') ? id.slice(id.indexOf(':') + 1) : id);
  cache.set(id, c);
  return c;
}

function resolve(n: string): RGB | null {
  if (n === 'air' || n === 'cave_air' || n === 'void_air' || n === 'barrier' || n === 'light' || n === 'structure_void') return null;
  if (EXACT[n]) return EXACT[n];
  for (const [dye, rgb] of Object.entries(DYE).sort((a, b) => b[0].length - a[0].length)) {
    if (n.startsWith(dye + '_')) {
      if (n.endsWith('_terracotta') || n.endsWith('_glazed_terracotta')) return mix(rgb, 0.72);
      if (n.endsWith('_stained_glass') || n.endsWith('_stained_glass_pane')) return mix(rgb, 1.05);
      return rgb; // wool, concrete, carpet, beds, banners…
    }
  }
  for (const [wood, rgb] of Object.entries(WOOD).sort((a, b) => b[0].length - a[0].length)) {
    if (!n.startsWith(wood + '_') && !n.startsWith('stripped_' + wood + '_')) continue;
    if (n.endsWith('_leaves')) return EXACT.oak_leaves;
    if (/_(log|wood|stem|hyphae)$/.test(n) && !n.startsWith('stripped_')) return mix(rgb, 0.7);
    return rgb; // planks, slabs, stairs, fences, doors…
  }
  if (n.includes('water')) return EXACT.water;
  if (n.includes('lava')) return EXACT.lava;
  if (n.endsWith('_leaves')) return EXACT.oak_leaves;
  if (n.includes('deepslate')) return EXACT.deepslate;
  if (n.includes('blackstone')) return EXACT.blackstone;
  if (n.includes('sandstone')) return n.startsWith('red_') ? EXACT.red_sandstone : EXACT.sandstone;
  if (n.includes('nether_brick')) return EXACT.nether_bricks;
  if (n.includes('end_stone')) return EXACT.end_stone;
  if (n.includes('purpur')) return EXACT.purpur_block;
  if (n.includes('prismarine')) return EXACT.prismarine;
  if (n.includes('quartz')) return EXACT.quartz_block;
  if (n.includes('copper')) return EXACT.copper_block;
  if (n.includes('brick')) return EXACT.bricks;
  if (n.includes('mossy')) return EXACT.mossy_cobblestone;
  if (n.includes('cobble')) return EXACT.cobblestone;
  if (n.includes('andesite')) return EXACT.andesite;
  if (n.includes('diorite')) return EXACT.diorite;
  if (n.includes('granite')) return EXACT.granite;
  if (n.includes('tuff')) return EXACT.tuff;
  if (n.includes('stone')) return EXACT.stone;
  if (n.includes('glass')) return EXACT.glass;
  if (n.includes('snow')) return EXACT.snow;
  if (n.includes('ice')) return EXACT.ice;
  if (n.includes('coral')) return [200, 90, 140];
  if (n.includes('mushroom')) return [150, 110, 90];
  if (/flower|tulip|poppy|dandelion|orchid|allium|bluet|daisy|cornflower|lily|rose|peony|lilac|sunflower|petals/.test(n)) {
    return EXACT.grass_block;
  }
  if (/wheat|carrots|potatoes|beetroots|crop|stem|vine|bush|sapling|roots|sprouts|dripleaf|azalea/.test(n)) return [96, 136, 40];
  if (n.includes('ore')) return EXACT.stone;
  if (n.includes('terracotta')) return EXACT.terracotta;
  if (n.includes('rail')) return EXACT.rail;
  return [128, 128, 128];
}

/** Pre-1.13 numeric block ids → modern names (common surface blocks only). */
const LEGACY: Record<number, string> = {
  1: 'stone', 2: 'grass_block', 3: 'dirt', 4: 'cobblestone', 5: 'oak_planks', 7: 'bedrock', 8: 'water', 9: 'water',
  10: 'lava', 11: 'lava', 12: 'sand', 13: 'gravel', 14: 'stone', 15: 'stone', 16: 'stone', 17: 'oak_log', 18: 'oak_leaves',
  20: 'glass', 24: 'sandstone', 31: 'short_grass', 32: 'short_grass', 35: 'white_wool', 37: 'dandelion', 38: 'poppy',
  39: 'brown_mushroom', 40: 'red_mushroom', 43: 'stone', 44: 'stone', 45: 'bricks', 47: 'bookshelf', 48: 'mossy_cobblestone',
  49: 'obsidian', 50: 'torch', 53: 'oak_planks', 54: 'chest', 58: 'crafting_table', 59: 'wheat', 60: 'farmland',
  61: 'furnace', 66: 'rail', 67: 'cobblestone', 78: 'snow', 79: 'ice', 80: 'snow_block', 81: 'cactus', 82: 'clay',
  83: 'sugar_cane', 85: 'oak_planks', 86: 'pumpkin', 87: 'netherrack', 88: 'soul_sand', 89: 'glowstone', 98: 'stone_bricks',
  99: 'mushroom_block', 100: 'mushroom_block', 103: 'melon', 106: 'vine', 110: 'mycelium', 111: 'lily_pad', 112: 'nether_bricks',
  121: 'end_stone', 155: 'quartz_block', 159: 'white_terracotta', 161: 'oak_leaves', 162: 'acacia_log', 170: 'hay_block',
  172: 'terracotta', 174: 'packed_ice', 175: 'sunflower', 179: 'red_sandstone'
};

export function legacyColor(id: number): RGB | null {
  if (id === 0) return null;
  return blockColor(LEGACY[id] ?? 'stone');
}
