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
  mundo.ts      geração determinística por SEED: relevo, árvores, pedras, arbustos, 4 cavernas, colisão
  clima.ts      relógio do mundo, estações, sol/lua, clima (não usa Three.js)
  especies.ts   perfis das espécies (coelho, cervo, lobo, javali, pássaro, peixe): sentidos, instintos, clima, ciclo de vida
  protocolo.ts  mensagens WebSocket servidor <-> navegador
engine/   motor da simulação (Node + TypeScript via tsx, WebSocket na porta 8080)
  src/index.ts     relógio real, persistência, rede, log de eventos
  src/simulacao.ts passo do mundo (agentes + animais + ecologia), estado v3, migração, censo, imigração
  src/agente.ts    humanos: percepção com erro, avaliação por memória, decisão por utilidade, fuga, caça, navegação
  src/memoria.ts   memória episódica, expectativa por semelhança, crenças refletidas no sono (inclusive erradas)
  src/mapa.ts      mapa mental do terreno (grade de 5 m) e rota A* sobre o que o agente acredita saber
  src/emocoes.ts   personalidade (Big Five + coragem, dominância), 8 emoções básicas, humores e afeto central
  src/deliberacao.ts IA deliberativa: situação neutra, contrato JSON, fila, orçamento, validação, filtro de anacronismo
  src/provedores.ts  quem pensa: Claude (SDK oficial, saída estruturada com zod) ou deliberador de teste local
  data/mente.jsonl   cada deliberação: situação, resposta, o que foi aplicado/rejeitado, consequência
  src/objetos.ts   objetos do mundo (pedra, graveto, fibra, lasca, pilha, fogo) e as regras materiais escondidas
  src/cavernas.ts  cavernas: perceber, entrar pela boca, dormir, virar "casa" por repetição
  src/social.ts    relações (afeto, confiança, respeito, medo, mágoa, dívida), léxico, naming game, avisos e indicações
  src/tecnicas.ts  gestos primitivos, experimentação, técnicas descobertas, imitação (Fase 10)
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
  src/painel.ts  painel do agente ou animal na mira (necessidades, emoções, o que sabe e carrega)
  src/cavernas.ts domo de rocha das cavernas (posição vem de shared/mundo)
  src/objetos.ts pedras, gravetos, fibras, lascas, pilhas e fogo (chama, luz, fumaça); itens nas mãos
  src/arbustos.ts arbustos e frutos
```

## Rodar
- Motor: `cd engine; npm run dev`
- Visualizador: `cd viewer; npm run dev` (http://localhost:5173)
- Tecla T (modo dev) alterna a velocidade do tempo no servidor: ×1, ×4, ×15, ×60.
- Celular na mesma rede: `http://<IP do PC>:5173` (Vite com host: true; liberar portas 5173 e 8080 no firewall).
- Mente deliberativa (Fase 9): sem chave usa o deliberador de teste. Para o Claude de verdade, antes de `npm run dev`:
  `$env:ANTHROPIC_API_KEY = "..."` (ou `$env:MENTE_LLM = "claude"`). Opções: `MENTE_LLM=claude|teste|desligado`,
  `MENTE_MODELO_ROTINA` (padrão claude-haiku-4-5, plano do dia), `MENTE_MODELO_PROFUNDO` (padrão claude-opus-5,
  eventos e reflexão), `MENTE_POR_DIA` (chamadas por agente por dia do mundo, padrão 8), `MENTE_POR_HORA` (teto por
  hora real, padrão 120). Com o tempo acelerado (T), o teto por hora real é o que segura o custo.

## Decisões já tomadas
- Tempo: 1 minuto real = 1 hora do mundo (1 dia = 24 min; 12 h de sol e 12 h de noite o ano todo). Ano de 365 dias, 4 estações, começa na primavera.
- Cada mundo começa no Dia 1 às 06:00, no momento em que foi criado (`criadoEm` no estado).
- O servidor é dono do tempo, do clima e dos agentes. O navegador nunca decide nada.
- Tudo determinístico por `SEED` (mundo e clima); decisões dos agentes usam RNG com semente.
- Acelerar o tempo roda vários passos de vida por tick (corpo, movimento e relógio aceleram juntos).
- Agentes só sabem o que perceberam: visão em cone (~120° andando, em volta parado), ~30 m de dia, ~8 m à noite,
  menos na neblina, chuva e mata; audição de bichos se mexendo; de longe confundem espécies parecidas.
  Lugares de recursos esquecem em ~5 dias sem rever; episódios esquecem conforme a importância.
