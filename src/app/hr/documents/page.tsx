import { DocumentManagement } from "@/components/hr/DocumentManagement";
import { requireHrPageAccess } from "@/lib/hr-page-access";

export default async function HrDocumentsPage() {
  await requireHrPageAccess("document_management");
  return <DocumentManagement />;
}
