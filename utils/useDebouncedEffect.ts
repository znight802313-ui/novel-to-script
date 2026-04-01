import { DependencyList, EffectCallback, useEffect } from 'react';

export const useDebouncedEffect = (
  effect: EffectCallback,
  deps: DependencyList,
  delay: number,
) => {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      effect();
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [...deps, delay]);
};
