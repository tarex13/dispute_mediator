import { useCallback, useMemo } from 'react';
import { AgGridReact, AgGridProvider } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { disputeTheme } from './theme.js';
import {
  REASON_LABELS, WAITING_LABELS, WAITING_STYLES, URGENCY_STYLES,
  ACTION_STYLES, money, recSummary,
} from './labels.js';

ModuleRegistry.registerModules([AllCommunityModule]);

const Badge = ({ className, children }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
    {children}
  </span>
);

// Each renderer receives `params`; params.data is the DisputeCard row.
const TitleCell = ({ data }) => (
  <div className="flex flex-col justify-center leading-tight py-1">
    <span className="font-medium text-slate-100">
      {data.title}
      {data.source === 'demo' && <span className="ml-2 text-xs font-normal text-slate-500">Sample</span>}
    </span>
    <span className="text-xs text-slate-500">{data.id}</span>
  </div>
);

const WaitingCell = ({ value }) => (
  <Badge className={WAITING_STYLES[value] ?? WAITING_STYLES.unknown}>{WAITING_LABELS[value] ?? value}</Badge>
);

const DaysCell = ({ value, data }) =>
  value === null || value === undefined ? (
    <span className="text-gray-400">—</span>
  ) : (
    <Badge className={URGENCY_STYLES[data.analysis.urgency] ?? URGENCY_STYLES.normal}>
      {value <= 0 ? 'Overdue' : `${value} day${value === 1 ? '' : 's'}`}
    </Badge>
  );

const EvidenceCell = ({ data, value }) => {
  if (data.analysis.waitingOn !== 'seller') return <span className="text-gray-400">—</span>;
  return value === 0
    ? <Badge className="bg-emerald-100 text-emerald-800">Complete</Badge>
    : <Badge className="bg-amber-100 text-amber-800">{value} missing</Badge>;
};

const AgentCell = ({ data, value }) => {
  if (data.approved) {
    return <Badge className="bg-emerald-600 text-white">{data.approved.mode === 'demo' ? 'Approved (demo)' : 'Approved'}</Badge>;
  }
  if (!value) return <span className="text-xs text-gray-400">Not generated yet</span>;
  return <Badge className={ACTION_STYLES[data.rec.action]}>{value}</Badge>;
};

// Soonest deadline first; disputes with no deadline go last.
const byDaysLeft = (a, b) => {
  const x = a ?? Infinity;
  const y = b ?? Infinity;
  return x === y ? 0 : x - y;
};

const columnDefs = [
  { headerName: 'Dispute', flex: 2, minWidth: 240, valueGetter: (p) => p.data.title, cellRenderer: TitleCell },
  {
    headerName: 'Amount', width: 130,
    valueGetter: (p) => p.data.analysis.disputeAmountValue,
    valueFormatter: (p) => money(p.value, p.data.analysis.currency),
  },
  { headerName: 'Reason', width: 150, valueGetter: (p) => REASON_LABELS[p.data.analysis.reason] ?? p.data.analysis.reason },
  { headerName: 'Status', width: 170, valueGetter: (p) => p.data.analysis.waitingOn, cellRenderer: WaitingCell },
  {
    headerName: 'Time left', width: 130, sort: 'asc', comparator: byDaysLeft,
    valueGetter: (p) => p.data.analysis.daysLeft, cellRenderer: DaysCell,
  },
  {
    headerName: 'Evidence', width: 130,
    valueGetter: (p) => {/*console.log(p);*/ return p.data.analysis.missingEvidence.length}, cellRenderer: EvidenceCell,
  },
  { headerName: 'Agent suggests', flex: 1, minWidth: 170, valueGetter: (p) => recSummary(p.data.rec), cellRenderer: AgentCell },
];

const defaultColDef = { sortable: true, resizable: true, suppressMovable: true };

export default function DisputeGrid({ rows, onSelect }) {
  const getRowId = useCallback((p) => p.data.id, []);
  const rowSelection = useMemo(() => ({ mode: 'singleRow', checkboxes: false, enableClickSelection: true }), []);
  const modules = [AllCommunityModule]
  return (
    <AgGridProvider modules={modules}>
        
    <AgGridReact
      theme={disputeTheme}
      rowData={rows}
      columnDefs={columnDefs}
      defaultColDef={defaultColDef}
      getRowId={getRowId}
      rowSelection={rowSelection}
      rowHeight={56}
      domLayout="autoHeight"
      onRowClicked={(e) => {onSelect(e.data.id)}}
    />
    </AgGridProvider>
  );
}