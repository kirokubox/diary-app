import { useState } from "react";
import type { ReactNode } from "react";
import { addDays, formatDateLabel } from "./dateUtils";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

export function IconButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className="icon-btn" type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}

// 「◀ 日付 ▶」。日付の文字を押すとブラウザ標準の日付選択が開く
export function DateSwitcher({ date, onMove }: { date: string; onMove: (date: string) => void | Promise<void> }) {
  return (
    <div className="date-switcher">
      <IconButton icon="chevron-left" label="前の日" onClick={() => void onMove(addDays(date, -1))} />
      <label className="date-jump">
        <span className="date-label">{formatDateLabel(date)}</span>
        <input
          aria-label="日付を選ぶ"
          type="date"
          value={date}
          onClick={(event) => {
            try {
              event.currentTarget.showPicker?.();
            } catch {
              // showPicker が使えない環境では、標準の入力欄の動きに任せる
            }
          }}
          onChange={(event) => {
            if (event.target.value) void onMove(event.target.value);
          }}
        />
      </label>
      <IconButton icon="chevron-right" label="次の日" onClick={() => void onMove(addDays(date, 1))} />
    </div>
  );
}

export type MenuItem = {
  label: string;
  icon: IconName;
  danger?: boolean;
  onSelect: () => void;
};

// 右上の「…」メニュー。まれにしか使わない操作（書き出し・削除など）を入れる
export function OverflowMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="menu-wrap">
      <IconButton icon="more" label="その他の操作" onClick={() => setOpen((value) => !value)} />
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="menu" role="menu">
            {items.map((item) => (
              <button
                className={item.danger ? "menu-item danger" : "menu-item"}
                key={item.label}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AppBar({ children }: { children: ReactNode }) {
  return <header className="app-bar">{children}</header>;
}
