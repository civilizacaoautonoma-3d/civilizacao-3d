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
  protocolo.ts  mensagens WebSocket servidor <-> navegador
engine/   motor da simulação (Node + TypeScript via tsx, WebSocket na porta 8080)
  src/index.ts   loop de passo fixo (10 ticks/s), persistência, rede, log de eventos
  src/agente.ts  percepção, memória, decisão por utilidade, execução de ações
  src/corpo.ts   fisiologia: fome, sede, sono, energia, frio, saúde, morte
  data/          estado.json e eventos.log (ignorado no git; apagar = mundo novo)
viewer/   visualização 3D (Vite + Three.js), só desenha o que o motor envia
  src/main.ts    cena, céu, clima visual, jogador observador, conexão
  src/agentes.ts malhas e poses dos agentes + painel de necessidades
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

## Princípios (da documentação)
- Regras mínimas, consequências reais. Nada social pré-definido (sem profissões, dinheiro, leis).
- Conhecimento local e imperfeito; crenças podem estar erradas.
- A IA (LLM, Fase 9) decide; o motor valida. O LLM não pode vazar conhecimento do mundo real.
- Morte e extinção são resultados válidos. O observador não interfere na simulação oficial.

## Fases
Concluídas: 1 (fundação), 2 (motor headless), 3 (mundo 3D), 5 (corpo e sobrevivência, primeira versão).
Próximas sugeridas: 6 (ecologia e animais), 7 (percepção/memória/aprendizado), 8 (emoções e personalidade), 4 (modelos Blender, em paralelo).

## Como validar mudanças no motor
Rodar uma simulação sem interface por vários dias do mundo (script com tsx importando `engine/src/agente.ts` e `shared/*`) e verificar se os agentes sobrevivem e têm um ritmo diário plausível antes de entregar.