- Fase 7: perceber não é entender. O medo de uma espécie = instinto leve + expectativa das memórias (viés de
  negatividade) + crenças. Crenças nascem na reflexão do sono e podem ser superstições; enfraquecem devagar.
  O mapa mental supõe o desconhecido passável; esbarrar na água ensina (e a água aprendida não se desfaz).
- Fase 8: personalidade fixa sorteada pelo id (Aru e Nia são diferentes). Emoções básicas (alegria, confiança, medo,
  surpresa, tristeza, nojo, raiva, antecipação) nascem da avaliação de acontecimentos e se apagam em minutos/horas;
  humores (ansiedade, solidão, tédio, satisfação, melancolia, esperança) acumulam em dias; emoções complexas
  (alívio, frustração, orgulho, decepção, luto). Tudo pesa nas decisões (coragem x distância do susto, curiosidade e
  tédio x explorar, tristeza x ficar parado, solidão x procurar o outro). Contágio emocional ao ver o outro.
  Expressão visível: postura e símbolo acima da cabeça.
- Fase 9: o LLM decide em três momentos — plano do dia (ao acordar), eventos marcantes (ataque, morte, primeira vez
  que vê um bicho grande, reencontro) e reflexão noturna (ao dormir) — e o motor valida: ações só de uma lista
  fechada, lugares só entre os que o agente conhece (L1…), certeza de crença limitada, filtro de anacronismo nos
  textos. Ontologia neutra: o prompt só tem o que o agente sente, lembra, acredita e percebe, com bichos descritos
  pela aparência. O que foi pensado inclina a utilidade (plano +0,08×peso, decisão +0,6 por 1 h); reflexos e
  necessidades urgentes continuam mandando. Sem LLM (sem chave, orçamento esgotado, erro), segue por utilidade.
- Fase 10: objetos soltos no mundo (gravetos perto das árvores, pedras perto das rochas, fibras perto dos arbustos;
  galhos e capim repõem, pedras não). Até 2 coisas nas mãos. Gestos primitivos: pegar, largar, bater, esfregar,
  empilhar, amarrar, cavar, encostar no fogo. O motor aplica regras materiais que o agente não conhece (`REGRAS` em
  objetos.ts): pedra batida em pedra/rocha às vezes lasca; esfregar gravetos ~1,1 h sem chuva perto de uma pilha
  faz fogo (fumaça antes); raio em tempestade incendeia árvore; fogo queima gravetos e apaga na chuva; graveto
  encostado no fogo vira tição; pilha de 8+ gravetos abriga; fibras prendem a pilha; cavar acha raízes. Descobrir
  é por curiosidade/tédio (a vontade de mexer cansa no dia; gestos pouco tentados atraem). Quem descobre sabe
  repetir (técnica); quem vê pode aprender imitando (chance pela abertura). Técnicas liberam tarefas (aquecer,
  fazer_fogo, lascar, construir, cavar) e palavras no filtro de anacronismo (quem conhece o fogo pode dizer "fogo").
  Efeitos: pedra afiada corta carne e ajuda a caçar; carne perto do fogo não faz mal; fogo aquece (+9 °C) e
  espanta bichos de terra. Registro histórico em `descobertas` (quem, quando, como, para quem passou).
