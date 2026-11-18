import { CheckOutlined } from '@ant-design/icons';
import { Dropdown } from 'antd';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { getToolbarSubmenuStyle, useViewerTheme } from './platform';

export type CadMenuOption<T extends string> = {
  value: T;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
};

type Props<T extends string> = {
  label: string;
  icon: ReactNode;
  active?: boolean;
  title?: string;
  onClick?: () => void;
  /** Turns this tool off when its button is clicked while it is already on. */
  onDeactivate?: () => void;
  menu?: { options: CadMenuOption<T>[]; value: T; onSelect: (value: T) => void };
  /** When set, the parent decides whether this menu is open so only one menu stays open. */
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
};

export function CadToolbarItem<T extends string>({
  label,
  icon,
  active,
  title,
  onClick,
  onDeactivate,
  menu,
  menuOpen,
  onMenuOpenChange,
}: Props<T>) {
  const viewerTheme = useViewerTheme();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = menuOpen ?? uncontrolledOpen;
  const setOpen = (value: boolean | ((current: boolean) => boolean)) => {
    const next = typeof value === 'function' ? value(open) : value;
    if (onMenuOpenChange) onMenuOpenChange(next);
    else setUncontrolledOpen(next);
  };
  const chevronRef = useRef<HTMLSpanElement>(null);
  const submenuStyle = useMemo(() => getToolbarSubmenuStyle(), []);
  const chevron = open ? (
    <ChevronUp size={10} strokeWidth={2.75} className="potree-toolbar-horizontal-chevron" />
  ) : (
    <ChevronDown size={10} strokeWidth={2.75} className="potree-toolbar-horizontal-chevron" />
  );
  const onTriggerClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (menu && chevronRef.current?.contains(event.target as Node)) {
      setOpen((value) => !value);
      return;
    }
    if (active && onDeactivate) {
      setOpen(false);
      onDeactivate();
      return;
    }
    if (menu) {
      setOpen((value) => !value);
      return;
    }
    onClick?.();
  };

  const trigger = (
    <button
      type="button"
      className="potree-toolbar-horizontal-trigger"
      aria-label={title ?? label}
      aria-pressed={active}
      aria-haspopup={menu ? 'menu' : undefined}
      aria-expanded={menu ? open : undefined}
      onClick={onTriggerClick}
    >
      <span className="potree-toolbar-horizontal-icon-row">
        <span className="potree-toolbar-horizontal-icon">{icon}</span>
      </span>
      <span className="potree-toolbar-horizontal-label-row">
        {menu ? <span className="potree-toolbar-horizontal-chevron-spacer" aria-hidden /> : null}
        <span className="potree-toolbar-horizontal-label">{label}</span>
        {menu ? (
          <span
            ref={chevronRef}
            className="potree-toolbar-horizontal-chevron-hit"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setOpen((value) => !value);
            }}
          >
            {chevron}
          </span>
        ) : null}
      </span>
    </button>
  );

  const submenu = menu ? (
    <div
      role="menu"
      className="potree-toolbar-horizontal-submenu"
      data-viewer-theme={viewerTheme}
      style={submenuStyle}
    >
      {menu.options.map((option) => {
        const selected = option.value === menu.value;
        return (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            className={`potree-toolbar-horizontal-submenu-item${selected ? ' is-selected' : ''}`}
            disabled={option.disabled}
            onClick={() => {
              if (selected && active && onDeactivate) onDeactivate();
              else menu.onSelect(option.value);
              setOpen(false);
            }}
          >
            <span className="potree-toolbar-horizontal-submenu-icon">{option.icon}</span>
            <span className="potree-toolbar-horizontal-submenu-label">{option.label}</span>
            {selected ? (
              <CheckOutlined className="potree-toolbar-horizontal-submenu-check" />
            ) : null}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div
      className={`potree-toolbar-horizontal-item${active ? ' is-active' : ''}${open ? ' is-open' : ''}`}
      style={{ position: 'relative' }}
    >
      {submenu ? (
        <Dropdown
          trigger={[]}
          open={open}
          placement="bottom"
          destroyOnHidden
          overlayClassName="potree-toolbar-submenu-popup"
          onOpenChange={setOpen}
          popupRender={() => submenu}
        >
          {trigger}
        </Dropdown>
      ) : (
        trigger
      )}
      <span className="potree-toolbar-tip" role="tooltip">
        {title ?? label}
      </span>
    </div>
  );
}
