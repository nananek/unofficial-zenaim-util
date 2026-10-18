# ZENAIM KEYBOARD HID プロトコル仕様 (protocol v2)

*An unofficial description of the ZENAIM KEYBOARD host HID protocol (protocol v2), written for configurator implementers.*

> **非公式ディスクレーマ** — 本ドキュメントは非公式であり、キーボードの製造元および関連会社とは無関係です。製品名・商標は各権利者に帰属し、記述目的でのみ使用しています。内容はデバイスの公開インターフェースの観測から独自に作成したもので、正確性・完全性は保証されません。

対象: ファームウェア 1.2.5 での観測時点の仕様 (2026-10)。

## 1. 概要

### 1.1 デバイス

| 項目 | 値 |
|---|---|
| USB VID:PID | 0x3507:0x0003 |
| 製造元文字列 | "Tokai Rika Co., Ltd" |
| 製品文字列 | "ZENAIM KEYBOARD" |
| modelName | `KB007-DGBK` (観測個体) |
| protocolVersion | 2 |
| firmwareVersion | `1.2.5` (観測個体) |
| キーマトリクス | 6 行 × 18 列 = 108 キー + 温度 6ch |
| layer.count | 3 |
| adc.count | 114 (= 108 + 温度 6) |
| ADC 分解能 | 12 bit (step 4096) |

- 機種ごとの構成値は deviceProperty として定義されており、USB 情報 (VID / PID / bcdDevice) と modelName で解決する (§5)。
- 本ドキュメントの数値は、特に断りのない限りファームウェア 1.2.5 の個体で観測したもの。

### 1.2 インターフェース構成

デバイスは HID インターフェースを 4 つ持つ。

| IF | usagePage / usage | 役割 |
|---|---|---|
| 0 | 0x01 / 0x06 | boot keyboard (標準キーボード) |
| 1 | 0xFF60 / 0x61 | **本プロトコル** (32 byte 論理フレーム。QMK/VIA 系で使われるカスタム usagePage) |
| 2 | 0x01 / 0x80, 0x0C / 0x01, 0x01 / 0x06 | system control + consumer control (メディア/システムキー) |
| 3 | 0xFF31 / 0x74 | 第二の raw エンドポイント (用途未確定・未調査) |

- 対象インターフェースは **IF1 (usagePage 0xFF60 / usage 0x61)**。
- Linux の hidraw ノード番号は接続順などで変わるため、番号をハードコードせず usagePage / usage で特定する。
- usbhid が全インターフェースを掴んだ状態でも、hidraw 経由の open / read / write は共存できた (観測)。

### 1.3 接続シーケンス

1. usagePage 0xFF60 / usage 0x61 のインターフェースを開く。
2. ProtocolVersionGet (0x30) を送り、protocolVersion = 2 を確認する。
3. KeyboardInfoGet (0x40) で deviceName / modelName / serialNumber を取得する (96 byte、§3.2)。
4. USB 情報と modelName から deviceProperty を解決し、以降のコマンドのサイズ計算に使う (§5)。

protocolVersion が 2 でないデバイスでは、ActuationUserConfig 系 (§3.22) など一部のコマンドが未対応になる。

## 2. トランスポート

### 2.1 レポート長とフレーム

論理フレームは **32 byte** (エンドポイントの HID レポート長に由来)。

送信 (write、33 byte):

```
+----------+--------------------------------------+----------+
| byte 0   | bytes 1..31                          | byte 32  |
| 0x00     | コマンドフレーム (可変長・ゼロ埋め)  | crc8     |
+----------+--------------------------------------+----------+
```

- 先頭の 0x00 は report ID 0 のプレフィックス。Linux の hidraw へはこの 33 byte の形で書き込む (公式アプリの Windows 版と同じ送信形)。
- crc8 は **bytes 0..31 全体** (0x00 プレフィックスを含む) を対象に計算する。
- コマンドフレームが 32 byte 目まで達する場合、32 byte 目は CRC に上書きされるため、コマンド部分の実効上限は 31 byte。データ系コマンドは後述の 26 byte チャンクで送るため通常は起きない (§2.4)。

受信 (read、32 byte):

```
+-----------+---------------+----------+
| byte 0    | bytes 1..30   | byte 31  |
| コマンドID | データ        | crc8     |
+-----------+---------------+----------+
```

- crc8 は **bytes 0..30** を対象に計算する。

### 2.2 CRC8 の定義

プロトコルの CRC は **CRC-8**。

- パラメータ: **width=8 / poly=0x07 / init=0x00 / refin=false / refout=false / xorout=0x00**
  - reveng 表記の CRC-8 (CRC-8/SMBUS と同一パラメータ)。
- 検査値: `crc8("123456789") = 0xF4`。
- 送信・受信で対象範囲が異なる (§2.1)。CRC が一致しないフレームは破棄する。

