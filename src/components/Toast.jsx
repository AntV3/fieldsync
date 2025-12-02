import { useEffect } from 'react'

export default function Toast({ message, type = '', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="toast-container">
      <div className={`toast ${type}`}>
        {message}
      </div>
    </div>
  )
}
