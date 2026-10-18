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
- **WebHID configurator** — configure the keyboard from a browser (Windows / macOS / Linux),
  no installation required. (planned)

Status: **Docs available / configurator WIP**

## 日本語

公式ファームウェアのまま使える、非公式のツール群です。内容はデバイスのプロトコル・
ハードウェア仕様のドキュメント (公開済み) と、WebHID コンフィギュレータ
(ブラウザからの設定変更、開発中) です。

本リポジトリは非公式・非提携であり、ベンダーのコードやバイナリ (アプリケーション・
ファームウェアイメージ・抽出物) は一切含めません。

## License

MIT License — see [LICENSE](LICENSE).
