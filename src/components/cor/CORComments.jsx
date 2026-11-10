import { useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'

const formatWhen = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/**
 * CORComments - The back-and-forth between the client and the office on a
 * change order. `viewer` decides which side reads as "you". Pass onReply to
 * let the viewer add a comment (the office replies; the client comments
 * through "Request changes" on the signing page).
 */
export default function CORComments({ comments, viewer = 'office', onReply, busy = false }) {
  const [draft, setDraft] = useState('')
  if (!comments || (comments.length === 0 && !onReply)) return null

  const submit = async (e) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body || busy) return
    const ok = await onReply(body)
    if (ok !== false) setDraft('')
  }

  return (
    <section className="cor-comments" aria-label="Comments with the client">
      <h3><MessageSquare size={18} aria-hidden="true" /> Comments with the client</h3>
      {comments.length === 0 ? (
        <p className="cor-comments-empty">No comments yet.</p>
      ) : (
        <ol className="cor-comment-list">
          {comments.map(comment => (
            <li key={comment.id} className={`cor-comment cor-comment--${comment.author_side === viewer ? 'mine' : 'theirs'}`}>
              <div className="cor-comment-head">
                <strong>{comment.author_name || (comment.author_side === 'client' ? 'Client' : 'Office')}</strong>
                <span className="cor-comment-side">{comment.author_side === 'client' ? 'Client' : 'Contractor'}</span>
                <span className="cor-comment-when">{formatWhen(comment.created_at)}</span>
              </div>
              <p className="cor-comment-body">{comment.body}</p>
            </li>
          ))}
        </ol>
      )}
      {onReply && (
        <form className="cor-comment-form" onSubmit={submit}>
          <label className="sr-only" htmlFor="cor-comment-reply">Reply to the client</label>
          <textarea
            id="cor-comment-reply"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Reply to the client"
            rows={2}
            maxLength={4000}
          />
          <button type="submit" className="btn btn-secondary" disabled={busy || !draft.trim()}>
            <Send size={15} aria-hidden="true" /> Reply
          </button>
        </form>
      )}
    </section>
  )
}