Python 再実装 (bitwise、テーブル不要):

```python
def crc8(data: bytes) -> int:
    """poly=0x07, init=0x00, refin=false, refout=false, xorout=0x00"""
    crc = 0x00
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x07) & 0xFF if (crc & 0x80) else ((crc << 1) & 0xFF)
    return crc
```

### 2.3 応答規約

- 応答は要求のエコーで始まる: `data[0]` = コマンド ID。buffer 系は続けて offset (u16LE) / size をエコーする。
- `0xFF` (Unhandled): 未対応コマンドへの応答。
- `0xFE` (Error): エラー応答。`data[1]` に詳細コード。
- **コマンドは 1 つずつ**: 応答が返るまで次のコマンドを送らない。プロトコルレベルにはタイムアウト・リトライが規定されていない (無応答だとキューが止まる) ため、ホスト側で必ずタイムアウトを実装すること。

### 2.4 フレーム種別

| 種別 | 要求 (コマンドフレーム) | 応答 |
|---|---|---|
| request | `[id]` のみ | `[id]` (エコー) |
| Get / Set (直接) | `[id, args...]` | 各コマンドの定義参照 |
| GetBuffer | `[id, offset u16LE, size, 0x00(reserved), ゼロ埋め]` | `[id, offset u16LE, size, payload...]` |
| SetBuffer | `[id, offset u16LE, size, payload...]` | `[id, offset u16LE, size, payload...]` (エコー) |
| HashGet | `[id]` | `[id, hash 16 byte]` (ホスト側では hex 32 桁として扱う) |
| Apply / Load / Save / DefaultLoad / DefaultSave | 原則 `[id]` (Buttonmap / Macro 系の Load / Save は `[id, profile]`) | `[id]` (エコー)、profile 付きは `[id, profile]` |

- GetBuffer の payload は 1 コマンド **26 byte** (32 − header 4 − reserved 1 − crc 1)。reserved は payload を 2 byte 単位に揃えるためのもの。
- SetBuffer の理論上の payload 上限は **27 byte** (32 − header 4 − crc 1) だが、実装上は Get / Set とも **26 byte 単位**でチャンクする。
- マルチチャンク読み書きは、呼び出し側が offset を進めながら逐次実行する。

## 3. コマンド一覧

全コマンド ID (定義順)。種別の凡例:

- `request`: `[id]` のみ送る
- `Get` / `Set`: 直接 payload
- `Get(buffer)` / `Set(buffer)`: GetBuffer / SetBuffer 形式 (§2.4)
- `AllGet(buffer)` / `AllSet(buffer)`: 同上 (デバイス全域を扱う)
- `HashGet`: 16 byte ハッシュ
- `Apply` / `Load` / `Save` / `DefaultLoad` / `DefaultSave`

### 3.1 System

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0x30 | ProtocolVersionGet | request | 応答 `[0x30, ver u16LE]`。観測値 = 2 |
| 0x31 | FirmwareVersionGet | request | 応答 `[0x31, ASCII..., 0x00]`。byte 1 から最初の NUL まで UTF-8。観測値 "1.2.5" (2026-10-17 時点) |
| 0x32 | BootloaderEnter | request | デバイスを UF2 ブートローダーモードへ移行する (ファームウェア更新用)。実行すると USB がマスストレージ (UF2 ドライブ) として再列挙され、本プロトコルのセッションは切れる。復旧・更新手順は [hardware.md §3](hardware.md) を参照 |
| 0x33 | FactoryReset | request | 出荷時設定に戻す。全設定・全プロファイルが消えるため、実行前にバックアップを強く推奨 |
| 0x34 | Reboot | request | 再起動 |
| 0x35 | ADCAllGet | AllGet(buffer) | サイズ = adc.count×2 (= 228 byte)。u16LE × 114 ch。108 = キー、6 = 温度 |
| 0x36 | EEPROMGet | request | 定義は存在する。実機挙動は未確認 (通常は使わない) |
| 0x37 | EEPROMSet | request | 定義は存在する。実機挙動は未確認。設定ストレージを直接操作する低レベル系で、通常は使わない |
| 0x38 | EEPROMErase | request | 定義は存在する。実機挙動は未確認。消去系の低レベルコマンドで、通常は使わない |
| 0x39 | SwitchMatrixState | AllGet(buffer) | サイズ = keySwitch.count (108 byte)。各 byte = スイッチ物理状態 |

### 3.2 Keyboard info

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0x40 | KeyboardInfoGet | Get(buffer) | 96 byte = deviceName 32B + modelName 32B + serialNumber 32B (各 NUL 終端 UTF-8) |
| 0x41 | KeyboardInfoSet | Set(buffer) | 96 byte (同上レイアウト) |
| 0x42 | KeyboardInfoHashGet | HashGet | |
| 0x43 | KeyboardInfoApply | Apply | |
| 0x44 | KeyboardInfoLoad | Load | |
| 0x45 | KeyboardInfoSave | Save | |

