# Kpnc Meet 0.3.0 — Windows e interface web

## Entregas

- Convite copiado por uma ponte nativa restrita a códigos de reunião. A confirmação aguarda a escrita assíncrona no clipboard. Versões antigas/navegadores sem acesso recebem um campo selecionável para copiar manualmente.
- Janela Windows sem a moldura nativa: barra com a identidade Kpnc, cores do tema e controles de minimizar, maximizar/restaurar e fechar. F11 continua disponível.
- Captura de tela corrigida para Electron 44: `getDisplayMedia` solicita `media` com `mediaTypes: []`. Esse pedido agora chega ao seletor explícito de telas/janelas, sem conceder acesso à câmera ou ao microfone. Origem, janela principal, navegação e seleção continuam validadas.
- Avatar circular com dimensões relativas, inclusive quando renderizado antes de a pré-entrada aparecer.
- Editor de perfil com máscara circular, arraste por mouse/toque, ajuste pelas setas, zoom e rotação. Dezesseis avatares de robôs originais, gerados localmente, sem assets de terceiros.
- Configurações gerais separadas do perfil; data/hora removidas. Quatro temas persistidos e seleção de dispositivos preservada.
- Moldura verde de quem fala, sem recriar as mídias ou alterar as dimensões do grid.
- Volume e silêncio de cada apresentação remota, locais a cada ouvinte. Não alteram o microfone nem o volume dos outros participantes e não aparecem na própria transmissão.
- Coroa identificando o anfitrião no painel Pessoas, baseada na identidade emitida pelo backend.
- Emojis Unicode e links HTTP(S) clicáveis no chat. Texto continua sem interpretação de HTML; links usam `noopener noreferrer`; esquemas nativos e URLs com credenciais não são abertos pelo app.
- Card de download Windows/Android no site, alimentado pelo manifesto de versões do próprio repositório. iPhone continua indicado como futuro.
- Sons um pouco mais altos, mantendo controle para desativá-los e limitação de frequência.

## Limites explícitos

- **GIFs de até 10 MB adiados pelo usuário.** A consulta à Cloudflare retornou R2 não ativado (`10042`). Não foi criada infraestrutura, nem habilitada cobrança. Mantido o limite atual de 42 KB para GIFs animados em metadata; fotos estáticas até 5 MB são reduzidas antes de sincronizar.
- **Transcrição de voz no Windows ainda não implementada.** Electron não fornece o serviço de voz usado pelo navegador. O app pode receber legendas dos outros participantes; as configurações explicam a indisponibilidade. Uma solução própria, local ou hospedada, precisa ser definida. Nos navegadores compatíveis, o reconhecimento existente agora interrompe corretamente após erros de permissão/rede/áudio, evitando reinício infinito.
- Esta rodada altera o cliente web e o Windows. O Android nativo permanece na versão 0.2.0, com seu link de download preservado. iPhone nativo segue adiado.
- Instaladores experimentais sem certificado de assinatura comercial. SHA-256 verifica integridade, não substitui assinatura de editor.

## Validação

- `node --test apps/desktop/test/*.test.cjs apps/mobile/test/*.test.mjs scripts/test-sounds.cjs`
- `scripts/test-web-feedback.cjs`: dispositivos, sons, toast e regressões; execução local e no site publicado.
- `scripts/test-meet-advanced.cjs`: temas, persistência, GIF e perfil durante reunião, atualização adiada.
- `scripts/test-meet-polish.cjs`: corte/arraste, presets, avatar responsivo, destaque, coroa, volume por apresentação, emojis, links sem HTML, fallback de convite e barra de janela com ponte simulada.
- CI Windows `--media-smoke`: ponte de clipboard real, solicitação de captura real, seleção na janela de fontes e faixa de vídeo viva. O instalador só é publicado após esse teste passar. O desktop capturado é o ambiente descartável do CI, não o computador do usuário.

O teste automatizado não substitui uma chamada entre dispositivos reais, especialmente para validar drivers, som de loopback e condições de rede.

## Preservação

Não alterar `backup-estavel-2026-08-20` (`b667f5c5c33c227521297c9c5c8dd974b3216d03`) nem `backup-meet-2026-09-09` (`2834387e604396a217446b9b7a8a980436f5e3f0`). Nenhuma mudança no Worker, secrets ou LiveKit nesta rodada.
