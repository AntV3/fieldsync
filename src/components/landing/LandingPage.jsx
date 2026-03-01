import { useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from '../Logo'
import HeroSection from './HeroSection'
import CapabilityStrip from './CapabilityStrip'
import AppShowcase from './AppShowcase'
import FeatureGrid from './FeatureGrid'
import SignInCTA from './SignInCTA'
import LandingFooter from './LandingFooter'

export default function LandingPage() {
  const navigate = useNavigate()
  const navRef = useRef(null)

  // Force dark theme for the landing page
  useEffect(() => {
    const prev = document.documentElement.getAttribute('data-theme')
    document.documentElement.setAttribute('data-theme', 'dark')
    return () => {
      if (prev) document.documentElement.setAttribute('data-theme', prev)
    }
  }, [])

  // Scroll-triggered reveal animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('lp-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1 }
    )

    const elements = document.querySelectorAll('.lp-animate')
    elements.forEach(el => observer.observe(el))

    return () => observer.disconnect()
  }, [])

  // Nav scroll effect — add background on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (navRef.current) {
        navRef.current.classList.toggle('lp-nav-scrolled', window.scrollY > 20)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll() // check initial state
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleGetStarted = useCallback(() => {
    localStorage.setItem('fieldsync-has-visited', 'true')
    navigate('/login')
  }, [navigate])

  const handleSignIn = useCallback(() => {
    localStorage.setItem('fieldsync-has-visited', 'true')
    navigate('/login')
  }, [navigate])

  const handleQuickAccess = useCallback((mode) => {
    localStorage.setItem('fieldsync-has-visited', 'true')
    navigate(`/login?mode=${mode}`)
  }, [navigate])

  const handleScrollToFeatures = useCallback(() => {
    const el = document.getElementById('features')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  return (
    <div className="lp">
      <nav className="lp-nav" ref={navRef}>
        <Logo className="lp-logo" showPoweredBy={false} />
        <div className="lp-nav-actions">
          <button className="lp-nav-signin" onClick={handleSignIn}>
            Sign In
          </button>
          <button className="lp-nav-cta" onClick={handleGetStarted}>
            Start Free
          </button>
        </div>
      </nav>

      <main>
        <HeroSection
          onGetStarted={handleGetStarted}
          onScrollToFeatures={handleScrollToFeatures}
          onQuickAccess={handleQuickAccess}
        />
        <CapabilityStrip />
        <AppShowcase />
        <FeatureGrid />
        <SignInCTA
          onGetStarted={handleGetStarted}
          onSignIn={handleSignIn}
        />
      </main>

      <LandingFooter />
    </div>
  )
}