### 3.3 Actuation enable

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0x46 | ActuationEnableGet | request | 応答 `[0x46, enable(0/1)]`。観測値 = true |
| 0x47 | ActuationEnableSet | Set | 要求 `[0x47, enable(0/1)]`、応答同形式 |

### 3.4 Actuation point [profile]

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0x48 | ActuationPointGet | Get | 要求 `[id, profile, row, column]` → 応答 `[id, profile, row, column, pointOn u16LE, pointOff u16LE]` [µm] |
| 0x49 | ActuationPointSet | Set | 要求 `[id, profile, row, column, pointOn u16LE, pointOff u16LE]` |
| 0x4a | ActuationPointAllGet | AllGet(buffer) | 1 profile = keySwitch.count×4 = 432 byte。offset = profile×432 |
| 0x4b | ActuationPointAllSet | AllSet(buffer) | 同上。1 点 4 byte (pointOn u16LE + pointOff u16LE) |
| 0x4c | ActuationPointHashGet | HashGet | |
| 0x4d | ActuationPointApply | Apply | |
| 0x4e | ActuationPointLoad | Load | |
| 0x4f | ActuationPointSave | Save | |
| 0x50 | ActuationPointDefaultLoad | DefaultLoad | |
| 0x51 | ActuationPointDefaultSave | DefaultSave | |

### 3.5 Actuation range

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0x52 | ActuationRangeGet | Get | 要求 `[id, row, column]` → 応答 `[id, row, column, pressValue u16LE, releaseValue u16LE]` (ADC 値) |
| 0x53 | ActuationRangeSet | Set | 要求 `[id, row, column, pressValue u16LE, releaseValue u16LE]` |
| 0x54 | ActuationRangeAllGet | AllGet(buffer) | 108×4 = 432 byte |
| 0x55 | ActuationRangeAllSet | AllSet(buffer) | 同上 |
| 0x56 | ActuationRangeHashGet | HashGet | |
| 0x57 | ActuationRangeApply | Apply | |
| 0x58 | ActuationRangeLoad | Load | |
| 0x59 | ActuationRangeSave | Save | |
| 0x5a | ActuationRangeDefaultLoad | DefaultLoad | |
| 0x5b | ActuationRangeDefaultSave | DefaultSave | |
| 0x5c | ActuationRangePressSet | Get 形式 | 要求 `[id, row, column]` → 応答 `[id, row, column, pressValue u16LE]` (値を返すのみで、設定かどうかは未検証) |
| 0x5d | ActuationRangePressAllSet | request | 挙動未確認 (payload 定義が見当たらない) |
| 0x5e | ActuationRangeReleaseSet | Get 形式 | 応答 `[id, row, column, releaseValue u16LE]` |
| 0x5f | ActuationRangeReleaseAllSet | request | 挙動未確認 |

### 3.6 Actuation coefficient

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0x60 | ActuationCoefficientGet | Get | 要求 `[id, row, column]` → 応答 `[id, row, column, float32LE × 4]` (3 次関数の係数) |
| 0x61 | ActuationCoefficientSet | Set | 要求 `[id, row, column, float32LE × 4]` (19 byte) |
| 0x62 | ActuationCoefficientAllGet | AllGet(buffer) | 108×16 = 1728 byte |
| 0x63 | ActuationCoefficientAllSet | AllSet(buffer) | 同上 |
| 0x64 | ActuationCoefficientHashGet | HashGet | |
| 0x65〜0x69 | ActuationCoefficientApply / Load / Save / DefaultLoad / DefaultSave | 各 request | |

### 3.7 Actuation distance

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0x6a | ActuationDistanceGet | Get | 要求 `[id, row, column]` → 応答 `[id, row, column, int16LE value]` |
| 0x6b | ActuationDistanceAllGet | AllGet(buffer) | 108×2 = 216 byte、int16LE |
| 0x6c | ActuationDistanceADCGet | Get | 0x6a と同形 (int16LE) |
| 0x6d | ActuationDistanceADCAllGet | AllGet(buffer) | 108×2 = 216 byte |

### 3.8 Keymap [profile]

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0x6e | KeymapGet | Get | 要求 `[id, profile, layer, row, column]` → 応答 `[id, profile, layer, row, column, keyCode u16LE]` |
| 0x6f | KeymapSet | Set | 要求 `[id, profile, layer, row, column, keyCode u16LE]` |
| 0x70 | KeymapAllGet | AllGet(buffer) | 1 profile×layer = 108×2 = 216 byte。offset = profile×layer.count×216 + layer×216 |
| 0x71 | KeymapAllSet | AllSet(buffer) | 同上 |
| 0x72 | KeymapHashGet | HashGet | |
| 0x73 | KeymapApply | Apply | |
| 0x74 | KeymapLoad | Load | `[id]` |
| 0x75 | KeymapSave | Save | `[id]` |
| 0x76 | KeymapDefaultLoad | DefaultLoad | `[id]` |
| 0x77 | KeymapDefaultSave | DefaultSave | `[id]` |

