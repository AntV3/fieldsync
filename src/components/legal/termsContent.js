import { LEGAL } from '../../lib/legal'

const P = LEGAL.PRODUCT
const US = LEGAL.LEGAL_ENTITY

/**
 * Terms of Service text. Drafted for review by a licensed attorney; see
 * docs/LEGAL_REVIEW.md for the points that need a lawyer's decision.
 */
export const TERMS_INTRO = [
  `These Terms of Service ("Terms") are a binding agreement between ${US} ("we", "us", "our") and the company or other organization that signs up for ${P} ("Customer", "you"). They govern every use of the ${P} websites, web app, mobile apps, links and related services (the "Service"). Please read them carefully: they limit our liability and explain who is responsible for the information entered into the Service.`
]

export const TERMS_SECTIONS = [
  {
    id: 'acceptance',
    title: 'Agreeing to these Terms',
    blocks: [
      { p: `You accept these Terms when you create a company account, join a company, accept an invitation, check the agreement box, or use the Service. If you accept on behalf of a company, you confirm that you are authorized to bind that company, and "you" means the company.` },
      { p: `If you do not agree, do not use the Service. You must be at least 18 years old and able to form a binding contract to create an account.` },
      { p: `The Service is a business tool. It is not offered to consumers for personal, family or household use.` }
    ]
  },
  {
    id: 'definitions',
    title: 'Definitions',
    blocks: [
      {
        dl: [
          ['Customer Data', 'Everything you or your Users enter or upload into the Service: projects, tickets, hours, crews, materials, change orders, reports, photos, documents, signatures, messages, contacts and similar content.'],
          ['User', 'A person who uses the Service under your account: an office user with a login, or a field user who signs in with your company code and a project PIN.'],
          ['External Party', 'Someone outside your company who receives a link from you, such as a client, general contractor, owner or inspector who views a share link, signs a document or uses the client portal.'],
          ['Administrator', 'A User with administrator access to your company account.']
        ]
      }
    ]
  },
  {
    id: 'service',
    title: 'The Service',
    blocks: [
      { p: `${P} helps construction companies record field work (time and material tickets, crews, daily reports, photos, observations, disposal loads and similar records), collect signatures, prepare and send change order requests, and share project information with their clients.` },
      { p: `We may improve, change or remove features. If we remove a feature you rely on in a material way, we will try to tell you in advance.` }
    ]
  },
  {
    id: 'beta',
    title: 'Beta service',
    blocks: [
      { p: `${P} is currently offered as a beta. During the beta:` },
      {
        ul: [
          'The Service may contain errors, may be interrupted, and may change or be withdrawn without notice.',
          'Data may in rare cases be lost, delayed or corrupted. Keep your own copies of anything critical to billing, claims or disputes (see "Your records" below).',
          'There is no service-level commitment, and support is provided on a best-effort basis.',
          'We may end the beta at any time. If we do, we will give you reasonable notice and a chance to export your Customer Data.'
        ]
      }
    ]
  },
  {
    id: 'accounts',
    title: 'Accounts, access and security',
    blocks: [
      { h3: 'Your account' },
      {
        ul: [
          'Give accurate information and keep it up to date.',
          'Keep passwords confidential. Each person must use their own login; do not share logins.',
          'Administrators decide who joins the company, what each member may do (for example approve tickets, send change orders or manage client access), and when access is removed. You are responsible for those decisions.',
          'Tell us promptly at ' + LEGAL.CONTACT_SECURITY + ' if you suspect unauthorized access.'
        ]
      },
      { h3: 'Field access (company code and project PIN)' },
      { p: 'Field users sign in with your company code and a project PIN instead of a personal login. Anyone who has both can enter that project as a field user. You are responsible for who you give them to, for choosing PINs that are hard to guess, and for changing a PIN when a person should no longer have access. Activity recorded through a field session is treated as activity by your company.' },
      { h3: 'Links you send' },
      { p: 'Share links, signing links and client portal links give access to anyone who has the link, without a login. You are responsible for sending them only to the intended person, for the information you choose to expose through them, and for switching off or revoking links that are no longer needed. The Service lets you revoke portal access and signing links at any time.' },
      { p: 'You are responsible for all activity under your account, your field sessions and your links, except to the extent caused by our breach of these Terms.' }
    ]
  },
  {
    id: 'customer-data',
    title: 'Your data',
    blocks: [
      { h3: 'You own it' },
      { p: 'As between you and us, you own your Customer Data. We do not sell it and we do not use it to advertise.' },
      { h3: 'What you allow us to do' },
      { p: 'You give us a limited, worldwide, non-exclusive licence to host, copy, process, transmit and display Customer Data only as needed to provide, secure, support and improve the Service, to prevent abuse, and to comply with law. This includes showing it to the Users and External Parties you give access to and sending emails you or the Service trigger (for example signing requests and signature notifications).' },
      { p: 'We may create aggregated, de-identified statistics about use of the Service (for example how many tickets are created per month) that do not identify you, your Users or any person, and use them to run and improve the Service.' },
      { h3: 'Your responsibilities for the data' },
      {
        ul: [
          'You are responsible for the accuracy, quality and legality of Customer Data and for having the rights and permissions needed to put it into the Service.',
          'You are responsible for giving your workers and other people whose information you record any notice, and obtaining any consent, that the law requires: for example for names, hours, photos that show people, location data attached to photos, signatures, and injury or incident details.',
          'Do not upload government identification numbers (such as Social Security numbers), payment card or bank account numbers, passwords, or health information beyond what an incident report reasonably needs. The Service is not designed for these and they are not protected to the standard that some laws require for them.',
          'You are responsible for meeting any retention, privacy or confidentiality obligations you owe to your clients, workers or others, including under your contracts.'
        ]
      },
      { h3: 'Your records' },
      { p: `${P} is a working tool, not an archive of record. Keep your own copies of signed tickets, change orders, invoices and other documents you may need for billing, claims, liens, audits or disputes. The Service provides PDF and spreadsheet exports for this.` }
    ]
  },
  {
    id: 'signatures',
    title: 'Electronic signatures and records',
    blocks: [
      { p: 'The Service lets your foremen, your clients and other External Parties sign tickets and change orders electronically, on a phone or through a signing link. By using these features you agree that:' },
      {
        ul: [
          'Electronic signatures and records made through the Service are intended to have the same effect as handwritten signatures and paper records, to the extent permitted by law, including the U.S. Electronic Signatures in Global and National Commerce Act (ESIGN) and the Uniform Electronic Transactions Act (UETA) as adopted in your state.',
          'Each signer is shown a consent to sign electronically before signing. With each signature the Service records the signer\'s name, any title and company they enter, the date and time, and (for signing links) their IP address and browser details.',
          'The Service does not verify the identity of a signer. A signing link can be used by whoever opens it. If you need stronger identity checks, use another method.',
          'You are responsible for deciding whether an electronic signature is acceptable for a document, and for meeting any requirement in your contract or the law for a particular form of signature, notarization, witness, delivery method or paper original.',
          'We are not a party to any document signed through the Service, and we are not responsible for its terms, validity or enforcement.',
          'A signer may ask you, not us, for a paper copy of a document they signed.'
        ]
      }
    ]
  },
  {
    id: 'construction',
    title: 'Construction records, change orders and calculations',
    blocks: [
      { p: 'Because of how the Service is used, please note in particular:' },
      {
        ul: [
          'We are not a party to your construction contracts or subcontracts and are not a contractor, construction manager, engineer, architect, inspector or safety advisor.',
          'We do not check or verify hours, crews, materials, quantities, prices, rates, markups, scope or progress. Totals, markups, fees, change order amounts, draw requests, invoices, AIA-style forms, and accounting exports are calculated from the data and settings you enter and are provided for convenience. You must review them before you rely on them, send them or bill from them.',
          'Approving, sending, signing, returning or voiding a ticket or change order in the Service does not by itself satisfy any notice, claim, change order, pay application, lien, bond, prompt payment or dispute procedure, form or deadline in your contracts or under the law. You remain responsible for meeting those requirements and deadlines.',
          'Comments and requested changes from a client in the Service are not a substitute for any written notice your contract requires.',
          'Injury and incident reports in the Service are records for your own use. They do not file or satisfy any reporting obligation to OSHA, a state agency, an insurer or a workers\' compensation carrier. You are responsible for those reports and their deadlines, and in an emergency you must contact emergency services directly.',
          'Nothing in the Service is legal, accounting, tax, insurance, engineering or safety advice.'
        ]
      }
    ]
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    blocks: [
      { p: 'You and your Users must not:' },
      {
        ul: [
          'break the law, or use the Service to defraud, mislead or harm anyone, including by creating false records, backdating, or forging or reusing another person\'s signature;',
          'access, or try to access, another company\'s data, or any account, project, PIN, link or system you are not authorized to use; probe, scan or test the Service for vulnerabilities except as allowed in "Reporting security issues" below;',
          'guess or attempt to guess codes, PINs, tokens or links, or get around rate limits, access controls or security measures;',
          'upload malware or content that infringes someone else\'s rights, or that is unlawful, harassing or obscene;',
          'scrape the Service, use it to build a competing product, or copy, modify, reverse-engineer or resell it, except as the law expressly allows;',
          'overload or interfere with the Service or its infrastructure;',
          'store the categories of information listed as not allowed in "Your data".'
        ]
      },
      { p: 'We may remove content or suspend access that we reasonably believe breaks these rules (see "Suspension").' }
    ]
  },
  {
    id: 'third-parties',
    title: 'Service providers and third-party services',
    blocks: [
      { p: 'We use service providers to run the Service, for example for hosting, database, file storage and authentication, and for sending email. They process Customer Data on our behalf under their own security and data protection commitments. The current list is in our Privacy Policy.' },
      { p: 'Email delivery depends on the recipient\'s mail system. We do not guarantee that an email sent by the Service (such as a signing request) is delivered, read or not marked as spam. Confirm important communications by other means.' },
      { p: 'If you connect or export to third-party software (for example an accounting system), your use of that software is governed by its own terms.' }
    ]
  },
  {
    id: 'security',
    title: 'Security and incidents',
    blocks: [
      { p: 'We use reasonable administrative, technical and organizational measures designed to protect Customer Data, described in our Privacy Policy. These include encrypted connections, separation of each company\'s data in the database, and access controls on files and links. No system is perfectly secure, and we do not promise that the Service will be free of security incidents.' },
      { p: 'If we become aware of unauthorized access to your Customer Data in our systems, we will notify your Administrators without undue delay and give the information we reasonably can to help you meet your own obligations.' },
      { h3: 'Reporting security issues' },
      { p: 'If you find a vulnerability, report it to ' + LEGAL.CONTACT_SECURITY + ' and do not access, change or delete data that is not yours. We will not pursue good-faith reports that follow this rule.' }
    ]
  },
  {
    id: 'confidentiality',
    title: 'Confidentiality',
    blocks: [
      { p: 'Each of us will protect the other\'s non-public information received in connection with the Service with reasonable care, and use it only for the purposes of these Terms. This does not apply to information that is or becomes public through no fault of the receiving party, that the receiving party already had or independently developed, or that it must disclose by law (in which case it will give notice where allowed).' }
    ]
  },
  {
    id: 'fees',
    title: 'Fees',
    blocks: [
      { p: 'The Service is free during the beta. We do not ask for payment details during the beta.' },
      { p: 'We plan to introduce paid plans. We will give you at least 30 days\' notice before any feature you use becomes paid, and you will never be charged unless you choose a paid plan and agree to its price and terms. If you do not, you may export your Customer Data and stop using the Service.' }
    ]
  },
  {
    id: 'suspension',
    title: 'Suspension',
    blocks: [
      { p: 'We may suspend all or part of your access if we reasonably believe it is necessary to prevent harm to the Service, to other customers or to any person, to stop a breach of these Terms, or to comply with law. We will tell you the reason where we lawfully can, limit the suspension to what is needed, and restore access once the issue is resolved.' }
    ]
  },
  {
    id: 'termination',
    title: 'Ending the agreement, export and deletion',
    blocks: [
      {
        ul: [
          'You may stop using the Service at any time and ask us to close your company account by writing to ' + LEGAL.CONTACT_PRIVACY + '.',
          'We may end these Terms for convenience with 30 days\' notice, or immediately if you seriously or repeatedly breach them.',
          'Before your account closes, and for 30 days afterwards, you may export your Customer Data with the export features or ask us for a copy.',
          'After that period we will delete Customer Data from the active Service within a reasonable time, except where the law requires us to keep it. Copies in backups are deleted as the backups expire.',
          'Sections that by their nature should survive (including Your data, Construction records, Disclaimers, Limitation of liability, Indemnity and Disputes) survive the end of these Terms.'
        ]
      }
    ]
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers',
    blocks: [
      { caps: 'EXCEPT AS EXPRESSLY STATED IN THESE TERMS, THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE". TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT AND ACCURACY, AND ANY WARRANTY THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR THAT DATA WILL NOT BE LOST.' },
      { caps: 'WE ARE NOT RESPONSIBLE FOR CONSTRUCTION, SAFETY, STAFFING, BILLING OR LEGAL DECISIONS MADE USING THE SERVICE, OR FOR THE OUTCOME OF ANY PROJECT, CLAIM, CHANGE ORDER, PAYMENT OR DISPUTE.' }
    ]
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    blocks: [
      { caps: 'TO THE FULLEST EXTENT PERMITTED BY LAW, NEITHER PARTY WILL BE LIABLE TO THE OTHER FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, PAYMENTS, CLAIMS OR CHANGE ORDER AMOUNTS, LOST OR CORRUPTED DATA, DELAY, OR COST OF SUBSTITUTE SERVICES, ARISING OUT OF OR RELATED TO THE SERVICE OR THESE TERMS, EVEN IF ADVISED OF THEIR POSSIBILITY.' },
      { caps: 'TO THE FULLEST EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATED TO THE SERVICE OR THESE TERMS WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID US FOR THE SERVICE IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM AND (B) ONE HUNDRED U.S. DOLLARS (US $100).' },
      { p: 'These limits do not apply to your payment obligations, to your indemnity obligations, to a party\'s breach of the acceptable use rules, or to liability that cannot be limited by law (such as for fraud or wilful misconduct).' }
    ]
  },
  {
    id: 'indemnity',
    title: 'Indemnity',
    blocks: [
      { p: 'You will defend and indemnify us and our officers, employees and agents against third-party claims, and pay the resulting damages, costs and reasonable attorneys\' fees, to the extent they arise from: your Customer Data; your or your Users\' use of the Service in breach of these Terms or the law; any dispute between you and your clients, subcontractors, workers or External Parties (including about hours, materials, change orders, payment, signatures or injuries); or links and access you grant.' },
      { p: 'We will tell you promptly about any such claim, let you control the defence (you may not settle in a way that admits fault for us or imposes obligations on us without our consent), and give reasonable help at your cost.' }
    ]
  },
  {
    id: 'disputes',
    title: 'Governing law and disputes',
    blocks: [
      { p: `These Terms are governed by the laws of the State of ${LEGAL.GOVERNING_STATE} and applicable U.S. federal law, without regard to conflict-of-law rules. The UN Convention on Contracts for the International Sale of Goods does not apply.` },
      { p: 'Before starting any formal proceeding, the party with a complaint will contact the other in writing and both will try in good faith to resolve it within 30 days.' },
      { p: `Any dispute that is not resolved will be decided exclusively in ${LEGAL.VENUE}, and both parties consent to their jurisdiction. Either party may seek urgent injunctive relief in any competent court.` },
      { caps: 'TO THE EXTENT PERMITTED BY LAW, EACH PARTY WAIVES ITS RIGHT TO A JURY TRIAL, AND CLAIMS MAY BE BROUGHT ONLY IN AN INDIVIDUAL CAPACITY AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY CLASS OR REPRESENTATIVE PROCEEDING.' },
      { p: 'Any claim must be brought within one year after it arises, unless the law requires a longer period.' }
    ]
  },
  {
    id: 'changes',
    title: 'Changes to these Terms',
    blocks: [
      { p: 'We may update these Terms. For a material change we will give at least 30 days\' notice by email to your Administrators or in the Service before it takes effect, unless the change is required sooner by law or to address a security risk. The version number and effective date at the top show which version applies. If you keep using the Service after the change takes effect, the new Terms apply; if you do not agree, stop using the Service and you may export your data.' }
    ]
  },
  {
    id: 'general',
    title: 'General',
    blocks: [
      {
        ul: [
          'Entire agreement: these Terms and the Privacy Policy are the entire agreement about the Service and replace any earlier agreement on the subject. Terms in your purchase orders or other documents do not apply.',
          'Electronic notices: you agree to receive notices from us electronically, by email to your Administrators or in the Service. Notices to us must be sent to ' + LEGAL.CONTACT_LEGAL + '.',
          'Assignment: you may not transfer these Terms without our written consent. We may transfer them in a merger, acquisition or sale of all or substantially all of our business or assets, with notice to you.',
          'Force majeure: neither party is liable for delay or failure caused by events beyond its reasonable control, such as outages of internet or hosting providers, natural disasters, or government action.',
          'Independent parties: the parties are independent contractors. There are no third-party beneficiaries, including your Users and External Parties.',
          'Export and sanctions: you will not use the Service in violation of U.S. export control or sanctions laws.',
          'Severability and waiver: if a provision is unenforceable, it will be enforced to the maximum extent possible and the rest remains in effect. Not enforcing a provision is not a waiver.',
          'Feedback: if you send us suggestions, we may use them without obligation to you.'
        ]
      }
    ]
  },
  {
    id: 'contact',
    title: 'Contact',
    blocks: [
      { p: `${US}. Legal notices: ${LEGAL.CONTACT_LEGAL}. Privacy and data requests: ${LEGAL.CONTACT_PRIVACY}. Security issues: ${LEGAL.CONTACT_SECURITY}.` }
    ]
  }
]
