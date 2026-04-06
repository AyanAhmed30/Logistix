"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getLeadTransferHistoryForCurrentSalesAgent,
  type LeadTransferRecord,
} from "@/app/actions/leads";

export function LeadTransferTrackingPanel() {
  const [isLoading, setIsLoading] = useState(false);
  const [sentTransfers, setSentTransfers] = useState<LeadTransferRecord[]>([]);
  const [receivedTransfers, setReceivedTransfers] = useState<LeadTransferRecord[]>([]);

  useEffect(() => {
    void fetchHistory();
  }, []);

  async function fetchHistory() {
    setIsLoading(true);
    try {
      const result = await getLeadTransferHistoryForCurrentSalesAgent();
      if (!("error" in result)) {
        setSentTransfers(result.sentTransfers || []);
        setReceivedTransfers(result.receivedTransfers || []);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="bg-white border shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base md:text-lg flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-orange-600" />
          Lead Transfer Tracking
        </CardTitle>
        <CardDescription className="text-xs md:text-sm">
          Track leads sent to other sales agents and leads received from other sales agents.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="text-sm text-secondary-muted py-4">Loading transfer history...</div>
        ) : (
          <>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-primary-dark">Sent Leads</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Sent To</TableHead>
                    <TableHead>Status at Send</TableHead>
                    <TableHead>Sent At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sentTransfers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-xs text-secondary-muted py-4">
                        No leads sent yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sentTransfers.map((transfer) => (
                      <TableRow key={transfer.id}>
                        <TableCell className="text-xs">
                          <div className="font-medium text-primary-dark">
                            #{transfer.lead_id_formatted_snapshot || "N/A"} - {transfer.lead_name_snapshot}
                          </div>
                          <div className="text-secondary-muted">{transfer.lead_number_snapshot}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {transfer.to_sales_agent_name}
                          {transfer.to_sales_agent_username ? ` (${transfer.to_sales_agent_username})` : ""}
                        </TableCell>
                        <TableCell className="text-xs">{transfer.status_before_transfer}</TableCell>
                        <TableCell className="text-xs">{new Date(transfer.transferred_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-primary-dark">Received Leads</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Received From</TableHead>
                    <TableHead>Status at Receive</TableHead>
                    <TableHead>Received At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receivedTransfers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-xs text-secondary-muted py-4">
                        No leads received yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    receivedTransfers.map((transfer) => (
                      <TableRow key={transfer.id}>
                        <TableCell className="text-xs">
                          <div className="font-medium text-primary-dark">
                            #{transfer.lead_id_formatted_snapshot || "N/A"} - {transfer.lead_name_snapshot}
                          </div>
                          <div className="text-secondary-muted">{transfer.lead_number_snapshot}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {transfer.from_sales_agent_name}
                          {transfer.from_sales_agent_username ? ` (${transfer.from_sales_agent_username})` : ""}
                        </TableCell>
                        <TableCell className="text-xs">{transfer.status_before_transfer}</TableCell>
                        <TableCell className="text-xs">{new Date(transfer.transferred_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