**Buttonmap (アケコン向け別系統)**: Buttonmap 系コマンドは上記 Keymap と同じ ID 帯 (0x6e〜0x77) を流用する。

- ButtonmapGet: 要求 `[0x6e, row, column]` → 応答 keyCodes u16LE × 5 (1 キー最大 5 コード)
- ButtonmapSet: 要求 `[0x6f, row, column, keyCode u16LE × 5]`
- ButtonmapLoad / Save / DefaultLoad / DefaultSave: `[id, profile]` を送る (プロファイル指定が必要)
- ButtonmapAllGet / AllSet: offset は常に 0、サイズ = 108×2×5 = 1080 byte

### 3.9 Macro [profile]

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0x78 | MacroGet | Get(buffer) | サイズ = 256×16 = 4096 byte |
| 0x79 | MacroSet | Set(buffer) | 同上 |
| 0x7a | MacroHashGet | HashGet | |
| 0x7b | MacroApply | Apply | |
| 0x7c | MacroLoad | Load | 要求 `[id, profile]` → 応答 `[id, profile]` |
| 0x7d | MacroSave | Save | 同上 |
| 0x7e | MacroDefaultLoad | DefaultLoad | `[id, profile]` |
| 0x7f | MacroDefaultSave | DefaultSave | `[id, profile]` |

### 3.10 RGB lighting [profile]

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0x80 | RGBLightingGet | Get(buffer) | 1 profile = 512 byte。offset = profile×512。params[28] = lighting mode |
| 0x81 | RGBLightingSet | Set(buffer) | 同上 |
| 0x82 | RGBLightingHashGet | HashGet | |
| 0x83 | RGBLightingApply | Apply | |
| 0x84 | RGBLightingLoad | Load | |
| 0x85 | RGBLightingSave | Save | profile 引数なし。他 profile の params は変化しない (観測、§6.2) |
| 0x86 | RGBLightingDefaultLoad | DefaultLoad | |
| 0x87 | RGBLightingDefaultSave | DefaultSave | |

512 byte params のレイアウト: byte 0-3 mem1 / 4-7 mem2 / 8-11 mem3 / 12-15 keyDisable / 16-19 capsLock (各インジケータ RGBA)、byte 20-27 予約 (0)、**byte 28 = mode**、byte 29 以降は mode 依存。

書き込みは Set (0x81) → Apply (0x83) → Save (0x85) の順 (§6.2)。Set は渡した長さ分のみを書く。

### 3.11 User info

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0x88 | UserInfoCustomerGet | Get(buffer) | 420 byte = uuid 36 byte + name 384 byte (UTF-8, NUL 終端) |
| 0x89 | UserInfoCustomerSet | Set(buffer) | 同上 |
| 0x8a | UserInfoUserGet | Get(buffer) | 420 byte (同レイアウト) |
| 0x8b | UserInfoUserSet | Set(buffer) | 同上 |
| 0x8c | UserInfoHashGet | HashGet | |
| 0x8d | UserInfoApply | Apply | |
| 0x8e | UserInfoLoad | Load | |
| 0x8f | UserInfoSave | Save | |

### 3.12 Profile info

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0x90 | ProfileInfoGet | Get(buffer) | 1 profile = 420 byte。offset = profile×420 |
| 0x91 | ProfileInfoSet | Set(buffer) | 同上 |
| 0x92 | ProfileInfoHashGet | HashGet | |
| 0x93 | ProfileInfoApply | Apply | |
| 0x94 | ProfileInfoLoad | Load | |
| 0x95 | ProfileInfoSave | Save | |

### 3.13 Temperature

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0x96 | TemperatureAllGet | request | **deprecated** (温度計 6 個固定)。応答は byte 1 から float32LE × 6。実機未検証 |
| 0x97 | TemperatureADCAllGet | request | **deprecated**。応答は byte 1 から u16LE × 6。実機未検証 |

温度は現在のところ、`ADCAllGet` (0x35) の offset = keySwitch.count×2 (216) / size = temperature.count×2 (12) で取得した生 ADC 値 (u16LE × 6) を、ホスト側でサーミスタ換算して ℃ にする。

- 換算パラメータ (観測): サーミスタは NCP15WF104F03RC 相当 (B = 4161 K / R0 = 100 kΩ)、分圧 68 kΩ、励磁 3300 mV。
- ADC 参照電圧は機種・リビジョンで異なる (§5): 2048 mV (80 シリーズ hw100/hw101) / 2900 mV (他)。換算に使う値を間違えると誤差になる。
- デバイス側は生値のみを返し、換算は行わない (物理的な温度校正値ではない。校正温度系のコマンド §3.21 / §3.24 とは別物)。

