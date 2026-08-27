# Kpnc Telas

Videoconferências no navegador com identidade própria, Cloudflare Pages no frontend, Cloudflare Workers na API e LiveKit Cloud como SFU.

## Recursos

- criação e entrada por código/link;
- pré-entrada com câmera e microfone;
- áudio, vídeo, apresentação de tela com áudio e reconexão automática;
- grade responsiva, participantes, convite e chat em tempo real;
- tokens LiveKit emitidos somente no Worker; as credenciais nunca chegam ao navegador.

## Estrutura

- `public/`: site estático publicado pelo projeto Pages `kpnc-meet` (output `public`);
- `worker/`: API publicada no Worker `kpnc-meet-api`;
- `worker/src/index.ts`: criação de códigos criptograficamente aleatórios e emissão de tokens LiveKit.

## Configuração

O Worker requer as bindings `LIVEKIT_URL`, `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET`. As duas credenciais devem permanecer como secrets. Para aceitar origens adicionais, configure `ALLOWED_ORIGINS` como uma lista separada por vírgulas.

O frontend usa `https://kpnc-meet-api.erikchristian2.workers.dev`. Para trocar o domínio da API no futuro, defina `window.KPNC_API_URL` antes de `/js/app.js` no `public/index.html`.

## Validação e deploy

```bash
pnpm install
pnpm run check
pnpm run worker:deploy
```

O deploy usa `--keep-vars`, preservando as variáveis e secrets já configurados no painel.

Esta é uma implementação independente, sem marca, textos ou assets proprietários de serviços de referência.

