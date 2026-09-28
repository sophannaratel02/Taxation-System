# Tax-frontend

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Compile and Minify for Production

```sh
npm run build
```

### Deploy Behind aPanel

The production build calls the same-origin `/api` path. Configure the website reverse proxy so `/api/` is forwarded to the backend Node service (default port `4000`), preserving the `/api` prefix. Serve the contents of `dist/` as the website root and enable SPA fallback to `index.html` for routes such as `/login`.

If the API is hosted on a separate domain, set `VITE_API_URL` to its full API base URL (for example `https://api.example.com/api`) before building, and set backend `CORS_ORIGIN` to the frontend origin. Rebuild after changing `VITE_API_URL`; it is embedded into the static bundle.
