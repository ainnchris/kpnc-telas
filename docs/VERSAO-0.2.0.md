# Kpnc Meet 0.2.0 — entrega experimental

## Windows e interface web compartilhada

- Corrigida a negação de display-capture e speaker-selection para a origem exata do Meet. A captura continua dependendo de escolha explícita de tela/janela. Câmera e microfone exigem consentimento.
- Permissão personalizada, local e isolada, com cancelamento e prazo limite. Não substitui eventuais permissões de privacidade do próprio sistema operacional.
- Prévia trata câmera e microfone separadamente e cancela captura tardia ao sair. Reprodução bloqueada oferece botão de ativação de áudio. Configurações incluem teste de saída.
- Quatro temas na home e na reunião: branco, escuro, cinza e all black; escolha persistida.
- Editor de perfil com prévia circular, rotação de 90°, zoom e posição horizontal/vertical. Salvar durante reunião atualiza nome/metadados sem reconectar nem recriar os vídeos.
- GIF preservado no web/Windows até 42 KB; clientes móveis recebem uma imagem estática compatível. Fotos estáticas exportadas como retrato de 96px.

## Atualizações

- Web: verifica updates.json e oferece recarregar apenas na home, fora de prévia/espera/reunião e sem diálogo aberto.
- Windows: a partir de 0.2.0, baixa um instalador da release do próprio repositório, confere SHA256 e exige clique adicional para instalar/reiniciar. O processo principal também bloqueia instalação durante a reunião.
- Android: 0.2.0 verifica versão na home e abre o APK oficial para confirmação do sistema. Não é OTA JavaScript nem instalação silenciosa.
- Versões antigas precisam desta primeira instalação manual; nelas o atualizador ainda não existe.
- Canal experimental via GitHub Releases e manifesto HTTPS. Hash detecta corrupção, mas não substitui certificado de assinatura de editor. Proteger as contas GitHub/Cloudflare e as credenciais de publicação.
- Worker/API não alterados nesta entrega, preservando compatibilidade das salas existentes.

## Testes

Testes de política, permissões, endereço/hash/versão de atualização, sons e API do cliente aprovados. TypeScript móvel validado.

scripts/test-meet-advanced.cjs valida no Edge com sala e metadados simulados: quatro fundos distintos na reunião, persistência de tema, GIF/rotação, salvamento do perfil e atualização adiada até a home. scripts/test-web-feedback.cjs valida dispositivos simulados e avisos na interface local e publicada.

Ainda é necessário testar chamada real entre computadores/celulares, microfone físico, saída selecionada, captura com áudio e instalação de uma atualização entre duas versões. Os testes não acessam dispositivos reais nem comprovam esses cenários.
