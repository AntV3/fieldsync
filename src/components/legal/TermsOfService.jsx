import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../Logo'

export default function TermsOfService() {
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
        <h1>Terms of Service</h1>
        <p className="legal-effective">Effective Date: February 28, 2026</p>

        <section>
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using FieldSync (&quot;the Service&quot;), you agree to be bound by these
            Terms of Service (&quot;Terms&quot;). If you are using the Service on behalf of a company or
            organization, you represent that you have authority to bind that entity to these Terms.
            If you do not agree, do not use the Service.
          </p>
        </section>

        <section>
          <h2>2. Description of Service</h2>
          <p>
            FieldSync is a construction progress tracking platform that provides real-time
            synchronization between field crews and office management. The Service includes
            project tracking, time and materials logging, change order management, billing
            support, document management, and related features accessible via web browsers
            and mobile applications.
          </p>
        </section>

        <section>
          <h2>3. Accounts and Registration</h2>
          <ul>
            <li>You must provide accurate and complete information when creating an account.</li>
            <li>You are responsible for maintaining the security of your account credentials.</li>
            <li>You must notify us immediately of any unauthorized use of your account.</li>
            <li>Company administrators are responsible for managing team member access and approvals.</li>
            <li>Field crew access via Company Code and Project PIN is the responsibility of the company that creates those credentials.</li>
          </ul>
        </section>

        <section>
          <h2>4. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service for any unlawful purpose or in violation of any applicable law</li>
            <li>Attempt to gain unauthorized access to any part of the Service or its systems</li>
            <li>Interfere with or disrupt the Service or its infrastructure</li>
            <li>Upload malicious code, viruses, or harmful content</li>
            <li>Scrape, crawl, or extract data from the Service through automated means</li>
            <li>Impersonate another person or entity</li>
            <li>Share your account credentials with unauthorized individuals</li>
            <li>Use the Service to store or transmit content that infringes intellectual property rights</li>
          </ul>
        </section>

        <section>
          <h2>5. Your Data</h2>
          <h3>5.1 Ownership</h3>
          <p>
            You retain all rights to the data you submit to the Service (&quot;Your Data&quot;),
            including project information, reports, photos, documents, and other content.
            FieldSync does not claim ownership of Your Data.
          </p>

          <h3>5.2 License to Us</h3>
          <p>
            By submitting data to the Service, you grant us a limited, non-exclusive license
            to use, store, process, and display Your Data solely for the purpose of providing
            and improving the Service. This license terminates when you delete Your Data or
            close your account.
          </p>

          <h3>5.3 Data Portability</h3>
          <p>
            You may export Your Data at any time using the export features available in the
            Service (PDF reports, Excel exports). Upon account termination, you may request
            a copy of Your Data before deletion.
          </p>

          <h3>5.4 Data Accuracy</h3>
          <p>
            You are responsible for the accuracy and completeness of Your Data. FieldSync
            is a tool that records and reports the information you provide — it does not
            independently verify the accuracy of construction progress, costs, or other
            project data.
          </p>
        </section>

        <section>
          <h2>6. Subscription and Payment</h2>
          <ul>
            <li>Access to the Service may require a paid subscription after any applicable free trial period.</li>
            <li>Subscription fees are billed in advance on a monthly or annual basis.</li>
            <li>All fees are non-refundable except as required by law or as explicitly stated in our refund policy.</li>
            <li>We may change pricing with 30 days&apos; notice. Changes take effect at the start of your next billing cycle.</li>
            <li>If payment fails, we may suspend access to the Service until payment is resolved.</li>
            <li>You are responsible for all taxes applicable to your subscription.</li>
          </ul>
        </section>

        <section>
          <h2>7. Free Trial</h2>
          <p>
            We may offer a free trial period. At the end of the trial, your account will
            require a paid subscription to continue using the Service. We will notify you
            before your trial expires. No charges are made during the trial period.
          </p>
        </section>

        <section>
          <h2>8. Intellectual Property</h2>
          <p>
            The Service, including its design, code, features, documentation, and branding,
            is owned by FieldSync and protected by intellectual property laws. You may not
            copy, modify, distribute, or reverse-engineer any part of the Service. The
            FieldSync name, logo, and related marks are trademarks of FieldSync.
          </p>
        </section>

        <section>
          <h2>9. Third-Party Services</h2>
          <p>
            The Service integrates with third-party services including Supabase (database
            and authentication), Stripe (payment processing), and Vercel (hosting). Your
            use of these services is subject to their respective terms and privacy policies.
            We are not responsible for the practices of third-party service providers.
          </p>
        </section>

        <section>
          <h2>10. Availability and Support</h2>
          <ul>
            <li>We strive to maintain high availability but do not guarantee uninterrupted access.</li>
            <li>The Service includes offline functionality to mitigate connectivity disruptions.</li>
            <li>We may perform maintenance that temporarily affects availability, with advance notice when possible.</li>
            <li>Support is provided via email during business hours.</li>
          </ul>
        </section>

        <section>
          <h2>11. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, FIELDSYNC AND ITS OFFICERS, DIRECTORS,
            EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
            CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS,
            DATA, USE, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE.
          </p>
          <p>
            OUR TOTAL LIABILITY FOR ANY CLAIM ARISING FROM THESE TERMS OR THE SERVICE SHALL
            NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
          </p>
          <p>
            FIELDSYNC IS A TRACKING AND REPORTING TOOL. WE ARE NOT RESPONSIBLE FOR
            CONSTRUCTION DECISIONS, BILLING DISPUTES, OR PROJECT OUTCOMES BASED ON DATA
            ENTERED INTO THE SERVICE.
          </p>
        </section>

        <section>
          <h2>12. Disclaimer of Warranties</h2>
          <p>
            THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY
            KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING WARRANTIES OF
            MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          </p>
        </section>

        <section>
          <h2>13. Indemnification</h2>
          <p>
            You agree to indemnify, defend, and hold harmless FieldSync from any claims,
            damages, losses, or expenses (including reasonable attorneys&apos; fees) arising from
            your use of the Service, your violation of these Terms, or your violation of any
            third-party rights.
          </p>
        </section>

        <section>
          <h2>14. Termination</h2>
          <ul>
            <li>You may cancel your account at any time through the Service or by contacting us.</li>
            <li>We may suspend or terminate your account if you violate these Terms.</li>
            <li>Upon termination, your right to use the Service ceases immediately.</li>
            <li>We will retain Your Data for a reasonable period after termination to allow you to export it, after which it will be deleted.</li>
            <li>Sections on Limitation of Liability, Disclaimer of Warranties, Indemnification, and Governing Law survive termination.</li>
          </ul>
        </section>

        <section>
          <h2>15. Governing Law</h2>
          <p>
            These Terms are governed by and construed in accordance with the laws of the
            State of Delaware, without regard to its conflict of law principles. Any disputes
            arising from these Terms or the Service shall be resolved in the state or federal
            courts located in Delaware.
          </p>
        </section>

        <section>
          <h2>16. Changes to These Terms</h2>
          <p>
            We may modify these Terms at any time. We will provide notice of material changes
            by posting the updated Terms and updating the Effective Date. Your continued use
            of the Service after changes constitutes acceptance. If you do not agree with the
            updated Terms, you must stop using the Service.
          </p>
        </section>

        <section>
          <h2>17. Miscellaneous</h2>
          <ul>
            <li>If any provision of these Terms is found unenforceable, the remaining provisions remain in effect.</li>
            <li>Our failure to enforce any right does not constitute a waiver of that right.</li>
            <li>These Terms constitute the entire agreement between you and FieldSync regarding the Service.</li>
            <li>You may not assign your rights under these Terms without our prior written consent.</li>
          </ul>
        </section>

        <section>
          <h2>18. Contact Us</h2>
          <p>If you have questions about these Terms, contact us at:</p>
          <p>
            <strong>FieldSync</strong><br />
            Email: <strong>legal@fieldsync.com</strong>
          </p>
        </section>
      </div>

      <footer className="legal-footer">
        <p>&copy; {new Date().getFullYear()} FieldSync. All rights reserved.</p>
        <div className="legal-footer-links">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/">Home</Link>
        </div>
      </footer>
    </div>
  )
}
