# Centro de Dados e Pesquisa — sprites V4

`mapa_centro_dados_pesquisa_v4.png` é o mapa/fundo aprovado e permanece intacto. Os elementos de cena são sprites em atlas PixiJS, e os elementos móveis têm quadros animados; não usamos takes estáticos.

- `centro_dados_pesquisa_props_v4.png` + `.json`: atlas de bancada, caixa, console, eclusa, janela, parede de servidores, plataforma de risco, rack e terminal.
- `centro_dados_pesquisa_engine_v4.png` + `.json`: 8 quadros animados do motor e animações `engine_startup`, `engine_burn` e `engine_shutdown`.
- `centro_dados_pesquisa_scientist_v4.png` + `.json`: 4 quadros de caminhada e 4 de susto, com `scientist_walk` e `scientist_startled`.
- `centro_dados_pesquisa_test_flash_v4.png` + `.json`: 8 quadros de flash de teste contido e dissipação.
- `animation_sequences_v4.json`: FPS, duração, comandos `E`/`R` e cadência de referência de 8 s (7,2 s idle + 0,8 s de chama).

Carregue cada JSON junto ao PNG indicado em `meta.image`; os nomes das animações mapeiam para os frames. O mapa continua sendo a camada estática de cenário.
