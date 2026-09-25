# Projeto Civilização 3D

Mundo 3D persistente em que agentes autônomos vivem, sobrevivem e formam uma civilização sem regras sociais pré-definidas. Documento de referência: `Documentacao_Projeto_Civilizacao_3D_v2.docx` (v2.0).

## Idioma e estilo
- Converse com o usuário em português do Brasil.
- Código, comentários e nomes de domínio em português (ex.: `atualizarAgente`, `necessidades`). Nomes técnicos genéricos podem ficar em inglês.
- O usuário usa Windows + PowerShell. Dê comandos em PowerShell.
- Prefira entregar arquivos completos em vez de trechos para colar.

## Estrutura
```
shared/   código usado pelo motor e pelo visualizador (sem dependências)
  mundo.ts      geração determinística por SEED: relevo, árvores, pedras, arbustos, colisão
  clima.ts      relógio do mundo, estações, sol/lua, clima (não usa Three.js)
  especies.ts   perfis das espécies (coelho, cervo, lobo, javali, pássaro, peixe): sentidos, instintos, clima, ciclo de vida
  protocolo.ts  mensagens WebSocket servidor <-> navegador
engine/   motor da simulação (Node + TypeScript via tsx, WebSocket na porta 8080)
  src/index.ts     relógio real, persistência, rede, log de eventos
  src/simulacao.ts passo do mundo (agentes + animais + ecologia), estado v3, migração, censo, imigração
  src/agente.ts    humanos: percepção, memória, decisão por utilidade, fuga de lobos, caça, carcaças
  src/corpo.ts     fisiologia humana: fome, sede, sono, energia, frio, dor, saúde, morte
  src/animal.ts    animais (sem LLM): corpo, emoções da espécie, memória associativa, fuga, caça, reprodução
  src/ecologia.ts  pasto e raízes em grade de 10 m, frutos (crescem e apodrecem), carcaças, marcas de cheiro dos lobos
  src/espaco.ts    utilidades de terreno e água compartilhadas
  src/contexto.ts  o que cada ser recebe a cada passo
  scripts/validar.ts  simulação sem interface: `npm run validar -- 60` (dias)
  data/          estado.json e eventos.log (ignorado no git; apagar = mundo novo)
viewer/   visualização 3D (Vite + Three.js), só desenha o que o motor envia
  src/main.ts    cena, céu, clima visual, jogador observador, conexão
  src/agentes.ts malhas e poses dos agentes
  src/animais.ts modelos provisórios dos animais e carcaças, animação de patas e poses
  src/painel.ts  painel do agente ou animal na mira (necessidades e emoções)
  src/arbustos.ts arbustos e frutos
```

## Rodar
- Motor: `cd engine; npm run dev`
- Visualizador: `cd viewer; npm run dev` (http://localhost:5173)
- Tecla T (modo dev) alterna a velocidade do tempo no servidor: ×1, ×4, ×15, ×60.

## Decisões já tomadas
- Tempo: 1 minuto real = 1 hora do mundo (1 dia = 24 min; 12 h de sol e 12 h de noite o ano todo). Ano de 365 dias, 4 estações, começa na primavera.
- Cada mundo começa no Dia 1 às 06:00, no momento em que foi criado (`criadoEm` no estado).
- O servidor é dono do tempo, do clima e dos agentes. O navegador nunca decide nada.
- Tudo determinístico por `SEED` (mundo e clima); decisões dos agentes usam RNG com semente.
- Acelerar o tempo roda vários passos de vida por tick (corpo, movimento e relógio aceleram juntos).
- Agentes só sabem o que perceberam (visão ~30 m de dia, ~8 m à noite) e esquecem em ~5 dias sem rever.
- Ações primitivas; comportamentos sociais devem emergir, nunca ser programados como comandos prontos.
- Estado atual: 2 agentes provisórios (Aru e Nia), personagens são cápsulas até a Fase 4 (Blender).
- Animais (Fase 6): coelhos (colônias, se escondem em arbustos, dormem na toca), cervos (manadas que migram atrás
  de pasto; machos disputam a manada na época de cria), lobos (matilha crepuscular, só a fêmea dominante cria,
  caçam em grupo, vencem pelo cansaço, marcam e defendem território, expulsam solitários), javalis (onívoros:
  fuçam raízes, comem frutos e carcaças, investem quando encurralados ou defendendo filhotes — uma investida e recuam),
  pássaros (voam, dormem empoleirados, alarme alerta todas as espécies), peixes (cardume na água funda, fogem de movimento).
  Todos sentem frio pela pelagem, se abrigam da chuva, dormem amontoados, engordam no outono e amamentam.
  Medo de humanos é aprendido por indivíduo: habituação lenta, sensibilização com um único ataque;
  filhotes herdam lugares e medos da mãe; o bando foge junto (contágio só de quem viu a ameaça).
- Limites do vale por espécie (`capacidade`) e chegada rara de migrantes pelas bordas quando uma espécie quase some.
- Humanos: medo instintivo de lobos e de javali bravo, caçam só se a experiência própria com aquela espécie diz que vale,
  comem carne de carcaças; carne estragada (>36 h) faz mal. Lobos só atacam humanos dormindo/feridos, com muita fome e em matilha.

## Princípios (da documentação)
- Regras mínimas, consequências reais. Nada social pré-definido (sem profissões, dinheiro, leis).
- Conhecimento local e imperfeito; crenças podem estar erradas.
- A IA (LLM, Fase 9) decide; o motor valida. O LLM não pode vazar conhecimento do mundo real.
- Morte e extinção são resultados válidos. O observador não interfere na simulação oficial.

## Fases
Concluídas: 1 (fundação), 2 (motor headless), 3 (mundo 3D), 5 (corpo e sobrevivência, primeira versão).
Em andamento: 6 (natureza, ecologia e animais) — falta validar um ano inteiro com as seis espécies.
Próximas sugeridas: 7 (percepção/memória/aprendizado), 8 (emoções e personalidade), 4 (modelos Blender, em paralelo).
Pendências da Fase 6: na validação de 1 ano a Nia morre de fome no inverno (dia ~316) com frutos no vale — investigar com
`npm run validar -- 317 --rastrear Nia --desde 311` (determinístico; ~25 min, precisa de memória livre); cervos caem de ~20
para ~6 ao longo do ano (migrantes agora chegam abaixo de 8); biomas.
Navegação de verdade (contornar rios) e nojo (evitar carne estragada) ficam para a Fase 7/8.

## Git
- Commitar direto no `main` ao final de cada desenvolvimento validado, com mensagem em português descrevendo o que mudou.
- Não fazer push: o usuário faz. Ao concluir uma fase, avisar que ela pode ser enviada ao GitHub.
- `engine/data/` não é versionado (é o mundo do usuário).

## Como validar mudanças no motor
Rodar `cd engine; npm run validar -- 60` (`--rastrear Nome --desde Dia` mostra um agente a cada meia hora) (dias do mundo; ~4 s por dia com as seis espécies) e verificar se os agentes sobrevivem, se têm um ritmo diário plausível e se as populações de animais não explodem nem somem, antes de entregar. O script cria um mundo novo em memória e não toca em `data/`.