### 3.14 RGB LED config

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0x98 | RGBLEDConfigGet | Get(buffer) | 128 byte。byte0 = enable (0/1)、byte1 = brightness |
| 0x99 | RGBLEDConfigSet | Set(buffer) | 2 byte (enable, brightness) |
| 0x9a | RGBLEDConfigHashGet | HashGet | |
| 0x9b | RGBLEDConfigApply | Apply | |
| 0x9c | RGBLEDConfigLoad | Load | |
| 0x9d | RGBLEDConfigSave | Save | |
| 0x9e | RGBLEDConfigDefaultLoad | DefaultLoad | |
| 0x9f | RGBLEDConfigDefaultSave | DefaultSave | |

### 3.15 Profile select

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0xa0 | ProfileSelectGet | Get(buffer) | 1 byte (現在の profile) |
| 0xa1 | ProfileSelectSet | Set(buffer) | 1 byte |
| 0xa2 | ProfileSelectHashGet | HashGet | |
| 0xa3 | ProfileSelectApply | Apply | |
| 0xa4 | ProfileSelectLoad | Load | |
| 0xa5 | ProfileSelectSave | Save | |

### 3.16 Alert config

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0xa6 | AlertConfigGet | Get(buffer) | 128 byte。u16LE × 4: key.maxAD / key.minAD / temperature.maxAD / temperature.minAD |
| 0xa7 | AlertConfigSet | Set(buffer) | 8 byte (同順) |
| 0xa8 | AlertConfigHashGet | HashGet | |
| 0xa9 | AlertConfigApply | Apply | |
| 0xaa | AlertConfigLoad | Load | |
| 0xab | AlertConfigSave | Save | |
| 0xac | AlertConfigDefaultLoad | DefaultLoad | |
| 0xad | AlertConfigDefaultSave | DefaultSave | |

### 3.17 Logging config

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0xae | LoggingConfigGet | Get(buffer) | 128 byte。byte0 = enable、byte1 = output (0 = hid, 1 = uart, それ以外 = 未定義) |
| 0xaf | LoggingConfigSet | Set(buffer) | 2 byte |
| 0xb0 | LoggingConfigHashGet | HashGet | |
| 0xb1 | LoggingConfigApply | Apply | |
| 0xb2 | LoggingConfigLoad | Load | |
| 0xb3 | LoggingConfigSave | Save | |
| 0xb4 | LoggingConfigDefaultLoad | DefaultLoad | |
| 0xb5 | LoggingConfigDefaultSave | DefaultSave | |

### 3.18 Actuation type [profile]

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0xb6 | ActuationTypeGet | Get | 要求 `[id, profile, row, column]` → 応答 `[id, profile, row, column, type]` (0 = Normal, 1 = MotionHack) |
| 0xb7 | ActuationTypeSet | Set | 要求 `[id, profile, row, column, type]` |
| 0xb8 | ActuationTypeAllGet | AllGet(buffer) | 1 profile = 108 byte (1 byte/キー)。offset = profile×108 |
| 0xb9 | ActuationTypeAllSet | AllSet(buffer) | 同上 |
| 0xba | ActuationTypeHashGet | HashGet | |
| 0xbb | ActuationTypeApply | Apply | |
| 0xbc | ActuationTypeLoad | Load | |
| 0xbd | ActuationTypeSave | Save | |
| 0xbe | ActuationTypeDefaultLoad | DefaultLoad | |
| 0xbf | ActuationTypeDefaultSave | DefaultSave | |

### 3.19 Actuation motion hack [profile]

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0xc0 | ActuationMotionHackGet | Get | 要求 `[id, profile, row, column]` → 応答 `[id, profile, row, column, range u16LE, strokeOn u16LE, strokeOff u16LE, beyondMode(0/1)]` |
| 0xc1 | ActuationMotionHackSet | Set | 要求 `[id, profile, row, column, range u16LE, strokeOn u16LE, strokeOff u16LE, beyondMode(0/1)]` (11 byte) |
| 0xc2 | ActuationMotionHackAllGet | AllGet(buffer) | 1 profile = 108×7 = 756 byte。offset = profile×756 |
| 0xc3 | ActuationMotionHackAllSet | AllSet(buffer) | 同上 |
| 0xc4 | ActuationMotionHackHashGet | HashGet | |
| 0xc5 | ActuationMotionHackApply | Apply | |
| 0xc6 | ActuationMotionHackLoad | Load | |
| 0xc7 | ActuationMotionHackSave | Save | |
| 0xc8 | ActuationMotionHackDefaultLoad | DefaultLoad | |
| 0xc9 | ActuationMotionHackDefaultSave | DefaultSave | |

