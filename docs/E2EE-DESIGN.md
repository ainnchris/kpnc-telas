# Projeto de criptografia ponta a ponta opcional

Status: **implementação experimental concluída em `feat/meet-next`; verificações automatizadas aprovadas e validação cruzada em aparelhos reais ainda pendente**.

Este documento define os limites de segurança e os testes mínimos antes de promover a criptografia ponta a ponta (E2EE) do Kpnc Meet à versão pública estável. A implementação usa os recursos E2EE dos SDKs LiveKit fixados no projeto (`livekit-client` 2.22.1 e `@livekit/react-native` 2.12.0), sem criar uma criptografia própria.

## O que será protegido

Quando o modo E2EE estiver ativado e validado, os quadros de áudio, câmera e compartilhamento de tela serão cifrados nos dispositivos dos participantes. A chave da reunião não poderá ser enviada ao Worker, ao LiveKit, a parâmetros de URL, metadados, armazenamento persistente, telemetria ou logs.

E2EE de mídia não oculta metadados necessários ao funcionamento da chamada, como identidades técnicas, horários, quantidade de participantes, tamanho e frequência dos pacotes. A infraestrutura continua transportando a comunicação, mas não deve receber a chave capaz de decifrar a mídia.

## O que não será protegido inicialmente

O chat atual possui histórico limitado à duração da sala e armazenado pelo coordenador da sala no backend. Portanto, **o chat não poderá ser apresentado como E2EE** enquanto continuar nesse fluxo. As ações de moderação, pedidos de entrada e permissões também passam pelo backend.

Gravação local, legendas e recursos de acessibilidade processam a mídia já decifrada no dispositivo. Quem consegue usar esses recursos também consegue conservar o conteúdo recebido; E2EE não impede gravações realizadas por um participante autorizado.

## Modelo de chaves

1. O anfitrião gera no próprio dispositivo uma chave aleatória com pelo menos 128 bits de entropia. O tamanho de chave de mídia será 128 bits enquanto for necessário para compatibilidade entre os SDKs web e nativos usados pelo projeto.
2. A chave permanece somente em memória e é apagada ao sair ou encerrar a sala. Não será reutilizada entre reuniões.
3. O anfitrião compartilha a chave por um canal externo confiável. Ela nunca integra o link de convite.
4. O backend guarda apenas o indicador de que a sala exige E2EE. Ele nunca recebe a chave, uma senha derivada dela ou um identificador que permita testá-la por tentativa e erro.
5. Antes de conectar, o cliente deriva localmente o material exigido pelo SDK e exibe uma impressão curta para conferência verbal entre participantes.
6. Chave ausente ou incorreta bloqueia a mídia e mostra uma mensagem amigável. O cliente jamais recua silenciosamente para mídia sem E2EE.

Não serão aceitas senhas curtas escolhidas livremente como chave principal. Se uma senha memorável for adicionada no futuro, ela dependerá de uma derivação resistente a tentativas e de uma revisão de segurança específica.

## Negociação do modo da sala

- A criação informa ao backend somente `e2ee: true` ou `false`.
- Todos os pedidos de entrada precisam declarar o mesmo modo da sala antes da aprovação.
- Uma incompatibilidade de modo é um erro bloqueante em português, sem tentativa automática de conexão.
- A chave e sua impressão nunca trafegam pelos endpoints de sala, espera, chat ou moderação.
- Uma sala E2EE não aceita clientes sem suporte. Uma sala comum não muda para E2EE no meio de uma chamada.

## Implementação atual

### Navegador e Windows

- obter o worker E2EE da versão exata `livekit-client` 2.22.1, conferir seu SHA-256 fixado antes de executá-lo e bloqueá-lo se conteúdo ou tamanho divergirem;
- criar `ExternalE2EEKeyProvider` e inicializar a sala com o worker e o provedor de chave;
- detectar suporte a Web Workers e Insertable Streams antes de permitir o modo;
- manter a chave fora de `localStorage`, `sessionStorage`, URL e pontes IPC do Electron;
- aplicar a mesma política de origem e Content Security Policy já usada pelo aplicativo Windows.

### Android e iOS

- integrar o gerenciador E2EE nativo e o provedor de chave do SDK React Native;
- preservar a chave apenas no estado volátil da reunião, sem AsyncStorage, Expo Updates ou notificações;
- inicializar o gerenciador E2EE nativo com chave compartilhada e tamanho de 128 bits;
- manter qualquer erro de criptografia como bloqueante e encerrar a conexão, sem recuo para mídia comum;
- validar em aparelhos reais câmera, microfone, compartilhamento, troca de dispositivo e serviço em primeiro plano com E2EE ativa.

## Verificações automatizadas concluídas

- geração criptograficamente segura de chaves aleatórias de 192 bits, representadas em 32 caracteres base64url;
- impressão local curta por SHA-256 para conferência verbal;
- integridade do worker web fixada e conferida antes da criação da sala;
- negociação de `e2ee: true` ou `false` no Worker e rejeição de clientes em modo incompatível;
- ausência da chave nos endpoints, parâmetros de URL, metadados e armazenamento persistente dos clientes;
- compilação TypeScript do Worker e do cliente móvel;
- tratamento bloqueante de chave ausente, formato inválido, cliente web sem suporte e erro de decifragem.
- separação explícita entre produção e prévia: serviço Worker, Durable Objects, nomes de salas LiveKit, origem web, perfil Windows e configuração móvel independentes.

Essas verificações não substituem as chamadas cruzadas e medições em dispositivos físicos listadas abaixo.

### Chat

O chat exigirá um projeto separado. Para ser E2EE, as mensagens deverão ser cifradas no remetente e decifradas nos participantes, sem histórico legível pelo backend. Antes disso, a interface deverá distinguir claramente “mídia com E2EE” de “chat protegido em trânsito”.

## Critérios obrigatórios para ativação

- chamadas cruzadas navegador ↔ Windows ↔ Android com áudio, câmera e compartilhamento;
- entrada inicial, reconexão, troca de rede, troca de câmera e retorno do segundo plano;
- bloqueio comprovado para chave errada, chave ausente, modo incompatível e cliente sem suporte;
- ausência de chave em requisições, URLs, logs, armazenamento persistente, relatórios de erro e histórico do clipboard;
- nenhuma queda silenciosa para mídia sem E2EE;
- conferência da impressão da chave e rotação de chave testadas entre todos os clientes;
- moderação, encerramento de sala e revogação de participante funcionando sem expor a chave;
- medição de CPU, bateria, temperatura, latência e perda de quadros em aparelhos reais;
- mensagens e controles acessíveis, em português, inclusive para tecnologias assistivas;
- revisão independente do fluxo e dos testes antes de alterar o texto público de segurança.

## Ordem da entrega

1. negociação segura do modo da sala no Worker;
2. implementação web com worker versionado localmente;
3. integração do aplicativo Windows sem enviar chaves por IPC;
4. integração Android e iOS;
5. ambiente de prévia isolado e testes cruzados de falha fechada;
6. revisão de segurança;
7. somente então, disponibilização do controle opcional e atualização da documentação pública.
