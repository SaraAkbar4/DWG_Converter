import { Input, Modal } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import styles from './cadFloorPlan.module.css';

export type CadCommand = { label: string; shortcut?: string; run: () => void };

type Props = { open: boolean; commands: CadCommand[]; onClose: () => void };

/** Searchable list of every viewer action, doubling as the keyboard-shortcut reference. */
export function CadCommandPalette({ open, commands, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return commands.filter((command) => words.every((word) => command.label.toLowerCase().includes(word)));
  }, [commands, query]);

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);
  useEffect(() => setActive(0), [query]);

  const run = (command: CadCommand | undefined) => {
    if (!command) return;
    onClose();
    command.run();
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} closable={false} destroyOnHidden width={480} styles={{ content: { padding: 8 } }}>
      <Input
        autoFocus
        variant="borderless"
        size="large"
        placeholder="Type a command"
        aria-label="Search commands"
        role="combobox"
        aria-expanded
        aria-controls="cad-commands"
        aria-activedescendant={matches[active] ? `cad-command-${active}` : undefined}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') setActive((index) => Math.min(index + 1, matches.length - 1));
          else if (event.key === 'ArrowUp') setActive((index) => Math.max(index - 1, 0));
          else if (event.key === 'Enter') run(matches[active]);
          else return;
          event.preventDefault();
        }}
      />
      <ul id="cad-commands" role="listbox" className={styles.commandList}>
        {matches.map((command, index) => (
          <li
            key={command.label}
            id={`cad-command-${index}`}
            role="option"
            aria-selected={index === active}
            onPointerMove={() => setActive(index)}
            onClick={() => run(command)}
          >
            {command.label}
            {command.shortcut && <kbd>{command.shortcut}</kbd>}
          </li>
        ))}
        {!matches.length && <li aria-disabled>No matching command</li>}
      </ul>
    </Modal>
  );
}
