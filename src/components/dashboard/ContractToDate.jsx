import { formatCurrencyCompact } from '../../lib/utils'

/**
 * ContractToDate - Sidebar waterfall of the contract breakdown:
 * original contract → approved COs → revised contract → billed →
 * pending in review → remaining, with a stacked progress bar.
 */
export default function ContractToDate({
  originalContract,
  changeOrderValue,
  revisedContractValue,
  billable,
  pendingApprovalValue
}) {
  const contract = Number(revisedContractValue) || 0
  const billed = Number(billable) || 0
  const pending = Number(pendingApprovalValue) || 0
  const remainingValue = contract - billed
  const billedPct = contract > 0 ? Math.min(100, Math.round((billed / contract) * 100)) : 0
  const inReviewPct = contract > 0 ? Math.min(100 - billedPct, Math.round((pending / contract) * 100)) : 0
  // T&M-only project: no contract value and nothing earned yet. The waterfall
  // would be a column of $0s, so say what is missing and where to add it.
  const noContract = contract <= 0 && !(billed > 0)

  return (
    <div className="sdx-card sdx-panel" role="region" aria-label="Contract to date">
      <div className="sdx-panel-header">
        <h3 className="sdx-panel-title">Contract to date</h3>
      </div>
      {noContract ? (
        <p className="sdx-empty-row">
          No contract value set — add one in Project Info → Edit Project to track earned vs remaining.
        </p>
      ) : (
        <div className="sdx-waterfall">
          <div className="sdx-wf-row">
            <span>Original contract</span>
            <span className="sdx-wf-val">{formatCurrencyCompact(originalContract)}</span>
          </div>
          <div className="sdx-wf-row">
            <span>+ Approved change orders</span>
            <span className="sdx-wf-val ok">+{formatCurrencyCompact(changeOrderValue)}</span>
          </div>
          <div className="sdx-wf-row sdx-wf-total">
            <span>Revised contract</span>
            <span className="sdx-wf-val strong">{formatCurrencyCompact(contract)}</span>
          </div>
          <div className="sdx-wf-row">
            <span>Billed / earned</span>
            <span className="sdx-wf-val">{formatCurrencyCompact(billed)}</span>
          </div>
          <div className="sdx-wf-row">
            <span>Pending in review</span>
            <span className="sdx-wf-val warn">{formatCurrencyCompact(pending)}</span>
          </div>
          <div className="sdx-wf-row">
            <span>Remaining to bill</span>
            <span className="sdx-wf-val accent">{formatCurrencyCompact(remainingValue)}</span>
          </div>
          <div className="sdx-stack-bar tall" aria-hidden="true">
            <span className="seg-navy" style={{ width: `${billedPct}%` }} />
            <span className="seg-amber" style={{ width: `${inReviewPct}%` }} />
          </div>
          <div className="sdx-legend">
            <span><i className="seg-navy" /> Billed</span>
            <span><i className="seg-amber" /> In review</span>
            <span><i className="seg-track" /> Remaining</span>
          </div>
        </div>
      )}
    </div>
  )
}
