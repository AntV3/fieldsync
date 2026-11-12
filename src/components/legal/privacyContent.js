import { LEGAL } from '../../lib/legal'

const P = LEGAL.PRODUCT
const US = LEGAL.LEGAL_ENTITY

/**
 * Privacy Policy text. Every statement here was checked against the code on
 * 2026-11-12 (see docs/LEGAL_REVIEW.md, section 4). When the app changes how
 * it collects, shares, keeps or protects data, update this file and bump
 * LEGAL.PRIVACY_VERSION.
 */
export const PRIVACY_INTRO = [
  `This Privacy Policy explains what information ${US} ("we", "us") handles when people use ${P}, a construction field and change order app, and what we do with it.`,
  `${P} is used by construction companies (our "Customers"). Most information in ${P} is entered by a Customer and its people about their projects, crews, clients and work. For that information the Customer decides what is collected and why, and we process it on the Customer's behalf and under its instructions. If you are a worker, client or signer and have a question about information a company holds about you, please contact that company first; we will help it respond.`
]

export const PRIVACY_SECTIONS = [
  {
    id: 'who',
    title: 'Whose information we handle',
    blocks: [
      {
        dl: [
          ['Office users', 'People at a Customer who sign in with an email and password.'],
          ['Field users', 'Foremen and crew leads who sign in with the company code and a project PIN. They do not have an individual account.'],
          ['Crew members', 'Workers whose names, hours and roles are recorded on tickets and crew check-ins, and who may sign a crew sign-in sheet.'],
          ['Clients and signers', 'People outside the Customer (for example a general contractor or owner) who view a shared project, sign a ticket or change order, or use the client portal.'],
          ['Visitors', 'Anyone who opens our website.']
        ]
      }
    ]
  },
  {
    id: 'collect',
    title: 'Information we collect',
    blocks: [
      { h3: 'Account and company information' },
      { ul: ['Name and email address of office users, and the company name. Passwords are handled by our authentication provider; we never see or store them in readable form.', 'The company code, office code and project PINs that the Customer sets up for field access, and which members hold which permissions.'] },
      { h3: 'Project and field records' },
      {
        ul: [
          'Projects: name, address, job number, contract value, and the contact details (name, position, phone, email) of the client and general contractor that the Customer enters.',
          'Time and material tickets, daily reports, crew check-ins and observations, including workers\' names, roles, hours, overtime and start and end times, materials and equipment, notes, and the name of the person who submitted them.',
          'Change orders, their costs and markups, comments exchanged with clients, invoices and draw requests.',
          'Messages between the field and the office, punch lists, RFIs, documents and files the Customer uploads.'
        ]
      },
      { h3: 'Photos and location' },
      {
        ul: [
          'Photos taken or uploaded in the app.',
          'When the device allows location access, the GPS position (latitude, longitude and accuracy) at the time a ticket photo was taken is saved with the ticket. It is not shown on share links, signing pages or the client portal. Field users can refuse the device\'s location permission.',
          'When a photo is uploaded, the app redraws it, which removes the photo\'s embedded metadata (such as camera GPS position and device details). A photo the device cannot redraw (rare formats) is uploaded as it is.'
        ]
      },
      { h3: 'Signatures' },
      {
        ul: [
          'Signature images and the name, title and company the signer enters, with the date and time.',
          'For signatures made through a signing link, the IP address reported for the connection and the browser details. These are kept as part of the signature record. The IP address is the one our hosting provider reports and may not identify the signer\'s exact location or device.',
          'For signatures made on a foreman\'s device, the browser details of that device.',
          'Crew sign-in sheets ask each worker for their printed name, a signature and the last four digits of their Social Security number, which the Customer uses to identify workers on its sign-in records. These are stored with the crew check-in and appear in the sign-in sheet PDFs the Customer generates.'
        ]
      },
      { h3: 'Injury and incident reports' },
      { p: 'If a Customer uses incident reporting, the report can contain the injured employee\'s name, contact details, job title and hire date, what happened, the body part and type of injury, whether medical treatment or hospitalization was needed and where, and witnesses\' names, contact details and statements. This is sensitive information. It is visible only to the Customer\'s signed-in members; field users can file a report but cannot read reports back.' },
      { h3: 'Links and the client portal' },
      { p: 'For signing links, share links and portal access we keep the recipient name and email the Customer enters, when the link was created and expires, and how many times and when it was last viewed. We do not record the IP address of people who only view a link.' },
      { h3: 'Device and technical information' },
      {
        ul: [
          'A random identifier stored on a field user\'s device, used to limit repeated wrong PIN attempts.',
          'A record of failed and successful PIN sign-in attempts (time, device identifier, and which company), used to stop PIN guessing.',
          'Error reports from the app (what failed, the technical error message and where in the app it happened, and the company, user and project involved), and timings of slow requests, used to fix problems.',
          'Standard web server logs kept by our hosting provider, which include IP addresses, browser details and the addresses of pages requested.'
        ]
      },
      { h3: 'What we do not collect' },
      { ul: ['We do not use advertising or analytics trackers, and we do not sell or rent personal information.', 'We do not collect payment card details.'] }
    ]
  },
  {
    id: 'use',
    title: 'How we use information',
    blocks: [
      {
        ul: [
          'To provide the Service: store and show records to the right people, sync field and office, generate PDFs and exports, and send emails the Customer\'s actions trigger (signing requests, signature notifications, ticket notices).',
          'To keep the Service secure: separate each company\'s data, check access, limit PIN guessing, and investigate misuse.',
          'To support Customers and fix problems.',
          'To improve the Service using aggregated, de-identified statistics.',
          'To comply with law and enforce our Terms.'
        ]
      },
      { p: 'We do not use Customer records to advertise to anyone, and we do not use them to train artificial intelligence models.' }
    ]
  },
  {
    id: 'sharing',
    title: 'Who can see it and who we share it with',
    blocks: [
      { h3: 'Within the Customer' },
      { p: 'Each company\'s records are visible only to that company\'s active members, according to the permissions its administrators set, and to field users signed in to that company\'s projects (who see only their own project). Removed or pending members cannot see the company\'s records.' },
      { h3: 'People the Customer sends links to' },
      { p: 'A share link shows the project information the Customer chose (progress, tickets and/or daily reports, never contact details, workers or PINs). A signing link shows the document to be signed and its photos. A client portal link shows that project\'s submitted change orders. Anyone holding one of these links can open it, so Customers should send them only to the intended person and revoke them when no longer needed.' },
      { h3: 'Service providers (sub-processors)' },
      {
        dl: [
          ['Supabase', 'Database, file storage and user authentication. Holds all Customer records and files.'],
          ['Vercel', 'Hosting of the website and app. Processes every web request, including server logs.'],
          ['Resend', 'Sending email. Receives the recipient\'s name and email address and the content of each email, which can include project names, document details, workers\' names and hours on a ticket, change order totals, and signing links.'],
          ['Google Fonts and CDNFonts', 'Typefaces for the website. Your browser requests them directly, which shares your IP address and browser details with those services.']
        ]
      },
      { p: 'If the Customer uses our mobile app on Android, the device\'s own backup service may back up app data under the device owner\'s settings.' },
      { h3: 'Other disclosures' },
      { p: 'We disclose information if required by law, subpoena or court order, to protect the rights, safety or property of anyone, or as part of a merger, acquisition or sale of our business (in which case this policy continues to apply to the transferred information).' }
    ]
  },
  {
    id: 'security',
    title: 'How we protect information',
    blocks: [
      {
        ul: [
          'All connections use HTTPS. Our website sends strict security headers (HSTS, a content security policy, and protections against framing and content sniffing).',
          'Data is stored with our database provider, which encrypts it at rest.',
          'Each company\'s data is separated by database-level access rules, so one company cannot read or change another\'s records. These rules are tested against our live database.',
          'Ticket photos and project documents are kept in private storage and opened through links that expire after one hour.',
          'Project PINs are checked only against a bcrypt hash, are never sent to field devices or kept in offline copies, and archived projects stop accepting their PIN. Repeated wrong PINs are blocked per device and per company, without locking out devices that have signed in before. Office users can add two-factor authentication to their login.',
          'Signing links, share links, portal links and field sessions use long cryptographically random tokens, always expire (at most one year for links; 12 hours for field sessions, or 30 days if the user chose "remember me"), and can be revoked at any time. Field sessions end when the user signs out.',
          'Public pages (share links, signing links, client portal) return only a fixed list of fields; they never return GPS positions, signer IP addresses, contact details or PINs.'
        ]
      },
      { p: 'No system is completely secure. If we learn that personal information in our systems was accessed without authorization, we will notify the affected Customers without undue delay so they can notify the people concerned where the law requires.' }
    ]
  },
  {
    id: 'device',
    title: 'Information stored on your device',
    blocks: [
      { p: `${P} works offline, so it keeps copies of some information on the phone or computer: the sign-in session, recent projects (never their PINs), tickets, crew check-ins (including crew sign-in details), daily reports and messages, unsent tickets and photos waiting to upload, and draft tickets. Signing out ends the session on our servers and deletes the offline copies of company data from the device; unsent tickets, photos and drafts are kept so no work is lost, and are removed once they are sent or discarded. The Android app does not include its data in device backups. Signing, portal and share link addresses are not stored in the app's offline cache. Use a device lock on any phone used for field work.` },
      { p: 'We use browser storage only for these purposes and for preferences (such as theme). We do not use advertising or tracking cookies.' }
    ]
  },
  {
    id: 'retention',
    title: 'How long we keep information',
    blocks: [
      {
        ul: [
          'Customer records and files are kept while the Customer\'s account is active, unless the Customer deletes them sooner.',
          'When a Customer closes its account, it has 30 days to export its records; we then delete them from the active Service within a reasonable time, and from backups as the backups expire.',
          'Signature records are kept with the document they belong to, because they are evidence of what was signed.',
          'Sign-in attempt records are deleted after 24 hours, expired field sessions daily, error reports after 180 days, slow-request timings after 90 days, and records of sent emails after 180 days. Activity and document logs are kept with the company\'s records as an audit trail.',
          'We may keep information longer where the law requires it or to resolve disputes.'
        ]
      }
    ]
  },
  {
    id: 'rights',
    title: 'Your choices and rights',
    blocks: [
      { p: 'Depending on where you live, you may have the right to know what personal information is held about you, to get a copy, to correct it, to delete it, or to object to or limit some uses.' },
      {
        ul: [
          'Office users can update their name in their account settings.',
          `For information a company recorded about you (for example as a worker, client or signer), contact that company; it controls those records. If you contact us, we will pass your request to the company and help it respond.`,
          `For anything else, or to close an account, email ${LEGAL.CONTACT_PRIVACY}. We will verify the request and respond within the time the law requires (generally 30 to 45 days).`,
          'You can refuse location access on your device; photos are then saved without a GPS position.'
        ]
      },
      { p: 'We will not discriminate against anyone for exercising these rights. We do not sell or share personal information for cross-context behavioral advertising.' }
    ]
  },
  {
    id: 'children',
    title: 'Children',
    blocks: [
      { p: `${P} is a business tool for adults. It is not directed to children, and accounts may only be created by people 18 or older. If we learn that we hold information about a child provided in breach of this rule, we will delete it.` }
    ]
  },
  {
    id: 'transfers',
    title: 'Where information is stored',
    blocks: [
      { p: 'Information is stored and processed in the United States by us and our service providers. If you use the Service from another country, your information is transferred to the United States, whose data protection laws may differ from yours.' }
    ]
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    blocks: [
      { p: 'When we change this policy we update the version and effective date above. For a material change we will notify Customers\' administrators by email or in the Service before it takes effect.' }
    ]
  },
  {
    id: 'contact',
    title: 'Contact',
    blocks: [
      { p: `${US}. Privacy questions and requests: ${LEGAL.CONTACT_PRIVACY}. Security issues: ${LEGAL.CONTACT_SECURITY}.` }
    ]
  }
]
