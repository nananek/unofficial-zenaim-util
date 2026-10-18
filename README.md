# unofficial-zenaim-util

Unofficial, community-made utilities for the **ZENAIM KEYBOARD** (KB007 / KB011 series).

> **Disclaimer** — This project is unofficial and is not affiliated with, endorsed by, or
> supported by the keyboard's manufacturer or any related company. Product names and
> trademarks belong to their respective owners and are used here descriptively only.
> No vendor binaries (applications, firmware images, extracted code) are distributed in
> this repository.

## Contents

- **[Protocol documentation](docs/protocol.md)** — the host HID protocol (protocol v2), written
  from scratch, based on observed behavior of the device interface.
- **[Hardware notes](docs/hardware.md)** — MCU, peripheral buses, key-scan engine and firmware
  recovery, based on static analysis of the official firmware.
- **[WebHID configurator](src/pages/config.astro)** — configure the keyboard from a browser
  (Windows / macOS / Linux), no installation required. Built with [Astro](https://astro.build/)
  and published to GitHub Pages.

Status: **Docs available / configurator MVP**

## WebHID configurator

A static site built with Astro. The `Deploy to GitHub Pages` workflow builds and publishes two
separate pages:

- `index.html` — landing page with a connectivity check.
- `config.html` — the configurator itself.

Writes are deliberately limited to the pathways the protocol spec marks as **verified on
hardware**. Everything else is out of scope for this MVP:

| Area | Read | Write | Notes |
|---|---|---|---|
| Device info (protocol / firmware / model / serial) | ✓ | — | §3.1, §3.2 |
| Actuation enable | ✓ | ✓ | §3.3 |
| Actuation points (per profile) | ✓ | ✓ | AllSet → Apply → Save, verified by read-back (§6.1) |
| Lighting params (per profile) | ✓ | ✓ | Set → Apply → Save, verified by read-back (§6.2) |
| RGB LED config (enable / brightness) | ✓ | ✓ | Set → Apply → Save, verified by read-back (§6.2) |
| Backup / restore | — | — | JSON export/import of the rows above |

Unverified command families (keymap, macro, SOCD, MotionHack, …) are intentionally not
implemented. Always take a backup before writing.

Requirements: a WebHID-capable Chromium browser (Chrome / Edge / Opera) on an HTTPS or
`localhost` context. Firefox and Safari do not implement WebHID.

### Running locally

```sh
npm install
npm run dev        # http://localhost:4321/unofficial-zenaim-util/
npm run build      # static output in dist/  (index.html / config.html)
npm run lint       # eslint (TypeScript + .astro)
npm run check      # astro check (types)
npm test           # vitest: protocol unit tests + headless UI integration tests
```

CI runs lint, type-check, tests and the build for every pull request
(`.github/workflows/ci.yml`); the Pages workflow runs the same checks before deploying.

`BASE_PATH` and `SITE_URL` configure the Pages base path; the deploy workflow derives them from
the repository name, so nothing is hard-coded.

Without hardware, use the **demo mode** button (or open `config.html?demo=1`) to drive an
in-memory mock device that reproduces the protocol's write semantics.

### Layout

- `src/lib/protocol/` — transport-agnostic protocol layer (CRC-8, framing, command IDs, the
  `deviceProperty` table, the high-level client, and the mock device). No DOM dependencies, so
  it is unit-tested in plain Node.
- `src/lib/hid/webhid.ts` — the WebHID transport (interface 1: usagePage `0xFF60` / usage `0x61`).
- `src/lib/ui/` — i18n (ja/en), small DOM helpers, and the connection controller.
- `src/pages/` — the two Astro pages; `src/scripts/` holds their client-side entry points.
- `tests/` — protocol unit tests, the device-table resolver, and headless UI tests.
- `eslint.config.js` — flat ESLint config (typescript-eslint + eslint-plugin-astro).

## 日本語

公式ファームウェアのまま使える、非公式のツール群です。内容はデバイスのプロトコル・
ハードウェア仕様のドキュメント (公開済み) と、WebHID コンフィギュレータ (ブラウザからの
設定変更) です。

本リポジトリは非公式・非提携であり、ベンダーのコードやバイナリ (アプリケーション・
ファームウェアイメージ・抽出物) は一切含めません。

WebHID コンフィギュレータは Astro 製の静的サイトで、GitHub Actions が `index.html` と
`config.html` の 2 ページを GitHub Pages に公開します。書き込み機能は、プロトコル仕様で
実機検証済みとされている範囲 (アクチュエーションポイント / ライティング / LED 設定) に
限定しています。未検証のコマンド (キーマップ・マクロ・SOCD 等) は実装していません。
書き込み前には必ずバックアップを取得してください。

実機がない場合はデモモード (`config.html?demo=1`) で UI と書き込み手順を確認できます。
UI は日本語 / 英語の切り替えに対応しています。

## License

MIT License — see [LICENSE](LICENSE).
