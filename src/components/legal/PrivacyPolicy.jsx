import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../Logo'

export default function PrivacyPolicy() {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="legal-page">
      <nav className="legal-nav">
        <Link to="/" className="legal-nav-home">
          <Logo className="legal-logo" showPoweredBy={false} />
        </Link>
      </nav>

      <div className="legal-content">
        <h1>Privacy Policy</h1>
        <p className="legal-effective">Effective Date: February 28, 2026</p>

        <section>
          <h2>1. Introduction</h2>
          <p>
            FieldSync (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) provides a construction progress
            tracking platform that connects field crews to office management in real time.
            This Privacy Policy explains how we collect, use, disclose, and protect your
            information when you use our website, mobile applications, and services
            (collectively, the &quot;Service&quot;).
          </p>
          <p>
            By using the Service, you agree to the collection and use of information in
            accordance with this policy. If you do not agree, please do not use the Service.
          </p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>

          <h3>2.1 Information You Provide</h3>
          <ul>
            <li><strong>Account Information:</strong> Name, email address, phone number, company name, and job title when you register for an account.</li>
            <li><strong>Project Data:</strong> Project names, contract values, progress areas, daily reports, crew check-ins, time and materials records, change order requests, and other construction-related data you enter.</li>
            <li><strong>Photos and Files:</strong> Images, documents, and files you upload as evidence or project documentation.</li>
            <li><strong>Signatures:</strong> Electronic signatures collected through our signature feature.</li>
            <li><strong>Payment Information:</strong> Billing details processed through our third-party payment processor (Stripe). We do not store full credit card numbers on our servers.</li>
            <li><strong>Communications:</strong> Messages you send to us for support or feedback.</li>
          </ul>

          <h3>2.2 Information Collected Automatically</h3>
          <ul>
            <li><strong>Device Information:</strong> Device type, operating system, browser type, and unique device identifiers.</li>
            <li><strong>Usage Data:</strong> Pages visited, features used, time spent on the Service, and interaction patterns.</li>
            <li><strong>Location Data:</strong> GPS coordinates when you use location-enabled features (such as GPS-tagged photos), only with your explicit permission.</li>
            <li><strong>Log Data:</strong> IP address, access times, and error logs for security and troubleshooting.</li>
          </ul>

          <h3>2.3 Information from Third Parties</h3>
          <ul>
            <li><strong>Authentication Providers:</strong> If you sign in through a third-party service, we receive basic profile information from that provider.</li>
            <li><strong>Company Administrators:</strong> Your company admin may provide your information when adding you to a team.</li>
          </ul>
        </section>

        <section>
          <h2>3. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul>
            <li>Provide, maintain, and improve the Service</li>
            <li>Process transactions and manage your account</li>
            <li>Enable real-time synchronization between field and office</li>
            <li>Generate reports, invoices, and billing documentation</li>
            <li>Send service-related notifications (progress updates, approvals, alerts)</li>
            <li>Provide customer support</li>
            <li>Detect, investigate, and prevent fraud or unauthorized access</li>
            <li>Comply with legal obligations</li>
            <li>Analyze usage patterns to improve the Service (in aggregate, anonymized form)</li>
          </ul>
        </section>

        <section>
          <h2>4. How We Share Your Information</h2>
          <p>We do not sell your personal information. We may share your information in these limited circumstances:</p>
          <ul>
            <li><strong>Within Your Company:</strong> Project data and activity are visible to other members of your company based on their access level and role.</li>
            <li><strong>Public Share Links:</strong> Data you share via public view or signature links is accessible to anyone with the link, subject to expiration settings.</li>
            <li><strong>Service Providers:</strong> We use trusted third parties for hosting (Vercel), database services (Supabase), payment processing (Stripe), and error monitoring. These providers are contractually obligated to protect your data.</li>
            <li><strong>Legal Requirements:</strong> We may disclose information if required by law, regulation, legal process, or government request.</li>
            <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction.</li>
          </ul>
        </section>

        <section>
          <h2>5. Data Security</h2>
          <p>
            We implement industry-standard security measures to protect your information, including:
          </p>
          <ul>
            <li>Encryption in transit (TLS/HTTPS) and at rest</li>
            <li>Row-level security (RLS) policies ensuring data isolation between companies</li>
            <li>Multi-factor authentication (MFA) support</li>
            <li>Regular security reviews and access audits</li>
            <li>Admin approval required for new company members</li>
          </ul>
          <p>
            No method of transmission or storage is 100% secure. While we strive to protect your
            data, we cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2>6. Data Retention</h2>
          <p>
            We retain your data for as long as your account is active or as needed to provide
            the Service. Project data is retained for the duration of the project plus any
            period required for billing, audit, or legal compliance. You may request deletion
            of your account and associated data by contacting us.
          </p>
        </section>

        <section>
          <h2>7. Your Rights</h2>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul>
            <li>Access and receive a copy of your personal data</li>
            <li>Correct inaccurate or incomplete data</li>
            <li>Request deletion of your data</li>
            <li>Restrict or object to certain processing</li>
            <li>Data portability (receive your data in a structured format)</li>
            <li>Withdraw consent for location tracking or push notifications at any time</li>
          </ul>
          <p>
            To exercise these rights, contact us at <strong>privacy@fieldsync.com</strong>.
          </p>
        </section>

        <section>
          <h2>8. Cookies and Local Storage</h2>
          <p>
            We use cookies and browser local storage to maintain your session, remember your
            preferences (such as theme settings), and support offline functionality. We do not
            use third-party tracking cookies for advertising. You can manage cookie preferences
            through your browser settings.
          </p>
        </section>

        <section>
          <h2>9. Children&apos;s Privacy</h2>
          <p>
            The Service is not intended for use by anyone under the age of 16. We do not
            knowingly collect personal information from children. If we learn that we have
            collected data from a child under 16, we will promptly delete it.
          </p>
        </section>

        <section>
          <h2>10. International Data Transfers</h2>
          <p>
            Your data may be processed and stored in the United States. By using the Service,
            you consent to the transfer of your information to the United States, which may have
            different data protection laws than your country of residence.
          </p>
        </section>

        <section>
          <h2>11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of material
            changes by posting the updated policy on this page and updating the &quot;Effective Date&quot;
            above. Your continued use of the Service after changes constitutes acceptance of the
            updated policy.
          </p>
        </section>

        <section>
          <h2>12. Contact Us</h2>
          <p>If you have questions about this Privacy Policy, contact us at:</p>
          <p>
            <strong>FieldSync</strong><br />
            Email: <strong>privacy@fieldsync.com</strong>
          </p>
        </section>
      </div>

      <footer className="legal-footer">
        <p>&copy; {new Date().getFullYear()} FieldSync. All rights reserved.</p>
        <div className="legal-footer-links">
          <Link to="/terms">Terms of Service</Link>
          <Link to="/">Home</Link>
        </div>
      </footer>
    </div>
  )
}
