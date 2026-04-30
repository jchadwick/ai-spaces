import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export interface ThemeTokens {
  bg: string; bgAlt: string; bgRaised: string; bgWell: string;
  ink: string; inkMid: string; inkDim: string; inkFaint: string;
  hair: string;
  accent: string; accentSoft: string; accentInk: string;
  agent: string; agentSoft: string; agentInk: string;
}

export interface Palette extends ThemeTokens {
  name: string;
  dark?: boolean;
}

export const PALETTES: Record<string, Palette> = {
  paper: {
    name: 'Paper',
    bg: '#F6F3EE', bgAlt: '#EFEAE2', bgRaised: '#FBFAF7', bgWell: '#E9E3D8',
    ink: '#1A1714', inkMid: '#5A5147', inkDim: '#8A7F72', inkFaint: '#B8AE9F',
    hair: '#E2DBCD',
    accent: '#C2410C', accentSoft: '#FBE4D5', accentInk: '#7C2D12',
    agent: '#3F6B4F', agentSoft: '#E4ECDF', agentInk: '#1F3A29',
  },
  ink: {
    name: 'Ink',
    bg: '#F4F5F7', bgAlt: '#ECEEF2', bgRaised: '#FBFBFC', bgWell: '#E2E5EB',
    ink: '#0F1216', inkMid: '#454B55', inkDim: '#7A8190', inkFaint: '#B5BCC8',
    hair: '#DBDFE6',
    accent: '#3730A3', accentSoft: '#E0E0FB', accentInk: '#1E1B4B',
    agent: '#0F766E', agentSoft: '#D6F0EC', agentInk: '#134E4A',
  },
  garden: {
    name: 'Garden',
    bg: '#F2F4EF', bgAlt: '#E8ECE3', bgRaised: '#FAFBF7', bgWell: '#DDE2D5',
    ink: '#1B1F1A', inkMid: '#4A5247', inkDim: '#7B8378', inkFaint: '#B2B9AD',
    hair: '#D6DCCD',
    accent: '#7E22CE', accentSoft: '#F0E2FB', accentInk: '#4A1582',
    agent: '#65A30D', agentSoft: '#E6F2D5', agentInk: '#365314',
  },
  dusk: {
    name: 'Dusk',
    bg: '#F7EFE7', bgAlt: '#F1E5D8', bgRaised: '#FCF7F1', bgWell: '#E9D9C7',
    ink: '#2A1A10', inkMid: '#5C4232', inkDim: '#8E7565', inkFaint: '#BFAA98',
    hair: '#E0CFBE',
    accent: '#9F1239', accentSoft: '#FBE0E8', accentInk: '#5F0C20',
    agent: '#0E7490', agentSoft: '#D5EEF5', agentInk: '#0C4A6E',
  },
  midnight: {
    name: 'Midnight',
    dark: true,
    bg: '#0A0D11', bgAlt: '#06080B', bgRaised: '#13171C', bgWell: '#1E2530',
    ink: '#F1F5F9', inkMid: '#CBD5E1', inkDim: '#64748B', inkFaint: '#334155',
    hair: '#1E2530',
    accent: '#A3E635', accentSoft: '#1F2A14', accentInk: '#D9F99D',
    agent: '#A3E635', agentSoft: '#1F2A14', agentInk: '#D9F99D',
  },
}

function applyPalette(p: Palette) {
  const el = document.documentElement
  const vars: [string, string][] = [
    ['--t-bg', p.bg], ['--t-bgAlt', p.bgAlt], ['--t-bgRaised', p.bgRaised], ['--t-bgWell', p.bgWell],
    ['--t-ink', p.ink], ['--t-inkMid', p.inkMid], ['--t-inkDim', p.inkDim], ['--t-inkFaint', p.inkFaint],
    ['--t-hair', p.hair],
    ['--t-accent', p.accent], ['--t-accentSoft', p.accentSoft], ['--t-accentInk', p.accentInk],
    ['--t-agent', p.agent], ['--t-agentSoft', p.agentSoft], ['--t-agentInk', p.agentInk],
  ]
  vars.forEach(([k, v]) => el.style.setProperty(k, v))
  el.style.setProperty('color-scheme', p.dark ? 'dark' : 'light')
}

interface ThemeContextValue {
  paletteName: string
  setPalette: (name: string) => void
  t: Palette
}

const ThemeContext = createContext<ThemeContextValue>({
  paletteName: 'paper',
  setPalette: () => {},
  t: PALETTES.paper,
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [paletteName, setPaletteState] = useState<string>(() => {
    return localStorage.getItem('ai-spaces-theme') ?? 'paper'
  })

  const t = PALETTES[paletteName] ?? PALETTES.paper

  useEffect(() => {
    applyPalette(t)
  }, [paletteName, t])

  const setPalette = (name: string) => {
    setPaletteState(name)
    localStorage.setItem('ai-spaces-theme', name)
  }

  return (
    <ThemeContext.Provider value={{ paletteName, setPalette, t }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
