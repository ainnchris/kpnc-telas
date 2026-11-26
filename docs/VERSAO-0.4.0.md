# Kpnc Meet 0.4.0

## Correções

- Android: o plugin de fotos removia CAMERA e RECORD_AUDIO do manifesto. As permissões agora são declaradas e verificadas no manifesto gerado e no APK. A autorização do usuário continua obrigatória.
- Android: quatro temas persistentes, 16 avatares originais, controles compactos, margens seguras e ajuste de teclado. Estado de conexão sincronizado ao montar os controles.
- Web/Windows: microfone e câmera inicializam antes da seleção opcional de saída; uma falha não impede o outro dispositivo. Mantém a escolha do usuário de entrar com dispositivos desligados.
- Web: seis tamanhos de tela verificados, controles móveis acessíveis, animação discreta com respeito a movimento reduzido e ícones Phosphor duotone com licença MIT local.
- Windows: download com progresso e instalação silenciosa com reabertura; nunca aplicar durante pré-entrada, espera ou reunião. Integridade SHA-256 e validação de origem preservadas.

## Atualização e limites

A primeira troca de Windows 0.3.0 para 0.4.0 ainda usa o atualizador antigo e pode mostrar o instalador. Depois de instalado 0.4.0, o novo fluxo dispensa o assistente. Android distribuído por APK ainda exige confirmação do sistema; não há atualização silenciosa arbitrária.

Testes locais: 21 testes de unidade, TypeScript mobile, manifesto Android gerado e quatro suítes de navegador. O teste responsivo simula redução do viewport, não um teclado físico. CI exige captura Windows, atualização silenciosa com reabertura e permissões no APK antes de publicar cada artefato.

Não validado em aparelho Android físico nesta sessão; confirmar câmera/microfone, teclado e retorno da tela cheia no aparelho do usuário. A alteração de inicialização do PC remove um bloqueio possível por saída de áudio, mas não substitui esse teste de hardware.

Backups estáveis permanecem intocados. GIFs grandes/R2 e publicação iPhone continuam adiados.

## Evidência de publicação Windows

O job Windows da execução 34533441426 passou em captura real, clipboard e instalação silenciosa de 0.3.0 para 0.4.0, verificando a versão instalada e a reabertura automática. SHA-256 do EXE publicado: `825d48f4f9497c807be5c58d6aa5a00be681837edfd7d0efaed02a22d3abe40f`.

Web 2026-09-10.4 também respeita “Depois” durante o download: a instalação automática é cancelada e não interrompe uma reunião.

## Evidência de publicação Android

A mesma execução 34533441426 compilou o APK 0.4.0 com sucesso e verificou CAMERA/RECORD_AUDIO dentro do APK com aapt. SHA-256: `08400879e0a286b4657eb69271b3cb11b23ec32e398a09a38f1878caf146553e`. Os dois instaladores foram baixados e seus hashes conferidos localmente. Isso não equivale a um teste de chamada em aparelho físico.
