/**
 * Tiny ja/en message catalog with DOM binding helpers.
 *
 * Static markup uses `data-i18n="key"` (textContent), `data-i18n-html="key"`
 * (innerHTML) and `data-i18n-<attr>="key"` for attributes. JavaScript code calls
 * `t('key')` directly. Switching the language re-applies both by dispatching a
 * `langchange` event on `document`.
 */

export type Lang = 'ja' | 'en';

const messages: Record<Lang, Record<string, string>> = {
  ja: {
    'app.name': 'ZENAIM KEYBOARD 非公式ユーティリティ',
    'app.tagline': '非公式・非提携のコミュニティ製ツール',
    'app.unofficial': '非公式',
    'app.disclaimer':
      '本サイトは非公式であり、キーボードの製造元・関連会社とは無関係です。製品名・商標は各権利者に帰属し、記述目的でのみ使用しています。',
    'app.langLabel': '言語',
    'app.lang.ja': '日本語',
    'app.lang.en': 'English',

    'nav.home': 'ホーム',
    'nav.config': 'コンフィギュレータ',
    'nav.docs': 'プロトコル仕様',

    'index.hero.title': 'ZENAIM KEYBOARD をブラウザから設定',
    'index.hero.lead':
      'WebHID に対応したブラウザで、キーボードを USB 接続するだけで設定を読み書きできます。インストールは不要です。',
    'index.cta.connect': 'キーボードに接続',
    'index.cta.open': 'コンフィギュレータを開く',
    'index.cta.demo': 'デモモードで試す',
    'index.hero.note': '接続情報はブラウザ内だけで扱い、どこかへ送信しません。',
    'index.connect.title': '接続',
    'index.connect.body':
      '下のボタンを押すとデバイス選択ダイアログが開きます。「ZENAIM KEYBOARD」を選んでください。',
    'index.connect.hint':
      '接続できたら「コンフィギュレータを開く」に進みます。許可したデバイスは次回から再接続できます。',
    'index.features.title': 'できること',
    'index.feature.ap.title': 'アクチュエーションポイント',
    'index.feature.ap.body':
      'キーごとの押下・解放しきい値 (µm) を読み書きします。実機で書き込み手順を検証済みの機能です。',
    'index.feature.light.title': 'ライティング',
    'index.feature.light.body':
      'LED の有効/明るさ、ライティングモードと各インジケータ色を設定します。',
    'index.feature.backup.title': 'バックアップ',
    'index.feature.backup.body':
      '現在の設定を JSON として保存し、あとから復元できます。書き込み前の控えにどうぞ。',
    'index.requirements.title': '動作要件',
    'index.requirements.browser': 'ブラウザ: WebHID 対応の Chromium 系 (Chrome / Edge / Opera)',
    'index.requirements.https': 'コンテキスト: HTTPS または localhost',
    'index.requirements.os': 'OS: Windows / macOS / Linux',
    'index.scope.title': '対応範囲と注意',
    'index.scope.body':
      '設定の書き込みは、プロトコル仕様で実機検証済みとされているアクチュエーションポイントとライティングに限定しています。未検証のコマンドは実装していません。書き込み前に必ずバックアップを取得してください。',
    'index.docs.title': 'ドキュメント',
    'index.docs.body': 'プロトコル仕様とハードウェアノートをリポジトリで公開しています。',
    'index.docs.link': 'docs/protocol.md を読む',

    'config.title': 'コンフィギュレータ',
    'config.eyebrow': 'ZENAIM · CONTROL CENTER',
    'config.lead': 'キーボードの設定を、ブラウザからシンプルに。',
    'config.local': 'データはブラウザ内で処理',
    'tab.connect': '接続',
    'tab.actuation': 'アクチュエーション',
    'tab.lighting': 'ライティング',
    'tab.backup': 'バックアップ',

    'connect.request': 'デバイスを選択して接続',
    'connect.reconnect': '前回のデバイスに再接続',
    'connect.disconnect': '切断',
    'connect.demo': 'デモモードで試す',
    'connect.demo.hint': '実機なしで UI と書き込み手順を試せます (メモリ上の模擬デバイス)。',
    'connect.unsupported':
      'このブラウザは WebHID に対応していません。Chrome / Edge / Opera のデスクトップ版をご利用ください。',
    'connect.status': '状態',
    'state.disconnected': '未接続',
    'state.connecting': '接続中…',
    'state.connected': '接続済み',
    'state.demo': 'デモモード',
    'state.error': 'エラー',
    'connect.selecting': 'デバイスを選択してください…',
    'connect.cancelled': 'デバイス選択がキャンセルされました。',
    'connect.needGesture': '接続ボタンから操作を開始してください。',

    'device.title': 'デバイス情報',
    'device.name': 'デバイス名',
    'device.model': 'モデル',
    'device.serial': 'シリアル',
    'device.firmware': 'ファームウェア',
    'device.protocol': 'プロトコル',
    'device.transport': '接続方式',
    'device.usb': 'USB',
    'device.series': 'シリーズ',
    'device.revision': 'リビジョン',
    'device.keys': 'キー数',
    'device.matrix': 'マトリクス',
    'device.temperature': '温度 ch',
    'device.adc': 'ADC',
    'device.reference': 'ADC 参照電圧',
    'device.travel': 'ストローク',
    'device.unknown': '不明',
    'device.ambiguous':
      'このブラウザでは bcdDevice を取得できないため、ハードウェアリビジョンを一意に特定できません。新しいリビジョンとして扱っています。ADC 換算値の誤差になり得ます。',

    'actuation.title': 'アクチュエーションポイント',
    'actuation.eyebrow': 'KEY RESPONSE',
    'actuation.body':
      'キーごとの押下しきい値 (pointOn)・解放しきい値 (pointOff) を µm 単位で設定します。',
    'actuation.positionHint': 'キーを選択して、押下・解放の深さを調整',
    'actuation.keyCount': '{count} KEYS',
    'actuation.mappingNote': 'ZK1 80US ではキー名、他のシリーズではマトリクス位置 (#NN) を表示します。キー割り当ての変更（リマップ）には対応していません。',
    'actuation.editor': 'KEY SETTINGS',
    'actuation.position': 'マトリクス R{row} · C{column}',
    'actuation.noKeyName': 'キー名なし',
    'actuation.cellTitle': 'キー #{index} · R{row} C{column} · 押下 {value} µm',
    'actuation.cellTitleNamed': '{name} · R{row} C{column} · 押下 {value} µm',
    'actuation.enable': 'アクチュエーションを有効にする',
    'actuation.enable.hint': '無効にするとキー入力が止まります。',
    'actuation.profile': 'プロファイル',
    'actuation.read': '読み込む',
    'actuation.notLoaded': 'まだ読み込んでいません。「読み込む」を押してください。',
    'actuation.grid': 'キー',
    'actuation.selected': '選択中のキー',
    'actuation.none': 'キーを選択してください。',
    'actuation.pointOn': '押下しきい値 (pointOn)',
    'actuation.pointOff': '解放しきい値 (pointOff)',
    'actuation.applyAll': 'この値を全キーへ適用',
    'actuation.defaults': '既定値に戻す',
    'actuation.write': '書き込み (AllSet → Apply → Save)',
    'actuation.loading': '読み込み中…',
    'actuation.writing': '書き込み中…',
    'actuation.writingProgress': '{percent}% ({done}/{total} キー)',
    'actuation.confirm':
      'プロファイル「{profile}」の全 {count} キーへアクチュエーションポイントを書き込みます。書き込み後に読み戻して照合します。よろしいですか？',
    'actuation.verify.ok': '書き込みと読み戻し照合に成功しました。',
    'actuation.verify.fail': '読み戻しが一致しませんでした (不一致 {count} 箇所)。復元を検討してください。',
    'actuation.unit': 'µm',
    'actuation.hint': '色は押下しきい値の大きさを示します (青 = 浅い / 赤 = 深い)。',
    'actuation.dirty': '未書き込みの変更があります。',
    'actuation.live.start': 'ライブモニター開始',
    'actuation.live.stop': 'ライブモニター停止',
    'actuation.live.rate': '{hz} Hz',
    'actuation.live.hint': '押鍵に合わせて押下量を表示します (読み取り専用、書き込み中は一時停止)。',
    'actuation.live.stoppedError':
      '読み取りに {count} 回続けて失敗したため、ライブモニターを停止しました: {message}',
    'actuation.live.depth': '{value} µm',
    'actuation.live.markerOn': '押下しきい値',
    'actuation.live.markerOff': '解放しきい値',

    'lighting.title': 'ライティング',
    'lighting.led': 'LED 全体設定',
    'lighting.led.enable': 'LED を有効にする',
    'lighting.brightness': '明るさ',
    'lighting.profile': 'プロファイル',
    'lighting.read': '読み込む',
    'lighting.notLoaded': 'まだ読み込んでいません。「読み込む」を押してください。',
    'lighting.mode': 'ライティングモード',
    'lighting.modeNote': 'モード以外のパラメータは読み込んだ値をそのまま保持して書き戻します。',
    'lighting.indicators': 'インジケータ色',
    'lighting.indicator.mem1': 'Mem1',
    'lighting.indicator.mem2': 'Mem2',
    'lighting.indicator.mem3': 'Mem3',
    'lighting.indicator.keyDisable': 'キー無効',
    'lighting.indicator.capsLock': 'Caps Lock',
    'lighting.alpha': '不透明度',
    'lighting.ledWrite': 'LED 設定を書き込み (Set → Apply → Save)',
    'lighting.write': 'ライティングを書き込み (Set → Apply → Save)',
    'lighting.writing': '書き込み中…',
    'lighting.confirmLed': 'LED の有効/明るさを書き込み、読み戻して照合します。よろしいですか？',
    'lighting.confirm':
      'プロファイル「{profile}」のライティングパラメータを書き込み、読み戻して照合します。よろしいですか？',
    'lighting.verify.ok': '書き込みと読み戻し照合に成功しました。',
    'lighting.verify.fail': '読み戻しが一致しませんでした (不一致 {count} 箇所)。',

    'backup.title': 'バックアップと復元',
    'backup.body':
      '現在の設定 (アクチュエーションポイント全プロファイル / ライティング全プロファイル / LED 設定 / 有効状態) を JSON で保存します。',
    'backup.download': 'バックアップをダウンロード',
    'backup.restore': 'バックアップから復元',
    'backup.file': 'バックアップ JSON を選択',
    'backup.confirm':
      'バックアップの内容をデバイスへ書き戻します。現在の設定は上書きされます。よろしいですか？',
    'backup.busy': 'バックアップを作成中…',
    'backup.restoring': '復元中…',
    'backup.done': '完了しました。',
    'backup.error': 'バックアップファイルを読み込めませんでした。',
    'backup.mismatch': 'バックアップのモデル「{backup}」と接続中のモデル「{current}」が異なります。',
    'backup.noDevice': '先にデバイスへ接続してください。',

    'common.busy': '処理中…',
    'common.ok': '成功',
    'common.warn': '注意',
    'common.error': 'エラー',
    'common.selected': '選択中',
  },

  en: {
    'app.name': 'ZENAIM KEYBOARD unofficial utilities',
    'app.tagline': 'Unofficial, community-made tooling',
    'app.unofficial': 'Unofficial',
    'app.disclaimer':
      'This site is unofficial and is not affiliated with, endorsed by, or supported by the keyboard vendor. Product names and trademarks belong to their respective owners.',
    'app.langLabel': 'Language',
    'app.lang.ja': '日本語',
    'app.lang.en': 'English',

    'nav.home': 'Home',
    'nav.config': 'Configurator',
    'nav.docs': 'Protocol spec',

    'index.hero.title': 'Configure the ZENAIM KEYBOARD from your browser',
    'index.hero.lead':
      'With a WebHID-capable browser you can read and write settings over USB. No installation required.',
    'index.cta.connect': 'Connect keyboard',
    'index.cta.open': 'Open the configurator',
    'index.cta.demo': 'Try demo mode',
    'index.hero.note': 'Everything stays in your browser; nothing is uploaded.',
    'index.connect.title': 'Connect',
    'index.connect.body':
      'Press the button below and pick “ZENAIM KEYBOARD” in the device chooser.',
    'index.connect.hint':
      'Once connected, continue to the configurator. Granted devices can be reconnected later.',
    'index.features.title': 'What you can do',
    'index.feature.ap.title': 'Actuation points',
    'index.feature.ap.body':
      'Read and write the per-key press/release thresholds (µm). This write path is verified on hardware.',
    'index.feature.light.title': 'Lighting',
    'index.feature.light.body':
      'Set the LED on/off state, brightness, lighting mode and indicator colours.',
    'index.feature.backup.title': 'Backup',
    'index.feature.backup.body':
      'Export the current settings as JSON and restore them later — handy as a safety net.',
    'index.requirements.title': 'Requirements',
    'index.requirements.browser': 'Browser: a WebHID-capable Chromium browser (Chrome / Edge / Opera)',
    'index.requirements.https': 'Context: HTTPS or localhost',
    'index.requirements.os': 'OS: Windows / macOS / Linux',
    'index.scope.title': 'Scope and caveats',
    'index.scope.body':
      'Writes are limited to the pathways the protocol spec marks as verified on hardware: actuation points and lighting. Unverified commands are deliberately not implemented. Always take a backup before writing.',
    'index.docs.title': 'Documentation',
    'index.docs.body': 'The protocol spec and hardware notes live in the repository.',
    'index.docs.link': 'Read docs/protocol.md',

    'config.title': 'Configurator',
    'config.eyebrow': 'ZENAIM · CONTROL CENTER',
    'config.lead': 'Fine-tune your keyboard, right from the browser.',
    'config.local': 'Processed locally in your browser',
    'tab.connect': 'Connection',
    'tab.actuation': 'Actuation',
    'tab.lighting': 'Lighting',
    'tab.backup': 'Backup',

    'connect.request': 'Select a device',
    'connect.reconnect': 'Reconnect previous device',
    'connect.disconnect': 'Disconnect',
    'connect.demo': 'Try demo mode',
    'connect.demo.hint': 'Exercise the UI and write sequences without hardware (in-memory device).',
    'connect.unsupported':
      'This browser does not support WebHID. Please use desktop Chrome / Edge / Opera.',
    'connect.status': 'Status',
    'state.disconnected': 'Disconnected',
    'state.connecting': 'Connecting…',
    'state.connected': 'Connected',
    'state.demo': 'Demo mode',
    'state.error': 'Error',
    'connect.selecting': 'Choose a device…',
    'connect.cancelled': 'Device selection was cancelled.',
    'connect.needGesture': 'Start from the connect button.',

    'device.title': 'Device information',
    'device.name': 'Device name',
    'device.model': 'Model',
    'device.serial': 'Serial',
    'device.firmware': 'Firmware',
    'device.protocol': 'Protocol',
    'device.transport': 'Transport',
    'device.usb': 'USB',
    'device.series': 'Series',
    'device.revision': 'Revision',
    'device.keys': 'Keys',
    'device.matrix': 'Matrix',
    'device.temperature': 'Temp ch',
    'device.adc': 'ADC',
    'device.reference': 'ADC reference',
    'device.travel': 'Travel',
    'device.unknown': 'unknown',
    'device.ambiguous':
      'This browser cannot read bcdDevice, so the hardware revision cannot be pinned down. The newest revision is assumed, which may bias the ADC conversion.',

    'actuation.title': 'Actuation points',
    'actuation.eyebrow': 'KEY RESPONSE',
    'actuation.body': 'Per-key press threshold (pointOn) and release threshold (pointOff), in µm.',
    'actuation.positionHint': 'Select a key to tune its press and release depth',
    'actuation.keyCount': '{count} KEYS',
    'actuation.mappingNote': 'Key names are shown on the ZK1 80US series; other series keep the matrix position (#NN). Key remapping is not available.',
    'actuation.editor': 'KEY SETTINGS',
    'actuation.position': 'Matrix R{row} · C{column}',
    'actuation.noKeyName': 'No key name',
    'actuation.cellTitle': 'Key #{index} · R{row} C{column} · press {value} µm',
    'actuation.cellTitleNamed': '{name} · R{row} C{column} · press {value} µm',
    'actuation.enable': 'Enable actuation',
    'actuation.enable.hint': 'Keys stop responding while disabled.',
    'actuation.profile': 'Profile',
    'actuation.read': 'Load',
    'actuation.notLoaded': 'Nothing loaded yet. Press “Load”.',
    'actuation.grid': 'Keys',
    'actuation.selected': 'Selected key',
    'actuation.none': 'Select a key.',
    'actuation.pointOn': 'Press threshold (pointOn)',
    'actuation.pointOff': 'Release threshold (pointOff)',
    'actuation.applyAll': 'Apply this value to all keys',
    'actuation.defaults': 'Reset to defaults',
    'actuation.write': 'Write (AllSet → Apply → Save)',
    'actuation.loading': 'Loading…',
    'actuation.writing': 'Writing…',
    'actuation.writingProgress': '{percent}% ({done}/{total} keys)',
    'actuation.confirm':
      'Write actuation points for all {count} keys of profile “{profile}”. The values are read back and verified afterwards. Continue?',
    'actuation.verify.ok': 'Write succeeded and the read-back matched.',
    'actuation.verify.fail': 'Read-back mismatch ({count} positions). Consider restoring a backup.',
    'actuation.unit': 'µm',
    'actuation.hint': 'Colour encodes the press threshold (blue = shallow, red = deep).',
    'actuation.dirty': 'There are unsaved changes.',
    'actuation.live.start': 'Start live monitor',
    'actuation.live.stop': 'Stop live monitor',
    'actuation.live.rate': '{hz} Hz',
    'actuation.live.hint': 'Shows press depth while you type (read-only; pauses during writes).',
    'actuation.live.stoppedError':
      'Live monitor stopped after {count} consecutive read failures: {message}',
    'actuation.live.depth': '{value} µm',
    'actuation.live.markerOn': 'Press threshold',
    'actuation.live.markerOff': 'Release threshold',

    'lighting.title': 'Lighting',
    'lighting.led': 'LED master settings',
    'lighting.led.enable': 'Enable LED',
    'lighting.brightness': 'Brightness',
    'lighting.profile': 'Profile',
    'lighting.read': 'Load',
    'lighting.notLoaded': 'Nothing loaded yet. Press “Load”.',
    'lighting.mode': 'Lighting mode',
    'lighting.modeNote': 'All other parameters are written back exactly as read.',
    'lighting.indicators': 'Indicator colours',
    'lighting.indicator.mem1': 'Mem1',
    'lighting.indicator.mem2': 'Mem2',
    'lighting.indicator.mem3': 'Mem3',
    'lighting.indicator.keyDisable': 'Key disable',
    'lighting.indicator.capsLock': 'Caps Lock',
    'lighting.alpha': 'Opacity',
    'lighting.ledWrite': 'Write LED settings (Set → Apply → Save)',
    'lighting.write': 'Write lighting (Set → Apply → Save)',
    'lighting.writing': 'Writing…',
    'lighting.confirmLed': 'Write the LED on/off state and brightness, then verify. Continue?',
    'lighting.confirm':
      'Write the lighting parameters of profile “{profile}” and verify the read-back. Continue?',
    'lighting.verify.ok': 'Write succeeded and the read-back matched.',
    'lighting.verify.fail': 'Read-back mismatch ({count} positions).',

    'backup.title': 'Backup and restore',
    'backup.body':
      'Export the current settings (actuation points for every profile, lighting for every profile, LED settings, enable flag) as JSON.',
    'backup.download': 'Download backup',
    'backup.restore': 'Restore from backup',
    'backup.file': 'Choose a backup JSON',
    'backup.confirm':
      'Write the backup contents back to the device. Current settings will be overwritten. Continue?',
    'backup.busy': 'Creating a backup…',
    'backup.restoring': 'Restoring…',
    'backup.done': 'Done.',
    'backup.error': 'Could not read the backup file.',
    'backup.mismatch': 'Backup model “{backup}” differs from the connected model “{current}”.',
    'backup.noDevice': 'Connect a device first.',

    'common.busy': 'Working…',
    'common.ok': 'Success',
    'common.warn': 'Note',
    'common.error': 'Error',
    'common.selected': 'selected',
  },
};

