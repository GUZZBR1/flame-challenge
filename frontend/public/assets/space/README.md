# Assets espaciais do PixiJS

- `estaleiro/`: fundo e camada frontal do estaleiro.
- `naves/`: quatro sprites de naves recortados do spritesheet original, sem os números impressos.
- `cometas/`: efeitos de cometas por cor.
- `motores/`: efeitos de propulsão.
- `takes/`: imagens cinematográficas do estaleiro e das naves.

Os caminhos consumidos pelo PixiJS foram atualizados para estas categorias.

As sequências e os takes do exterior ficam definidos em `design/assets/estaleiros/shipyard_takes.json` e são copiados para `assets/space/shipyard_takes.json` na pasta pública do frontend.

Recortes de `naves/`, `cometas/` e `motores/` foram refeitos diretamente da prancha-fonte original do IGNIS; os rótulos da prancha ficaram fora dos recortes. Os PNGs de efeitos usam transparência para PixiJS.
