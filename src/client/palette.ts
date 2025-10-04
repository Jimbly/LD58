import { vec4ColorFromIntColor } from 'glov/client/font';
import { vec4 } from 'glov/common/vmath';

export const palette_font = [
  0xbe4a2fff,
  0xd77643ff,
  0xead4aaff,
  0xe4a672ff,
  0xb86f50ff,
  0x733e39ff,
  0x3e2731ff,
  0xa22633ff,
  0xe43b44ff,
  0xf77622ff,
  0xfeae34ff,
  0xfee761ff,
  0x63c74dff,
  0x3e8948ff,
  0x265c42ff,
  0x193c3eff,
  0x124e89ff,
  0x0099dbff,
  0x2ce8f5ff,
  0xffffffff,
  0xc0cbdcff,
  0x8b9bb4ff,
  0x5a6988ff,
  0x3a4466ff,
  0x262b44ff,
  0x181425ff,
  0xff0044ff,
  0x68386cff,
  0xb55088ff,
  0xf6757aff,
  0xe8b796ff,
  0xc28569ff,
];

export const palette = palette_font.map((hex) => {
  return vec4ColorFromIntColor(vec4(), hex);
});
