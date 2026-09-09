# Kpnc Meet

Videoconferências no navegador com identidade própria, Cloudflare Pages no frontend, Cloudflare Workers na API e LiveKit Cloud como SFU.

## Aplicativos multiplataforma (em desenvolvimento)

Os clientes Windows e Android/iOS estão em `apps/desktop` e `apps/mobile`. Consulte [estado, builds e pendências](docs/APLICATIVOS.md). Eles ainda são experimentais: gerar código ou bundles JavaScript não comprova chamadas funcionando nos aparelhos. O site em produção e as branches de backup não são alterados por este desenvolvimento.

## Recursos

- criação e entrada por código/link;
- validação real da existência da reunião;
- sala de espera com aprovação ou recusa pelo anfitrião;
- pré-entrada com câmera e microfone;
- áudio, vídeo, apresentação de tela com áudio e reconexão automática;
- grade responsiva, participantes, convite, chat e levantar a mão;
- encerramento da reunião para todos pelo anfitrião;
- tokens LiveKit emitidos somente no Worker; as credenciais nunca chegam ao navegador.

## Estrutura

- `public/`: site estático publicado pelo projeto Pages `kpnc-meet` (output `public`);
- `worker/`: API publicada no Worker `kpnc-meet-api`;
- `worker/src/index.ts`: códigos aleatórios, tokens LiveKit e coordenação persistente das salas.

## Configuração

O Worker requer `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET` como secrets. `LIVEKIT_URL`, origens permitidas e o Durable Object `ROOMS` ficam declarados em `worker/wrangler.jsonc`.

O frontend usa `https://kpnc-meet-api.erikchristian2.workers.dev`. Para trocar o domínio da API no futuro, defina `window.KPNC_API_URL` antes de `/js/app.js` no `public/index.html`.

## Validação e deploy

```bash
pnpm install
pnpm run check
pnpm run worker:deploy
```

O deploy usa `--keep-vars`, preservando as variáveis e secrets já configurados no painel.

Esta é uma implementação independente, sem marca, textos ou assets proprietários de serviços de referência.
