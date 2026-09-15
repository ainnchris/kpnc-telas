# Roteiro da próxima versão do Kpnc Meet

Este documento mantém o escopo da grande atualização fora do histórico do chat. A implementação acontece em `feat/meet-next`; a `main` continua sendo a versão pública estável até a validação final.

Legenda: **implementado** significa que o código e as verificações automáticas estão prontos nesta branch. Não substitui teste em aparelhos reais. **Em andamento** significa que apenas parte do fluxo está pronta.

## Primeira etapa — implementada na branch

- pré-entrada com teste de câmera, microfone, nível de áudio e resposta da internet;
- mensagens de erro de dispositivos e rede em português e mais fáceis de entender;
- troca entre câmera frontal e traseira na prévia e durante a reunião móvel;
- redução de ruído, cancelamento de eco e ganho automático ao ativar o microfone;
- indicador de qualidade da conexão;
- apresentação fixada automaticamente, melhor aproveitamento da janela e volume agrupado com os controles da transmissão;
- tela cheia da transmissão no navegador, alternativa para Safari móvel e modo paisagem no aplicativo;
- janela flutuante (Picture-in-Picture) no navegador compatível;
- seleção de `Source`, 1440p, 1080p, 720p, 480p ou 360p e 30, 60 ou 120 FPS para compartilhar pelo navegador, Windows e aplicativo móvel;
- visualizador móvel imersivo em paisagem, com zoom de 100% a 300% e alternância entre transmissão ou transmissão + chat;
- aceleração de hardware configurável no aplicativo Windows, aplicada após reiniciar; no navegador ela permanece sob controle do próprio navegador;
- chat web com busca, categorias e histórico recente de emojis;
- controles do anfitrião para bloquear novas entradas e silenciar todos;
- ícones normal, adaptativo e monocromático do Android;
- download e verificação SHA-256 da atualização Android dentro do aplicativo, mantendo a confirmação de instalação exigida pelo sistema;
- suporte de código a atualizações rápidas Expo, ainda aguardando vinculação do projeto EAS;
- coanfitriões com credenciais próprias e revogáveis, transferência de anfitrião e permissões individuais de microfone, câmera, chat e compartilhamento;
- chat com histórico limitado à duração da sala, respostas por referência, links seguros, avisos acessíveis e emojis categorizados também no aplicativo móvel.
- serviço Android de chamada em primeiro plano, com áudio preservado ao apagar a tela e notificação permanente para silenciar o microfone, alternar a saída, voltar ao aplicativo ou encerrar a reunião.
- confirmações e estados de andamento/resultado para as ações administrativas, estado de bloqueio sincronizado e histórico de moderação limitado, protegido e disponível para anfitrião e coanfitriões no navegador e no aplicativo.
- alternância acessível entre câmeras, apresentações e participantes dentro do visualizador móvel imersivo, com recuperação automática quando a transmissão selecionada termina.
- atualizador do Windows com progresso por etapa, retomada segura de downloads interrompidos, reaproveitamento de instalador verificado e recuperação amigável de falhas; a assinatura definitiva continua pendente.
- arquitetura e limites da criptografia ponta a ponta opcional definidos em `docs/E2EE-DESIGN.md`, incluindo ciclo de chaves, falha fechada, separação entre mídia e chat e critérios de testes cruzados; o recurso permanece desativado até a implementação e validação completas.
- sistema visual unificado entre web, Windows e aplicativo móvel com Minimalism, Liquid Glass, Spatial UI e Immersive Visuals, incluindo fallbacks opacos, movimento reduzido, contraste e controles responsivos; especificação em `docs/VISUAL-SYSTEM.md`.

## Próximas etapas

### Reunião e moderação

- validar coanfitrião, transferência e permissões em chamadas reais entre navegador, Windows e Android;
- validar confirmações, histórico e estados visuais das ações administrativas em chamadas reais;
- validar histórico, respostas, links, avisos e acessibilidade do chat em chamadas reais.

### Experiência de apresentação

- validar cada resolução e FPS em máquinas e conexões diferentes, com adaptação quando o dispositivo não alcançar o valor escolhido;
- validar os controles móveis de zoom e transmissão + chat em diferentes tamanhos de tela;
- validar a alternância de participantes do visualizador imersivo em diferentes tamanhos de tela;
- testar tela cheia, paisagem e Picture-in-Picture em Android, iPhone e navegadores reais;
- medir bitrate, perda de pacotes, uso de CPU/GPU e temperatura antes de definir padrões de qualidade.

### Aplicativos

- validar em aparelhos Android reais o áudio em segundo plano, tela apagada e os controles da notificação permanente;
- ativar o projeto/canal EAS para atualizações rápidas da interface;
- configurar e preservar uma chave Android definitiva. Ao trocar a assinatura experimental atual pela definitiva, poderá ser necessária uma última reinstalação; depois disso, as atualizações poderão substituir o mesmo aplicativo;
- validar o atualizador do Windows em uma versão assinada com certificado definitivo;
- testar câmera, microfone, Bluetooth, rotação, reconexão e atualização em aparelhos físicos.

### Segurança e interface

- implementar a criptografia ponta a ponta opcional conforme `docs/E2EE-DESIGN.md` e validá-la entre todos os clientes antes de anunciá-la;
- validar o novo sistema visual em navegadores, Windows e aparelhos móveis reais, incluindo contraste, leitores de tela, movimento/transparência reduzidos e desempenho;
- auditoria de segurança e privacidade antes de promover a branch para `main`.

## Critérios para publicação

1. Compilações web, Worker, Windows, Android e iOS aprovadas.
2. Testes reais entre navegador, Windows e pelo menos um aparelho Android.
3. Instalação de uma atualização Android sobre a versão anterior usando a mesma assinatura.
4. Testes de sala bloqueada, silenciar todos, compartilhamento, reconexão e permissões negadas.
5. Nenhum segredo, certificado ou chave de assinatura versionado no Git.
6. Revisão final do README, licença, política de privacidade e notas da versão.
