# Kpnc Meet multiplataforma

## Estado desta etapa

Desenvolvimento isolado em `feat/meet-multiplataforma`, a partir do commit `2834387e604396a217446b9b7a8a980436f5e3f0`.

- Não modificar `backup-estavel-2026-08-20` nem `backup-meet-2026-09-09`.
- Não substituir `main` antes de validar as chamadas entre plataformas.
- O Windows abre o site HTTPS publicado em uma janela Electron isolada. Precisa de internet; não é uma cópia offline do site.
- Android/iOS usam React Native, Expo e o SDK nativo LiveKit. Não são WebViews e não funcionam no Expo Go.
- Os clientes usam a API existente. Chaves de assinatura, hostKey e tokens de reunião nunca devem ser commitados. O hostKey permanece somente na memória do cliente durante a reunião.

## Recursos no código

| Recurso | Windows | Android | iOS |
| --- | --- | --- | --- |
| Criar, solicitar entrada, aceitar/recusar | Interface web existente | Implementado | Implementado |
| Câmera, microfone, receber apresentações | Interface web existente | Implementado | Implementado |
| Chat, participantes, mão levantada | Interface web existente | Implementado | Implementado |
| Perfil local, foto, tema claro/escuro | Perfil próprio do aplicativo | Implementado | Implementado |
| Ampliar uma transmissão | Interface web existente | Implementado | Implementado |
| Enviar tela | Seletor de monitor/janela | SDK + serviço de captura configurado | Extensão e seletor implementados; **aguarda validação nativa/física** |
| Áudio da apresentação | Loopback Windows com consentimento | Não validado; não garantido | O transporte da extensão envia vídeo, **não áudio de outros apps** |
| Inverter câmera / escolher saída de áudio | Preferências web existentes | Implementado | Implementado |
| Continuidade em segundo plano | Depende de manter a janela/processo aberto | **Pendente: serviço de chamada** | Áudio configurado; **pendente: CallKit e testes** |
| Prévia de câmera antes da entrada | Interface web existente | Implementada, com ativação explícita | Implementada, com ativação explícita |
| Legendas, gravação composta, efeitos nativos | Recursos/limitações do site atual | **Pendente** | **Pendente** |
| Atualização automática do binário | **Pendente: canal assinado**; site atualiza online | Lojas/distribuição pendentes | Lojas/distribuição pendentes |

“Implementado” descreve o código, não certificação em hardware. Esta etapa **não é uma entrega completa de paridade**. Não divulgar como versão final.

## Instalar dependências e verificar

Use Node 24 e pnpm 11.19.0:

```sh
pnpm install --frozen-lockfile
node --test apps/desktop/test/*.test.cjs apps/mobile/test/*.test.mjs
pnpm --filter kpnc-meet-mobile typecheck
pnpm --filter kpnc-meet-mobile export
```

Os testes verificam confiança de origem, convites, códigos, transporte HTTP e autenticação de ações. A checagem TypeScript valida a integração com as versões fixadas dos SDKs. A exportação Metro valida os bundles JavaScript; não substitui a compilação nativa.

## Windows

```sh
pnpm --filter kpnc-meet-desktop start
pnpm --filter kpnc-meet-desktop dist
```

O instalador vai para `apps/desktop/dist`. Sem certificado de assinatura, o Windows pode exibir alertas de editor desconhecido. Não oriente usuários a desativar antivírus ou SmartScreen. Para distribuição pública, configurar assinatura de código e canal de atualização seguro.

O aplicativo mantém `nodeIntegration:false`, `contextIsolation:true`, sandbox e validação TLS. Só a origem exata do site tem acesso ao fluxo de permissão de dispositivos. Compartilhar tela abre um seletor local; áudio do computador é opcional e começa desmarcado. Cancelar nunca escolhe uma tela automaticamente.

Atalhos na janela: Ctrl+Shift+M (microfone), Ctrl+Shift+V (câmera), Ctrl+Shift+C (chat). Não são atalhos globais. O protocolo `kpncmeet://join/codigo-da-sala` é registrado pelo instalador; ao abrir outro convite durante uma sessão, pede confirmação.

