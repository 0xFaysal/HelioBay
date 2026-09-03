import { AdminSettings } from "@/components/credit/admin-overview";
import { ApiAdminResources } from "@/components/credit/api-admin";
import { isDemo } from "@/lib/config";
export default function Page() { return isDemo?<AdminSettings/>:<ApiAdminResources resource="tariffs"/>; }
