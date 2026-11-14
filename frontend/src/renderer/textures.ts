import { Application, Container, Graphics, Texture } from 'pixi.js'
import { TILE_W, TILE_H } from '../game/config'
import type { RoomType } from '../game/types'

export interface TexSet {
  floor: Texture
  voidTile: Texture
  crew: Record<'scientist' | 'engineer', Texture>
  dead: Texture
  flame: Texture
  coolFlame: Texture
  smoke: Texture
  props: Partial<Record<RoomType, Texture>>
  ring: Texture
}

const H = TILE_H / 2
const W = TILE_W / 2

function diamond(g: Graphics, color: number, alpha = 1) {
  g.poly([0, -H, W, 0, 0, H, -W, 0]).fill({ color, alpha })
}

/** draws an iso box with base diamond centered at (0, 0), height px upward */
function isoBox(
  g: Graphics,
  wHalf: number,
  hHalf: number,
  height: number,
  top: number,
  left: number,
  right: number,
) {
  // left face
  g.poly([-wHalf, 0, 0, hHalf, 0, hHalf - height, -wHalf, -height]).fill({ color: left })
  // right face
  g.poly([wHalf, 0, 0, hHalf, 0, hHalf - height, wHalf, -height]).fill({ color: right })
  // top
  g.poly([0, -hHalf - height, wHalf, -height, 0, hHalf - height, -wHalf, -height]).fill({ color: top })
}

function makeProp(kind: RoomType): Graphics {
  const g = new Graphics()
  switch (kind) {
    case 'dock': {
      // landing pad with yellow-black hazard ring
      diamond(g, 0x2e4a42)
      g.poly([0, -H + 4, W - 8, 0, 0, H - 4, -W + 8, 0]).fill({ color: 0x243a34 })
      g.poly([0, -H + 4, W - 8, 0, 0, H - 4, -W + 8, 0]).stroke({ width: 2, color: 0xd8a23a })
      isoBox(g, 6, 3, 16, 0x8ea3b8, 0x5a6c7d, 0x71869a)
      break
    }
    case 'deck': {
      diamond(g, 0x2a3448)
      g.poly([0, -H + 6, W - 12, 0, 0, H - 6, -W + 12, 0]).stroke({ width: 1, color: 0x39445e })
      break
    }
    case 'quarters': {
      // two bunks
      isoBox(g, 12, 6, 8, 0x6b87a8, 0x42576e, 0x54708e)
      isoBox(g, 6, 3, 5, 0xa8bfd4, 0x6e8299, 0x8aa2b8)
      break
    }
    case 'lab': {
      // console desk + screen pillar
      isoBox(g, 13, 6, 6, 0x39b8cf, 0x23707f, 0x2d93a6)
      isoBox(g, 4, 2, 18, 0x9adfef, 0x5a96a8, 0x79b8c9)
      break
    }
    case 'combustion': {
      // sealed combustion rack: dark cylinder-ish box + ember window
      isoBox(g, 14, 8, 22, 0xb8622e, 0x6e3418, 0x8f4a22)
      g.circle(0, -14, 4.5).fill({ color: 0xffb347 })
      g.circle(0, -14, 6.5).stroke({ width: 1.5, color: 0x3a1c0c })
      break
    }
    case 'fab': {
      // fabricator: gantry + base plate
      isoBox(g, 14, 7, 5, 0x7a5fa8, 0x4a3870, 0x5f4a8a)
      isoBox(g, 4, 2, 16, 0xb99fe0, 0x6e5596, 0x8f76b8)
      g.poly([0, -16 - 14, 10, -9 - 14, 0, -2 - 14, -10, -9 - 14]).fill({ color: 0x8f76b8 })
      break
    }
  }
  return g
}

export function makeTextures(app: Application): TexSet {
  const gen = (c: Container | Graphics) => app.renderer.generateTexture(c)

  // walkable floor diamond
  const fg = new Graphics()
  diamond(fg, 0x39445e)
  fg.poly([0, -H + 2, W - 4, 0, 0, H - 2, -W + 4, 0]).fill({ color: 0x2c3650 })
  const floor = gen(fg)

  // faint void grid tile
  const vg = new Graphics()
  vg.poly([0, -H, W, 0, 0, H, -W, 0]).stroke({ width: 1, color: 0x141c2e, alpha: 0.55 })
  const voidTile = gen(vg)

  const crew = {
    scientist: gen(makeCrew(0xe8f4f8, 0x67e8f9)),
    engineer: gen(makeCrew(0xffb347, 0xff6b35)),
  }

  const dead = gen(makeDead())

  // flame — layered hot teardrop, origin at base center
  const flameG = new Graphics()
  flameG.poly([0, -26, 9, -8, 6, 0, -6, 0, -9, -8]).fill({ color: 0xff6b35, alpha: 0.95 })
  flameG.poly([0, -19, 6, -6, 4, 0, -4, 0, -6, -6]).fill({ color: 0xffb347 })
  flameG.poly([0, -11, 3, -3, 2, 0, -2, 0, -3, -3]).fill({ color: 0xfff3c4 })
  const flame = gen(flameG)

  // cool flame — dim blue, per FLEX observations
  const coolG = new Graphics()
  coolG.poly([0, -20, 8, -6, 5, 0, -5, 0, -8, -6]).fill({ color: 0x5fb8ff, alpha: 0.5 })
  coolG.poly([0, -12, 4, -3, 3, 0, -3, 0, -4, -3]).fill({ color: 0xbfe6ff, alpha: 0.7 })
  const coolFlame = gen(coolG)

  const smokeG = new Graphics()
  smokeG.circle(0, 0, 7).fill({ color: 0x6b7280, alpha: 0.45 })
  const smoke = gen(smokeG)

  const ringG = new Graphics()
  ringG.poly([0, -H + 1, W - 2, 0, 0, H - 1, -W + 2, 0]).stroke({ width: 2, color: 0x67e8f9, alpha: 0.9 })
  const ring = gen(ringG)

  const props: TexSet['props'] = {}
  for (const t of ['dock', 'deck', 'quarters', 'lab', 'combustion', 'fab'] as RoomType[])
    props[t] = gen(wrapProp(makeProp(t)))

  return { floor, voidTile, crew, dead, flame, coolFlame, smoke, props, ring }
}

function wrapProp(g: Graphics): Container {
  // prop textures are drawn around (0,0) = base center; pad bounds so
  // generateTexture captures the whole drawing
  const c = new Container()
  c.addChild(g)
  return c
}

function makeCrew(suit: number, accent: number): Container {
  const g = new Graphics()
  // shadow
  g.ellipse(0, 0, 7, 3.5).fill({ color: 0x000000, alpha: 0.35 })
  // body suit
  g.roundRect(-4.5, -17, 9, 14, 4).fill({ color: suit })
  // backpack
  g.roundRect(-7, -16, 3, 9, 1.5).fill({ color: 0x8b94a7 })
  // helmet
  g.circle(0, -20, 5.5).fill({ color: suit })
  // visor
  g.ellipse(0, -19.5, 3.4, 2.6).fill({ color: accent })
  // belt accent
  g.rect(-4.5, -9, 9, 2).fill({ color: accent, alpha: 0.85 })
  return wrapProp(g)
}

function makeDead(): Container {
  const g = new Graphics()
  g.ellipse(0, 0, 8, 4).fill({ color: 0x000000, alpha: 0.3 })
  g.roundRect(-8, -4, 16, 5, 2.5).fill({ color: 0x5a6478 })
  g.circle(7, -2, 4).fill({ color: 0x5a6478 })
  return wrapProp(g)
}
