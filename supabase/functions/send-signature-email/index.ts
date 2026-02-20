import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SignatureEmailPayload {
  to: string
  clientName?: string
  documentTitle: string
  documentType: 'cor' | 'tm_ticket'
  signingLink: string
  expiresAt: string | null
  expiresInDays: number | null
}

function buildEmailHtml(payload: SignatureEmailPayload): string {
  const { clientName, documentTitle, documentType, signingLink, expiresAt, expiresInDays } = payload

  const greeting = clientName ? `Hello ${clientName},` : 'Hello,'
  const docLabel = documentType === 'cor' ? 'Change Order Request' : 'T&M Ticket'

  const deadlineText = expiresInDays
    ? `This link will expire in <strong>${expiresInDays} days</strong>${expiresAt ? ` (${new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })})` : ''}.`
    : 'This link does not expire.'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Signature Requested — ${documentTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#1a2332;padding:28px 40px;">
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">FieldSync</p>
              <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">Signature Request</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;color:#1a2332;font-size:16px;">${greeting}</p>
              <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
                You have been asked to review and sign the following document:
              </p>

              <!-- Document card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 4px;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${docLabel}</p>
                    <p style="margin:0;color:#1a2332;font-size:18px;font-weight:600;">${documentTitle}</p>
                  </td>
                </tr>
              </table>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#2563eb;border-radius:6px;">
                    <a href="${signingLink}" target="_blank"
                       style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                      Review &amp; Sign Document →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Deadline notice -->
              <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6;">
                ${deadlineText}
              </p>

              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px;" />

              <!-- Link fallback -->
              <p style="margin:0 0 6px;color:#64748b;font-size:13px;">If the button above doesn't work, paste this link into your browser:</p>
              <p style="margin:0;word-break:break-all;">
                <a href="${signingLink}" style="color:#2563eb;font-size:13px;">${signingLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
                You received this email because a team member sent you a document for signature via FieldSync.
                No account is required — just click the link above.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const payload: SignatureEmailPayload = await req.json()
    const { to, documentTitle, documentType } = payload

    if (!to || !documentTitle || !documentType) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, documentTitle, documentType' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'Email service not configured (RESEND_API_KEY missing)' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const fromAddress = Deno.env.get('EMAIL_FROM') || 'FieldSync <noreply@fieldsync.app>'
    const docLabel = documentType === 'cor' ? 'Change Order Request' : 'T&M Ticket'
    const subject = `Signature required: ${docLabel} — ${documentTitle}`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject,
        html: buildEmailHtml(payload),
      }),
    })

    const result = await res.json()

    if (!res.ok) {
      console.error('Resend API error:', result)
      return new Response(
        JSON.stringify({ error: 'Email delivery failed', detail: result }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, id: result.id }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('send-signature-email error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal error', detail: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }
})
