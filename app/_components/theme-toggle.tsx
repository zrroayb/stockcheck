'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'dark' | 'light'

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const stored = window.localStorage.getItem('theme')
    const initial: Theme = stored === 'light' ? 'light' : 'dark'
    setTheme(initial)
    document.documentElement.dataset.theme = initial
  }, [])

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    window.localStorage.setItem('theme', next)
  }

  const Icon = theme === 'dark' ? Sun : Moon
  const label = theme === 'dark' ? 'Aydinlik mod' : 'Koyu mod'

  return (
    <button type="button" className="btn-icon" onClick={toggleTheme} title={label} aria-label={label}>
      <Icon className="h-4 w-4" />
    </button>
  )
}
