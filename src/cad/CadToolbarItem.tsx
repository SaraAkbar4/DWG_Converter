import { CheckOutlined } from '@ant-design/icons';
import { Dropdown, theme } from 'antd';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
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
  menu?: { options: CadMenuOption<T>[]; value: T; onSelect: (value: T) => void };
};

export function CadToolbarItem<T extends string>({
  label,
  icon,
  active,
  title,
  onClick,
  menu,
}: Props<T>) {
  const { token } = theme.useToken();
  const viewerTheme = useViewerTheme();
  const [open, setOpen] = useState(false);
  const submenuStyle = useMemo(() => getToolbarSubmenuStyle(token), [token]);
  const chevron = open ? (
    <ChevronUp size={10} strokeWidth={2.75} className="potree-toolbar-horizontal-chevron" />
  ) : (
    <ChevronDown size={10} strokeWidth={2.75} className="potree-toolbar-horizontal-chevron" />
  );

  const trigger = (
    <button
      type="button"
      className="potree-toolbar-horizontal-trigger"
      aria-label={title ?? label}
      aria-pressed={active}
      aria-haspopup={menu ? 'menu' : undefined}
      aria-expanded={menu ? open : undefined}
      onClick={menu ? undefined : onClick}
    >
      <span className="potree-toolbar-horizontal-icon-row">
        <span className="potree-toolbar-horizontal-icon">{icon}</span>
      </span>
      <span className="potree-toolbar-horizontal-label-row">
        {menu ? <span className="potree-toolbar-horizontal-chevron-spacer" aria-hidden /> : null}
        <span className="potree-toolbar-horizontal-label">{label}</span>
        {menu ? chevron : null}
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
              menu.onSelect(option.value);
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
          trigger={['click']}
          open={open}
          placement="bottom"
          destroyOnHidden
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
