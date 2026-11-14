# Takes PixiJS do estaleiro

Os takes são renderizados em tempo real pelo componente `ShipyardSpaceScene.tsx`; não são imagens compostas com naves ou cometas à frente do estaleiro. A pilha PixiJS mantém as naves e os efeitos atrás da camada de primeiro plano da estação.

Modos disponíveis: visão macro, patrulha traseira, passagem pelo vão toroidal, fogo do motor, propulsor de perto, queima completa e cometas de fundo. Nos takes de propulsão, o motor alterna os frames de idle, cruzeiro, queima completa e boost.
