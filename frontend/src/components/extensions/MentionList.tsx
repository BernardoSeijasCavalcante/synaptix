import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

export const MentionList = forwardRef((props: any, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];

    if (item) {
      props.command({ id: item.id, label: item.label });
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: any) => {
      if (event.key === 'ArrowUp') {
        upHandler();
        return true;
      }

      if (event.key === 'ArrowDown') {
        downHandler();
        return true;
      }

      if (event.key === 'Enter') {
        enterHandler();
        return true;
      }

      return false;
    },
  }));

  return (
    <div className="bg-slate-800 rounded-lg shadow-xl border border-slate-700 overflow-hidden flex flex-col py-1 min-w-[200px]">
      {props.items.length ? (
        props.items.map((item: any, index: number) => (
          <button
            className={`text-left px-3 py-1.5 text-sm transition-colors ${
              index === selectedIndex ? 'bg-slate-700 text-yellow-500' : 'bg-transparent text-gray-300 hover:bg-slate-700/50'
            }`}
            key={index}
            onClick={() => selectItem(index)}
          >
            <span className="opacity-50 mr-2 text-xs">{item.type === 'note' ? '📝' : '💬'}</span>
            {item.label}
          </button>
        ))
      ) : (
        <div className="px-3 py-1.5 text-sm text-gray-500 italic">Nada encontrado</div>
      )}
    </div>
  );
});

MentionList.displayName = 'MentionList';