### 3.20 Actuation distance with switch state

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0xca | ActuationDistanceWithSwitchStateGet | Get | 要求 `[id, row, column]` → 応答 2 byte。bit14 (上位 byte の bit6) = switch state、残る 14 bit = signed distance |
| 0xcb | ActuationDistanceWithSwitchStateAllGet | AllGet(buffer) | 108×2 = 216 byte |
| 0xf1 | ActuationDistanceWithLogicalSwitchStateAllGet | AllGet(buffer) | 108×2 = 216 byte (0xcb と対。ID 定義上は離れた位置にある) |

### 3.21 Actuation config

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0xcc | ActuationConfigGet | Get(buffer) | 128 byte。byte 0-3 = calibrationTemperature (float32LE) |
| 0xcd | ActuationConfigSet | Set(buffer) | 4 byte (float32LE) |
| 0xce | ActuationConfigHashGet | HashGet | |
| 0xcf | ActuationConfigApply | Apply | |
| 0xd0 | ActuationConfigLoad | Load | |
| 0xd1 | ActuationConfigSave | Save | |
| 0xd2 | ActuationConfigDefaultLoad | DefaultLoad | |
| 0xd3 | ActuationConfigDefaultSave | DefaultSave | |

### 3.22 Actuation user config (protocol v2 以降)

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0xd4 | ActuationUserConfigGet | Get(buffer) | 128 byte。byte 0-1 = holdTimeOn u16LE [msec]、byte 2-3 = holdTimeOff u16LE [msec] |
| 0xd5 | ActuationUserConfigSet | Set(buffer) | 4 byte |
| 0xd6 | ActuationUserConfigHashGet | HashGet | |
| 0xd7 | ActuationUserConfigApply | Apply | |
| 0xd8 | ActuationUserConfigLoad | Load | |
| 0xd9 | ActuationUserConfigSave | Save | |
| 0xda | ActuationUserConfigDefaultLoad | DefaultLoad | |
| 0xdb | ActuationUserConfigDefaultSave | DefaultSave | |

protocolVersion < 2 のデバイスでは、この系統は使用できない (ホスト側で protocolVersion を確認して分岐する)。

### 3.23 Actuation SOCD [profile]

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0xdc | ActuationSOCDGet | Get | 要求 `[id, profile, index]` → 応答 `[id, profile, index, mode, key1Index, key2Index]` |
| 0xdd | ActuationSOCDSet | Set | 要求 `[id, profile, index, mode, key1Index, key2Index]` |
| 0xde | ActuationSOCDAllGet | AllGet(buffer) | 1 profile = 2 エントリ × 3 byte = 6 byte。offset = profile×6 |
| 0xdf | ActuationSOCDAllSet | AllSet(buffer) | 同上 |
| 0xe0 | ActuationSOCDHashGet | HashGet | |
| 0xe1 | ActuationSOCDApply | Apply | |
| 0xe2 | ActuationSOCDLoad | Load | |
| 0xe3 | ActuationSOCDSave | Save | |
| 0xe4 | ActuationSOCDDefaultLoad | DefaultLoad | |
| 0xe5 | ActuationSOCDDefaultSave | DefaultSave | |

### 3.24 Actuation calibration temperature

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0xe6 | ActuationCalibrationTemperatureGet | Get | 要求 `[id, row, column]` → 応答 `[id, row, column, press float32LE, release float32LE]` [℃] |
| 0xe7 | ActuationCalibrationTemperatureSet | Set | 要求 `[id, row, column, press float32LE, release float32LE]` (11 byte) |
| 0xe8 | ActuationCalibrationTemperatureAllGet | AllGet(buffer) | 108×8 = 864 byte |
| 0xe9 | ActuationCalibrationTemperatureAllSet | AllSet(buffer) | 同上 |
| 0xea | ActuationCalibrationTemperatureHashGet | HashGet | |
| 0xeb | ActuationCalibrationTemperatureApply | Apply | |
| 0xec | ActuationCalibrationTemperatureLoad | Load | |
| 0xed | ActuationCalibrationTemperatureSave | Save | |
| 0xee | (欠番) | — | コマンド定義に 0xee は存在しない |
| 0xef | ActuationCalibrationTemperatureDefaultLoad | DefaultLoad | |
| 0xf0 | ActuationCalibrationTemperatureDefaultSave | DefaultSave | |

### 3.25 予約・エラー

| ID | 名前 | 種別 | 内容・特記事項 |
|---|---|---|---|
| 0xfe | Error | — | 応答専用。`[0xfe, code]` |
| 0xff | Unhandled | — | 応答専用 (未知コマンド)。`[0xff]` |

## 4. データ構造・列挙

### 4.1 Profile