Teste de carregamento oculto, sem acessar dispositivos:

```sh
cd apps/desktop
node node_modules/electron/cli.js . --smoke-test
```

Neste ambiente Windows, esse teste encontrou falha ao inicializar o processo gráfico (`GPU process exited`, código `-1073741515`). Não foi contornada desativando a sandbox; a execução e a chamada real precisam ser verificadas em ambiente compatível.

## Android

Instale Android Studio/SDK e um JDK compatível com a versão gerada pelo Expo. Execute:

```sh
pnpm --filter kpnc-meet-mobile android
```

O workflow `Aplicativos de teste` também gera um APK experimental usando `assembleRelease` no projeto gerado. O template Expo usa assinatura de desenvolvimento: ela **não é a identidade de assinatura para uma publicação definitiva**. Para loja, configurar chave de upload/Play App Signing e produzir AAB; preservar a chave em armazenamento seguro, nunca no GitHub.

Como alternativa com conta Expo, usar EAS: `eas build --platform android --profile preview` dentro de `apps/mobile`. Isso requer vincular o projeto à conta; nenhum projeto remoto ou conta foi criado automaticamente. Custos/filas dependem do plano escolhido.

## iPhone

O código usa o mesmo cliente móvel. Para compilar localmente, é necessário macOS/Xcode compatível com o Expo escolhido. Uma compilação em nuvem pode substituir o Mac local, mas não a assinatura/distribuição Apple.

Para TestFlight/App Store, o proprietário precisa da conta Apple Developer e configurar o identificador `dev.kpnc.meet` (provisório, confirmar disponibilidade). As credenciais e certificados devem ser cadastrados no serviço de build ou no Xcode, não enviados em chat nem commitados. Para testes físicos locais existem opções de provisionamento limitado; não equivalem à distribuição pública.

Antes de chamar iOS de completo, adicionar e validar:

1. Validar a Broadcast Upload Extension gerada pelo plugin `with-broadcast`, App Group e seletor de captura em um iPhone físico. A extensão usa o transporte de vídeo do exemplo Jitsi recomendado pelo SDK LiveKit; licença e atribuições estão em `apps/mobile/native/broadcast`.
2. Continuidade da chamada com CallKit, interrupções e rotas Bluetooth.
3. Assinatura do aplicativo e extensão com a mesma equipe Apple.
4. Testes em iPhone físico; o simulador não comprova câmera/microfone nem captura de tela.

## Matriz obrigatória de testes reais

- Criar no navegador e admitir Windows/Android/iPhone; repetir mudando o anfitrião.
- Código inexistente; recusa; expiração; cancelar espera; queda de rede na espera.
- Mutar/desmutar e ligar/desligar câmera sem remontar vídeos remotos.
- Receber e enviar apresentações onde suportado, encerrar captura pelo sistema, ampliar sem distorcer.
- Chat entre todas as plataformas, nomes/fotos, mão, remoção e encerramento pelo anfitrião.
- Girar celular, bloquear tela, alternar aplicativos, conectar/desconectar Bluetooth.
- Wi-Fi/dados móveis, perda de rede e reconexão; conferir liberação de câmera/microfone ao sair.
- Negar permissões e confirmar que o app continua utilizável sem dispositivos.
- Medir RTT, perda de pacotes, bitrate, FPS e CPU antes de prometer melhorias de qualidade/latência.

Um executável não reduz automaticamente o ping nem elimina lag. A rede, o SFU, o dispositivo e as configurações de mídia continuam determinantes. Não aumentar resolução/bitrate indiscriminadamente.

## Referências oficiais

- https://docs.livekit.io/transport/sdk-platforms/expo/
- https://github.com/livekit/client-sdk-react-native#screenshare
- https://github.com/livekit/client-sdk-react-native#background-processing
- https://www.electronjs.org/docs/latest/tutorial/security
- https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequesthandlerhandler-opts
