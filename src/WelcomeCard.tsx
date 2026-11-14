import { Icon } from "./Icon";

/** 日記画面の先頭の「はじめに」：日記が1件もない状態で開いたとき（はじめて開いた人）だけ出す */
export function WelcomeCard({ onOpenList, onOpenSettings }: { onOpenList: () => void; onOpenSettings: () => void }) {
  return (
    <section className="card welcome-card" aria-label="はじめに">
      <h2 className="welcome-title">はじめに</h2>
      <ol className="welcome-steps">
        <li className="welcome-row">
          <span className="welcome-no" aria-hidden="true">①</span>
          <span className="welcome-text">
            下の「振り返り」を開いて、今日のことを書く
            <span className="welcome-example">見出しごとに1行ずつで大丈夫です。例：「朝は散歩。昼は友人とランチ」「少し疲れた。早く寝たい」</span>
          </span>
        </li>
        <li className="welcome-row">
          <span className="welcome-no" aria-hidden="true">②</span>
          <span className="welcome-text">
            書いたものは自動で保存される
            <span className="welcome-example">写真は、画面のいちばん下から足せます。</span>
          </span>
        </li>
        <li>
          <button type="button" className="welcome-row" onClick={onOpenList}>
            <span className="welcome-no" aria-hidden="true">③</span>
            <span className="welcome-text">
              一覧で読み返す
              <span className="welcome-example">1か月前・1年前の同じ日の日記も、ここに出ます。</span>
            </span>
            <Icon name="chevron-right" size={18} />
          </button>
        </li>
      </ol>
      <p className="welcome-note">
        日記はこの端末の中だけに保存されます。見出しは設定の「テンプレートを編集」で変えられ、短く書きたい人向けの「シンプルな日記」も選べます。
        <button type="button" className="welcome-link" onClick={onOpenSettings}>設定を開く</button>
      </p>
    </section>
  );
}