| 名前 | 値 |
|---|---|
| Base | 0 |
| Temporary | 1 |
| Memory1 | 2 |
| Memory2 | 3 |
| Memory3 | 4 |

- profile は 5 つ (Base / Temporary / Memory1-3)。
- profile 別データの AllGet / AllSet は `offset = profile × ブロックサイズ` で指定する (ブロックサイズはコマンドごとに異なる。§3 参照)。呼び出し側は 5 profile 分を逐次実行する。

### 4.2 Lighting

| 名前 | 値 | 意味 |
|---|---|---|
| MONO | 0 | 単色 |
| WAVE | 1 | 波 |
| WARP | 2 | ワープ |
| CHASE | 3 | チェース |
| BREATHE | 4 | ブレーズ |
| MANUAL | 5 | 自由設定 |
| REACTIVE | 6 | 反応 |

モードは 512 byte params の byte 28。観測値 (profile 0) = 6 (REACTIVE)。

### 4.3 KeymapLayer / ActuationType / SOCD

- KeymapLayer: 0 = Normal / 1 = Disable / 2 = Fn
- ActuationType: 0 = Normal / 1 = MotionHack
- SOCD: 0 = OFF / 1 = Neutral / 2 = 先入力優先 / 3 = 後入力優先 / 4 = Key1 優先 / 5 = Key2 優先

### 4.4 主要なデータ型

エンコーディング:

- マルチバイトの整数・浮動小数はすべて **little endian** (u16LE / int16LE / float32LE)。
- 文字列は **UTF-8・NUL 終端**。
- ビットフィールドは個別規定 (例: switch state は bit14。§3.20)。
- HashGet の 16 byte は、ホスト側では hex 32 桁文字列として扱うのが便宜。

| 型 | フィールド (単位) |
|---|---|
| KeyboardInfo | deviceName / modelName / serialNumber (各 32 byte まで) |
| ActuationPoint | pointOn / pointOff [µm] |
| ActuationRange | pressValue / releaseValue (ADC 値) |
| ActuationCoefficient | float × 4 (3 次関数の係数) |
| ActuationMotionHack | range (有効範囲) / strokeOn / strokeOff / beyondMode |
| ActuationDistanceWithSwitchState | distance [µm] (signed 14bit) / switchState |
| ActuationConfig | calibrationTemperature |
| ActuationUserConfig | holdTimeOn / holdTimeOff [msec] |
| ActuationSOCD | mode / key1Index / key2Index |
| ActuationCalibrationTemperature | press / release [℃] |
| CustomerInfo / UserInfo / ProfileInfo | uuid 36 byte / name 384 byte |
| RGBLEDConfig | enable / brightness |
| AlertConfig | key{maxAD, minAD} / temperature{maxAD, minAD} |
| LoggingConfig | enable / output (hid / uart) |

## 5. モデル一覧 (deviceProperty)

機種ごとの構成値は deviceProperty として定義されている。解決は USB 情報 (VID / PID / usagePage / usage / bcdDevice) と modelName の完全一致を優先し、見つからない場合は USB 情報のみで検索する (逆順 = 新しいハードウェアリビジョンを優先)。

| シリーズ | modelName | productId | bcdDevice | キー配列 | キー数 | 温度 ch | ADC 数 |
|---|---|---|---|---|---|---|---|
| ZK1 80US | KB007-DGBK | 0x0003 | 0x0100 | 6×18 | 108 | 6 | 114 |
| ZK1 80US | KB011-DGBK | 0x0003 | 0x0101 | 6×18 | 108 | 6 | 114 |
| ZK1 80US | KB011-DGBK | 0x0003 | 0x0102 | 6×18 | 108 | 6 | 114 |
| ZK1 80JIS | KB006-DGBK | 0x0002 | 0x0100 | 6×18 | 108 | 6 | 114 |
| ZK1 80JIS | KB010-DGBK | 0x0002 | 0x0101 | 6×18 | 108 | 6 | 114 |
| ZK1 80JIS | KB010-DGBK | 0x0002 | 0x0102 | 6×18 | 108 | 6 | 114 |
| ZK1 60JIS | KB008-DGBK | 0x0005 | 0x0100 | 5×15 | 75 | 6 | 81 |
| ZK1 60US | KB009-DGBK | 0x0006 | 0x0100 | 5×15 | 75 | 6 | 81 |
| 19Key | AC001-BKBK | 0x000b | 0x0100 | 3×19 | 57 | 19 | 76 |
| 19Key Module | AC002-BKBK | 0x0004 | 0x0100 | 3×19 | 57 | 19 | 76 |
| 19Key Module | AC002-BKBK | 0x000b | 0x0100 | 3×19 | 57 | 19 | 76 |

