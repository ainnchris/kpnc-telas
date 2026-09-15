# Sistema visual do Kpnc Meet

O Kpnc Meet combina quatro direções sem transformar a reunião em uma vitrine de efeitos. O conteúdo e as ações permanecem em primeiro plano.

## Princípios

- **Minimalism:** poucas cores de destaque, textos curtos, hierarquia tipográfica clara e controles agrupados por função.
- **Liquid Glass:** superfícies translúcidas apenas em barras, cartões e painéis; sempre com cor opaca de reserva e borda suficiente para separar camadas.
- **Spatial UI:** profundidade comunica prioridade. A reunião fica no plano principal; controles, chat e configurações ocupam camadas previsíveis.
- **Immersive Visuals:** vídeo e compartilhamento usam o máximo de área útil, com entorno escuro e pouco ruído visual.

## Regras de uso

1. Azul é reservado para ação principal, seleção ou informação interativa.
2. Verde indica conexão ou resultado positivo; amarelo indica atenção; vermelho indica interrupção, bloqueio ou ação destrutiva.
3. Vidro nunca é a única forma de separar conteúdo: toda superfície possui borda, contraste e fallback opaco.
4. Sombras são discretas no conteúdo e mais profundas somente em diálogos, painéis e cartões elevados.
5. Cantos maiores identificam superfícies; controles circulares ou em cápsula identificam ações rápidas.
6. Nenhuma animação é necessária para entender estado ou concluir uma ação.

## Tokens web

Os tokens ficam em `public/css/spatial.css` e são aplicados após as folhas funcionais existentes:

- `--kpnc-accent` e `--kpnc-cyan`: identidade e destaques;
- `--kpnc-glass` e `--kpnc-glass-strong`: superfícies translúcidas;
- `--kpnc-glass-border` e `--kpnc-hairline`: separação entre camadas;
- `--kpnc-shadow-sm` e `--kpnc-shadow-lg`: profundidade;
- `--kpnc-radius-md` e `--kpnc-radius-lg`: ritmo de cantos;
- `--kpnc-blur`: desfoque controlado.

Os temas Branco, Escuro, Cinza e All black redefinem superfícies e contraste sem alterar a estrutura. Navegadores sem `backdrop-filter` recebem a cor sólida declarada antes da melhoria progressiva.

## Aplicativo móvel

O aplicativo reutiliza a mesma lógica por meio das paletas e estilos do React Native:

- cartão de introdução com hierarquia compacta;
- cartões e campos com os mesmos raios e espaçamento;
- vídeos em superfícies imersivas escuras;
- controles grandes o bastante para toque;
- sombras leves com `elevation` no Android e sombras equivalentes no iOS.

## Acessibilidade e desempenho

- foco por teclado continua visível e não depende de mudança de cor sutil;
- textos e ícones essenciais mantêm contraste sobre superfícies sólidas ou translúcidas;
- `prefers-reduced-motion` remove animações e deslocamentos decorativos;
- `prefers-reduced-transparency` substitui vidro por superfícies opacas;
- efeitos não são aplicados sobre cada vídeo, evitando custo contínuo de blur durante a chamada;
- os controles permanecem alcançáveis em 320 px, retrato, paisagem e com teclado móvel aberto.

## Validação

`scripts/test-visual-system.cjs` verifica carregamento e precedência do sistema, hierarquia desktop/móvel, ausência de overflow, alcance dos controles da reunião, superfícies visuais e movimento reduzido. As suítes responsivas existentes continuam cobrindo seis tamanhos de tela, chat, painéis e temas.

