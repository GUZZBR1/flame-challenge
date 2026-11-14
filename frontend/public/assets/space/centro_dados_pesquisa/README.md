# Assets do Centro de Dados e Pesquisa

Mapa atual: `mapa_centro_dados_pesquisa_v4.png` (aprovado, com projeção 2.5D, duto de escape e paleta escura IGNIS). Prancha de objetos: `centro_dados_pesquisa_assets_v1.png` (RGBA). Os recortes são fontes conceituais e precisam de revisão de bordas antes de uso em runtime.

| Grupo | Arquivos |
|---|---|
| Servidores | `rack_servidor.png`, `rack_servidor_compacto.png` |
| Computadores | `console_pesquisa.png`, `terminal.png` |
| Pesquisa | `bancada_pesquisa.png` |
| Flora | `planta_jardineira_a.png`, `planta_jardineira_b.png` |
| Motor | `motor_prototipo.png`, `motor_ciclo_frames_v1.png` |
| Mapa | `mapa_centro_dados_pesquisa_v4.png` |
| Personagens | `personagens_atlas_v1.png` — dois cientistas na baia, uma técnica de servidores e duas pessoas trabalhando sentadas; ciclos de caminhada em quatro poses |
| Animação | `animacoes/engine_test_sequence_v4.png` — storyboard 3×4, 12 quadros baseado no mapa oficial V4 |

`assets_manifest.json` registra dimensões e modos de cor dos arquivos. O motor em rajada usado na cena espacial do estaleiro é especificado separadamente em `design/assets/estaleiros/shipyard_takes.json`; a faixa `motor_ciclo_frames_v1.png` permanece um conceito visual e não é consumida pelo runtime.




A prancha em `animacoes/engine_test_sequence_v4.png` usa o mapa V4 como referência: motor desligado, ignição, chama no duto de vácuo, flash de teste contido, cientistas assustados e retorno seguro. São quadros de storyboard; a integração em runtime requer fatiar os quadros e animar as camadas sobre a imagem V4. Os takes anteriores foram removidos.
