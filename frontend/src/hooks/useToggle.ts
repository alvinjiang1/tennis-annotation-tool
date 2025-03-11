import { useState, useCallback } from 'react';

type UseToggleReturn = [boolean, () => void, (value: boolean) => void];

export default function useToggle(initialState = false): UseToggleReturn {
  const [state, setState] = useState<boolean>(initialState);
  
  const toggle = useCallback(() => {
    setState(prevState => !prevState);
  }, []);
  
  const setValue = useCallback((value: boolean) => {
    setState(value);
  }, []);
  
  return [state, toggle, setValue];
}
