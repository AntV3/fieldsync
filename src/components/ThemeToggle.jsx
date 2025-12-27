import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../lib/ThemeContext'

export default function ThemeToggle({ compact = false }) {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      className={`theme-toggle ${compact ? 'theme-toggle-compact' : ''}`}
      onClick={toggleTheme}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <>
          <Sun size={compact ? 18 : 16} />
          {!compact && <span>Light</span>}
        </>
      ) : (
        <>
          <Moon size={compact ? 18 : 16} />
          {!compact && <span>Dark</span>}
        </>
      )}
    </button>
  )
}
