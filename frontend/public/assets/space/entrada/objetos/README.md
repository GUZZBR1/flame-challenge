# Sprites animados — Entrada V8

Cada PNG é uma spritesheet RGBA horizontal com 6 frames sequenciais. Use `sprites_entrada_v8.json` para os nomes, tamanho dos frames, loop e FPS sugeridos. Cada frame mede 256×170 px; recorte da esquerda para a direita sem interpolação.

| Arquivo | Animação |
| --- | --- |
| `visitante_a_walk.png` | Ciclo de caminhada do visitante A |
| `visitante_b_walk.png` | Ciclo de caminhada do visitante B |
| `quiosque_holograma.png` | Variação do holograma do quiosque |
| `luminaria_amber.png` | Pulso da luminária âmbar |
| `nave_janela.png` | Pulso dos motores da nave |
| `terminal_ui.png` | Ciclo de telas do terminal |

Os spritesheets substituem o antigo atlas estático. A cena V8 permanece em `../entrada_hub_v8.png` como referência de composição.
