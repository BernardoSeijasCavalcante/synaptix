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
    <div className="glass-panel bg-slate-900/95 backdrop-blur-2xl rounded-xl shadow-2xl border border-white/15 overflow-hidden flex flex-col py-1.5 min-w-[220px] z-50">
      {props.items.length ? (
        props.items.map((item: any, index: number) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              className={`text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${
                isSelected 
                  ? 'bg-amber-500/15 text-amber-300 font-semibold border-l-2 border-amber-400 pl-2.5' 
                  : 'bg-transparent text-slate-300 hover:bg-white/[0.06] hover:text-white'
              }`}
              key={index}
              onClick={() => selectItem(index)}
            >
              <span className="opacity-70 text-xs">{item.type === 'note' ? '📝' : '💬'}</span>
              <span className="truncate">{item.label}</span>
            </button>
          );
        })
      ) : (
        <div className="px-3 py-2 text-xs text-slate-500 italic text-center">Nenhum resultado encontrado</div>
      )}
    </div>
  );
});

MentionList.displayName = 'MentionList';
