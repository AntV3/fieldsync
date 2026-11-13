import LegalDocument from './LegalDocument'
import { TERMS_INTRO, TERMS_SECTIONS } from './termsContent'
import { LEGAL } from '../../lib/legal'

export default function TermsOfService() {
  return (
    <LegalDocument
      title="Terms of Service"
      effective={LEGAL.TERMS_EFFECTIVE}
      version={LEGAL.TERMS_VERSION}
      intro={TERMS_INTRO}
      sections={TERMS_SECTIONS}
      otherLink={{ to: '/privacy', label: 'Privacy Policy' }}
    />
  )
}
