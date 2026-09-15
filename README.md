# Kpnc Meet

Plataforma de videoconferências com identidade própria, disponível no navegador e em clientes experimentais para Windows e Android. O frontend é publicado no Cloudflare Pages, a API utiliza Cloudflare Workers e Durable Objects, e a mídia em tempo real é transportada pelo LiveKit Cloud.

> Estado atual: versão experimental `0.4.0`. Antes de tratar o produto como uma versão final, ainda são necessários testes de chamadas reais entre dispositivos e redes diferentes.

## Acesso

- Web: <https://kpnc-meet.pages.dev>
- API: <https://kpnc-meet-api.erikchristian2.workers.dev>
- Windows e Android: os instaladores publicados aparecem no próprio site.
- iPhone: ainda não há uma versão instalável em aparelho físico.

## Recursos

- criação de reunião e entrada por código ou link;
- sala de espera com aprovação ou recusa pelo anfitrião;
- câmera, microfone e seleção de dispositivos;
- teste de câmera, microfone e resposta da internet antes da entrada;
- compartilhamento de tela e áudio quando a plataforma oferece suporte;
- escolha de resolução e FPS da apresentação no navegador/aplicativo Windows;
- grade responsiva, destaque de quem está falando, tela cheia móvel e janela flutuante;
- lista de participantes, chat com emojis por categoria e mão levantada;
- remoção, silenciamento, bloqueio de novas entradas e encerramento pelo anfitrião;
- perfil local com nome, foto, GIF pequeno e avatares próprios;
- quatro temas de interface;
- sistema visual responsivo com superfícies espaciais, transparência progressiva e alternativas para movimento ou transparência reduzidos;
- gravação local e legendas nos navegadores compatíveis;
- atualizador do aplicativo Windows com verificação SHA-256;
- atualização Android baixada e verificada dentro do aplicativo, com confirmação final do sistema.

## Arquitetura

| Componente | Diretório | Tecnologia | Responsabilidade |
| --- | --- | --- | --- |
| Cliente web | `public/` | HTML, CSS e JavaScript | Interface, mídia e recursos da reunião |
| API | `worker/` | Cloudflare Workers | Códigos de sala, admissão e tokens LiveKit |
| Estado temporário | `worker/src/index.ts` | Durable Objects | Sala de espera, autoridade do anfitrião e expiração |
| Windows | `apps/desktop/` | Electron | Aplicativo isolado, permissões, captura e atualização |
| Android/iOS | `apps/mobile/` | React Native e Expo | Cliente móvel nativo e integração LiveKit |

Os segredos `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET` pertencem somente ao Worker. Eles não devem ser colocados no frontend, no aplicativo ou no repositório.

## Branches

- `main`: site e API publicados;
- `feat/meet-next`: desenvolvimento da próxima grande atualização do Meet;
- `feat/meet-multiplataforma`: histórico da primeira etapa dos clientes Windows e Android/iOS;
- `backup-estavel-2026-08-20` e `backup-meet-2026-09-09`: cópias de segurança que não devem ser modificadas.

O desenvolvimento da próxima versão continua separado da `main` até a conclusão dos testes reais. Consulte [`docs/ROADMAP-MEET-NEXT.md`](docs/ROADMAP-MEET-NEXT.md), [`docs/APLICATIVOS.md`](docs/APLICATIVOS.md) e os registros em `docs/VERSAO-*.md`.

## Desenvolvimento local