- 全機種で layer.count = 3、profile.count = 5。
- 19Key / 19Key Module はアケコン (ZENAIM ARCADE CONTROLLER) の系統。19Key Module には productId が 0x0004 と 0x000b の 2 エントリがあり、0x000b は 19Key と共通のため、区別には modelName の完全一致が必要。
- 観測個体は ZK1 80US / `KB007-DGBK` / bcdDevice 0x0100。

主要値 (deviceProperty 抜粋):

| 項目 | 80 シリーズ hw100/hw101 | 80 シリーズ hw102 | 60 シリーズ | 19Key 系 |
|---|---|---|---|---|
| adc.powerVoltage | 3300 mV | 3300 mV | 3300 mV | 3300 mV |
| adc.referenceVoltage | 2048 mV | 2900 mV | 2900 mV | 2900 mV |
| adc.resolution | 12 bit (step 4096) | 同左 | 同左 | 同左 |
| actuation.distance | 1800 | 1800 | 1800 | 650 |
| initialValue.normal (pointOn / pointOff) | 1500 / 1300 [µm] | 同左 | 同左 | 400 / 100 |
| initialValue.motionHack | range 500 / strokeOn 1000 / strokeOff 200 / beyondMode false | 同左 | 同左 | range 100 / strokeOn 200 / strokeOff 300 |

観測個体 (ZK1 80US hw100) の値: layer.count = 3 / profile.count = 5 / keySwitch 6×18 = 108 / temperature.count = 6 / adc.count = 114 / adc.resolution 12 bit (step 4096) / actuation.distance = 1800 / initialValue.normal pointOn = 1500, pointOff = 1300。

## 6. 書き込みシーケンス

### 6.1 ActuationPoint (AP、プロファイル別)

書き込みは 3 コマンドで行う:

1. **AllSet** (0x4b、offset = profile×432、108 点 × 4 byte) — 応答は成功するが、**この時点では AllGet / HashGet に反映されない** (ステージングのみ)。
2. **Apply** (0x4d) — **直後から AllGet / HashGet に反映される**。
3. **Save** (0x4f) — **再接続後も値が残る** (永続化)。

- 単点の Set (0x49) は AllGet / HashGet 系とは別の経路に書かれるらしく、AllGet 側には反映されない (観測)。全点書き込みには AllSet 系を使う。
- 検証 (verify) は **Apply の後**に AllGet で全 108 点を読み、書き込んだ配列と全点照合する (AllSet 直後は反映されないため、verify は Apply 後にのみ意味がある)。

### 6.2 RGB lighting / RGBLEDConfig

- ライティング: **Set (0x81) → Apply (0x83) → Save (0x85)** の順で書く。
- Set は渡した長さ分のみを書く (trimmed 出力)。no-op の 512 byte 書戻し / 短い書込 / baseline への復元、いずれも読み戻しで一致することを確認済み (観測)。
- **Save (0x85) は profile 引数を持たないが、他 profile の params は変化しない** (観測: 5 profile すべてを書込 / 復元の前後で比較して params 一致)。
- LED 全体設定も同型: **Set (0x99) → Apply (0x9b) → Save (0x9d)** (payload は enable / brightness の 2 byte)。

### 6.3 書き込みの一般則

- すべての書き込みは「**バックアップ → 書き込み → 読み戻し照合 → (不一致時) 復元**」の順で行う。
- 読み戻しは GetBuffer 系 (AllGet) で行い、書き込んだ値と照合する。AP 系は Apply 後にのみ反映される点に注意 (§6.1)。
- Load / DefaultLoad / DefaultSave 系の実機挙動は未検証 (§7)。

## 7. 未確定事項

- IF3 (usagePage 0xFF31 / usage 0x74) の用途は未調査。
- TemperatureAllGet (0x96) / TemperatureADCAllGet (0x97) は deprecated 扱いで、実機未検証。
- HashGet のハッシュアルゴリズム (16 byte の生成方法) は不明。
- SetBuffer の payload 27 byte (理論上限) を実際に送った場合の挙動は未検証 (32 byte 目の CRC 上書き問題があるため、26 byte チャンクを維持するのが安全)。
- 書き込み系の検証状況: AP (AllSet / Apply / Save) と RGB lighting / RGBLEDConfig (Set / Apply / Save) は実機検証済み。Load / DefaultLoad / DefaultSave 系、および Keymap / Macro / ProfileInfo / UserInfo 等の書込は未検証。
- ActuationRangePressSet / ReleaseSet (0x5c / 0x5e) が「現在値の取得」なのか「設定」なのかは未検証 (payload が row/column のみで、応答に値が入る)。
- AlertConfig / LoggingConfig / UserInfo 系の実機挙動は未検証 (RGBLEDConfig の書込みは §6.2 で検証済み)。
- KeyboardInfoSet (0x41) / EEPROM 系 (0x36〜0x38) の実機挙動は未確認。

## ライセンス

MIT License — 詳細はリポジトリの [LICENSE](../LICENSE) を参照。