const STORAGE_KEY = 'zenaim.lang';

function detectLang(): Lang {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'ja' || stored === 'en') return stored;
  }
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('en')) {
    return 'en';
  }
  return 'ja';
}

let current: Lang = detectLang();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* private mode: keep the in-memory choice only */
  }
  applyI18n(document);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
  }
}

/** Translate a key, interpolating `{name}` placeholders. */
export function t(key: string, params?: Record<string, string | number>): string {
  const template = messages[current][key] ?? messages.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

const ATTRIBUTES = ['title', 'placeholder', 'aria-label'] as const;

/** Fill every `data-i18n*` element under `root` from the current language. */
export function applyI18n(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n ?? '');
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((element) => {
    element.innerHTML = t(element.dataset.i18nHtml ?? '');
  });
  for (const attribute of ATTRIBUTES) {
    const datasetKey = `i18n${attribute.replace(/(^|-)([a-z])/g, (_, __, c: string) => c.toUpperCase())}`;
    root.querySelectorAll<HTMLElement>(`[data-${attribute === 'aria-label' ? 'i18n-aria-label' : `i18n-${attribute}`}]`)
      .forEach((element) => {
        const key = (element.dataset as Record<string, string | undefined>)[datasetKey];
        if (key) element.setAttribute(attribute, t(key));
      });
  }
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}

export function onLangChange(listener: (lang: Lang) => void): void {
  document.addEventListener('langchange', () => listener(current));
}
