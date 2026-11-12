import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../Logo'
import { LEGAL } from '../../lib/legal'

/**
 * Renders a legal document from plain data so the text lives in one readable
 * place. Each section: { id, title, blocks }, where a block is one of
 *   { p: 'text' }          paragraph
 *   { caps: 'TEXT' }       paragraph in capitals (warranty / liability text)
 *   { h3: 'text' }         sub-heading
 *   { ul: ['a', 'b'] }     bulleted list
 *   { dl: [['term', 'definition'], ...] }  definition list
 */
export default function LegalDocument({ title, effective, version, intro, sections, otherLink }) {
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
        <h1>{title}</h1>
        <p className="legal-effective">
          Effective {effective} · Version {version}
        </p>
        {intro?.map((text, i) => <p key={i}>{text}</p>)}

        <nav className="legal-toc" aria-label="Contents">
          <h2>Contents</h2>
          <ol>
            {sections.map(section => (
              <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>
            ))}
          </ol>
        </nav>

        {sections.map((section, index) => (
          <section key={section.id} id={section.id}>
            <h2>{index + 1}. {section.title}</h2>
            {section.blocks.map((block, i) => {
              if (block.h3) return <h3 key={i}>{block.h3}</h3>
              if (block.caps) return <p key={i} className="legal-caps">{block.caps}</p>
              if (block.ul) return <ul key={i}>{block.ul.map((item, j) => <li key={j}>{item}</li>)}</ul>
              if (block.dl) {
                return (
                  <dl key={i}>
                    {block.dl.map(([term, def]) => (
                      <div key={term} className="legal-dl-row">
                        <dt>{term}</dt>
                        <dd>{def}</dd>
                      </div>
                    ))}
                  </dl>
                )
              }
              return <p key={i}>{block.p}</p>
            })}
          </section>
        ))}
      </div>

      <footer className="legal-footer">
        <p>&copy; {new Date().getFullYear()} {LEGAL.LEGAL_ENTITY}. All rights reserved.</p>
        <div className="legal-footer-links">
          <Link to={otherLink.to}>{otherLink.label}</Link>
          <Link to="/">Home</Link>
        </div>
      </footer>
    </div>
  )
}