Requisitos: Node.js 24 e pnpm 11.19.0.

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run check
node --test apps/desktop/test/*.test.cjs apps/mobile/test/*.test.mjs scripts/test-*.cjs
pnpm --filter kpnc-meet-mobile typecheck
```

Para iniciar o Worker localmente:

```bash
pnpm run worker:dev
```

Crie um arquivo local `.dev.vars` com as credenciais necessárias. Arquivos `.env*`, `.dev.vars*`, certificados e chaves de assinatura são ignorados pelo Git e nunca devem ser enviados ao repositório.

## Configuração e publicação

O arquivo `worker/wrangler.jsonc` declara a URL pública do LiveKit, as origens autorizadas, o binding `ROOMS` e os nomes dos segredos obrigatórios, sem os valores.

Para validar e publicar somente o Worker:

```bash
pnpm run check
pnpm run worker:deploy
```

O deploy usa `--keep-vars` para preservar a configuração existente. O frontend usa a API definida em `public/js/app.js`; uma implantação alternativa pode definir `window.KPNC_API_URL` antes desse arquivo ser carregado.

## Segurança e privacidade

- tokens LiveKit são assinados somente no backend e limitados à sala correspondente;
- a autoridade administrativa permanece no backend e exige o segredo temporário do anfitrião;
- os clientes atuais enviam segredos de admissão no cabeçalho `Authorization`, não na URL; a API mantém compatibilidade temporária com clientes `0.4.0` já instalados;
- a sala de espera possui limite de solicitações ativas e expiração automática;
- o cliente Windows mantém `nodeIntegration` desativado, isolamento de contexto, sandbox e validação estrita da origem;
- downloads do atualizador Windows exigem origem conhecida e SHA-256 correspondente;
- o site define Content Security Policy, bloqueio de frames e políticas restritivas de navegador;
- mensagens, links e nomes são renderizados sem interpretar HTML fornecido por participantes;
- o histórico do chat é limitado à duração da sala e gravações são geradas somente no dispositivo do usuário;
- perfil e preferências ficam no armazenamento local do navegador ou aplicativo;
- salas expiram automaticamente após 12 horas e solicitações de entrada após 15 minutos.

O Kpnc Meet público estável protege o tráfego em trânsito, mas não anuncia criptografia de ponta a ponta verificável. Na branch `feat/meet-next`, existe um modo experimental de E2EE para áudio, câmera e compartilhamento de tela; a chave fica somente na memória dos clientes e nunca segue para a API. O chat, a admissão e a moderação continuam protegidos em trânsito, mas não são E2EE. A implementação, seus limites e os testes reais ainda obrigatórios estão em [`docs/E2EE-DESIGN.md`](docs/E2EE-DESIGN.md).

Para operação pública, recomenda-se configurar limitação de tráfego no Cloudflare, monitorar erros e custos, assinar comercialmente os instaladores e manter os segredos fora de logs e mensagens.

## Limitações conhecidas

- Android ainda precisa de validação de câmera, microfone, teclado, reconexão e segundo plano em aparelho físico;
- o canal rápido de atualização Android ainda precisa ser vinculado a um projeto EAS e o APK definitivo precisa de uma chave de assinatura estável;
- iOS foi compilado apenas para simulador e ainda depende de assinatura, CallKit e teste em iPhone;
- GIFs grandes dependem de armazenamento externo e continuam adiados;
- a transcrição local não está disponível no aplicativo Windows;
- os instaladores experimentais ainda não possuem certificado comercial de assinatura;
- a primeira atualização do Windows `0.3.0` para `0.4.0` pode exibir o instalador.

## Repositório privado

O site já publicado no Cloudflare continua online mesmo que o repositório se torne privado. Novos deploys automáticos continuam funcionando somente se o aplicativo **Cloudflare Workers and Pages** mantiver acesso a este repositório.

Os instaladores atuais são distribuídos por GitHub Releases. Em um repositório privado, visitantes sem autorização não conseguem baixar esses arquivos; por isso, os downloads públicos e o atualizador do Windows precisam ser migrados para um armazenamento público antes da mudança de visibilidade.

## Licença

Código autoral e identidade do Kpnc Meet são proprietários e não estão liberados como código aberto. Consulte [`LICENSE.md`](LICENSE.md). Bibliotecas, ícones e outros componentes de terceiros permanecem sujeitos às licenças de seus respectivos autores.
