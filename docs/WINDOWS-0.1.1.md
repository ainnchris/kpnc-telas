# Windows 0.1.1

- Barra nativa de menus removida; atalhos de microfone/câmera/chat e F11 preservados.
- Instalador, desinstalador e janela usam a marca atual. O PNG existente foi redimensionado para 256px, sem redesenho, e empacotado como ICO.
- Dispositivo padrão automático, seleção manual, identificação autorizada por microfone (sem câmera), atualização ao conectar/remover dispositivos e saída de áudio salva aplicada ao entrar.
- Avisos compactos com contraste claro/escuro; novo aviso reinicia o prazo de exibição.
- Sons discretos para botões, entrada/saída, solicitação de entrada, chat e início/fim de apresentação. Podem ser silenciados na home ou no menu; preferência persistida. Avisos da fila usam IDs para evitar repetição por polling e detectar novas pessoas mesmo com a mesma contagem.

## Verificação

Os testes de política/branding/mobile e `node --test scripts/test-sounds.cjs` passaram. A interface local e o site publicado foram testados no Edge automatizado: home, seleção padrão/manual, permissão só de áudio, liberação da captura temporária, preferência de sons e toast compacto em 1280px/390px. Dispositivos foram simulados; isso não substitui uma chamada real com fones e outro participante.

`scripts/test-web-feedback.cjs` requer Playwright instalado no ambiente. Use PLAYWRIGHT_MODULE para indicar o módulo e BROWSER_EXECUTABLE para indicar o navegador, se necessário. KPNC_TEST_LIVE=1 testa a interface publicada; sem essa variável os arquivos são interceptados localmente. O teste não cria reuniões nem acessa dispositivos reais.

Para receber o ícone e a janela sem menu é necessário instalar a versão 0.1.1. A interface web compartilhada atualiza ao reabrir o aplicativo. O instalador continua experimental, sem assinatura de editor definitiva.
