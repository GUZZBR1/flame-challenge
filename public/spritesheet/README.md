# Spritesheet e Conjunto de Animações do Hangar IGNIS (PixiJS)

Esta pasta reúne a folha de sprites (*spritesheet*), o conjunto de tiles modulares e a especificação de quadros de animação criados para dar vida ao Hangar 2.5D do Estaleiro IGNIS no motor PixiJS v8.

---

## 1. Arquivos Contidos

```
design/assets/estaleiros/spritesheet/
├── README.md                          # Este documento explicativo
├── ignis_hangar_spritesheet.jpg       # Folha de sprites consolidada em 2.5D pixel art
└── spritesheet_spec.json              # Mapeamento técnico de frames, taxas de FPS e metadados
```

---

## 2. Componentes e Quadros de Animação (*Time-Set*)

1. **Landing Pad Beacon Lights (4 Frames):**
   * Sequência cíclica de pulsação luminosa em ciano (`#49B8D6`).
   * Utilizada nos anéis concêntricos de pouso e balizadores em solo.
2. **Gateway Forcefield Energy Field (4 Frames):**
   * Efeito de shimmer em malha hexagonal de contenção atmosférica no portal de acesso ao espaço sideral.
3. **Sci-Fi Runway Pillar Navigation Beacons (3 Frames):**
   * Postes de balizamento vertical com luzes estroboscópicas alternadas (vermelho de segurança e ciano de aproximação).
4. **Isolated Exploration Ship (Single Tile 2.5D):**
   * Modelo autônomo da nave científica IGNIS desacoplada do cenário para inserção e movimentação dinâmica.
5. **Ground Crew Technician (4-Frame Idle & Inspection Sequence):**
   * Sprite animado de operadores e pesquisadores com o macacão oficial azul IGNIS, com variações de com/sem capacete para solo e hub.
6. **Modular Tileset (Piso e Bordas):**
   * `Floor_Tile_A_Slate`: Placa de convés metálico sem emenda.
   * `Floor_Tile_B_HazardStripe`: Faixas diagonais amarelas e pretas de demarcação de segurança.
   * `Border_Tile_Gantry`: Calha estrutural de cabeamento e anteparo de doca.

---

## 3. Integração com PixiJS v8

No projeto web ([flame-challenge/src/components/HangarScene.tsx](file:///home/gusta/NASA/flame-challenge/src/components/HangarScene.tsx)):
* Os assets estão servidos publicamente em `flame-challenge/public/assets/hangar/`.
* A cena executa um loop no `app.ticker` com ondas de pulsação luminosa matemática em tempo real, brilho volumétrico do portal de vácuo e balizadores de pista estroboscópicos.
* Permite controle de navegação completo: arrastar para mover (pan), roda do mouse para zoom suave (40% a 250%) e 3 hotspots interativos com balões analíticos.
