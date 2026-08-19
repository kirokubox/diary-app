# 季節日記 Androidウィジェット

既存PWAを置き換えず、Pixel 8のホーム画面へ1行の情報ウィジェットを追加する最小companionです。

## データ連携

Webアプリの設定画面で「ウィジェットを更新」を押すと、次の表示用データだけをカスタムリンクで渡します。

- 直近7日平均睡眠
- 今期の変動費残額（超過時は超過額）
- 前日の変動費合計
- 更新日時

Android側は端末内のSharedPreferencesへ最後の値を保存します。日記本文・写真・個別日の記録は複製しません。オフライン時も最後に同期した値を表示します。

## Pixel 8へ入れる

1. Android Studioでこの`android-widget`フォルダを開く
2. Android SDK 35をインストールし、Gradle Syncを完了する
3. USBデバッグを有効にしたPixel 8を接続する
4. `app`を実行してAPKをインストールする
5. Pixel Launcherのホーム画面を長押しし、「ウィジェット」→「季節日記」を追加する
6. PWAの「設定」→「ウィジェットを更新」を押す

ウィジェットをタップすると `https://kirokubox.github.io/diary-app/` を開きます。PWAがインストール済みの場合もデータ本体は従来どおりChrome側のIndexedDBに残ります。
