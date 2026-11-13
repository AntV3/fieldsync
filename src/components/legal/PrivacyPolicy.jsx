import LegalDocument from './LegalDocument'
import { PRIVACY_INTRO, PRIVACY_SECTIONS } from './privacyContent'
import { LEGAL } from '../../lib/legal'

export default function PrivacyPolicy() {
  return (
    <LegalDocument
      title="Privacy Policy"
      effective={LEGAL.PRIVACY_EFFECTIVE}
      version={LEGAL.PRIVACY_VERSION}
      intro={PRIVACY_INTRO}
      sections={PRIVACY_SECTIONS}
      otherLink={{ to: '/terms', label: 'Terms of Service' }}
    />
  )
}