- Cavernas: 4 em encostas (gerador próprio, SEED+2000; uma a ~50-90 m do início), paredes com colisão e boca virada
  para baixo do morro. Dentro: abrigado (sem chuva e vento) e +4 °C. O agente só usa as que já viu (marco que não se
  esquece). "Casa" emerge: depois de 3 noites numa caverna ela vira o `lar`, e ele volta para ela de mais longe
  (alcance cresce com as noites). O LLM recebe as cavernas conhecidas como lugares (sem a palavra "casa").
  Aperfeiçoar a caverna (descoberto, não programado): ao deitar o agente larga o que segura, então coisas vão parar
  na caverna. 3+ fibras onde dorme = cama de capim (+3 °C dormindo, sono mais fundo) -> técnica `cama-capim`;
  pilha de 5+ gravetos na boca = boca tapada (+3 °C e lobo não ataca quem dorme lá) -> técnica `fechar-boca`.
  Quem sabe ganha a tarefa `melhorar_caverna` (leva capim para dentro, empilha gravetos na boca). Dentro da
  caverna a chuva não apaga o fogo. O que está dentro de uma caverna só é mexido por quem está lá dentro (guardado).
- Fase 11: ninguém nasce falando. Para se referir a algo (água, comida, carne, caverna, fogo, perigo por espécie,
  uma pessoa, "vem cá"), o agente inventa um som (sílabas aleatórias) e aponta. Quem ouve (até ~35 m, 45 m para
  perigo) e vê a mesma coisa reforça som->conceito nos dois; desencontro enfraquece (naming game, inibição lateral).
  Entendido sem ver, o som passa informação: aviso de perigo (medo, desiste de ir para lá), lugar de água/comida/
  carne/caverna/fogo (vira lembrança, com força pela confiança), chamado. Chegar lá confere: verdade sobe a
  confiança e a dívida, mentira/engano derruba. Quando fala: bicho temido por perto, achou o que o outro precisa,
  indo dormir na caverna, sente falta (chama pelo nome). Relações nascem da convivência (dormir junto conta), de
  aprender com o outro (respeito), de dicas certas e de disputar o mesmo arbusto (mágoa); laços positivos crescem
  cada vez mais devagar e longe só esfriam. O afeto pesa na vontade de ficar perto. O LLM recebe relações, sons e o
  que ouviu (e não pode usar palavras de línguas reais). O visualizador mostra o balão com o som e a tradução.
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
Concluídas: 1 (fundação), 2 (motor headless), 3 (mundo 3D), 5 (corpo e sobrevivência), 6 (natureza, ecologia e animais),
7 (percepção, memória e aprendizado), 8 (emoções e personalidade), 9 (IA deliberativa), 10 (ações primitivas, descoberta,
construção e cavernas), 11 (relações e protolinguagem) — todas validadas com os dois
agentes vivos o ano todo. A Fase 9 foi validada com o deliberador de teste; com o Claude de verdade ainda não (precisa de chave).
Próximas sugeridas: 12 (ciclo de vida, reprodução e gerações), 13 (duas comunidades), 4 (Blender, em paralelo).
Fase 10 ainda não viu: fogo por atrito, levar fogo, boca de caverna tapada (existem nas regras; raros por acaso).
Pendências: cervos caem de ~24 para ~8 ao longo do ano (migrantes seguram abaixo de 8); javalis ainda investem
contra humanos ~35 vezes por ano (quase sempre avisos, sem mortes); biomas.

## Git
- Ao final de cada desenvolvimento validado: commit no `main` (mensagem em português) e `git push origin main`.
- Nunca `--force`. Se o push falhar, avisar o usuário. Ao concluir uma fase, avisar que foi concluída e enviada.
- `engine/data/` não é versionado (é o mundo do usuário).

## Como validar mudanças no motor
Rodar `cd engine; npm run validar -- 60` (`--rastrear Nome --desde Dia` mostra um agente a cada meia hora) (dias do mundo; ~4 s por dia com as seis espécies) e verificar se os agentes sobrevivem, se têm um ritmo diário plausível e se as populações de animais não explodem nem somem, antes de entregar. O script cria um mundo novo em memória e não toca em `data/`. Para o ano inteiro, rode em blocos (a máquina fica sem memória numa rodada só): `npm run validar -- 60 --salvar b1.json`, depois `npm run validar -- 120 --carregar b1.json --salvar b2.json` e assim por diante.
