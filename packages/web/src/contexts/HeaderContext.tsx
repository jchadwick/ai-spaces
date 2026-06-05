/* eslint-disable react-refresh/only-export-components */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

interface HeaderContextType {
  headerContent: ReactNode;
  setHeaderContent: (content: ReactNode) => void;
}

const HeaderContext = createContext<HeaderContextType | undefined>(undefined);

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [headerContent, setHeaderContentState] = useState<ReactNode>(null);

  const setHeaderContent = useCallback((content: ReactNode) => {
    setHeaderContentState(content);
  }, []);

  return (
    <HeaderContext.Provider value={{ headerContent, setHeaderContent }}>
      {children}
    </HeaderContext.Provider>
  );
}

export function useHeader() {
  const context = useContext(HeaderContext);
  if (!context) throw new Error("useHeader must be used within HeaderProvider");
  return context;
}

export function useHeaderContent(content: ReactNode) {
  const { setHeaderContent } = useHeader();

  useEffect(() => {
    setHeaderContent(content);
    return () => setHeaderContent(null);
  }, [content, setHeaderContent]);
}
