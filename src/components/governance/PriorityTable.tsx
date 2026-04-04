import React from "react";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import type { QueueRow } from "./types";
import { getStatusStyle } from "./types";

interface PriorityTableProps {
  rows: QueueRow[];
}

export const PriorityTable = React.memo(({ rows }: PriorityTableProps) => (
  <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-lg mt-4 overflow-hidden">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Client</TableHead>
          <TableHead className="text-center">Overdue Days</TableHead>
          <TableHead className="text-center">Risk Score</TableHead>
          <TableHead className="text-center">Priority Score</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-semibold">{r.client}</TableCell>
            <TableCell className="text-center">{r.days}</TableCell>
            <TableCell className="text-center">{r.risk}</TableCell>
            <TableCell className="text-center">{r.priority}</TableCell>
            <TableCell className="text-right">
              <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${getStatusStyle(r.status)}`}>
                {r.status}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
));

PriorityTable.displayName = "PriorityTable";
