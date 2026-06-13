// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    // dev でも wrangler の platform proxy を通じて Astro.locals.runtime.env を利用可能にする。
    // （R2 等のバインディングを使う場合の足場。本実装は aws4fetch HTTP のため必須ではない）
    platformProxy: { enabled: true },
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      // @astrojs/react は SSR で `react-dom/server`（= browser ビルドに解決される）を
      // 読み込むが、それは Cloudflare Workers にない MessageChannel を要求する。
      // Workers 互換の server.edge ビルドへ差し替える。
      // ※ ビルド時のみ適用。dev サーバー（Node）では server.edge が require 非対応で
      //   壊れるため、本番ビルドに限定する。
      alias: process.env.npm_lifecycle_event === 'dev'
        ? {}
        : { 'react-dom/server': 'react-dom/server.edge' },
    },
  },
});
