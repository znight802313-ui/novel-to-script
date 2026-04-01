import React, { useEffect, useState } from 'react';

interface DiffPart {
  added?: boolean;
  removed?: boolean;
  value: string;
}

interface DiffTextViewProps {
  oldText: string;
  newText: string;
  containerClassName: string;
  loadingText?: string;
}

const DiffTextView: React.FC<DiffTextViewProps> = ({
  oldText,
  newText,
  containerClassName,
  loadingText = '正在计算差异...',
}) => {
  const [parts, setParts] = useState<DiffPart[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setParts(null);

    import('diff').then((Diff) => {
      if (cancelled) {
        return;
      }
      setParts(Diff.diffWordsWithSpace(oldText, newText));
    });

    return () => {
      cancelled = true;
    };
  }, [oldText, newText]);

  return (
    <div className={containerClassName}>
      {parts ? (
        parts.map((part, index) => {
          if (part.added) {
            return <span key={index} className="bg-green-100 text-green-800 border-b-2 border-green-300 rounded px-0.5">{part.value}</span>;
          }
          if (part.removed) {
            return <span key={index} className="bg-red-100 text-red-800 line-through decoration-red-400 opacity-60 select-none px-0.5">{part.value}</span>;
          }
          return <span key={index} className="text-gray-800">{part.value}</span>;
        })
      ) : (
        <div className="text-gray-400">{loadingText}</div>
      )}
    </div>
  );
};

export default DiffTextView;
