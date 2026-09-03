import { AdminStations } from "@/components/credit/admin-stations";
import { ApiAdminResources } from "@/components/credit/api-admin";
import { isDemo } from "@/lib/config";
export default function Page() { return isDemo?<AdminStations/>:<ApiAdminResources resource="stations"/>; }
