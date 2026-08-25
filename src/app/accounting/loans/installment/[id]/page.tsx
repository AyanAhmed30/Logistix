import { redirect } from "next/navigation";
import { getAccountingLoanIdByInstallment } from "@/app/actions/accounting/loans";

type Props = { params: Promise<{ id: string }> };

export default async function AccountingLoanInstallmentRedirectPage({
  params,
}: Props) {
  const { id } = await params;
  const res = await getAccountingLoanIdByInstallment(id);
  if ("loanId" in res && res.loanId) {
    redirect(`/accounting/loans/${res.loanId}`);
  }
  redirect("/accounting/review/loans-analysis");
}
